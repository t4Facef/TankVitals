"""Publicador falso — imita o ESP32 para desenvolver sem o Wokwi aberto.

Tarefa: BE-09
Contrato: publica EXATAMENTE o payload da ARQUITETURA §2.2

IMPORTANTE: isto é ferramenta de desenvolvimento. Na avaliação quem publica é
o ESP32 do Wokwi — a rubrica exige o dispositivo funcionando (1,5 pts).

Uso pretendido:
    python tools/fake_device.py --interval 5
    python tools/fake_device.py --anomalia ph      # força cenário de alerta
"""

from __future__ import annotations

import argparse


def build_payload(seq: int, anomalia: str | None) -> dict:
    """Monta uma leitura plausível.

    TODO(BE-09): fazer os valores passearem de forma realista (ex.: temperatura
    entre 24 e 29 °C com variação suave, não número aleatório puro — o gráfico
    fica feio e não convence na apresentação).

    Quando ``anomalia`` for informada, jogue aquela grandeza para fora da faixa
    segura, para demonstrar o alerta ponta a ponta sem mexer no potenciômetro.
    """
    raise NotImplementedError("BE-09")


def main() -> None:
    """TODO(BE-09): parsear argumentos, conectar no broker local e publicar em
    laço no tópico <prefixo>/<tank_id>/telemetry."""
    parser = argparse.ArgumentParser(description="Publicador falso do TankVitals")
    parser.add_argument("--interval", type=float, default=5.0, help="segundos entre envios")
    parser.add_argument("--tank-id", default="tanque-01")
    parser.add_argument(
        "--anomalia",
        choices=["temperature_c", "ph", "level_pct", "turbidity_ntu"],
        help="força esta grandeza para fora da faixa segura",
    )
    parser.parse_args()
    raise NotImplementedError("BE-09")


if __name__ == "__main__":
    main()
