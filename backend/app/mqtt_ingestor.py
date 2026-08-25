"""Ingestor MQTT — fecha o elo Mosquitto -> InfluxDB.

Tarefa: BE-05
Contrato: docs/ARQUITETURA.md §2.1 (tópicos) e §3 (validação)

Roda em thread própria do paho (loop_start). Cuidado ao falar com o FastAPI
daqui: ver a nota de asyncio na BE-08.
"""

from __future__ import annotations

from typing import Callable


class MqttIngestor:
    """Assina os tópicos de telemetria/status e persiste o que chega."""

    def __init__(self, on_reading: Callable[[dict], None] | None = None) -> None:
        """Args:
            on_reading: callback chamado a cada leitura gravada — é por aqui
                que o WebSocket (BE-08) recebe o dado ao vivo.

        TODO(BE-05): criar o cliente paho com o client_id do config e
        configurar reconnect_delay_set().
        """
        # Última leitura e estado online/offline por tanque, em memória.
        # A API usa isso para responder rápido sem ir ao banco.
        self.last_reading: dict[str, dict] = {}
        self.online: dict[str, bool] = {}
        raise NotImplementedError("BE-05")

    def start(self) -> None:
        """Conecta no broker LOCAL e começa a consumir.

        TODO(BE-05): assinar "<prefixo>/+/telemetry" e "<prefixo>/+/status",
        depois loop_start().
        """
        raise NotImplementedError("BE-05")

    def stop(self) -> None:
        """TODO(BE-05): loop_stop() + disconnect(), chamado no shutdown da API."""
        raise NotImplementedError("BE-05")

    # ----------------------------------------------------------------- callbacks

    def _on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:
        """TODO(BE-05): reassinar os tópicos aqui — a assinatura se perde a cada
        reconexão, e esquecer isso faz o ingestor 'emudecer' silenciosamente."""
        raise NotImplementedError("BE-05")

    def _on_message(self, client, userdata, msg) -> None:
        """TODO(BE-05):
        - tópico terminando em /telemetry -> parse_reading (BE-02)
          -> classify_reading (BE-03) -> write_reading (BE-04) -> on_reading
        - tópico terminando em /status   -> atualiza self.online
        - payload inválido -> log WARNING com o motivo, sem derrubar o serviço
        - log de sucesso: UMA linha por leitura (tank_id + grandezas)
        """
        raise NotImplementedError("BE-05")

    def publish_command(self, tank_id: str, command: dict) -> None:
        """Publica em <prefixo>/<tank_id>/cmd (ARQUITETURA §2.3).

        Base da atuação remota do 2º bimestre.
        TODO(BE-05): implementar.
        """
        raise NotImplementedError("BE-05")
