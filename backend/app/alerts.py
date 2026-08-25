"""Classificação das leituras em ok / atencao / critico.

Tarefa: BE-03
Contrato: docs/ARQUITETURA.md §5 (tabela de faixas seguras)

Os limites vêm do config.py. Número solto de faixa aqui dentro é bug.
"""

from __future__ import annotations

from enum import Enum


class AlertLevel(str, Enum):
    """Níveis, do melhor para o pior. A ordem importa para calcular o pior."""

    OK = "ok"
    ATENCAO = "atencao"
    CRITICO = "critico"


def classify_metric(metric: str, value: float) -> AlertLevel:
    """Classifica UMA grandeza segundo a tabela da ARQUITETURA §5.

    TODO(BE-03): implementar. Cuidado com as bordas — exatamente 24,0 °C é OK;
    23,9 é ATENCAO.

    Args:
        metric: nome do campo, ex. "temperature_c".
        value: valor lido.
    """
    raise NotImplementedError("BE-03")


def classify_reading(reading: "object") -> tuple[AlertLevel, dict[str, AlertLevel]]:
    """Classifica a leitura inteira.

    Devolve o nível geral (o PIOR entre as grandezas presentes) e o nível de
    cada grandeza.

    TODO(BE-03): implementar. Grandeza ausente não entra no cálculo — ausente
    não é crítico, é ausente.
    """
    raise NotImplementedError("BE-03")
