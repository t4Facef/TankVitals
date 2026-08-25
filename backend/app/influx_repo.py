"""Acesso ao InfluxDB: escrita das leituras e consultas do dashboard.

Tarefas: BE-04 (escrita) e BE-06 (consultas)
Contrato: docs/ARQUITETURA.md §4 (schema e queries de referência) e §6 (formatos)

Este é o ÚNICO módulo que fala com o banco.
"""

from __future__ import annotations

# Períodos e janelas aceitos. Validar contra estas listas antes de montar a
# query: nunca interpolar string vinda do usuário direto no Flux (injeção).
VALID_RANGES = ("1h", "6h", "24h", "7d")
VALID_WINDOWS = ("10s", "1m", "5m", "1h")

# Janela automática por período (ARQUITETURA §6): mantém a série em ~360 pontos.
DEFAULT_WINDOW = {"1h": "10s", "6h": "1m", "24h": "5m", "7d": "1h"}


class InfluxRepository:
    """Encapsula cliente, escrita e consultas do InfluxDB."""

    def __init__(self) -> None:
        """TODO(BE-04): criar InfluxDBClient(url, token, org) a partir do config."""
        raise NotImplementedError("BE-04")

    # ------------------------------------------------------------------ escrita

    def write_reading(self, reading: "object") -> None:
        """Grava uma leitura como ponto no measurement ``water_reading``.

        TODO(BE-04):
          - tags: tank_id, device_id, fw
          - fields: só as grandezas PRESENTES (campo ausente não vira field;
            nunca gravar 0 no lugar — zero é valor legítimo de sensor)
          - WritePrecision.NS, write_options=SYNCHRONOUS
          - erro de escrita: logar e seguir, nunca derrubar o ingestor
        """
        raise NotImplementedError("BE-04")

    # ----------------------------------------------------------------- consultas

    def get_latest(self, tank_id: str) -> dict | None:
        """Última leitura do tanque, no formato da ARQUITETURA §6.

        TODO(BE-06): usar last() + pivot() (query de referência na §4).
        Tanque sem dado devolve None, não exceção.
        """
        raise NotImplementedError("BE-06")

    def get_history(
        self,
        tank_id: str,
        range_: str = "6h",
        window: str | None = None,
        metrics: list[str] | None = None,
    ) -> dict:
        """Série temporal agregada que alimenta o gráfico.

        TODO(BE-06): validar range_/window contra VALID_*, aplicar
        DEFAULT_WINDOW quando window for None e usar aggregateWindow(fn: mean).
        Timestamps de saída em ISO 8601 UTC terminando em "Z".
        """
        raise NotImplementedError("BE-06")

    def get_stats(self, tank_id: str, range_: str = "24h") -> dict:
        """Mín, máx, média e último valor por grandeza no período.

        TODO(BE-06): implementar conforme ARQUITETURA §6.
        """
        raise NotImplementedError("BE-06")

    def list_tanks(self) -> list[dict]:
        """Tanques conhecidos e quando cada um foi visto pela última vez.

        TODO(BE-06): valores distintos da tag tank_id.
        """
        raise NotImplementedError("BE-06")

    def ping(self) -> bool:
        """Usado por /api/health. TODO(BE-07): checar o banco de verdade."""
        raise NotImplementedError("BE-06")
