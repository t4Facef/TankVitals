"""Testes da validação do payload (BE-02).

Cada teste aqui corresponde a um item do critério de aceite da tarefa BE-02.
Remova o skip conforme for implementando.
"""

import pytest

pytestmark = pytest.mark.skip(reason="TODO(BE-02): implementar parse_reading")

TOPICO = "tankvitals/tanque-01/telemetry"

PAYLOAD_VALIDO = b"""{
  "device_id": "esp32-tank-01",
  "tank_id": "tanque-01",
  "fw": "1.0.0",
  "seq": 42,
  "uptime_s": 210,
  "rssi": -58,
  "ts": 1756108800,
  "temperature_c": 26.44,
  "ph": 7.21,
  "level_pct": 78.5,
  "distance_cm": 13.6,
  "turbidity_ntu": 12.3
}"""


def test_payload_valido_e_aceito():
    """Payload de exemplo da ARQUITETURA §2.2 é aceito com todos os campos."""


def test_json_invalido_devolve_none():
    """b"nao e json" devolve None, sem lançar exceção."""


def test_grandeza_fora_da_faixa_valida_e_descartada_isoladamente():
    """ph=99 é removido, mas temperatura e nível continuam na leitura."""


def test_payload_sem_nenhuma_grandeza_e_rejeitado():
    """Só device_id e tank_id não é leitura — devolve None."""


def test_ts_ausente_usa_horario_do_servidor():
    """Sem ts (ou ts <= 1700000000), a leitura recebe o horário de chegada."""


def test_tank_id_divergente_vale_o_do_topico():
    """tank_id do payload diferente do tópico: prevalece o do tópico."""
