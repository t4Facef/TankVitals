"""Ponto de entrada: sobe a API e o ingestor MQTT no mesmo processo.

Tarefa: BE-07
Executar com:  uvicorn app.main:app --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ciclo de vida da aplicação.

    TODO(BE-07):
      startup  -> guardar asyncio.get_running_loop() (o WebSocket da BE-08
                  precisa dele), criar o InfluxRepository e dar start() no
                  MqttIngestor
      shutdown -> stop() no ingestor e fechar o cliente do Influx
    """
    yield


app = FastAPI(
    title="TankVitals API",
    description="Monitoramento IoT de tanque de aquicultura — UniFACEF 2026",
    version="0.1.0",
    lifespan=lifespan,
)

# TODO(BE-07): CORSMiddleware com as origens do config (sem isso o navegador
# bloqueia toda chamada vinda do Vite em localhost:5173).

# TODO(BE-07): app.include_router(router) e registrar a rota WebSocket /ws/live.
