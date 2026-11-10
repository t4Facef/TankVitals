"""Idempotent initial registry; never overwrites edited values or passwords.

Nomes, rótulos, unidades e faixas seguem a docs/ARQUITETURA.md §15, iguais ao
cadastro do modo simulado do front (`frontend/src/mock/registry.ts`). É deles
que saem os textos e as cores de todas as telas: o rótulo é "Oxigênio
dissolvido", nunca a chave `oxygen_mg_l`.

O estado dos atuadores e da bomba (`on`, `running`) não é variável do cadastro:
é o estado, que a API anuncia em `state_field`.
"""
import os
import bcrypt
from sqlalchemy import select
from app.core.catalog import devices, fields, rules, users
from app.simulator.devices import DEVICES

STATE_FIELDS = ('on', 'running')

DEVICE_NAMES = {
    'temp-agua-01': 'Termômetro da água',
    'ph-01': 'Sonda de pH',
    'nivel-01': 'Sensor de nível',
    'turbidez-01': 'Turbidímetro',
    'od-01': 'Sonda de oxigênio',
    'luz-01': 'Sensor de luz',
    'bomba-rec-01': 'Bomba de recirculação',
    'aerador-01': 'Aerador',
    'bomba-repo-01': 'Reposição de água',
}

# chave: (rótulo, rótulo curto, unidade, (ok_min, ok_max, crit_min, crit_max))
FIELDS = {
    'temperature_c': ('Temperatura da água', 'Temperatura', '°C', (24, 28, 22, 30)),
    'ph': ('pH', 'pH', 'pH', (6.5, 8, 6, 8.5)),
    'level_pct': ('Nível da água', 'Nível', '%', (30, None, 15, None)),
    'turbidity_ntu': ('Turbidez', 'Turbidez', 'NTU', (None, 40, None, 60)),
    'oxygen_mg_l': ('Oxigênio dissolvido', 'Oxigênio', 'mg/L', (5, None, 3, None)),
    'light_lux': ('Luminosidade', 'Luz', 'lux', (None, None, None, None)),
    'vibration_mm_s': ('Vibração', 'Vibração', 'mm/s', (None, 2.8, None, 4.5)),
    'current_a': ('Corrente do motor', 'Corrente', 'A', (None, 3.2, None, 3.8)),
    'motor_temp_c': ('Temperatura do motor', 'Temp. do motor', '°C', (None, 65, None, 80)),
    'flow_l_min': ('Vazão', 'Vazão', 'L/min', (40, None, 30, None)),
}


def seed(engine):
    with engine.begin() as conn:
        for d in DEVICES:
            if not conn.execute(select(devices.c.id).where(devices.c.id == d.id)).first():
                conn.execute(devices.insert().values(id=d.id, name=DEVICE_NAMES.get(d.id, d.id), zone=d.zone,
                             kind=d.kind, commands=sorted(d.commands), active=True))
            for key, decimals in d.fields:
                if key in STATE_FIELDS:
                    continue
                if not conn.execute(select(fields.c.key).where(fields.c.device_id == d.id, fields.c.key == key)).first():
                    label, short, unit, bounds = FIELDS.get(key, (key, key, '', (None,) * 4))
                    conn.execute(fields.insert().values(
                        device_id=d.id, key=key, label=label, short=short, unit=unit, decimals=decimals,
                        active=True, **dict(zip(('ok_min', 'ok_max', 'crit_min', 'crit_max'), bounds))))
        if not conn.execute(select(rules.c.id).where(rules.c.id == 'aerator-low-oxygen')).first():
            conn.execute(rules.insert().values(id='aerator-low-oxygen', name='Aerador por oxigênio baixo',
                device_id='od-01', field_key='oxygen_mg_l', actuator_id='aerador-01', on_below=5, off_at=6.5, enabled=True))
        for role in ('viewer','operator','admin'):
            if not conn.execute(select(users.c.username).where(users.c.username == role)).first():
                password = os.environ[f'DEMO_{role.upper()}_PASSWORD']
                conn.execute(users.insert().values(username=role, role=role, active=True, failures=0,
                    password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()))
