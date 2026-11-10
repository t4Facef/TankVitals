"""Parâmetros de consulta Flux que funcionam no InfluxDB OSS.

O `params=` do cliente Python só existe no InfluxDB Cloud: o OSS 2.x, que roda
no compose, ignora o campo e a consulta falha com "undefined identifier
params". Aqui os valores entram no próprio texto da consulta, como um registro
`params = {...}` no topo, e as consultas continuam usando `params.x`.

Nada do pedido vira código: todo texto passa por `literal`, que escapa aspas,
barra invertida, quebras de linha e `${` (a interpolação de texto do Flux).
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t", "$": "\\$"}


def literal(value) -> str:
    """Um valor Python como literal Flux: texto, número, booleano ou lista deles."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return '"' + "".join(_ESCAPES.get(ch, ch) for ch in value) + '"'
    if isinstance(value, Sequence):
        return "[" + ", ".join(literal(item) for item in value) + "]"
    raise TypeError(f"tipo sem literal Flux: {type(value).__name__}")


def bind(flux: str, params: Mapping[str, object], name: str = "params") -> str:
    """Prefixa a consulta com `params = {...}`."""
    for key in params:
        if not _NAME.fullmatch(key):
            raise ValueError(f"nome de parâmetro inválido: {key!r}")
    record = ", ".join(f"{key}: {literal(value)}" for key, value in params.items())
    return f"{name} = {{{record}}}\n{flux}"


def bind_variables(flux: str, params: Mapping[str, object]) -> str:
    """Prefixa a consulta com uma variável por parâmetro (`bucket = "..."`)."""
    for key in params:
        if not _NAME.fullmatch(key):
            raise ValueError(f"nome de parâmetro inválido: {key!r}")
    return "".join(f"{key} = {literal(value)}\n" for key, value in params.items()) + flux


def query(api, flux: str, params: Mapping[str, object], **kwargs):
    """`api.query` com os parâmetros embutidos no texto."""
    return api.query(bind(flux, params), **kwargs)
