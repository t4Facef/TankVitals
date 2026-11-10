"""Bomba de recirculação do simulador (IOT-01, IOT-06 e IOT-08).

A física é a mesma do gerador de dados da IA (`core/physics.py`, IA-01): o
modelo treinado vê, ao vivo, a mesma bomba que viu no treino. Este arquivo só
adapta a física à interface que o simulador usa (`step`, `inject_fault`,
`repair`, `set_running`) e cuida do que a física não modela: a bomba
desligada, sem vazão nem corrente, com o motor esfriando.

Passo: 1 leitura = 1 minuto simulado, o mesmo do gerador. Com `SIM_SPEED=60`,
1 s real = 1 min simulado. Depois de `inject_fault`, o desgaste vai de quase
nada ao máximo em 2 a 4,5 minutos reais (o ritmo é sorteado, como no gerador),
e acelera perto da falha.

**O rótulo da simulação fica aqui dentro.** O desgaste, o modo de falha e a
"saúde de verdade" nunca saem de `step()`: a leitura devolvida tem só os quatro
valores físicos e o estado `running`. Se o rótulo vazasse na telemetria, o
modelo "colaria" na prova ao vivo (§12.2).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.core import physics

from .devices import FAULT_MODES

# Teto do tempo da falha, em passos: com o ritmo mais lento do gerador (1/480
# por minuto), o desgaste chega ao máximo em ~256 minutos simulados.
FAULT_SIM_MINUTES = 270

# A bomba do tanque é uma bomba típica do gerador: os valores de base ficam no
# centro das faixas sorteadas em `physics.create_population`.
TYPICAL_BASE = (1.1, 2.6, 42.0, 50.0)

IDLE_MOTOR_TEMP = 27.0
# Fração do caminho até a temperatura ambiente que o motor parado percorre a cada passo.
THERMAL_INERTIA = 0.05


@dataclass(frozen=True)
class PumpSample:
    """O que a bomba mede. Só grandezas físicas: nenhum rótulo."""

    vibration_mm_s: float
    current_a: float
    motor_temp_c: float
    flow_l_min: float
    running: bool


class PumpModel:
    def __init__(self, rng: np.random.Generator):
        self._rng = rng
        self.running = True
        self._population = physics.create_population(1, failure_fraction=0.0, seed=int(rng.integers(0, 2**32)))
        self._population.base_values[0] = TYPICAL_BASE
        self._population.stuck_values[0] = TYPICAL_BASE
        # Bomba nova e sem falha marcada: o desgaste só anda depois de `inject_fault`.
        physics.repair(self._population)
        self._motor_temp = TYPICAL_BASE[2]

    # --- controle (comandos) -------------------------------------------------

    def set_running(self, running: bool) -> None:
        self.running = bool(running)

    def inject_fault(self, mode: str) -> None:
        if mode not in FAULT_MODES:
            raise ValueError(f"modo de falha desconhecido: {mode!r}")
        physics.inject_fault(self._population, mode)

    def repair(self) -> None:
        """A bomba volta ao estado de nova."""
        physics.repair(self._population)

    # --- simulação -----------------------------------------------------------

    def step(self, daylight: float) -> PumpSample:  # noqa: ARG002 - a física da bomba não depende da luz
        """Avança 1 minuto simulado e devolve a leitura dos sensores da bomba."""
        rng = self._rng
        if not self.running:
            # Desligada: sem vazão nem corrente, o motor esfria e o desgaste não anda.
            self._motor_temp += (IDLE_MOTOR_TEMP - self._motor_temp) * THERMAL_INERTIA
            return PumpSample(
                vibration_mm_s=abs(float(rng.normal(0, 0.02))),
                current_a=0.0,
                motor_temp_c=self._motor_temp + float(rng.normal(0, 0.3)),
                flow_l_min=0.0,
                running=False,
            )

        reading = physics.advance_population(self._population, 1.0)
        values = {field: float(reading[field][0]) for field in physics.PUMP_FIELDS}
        self._motor_temp = values["motor_temp_c"]
        return PumpSample(**values, running=True)
