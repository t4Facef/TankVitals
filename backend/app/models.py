"""Modelos e validação do payload que chega do MQTT.

Tarefa: BE-02
Contrato: docs/ARQUITETURA.md §2.2 (payload) e §3 (campos e regras)

Esta é a fronteira de confiança do sistema: dado de IoT chega sujo, e nada
passa daqui para dentro sem ser validado.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SensorReading(BaseModel):
    """Uma leitura validada, pronta para ser gravada no InfluxDB.

    TODO(BE-02): declarar os campos da ARQUITETURA §3 com seus limites de faixa
    VÁLIDA (não confundir com faixa SEGURA, que é regra de alerta na BE-03):

        device_id      str, obrigatório, 1..64
        tank_id        str, obrigatório, 1..64
        fw             str, opcional
        seq            int, opcional, >= 0
        uptime_s       int, opcional, >= 0
        rssi           int, opcional, -100..0
        time           datetime (do campo `ts` ou horário do servidor)
        temperature_c  float, opcional, -10..60
        ph             float, opcional, 0..14
        level_pct      float, opcional, 0..100
        distance_cm    float, opcional, 0..400
        turbidity_ntu  float, opcional, 0..1000
    """


def parse_reading(topic: str, payload: bytes) -> SensorReading | None:
    """Converte a mensagem MQTT crua em uma leitura validada.

    Devolve ``None`` quando a mensagem deve ser descartada.

    TODO(BE-02): implementar as 6 regras da ARQUITETURA §3:
      1. JSON inválido                      -> None + log WARNING
      2. sem device_id ou tank_id           -> None
      3. grandeza fora da faixa válida      -> descarta SÓ aquele campo
      4. nenhuma grandeza sobrou            -> None
      5. ts ausente ou <= 1700000000        -> usa horário do servidor
      6. tank_id != tank_id do tópico       -> vale o do tópico + log WARNING

    Args:
        topic: tópico completo, ex. "tankvitals/tanque-01/telemetry".
        payload: bytes crus recebidos do broker.
    """
    raise NotImplementedError("BE-02")


def tank_id_from_topic(topic: str) -> str | None:
    """Extrai o <tank_id> de ``<prefixo>/<tank_id>/<sufixo>``.

    TODO(BE-02): implementar. Devolve None se o tópico não tiver esse formato.
    """
    raise NotImplementedError("BE-02")
