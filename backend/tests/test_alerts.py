"""Testes da regra de alerta (BE-03).

Casos de borda da tabela da ARQUITETURA §5 — é onde mora o bug.
"""

import pytest

pytestmark = pytest.mark.skip(reason="TODO(BE-03): implementar classify_*")


def test_tudo_dentro_da_faixa_e_ok():
    """Leitura normal -> nível geral 'ok'."""


def test_temperatura_29_graus_e_atencao():
    """29 °C com o resto normal -> geral 'atencao'."""


def test_ph_55_e_critico():
    """pH 5,5 -> geral 'critico', mesmo com as outras grandezas em 'ok'."""


def test_nivel_geral_e_o_pior_das_grandezas():
    """Uma 'atencao' e uma 'critico' -> geral 'critico'."""


def test_grandeza_ausente_nao_conta_como_critico():
    """Ausente é ausente: não entra no cálculo do nível geral."""


@pytest.mark.parametrize(
    "valor,esperado",
    [
        (24.0, "ok"),        # limite inferior da faixa ok
        (23.9, "atencao"),
        (28.0, "ok"),        # limite superior da faixa ok
        (28.1, "atencao"),
        (30.0, "atencao"),
        (30.1, "critico"),
        (22.0, "atencao"),
        (21.9, "critico"),
    ],
)
def test_bordas_da_temperatura(valor, esperado):
    """Cada limite da tabela §5, exatamente no valor de corte."""
