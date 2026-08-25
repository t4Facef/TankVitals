"""Rotas HTTP e WebSocket consumidas pelo dashboard.

Tarefas: BE-07 (REST) e BE-08 (WebSocket)
Contrato: docs/ARQUITETURA.md §6 — os formatos de resposta são contrato com o
frontend. Mudou aqui, atualiza lá.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    """Estado do serviço, do broker e do banco.

    TODO(BE-07): checar de verdade (ping no Influx + estado da conexão MQTT).
    Health que sempre responde "ok" não serve para nada. Devolver 503 quando
    o banco estiver fora.
    """
    raise NotImplementedError("BE-07")


@router.get("/thresholds")
def thresholds() -> dict:
    """Faixas seguras (ARQUITETURA §5), para o front não duplicar números.

    TODO(BE-07): devolver os limites vindos do config.
    """
    raise NotImplementedError("BE-07")


@router.get("/tanks")
def list_tanks() -> list[dict]:
    """Tanques conhecidos, último visto e online/offline.

    TODO(BE-07): combinar InfluxRepository.list_tanks() com o estado em
    memória do ingestor.
    """
    raise NotImplementedError("BE-07")


@router.get("/readings/latest")
def latest(tank_id: str = "tanque-01") -> dict:
    """Última leitura já classificada — formato exato da ARQUITETURA §6.

    TODO(BE-07): incluir age_s, online e o nível de cada grandeza.
    """
    raise NotImplementedError("BE-07")


@router.get("/readings/history")
def history(
    tank_id: str = "tanque-01",
    range: str = "6h",
    window: str | None = None,
    metrics: str | None = None,
) -> dict:
    """Série temporal agregada que alimenta o gráfico.

    TODO(BE-07): validar os parâmetros (400 em valor inválido) e delegar para
    InfluxRepository.get_history().
    """
    raise NotImplementedError("BE-07")


@router.get("/stats")
def stats(tank_id: str = "tanque-01", range: str = "24h") -> dict:
    """Mín/máx/média por grandeza no período. TODO(BE-07)."""
    raise NotImplementedError("BE-07")


# ---------------------------------------------------------------------------
# WebSocket (BE-08)
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Lista de clientes WebSocket conectados.

    TODO(BE-08): connect/disconnect/broadcast. Cliente que caiu deve sair da
    lista sem quebrar o envio para os outros.
    """

    def __init__(self) -> None:
        self.active: list[WebSocket] = []


async def live(websocket: WebSocket, tank_id: str = "tanque-01") -> None:
    """Push de cada nova leitura (ARQUITETURA §6: tipos "reading" e "status").

    TODO(BE-08): ATENÇÃO — o ingestor roda em thread do paho e o FastAPI em
    asyncio. Para cruzar essa fronteira use
    ``asyncio.run_coroutine_threadsafe(coro, loop)`` com o loop capturado no
    lifespan. Dar await direto a partir da thread do paho NÃO funciona, e é o
    erro mais comum desta tarefa.
    """
    raise NotImplementedError("BE-08")
