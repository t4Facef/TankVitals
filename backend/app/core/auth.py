"""JWT roles and persistent per-account login throttling."""
import os
from datetime import timedelta
import bcrypt
import jwt
from fastapi import Depends, HTTPException
from sqlalchemy import select, update
from app.ai_api import current_user
from app.core.catalog import users, log, now

def token_ttl():
    """Validade do login; 2 h por padrão, para não vencer no meio de uma demonstração."""
    try:
        minutes = int(os.environ.get('JWT_TTL_MINUTES', '120'))
    except ValueError:
        minutes = 120
    return timedelta(minutes=max(1, minutes))

def require_role(role):
    ranks = {'viewer': 0, 'operator': 1, 'admin': 2}
    def dependency(user=Depends(current_user)):
        if ranks[user['role']] < ranks[role]:
            raise HTTPException(403, 'Papel insuficiente')
        return user
    return dependency

def authenticate(engine, username, password):
    secret = os.environ.get('JWT_SECRET')
    if not secret:
        raise HTTPException(503, 'Autenticação não configurada')
    username = {'visualizador':'viewer','operador':'operator'}.get(username, username)
    status = 401
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.username == username).with_for_update()).mappings().first()
        stamp = now()
        locked = row and row['locked_until']
        if locked and locked.tzinfo is None:
            locked = locked.replace(tzinfo=stamp.tzinfo)
        if locked and locked > stamp:
            status = 429
            log(conn, username, 'login', 'login_blocked', ok=False)
        else:
            try:
                valid = bool(row and row['active'] and bcrypt.checkpw(password.encode(), row['password_hash'].encode()))
            except ValueError:
                valid = False
            if row:
                failures = 0 if valid else (0 if locked else row['failures']) + 1
                conn.execute(update(users).where(users.c.username == username).values(
                    failures=failures, locked_until=stamp + timedelta(minutes=5) if failures >= 5 else None))
            log(conn, username, 'login', 'login' if valid else 'login_failed', ok=valid)
            if valid:
                return issue_token(username, row['role'], stamp, secret)
    raise HTTPException(status, 'Muitas tentativas' if status == 429 else 'Usuário ou senha inválidos')

def issue_token(username, role, stamp, secret):
    return {'access_token': jwt.encode({'sub': username, 'role': role, 'iat': stamp, 'exp': stamp + token_ttl()},
                                       secret, algorithm='HS256'), 'token_type': 'bearer'}

DEMO_ROLES = ('viewer', 'operator', 'admin')

def demo_quick_login_enabled():
    """Acesso rápido de demonstração: desligado, a menos que DEMO_QUICK_LOGIN esteja ligado no servidor."""
    return os.environ.get('DEMO_QUICK_LOGIN', '').strip().lower() in ('1', 'true', 'yes', 'sim')

def demo_login(engine, role):
    """Entra como o usuário de demonstração do papel, sem senha.

    Existe para testar e apresentar sem digitar as senhas geradas. Só responde com
    DEMO_QUICK_LOGIN ligado (fora disso, 404), só serve aos três usuários de
    demonstração e cada entrada fica na auditoria como login_demo.
    """
    if not demo_quick_login_enabled():
        raise HTTPException(404, 'Not Found')
    secret = os.environ.get('JWT_SECRET')
    if not secret:
        raise HTTPException(503, 'Autenticação não configurada')
    if role not in DEMO_ROLES:
        raise HTTPException(422, 'Papel inválido')
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.username == role)).mappings().first()
        if not row or not row['active'] or row['role'] != role:
            raise HTTPException(404, 'Usuário de demonstração não encontrado')
        stamp = now()
        log(conn, role, 'login', 'login_demo', ok=True)
        return issue_token(role, role, stamp, secret)
