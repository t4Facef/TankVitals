"""Histórico do dashboard: estado booleano separado e indicadores sobre os dados crus."""
from datetime import datetime, timezone

import pytest

from app.telemetry_history import out_of_range_predicate, query_history

T0 = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)


class Record:
    def __init__(self, device, field, value, result='_result'):
        self.values = {'device': device, 'result': result}
        self._field, self._value = field, value

    def get_field(self):
        return self._field

    def get_value(self):
        return self._value

    def get_time(self):
        return T0


class Table:
    def __init__(self, records):
        self.records = records


class FakeApi:
    """Responde pelo tipo de consulta e guarda o Flux de cada uma."""

    def __init__(self):
        self.queries = []

    def query(self, flux, params=None):
        self.queries.append(flux)
        state = 'toInt()' in flux
        if 'aggregateWindow' in flux:
            if state:
                return [Table([Record('aerador-01', 'on', 0.0), Record('aerador-01', 'on', 0.5)])]
            return [Table([Record('od-01', 'oxygen_mg_l', 6.1), Record('od-01', 'oxygen_mg_l', 4.8)]),
                    Table([Record('luz-01', 'light_lux', 500.0)])]
        if 'yield(name: "out")' in flux:
            return [Table([Record('od-01', 'oxygen_mg_l', 42, 'out')])]
        if state:
            return [Table([Record('aerador-01', 'on', 3600, 'count'), Record('aerador-01', 'on', 1, 'last'),
                           Record('aerador-01', 'on', 900, 'on'), Record('aerador-01', 'on', 4, 'turn_ons')])]
        return [Table([Record('od-01', 'oxygen_mg_l', n, op) for op, n in
                       (('count', 3600), ('min', 4.7), ('max', 8.0), ('mean', 6.2), ('last', 6.1))]),
                Table([Record('luz-01', 'light_lux', 3600, 'count')])]


RANGES = {('od-01', 'oxygen_mg_l'): (5.0, None, 3.0, None)}


def test_state_fields_never_go_through_mean_min_or_max():
    api = FakeApi()
    query_history(api, 'tankvitals', '1h', ranges=RANGES)
    for flux in api.queries:
        if 'toInt()' in flux:
            assert 'min()' not in flux and 'max()' not in flux
        else:
            assert 'r._field == "on"' in flux and 'not (' in flux


def test_stats_include_out_of_range_and_actuator_usage(monkeypatch):
    monkeypatch.setenv('SIM_SPEED', '60')
    result = query_history(FakeApi(), 'tankvitals', '1h', ranges=RANGES)
    series = {(s['device'], s['field']): s for s in result['series']}

    oxygen = series[('od-01', 'oxygen_mg_l')]['stats']
    assert oxygen == {'count': 3600, 'min': 4.7, 'max': 8.0, 'avg': 6.2, 'last': 6.1, 'out_of_range_s': 42}

    aerator = series[('aerador-01', 'on')]['stats']
    assert aerator == {'count': 3600, 'on_s': 900, 'turn_ons': 4, 'last': 1}

    # Sem faixa no cadastro, não há "tempo fora da faixa": a tela mostra "sem faixa".
    assert 'out_of_range_s' not in series[('luz-01', 'light_lux')]['stats']


def test_seconds_follow_the_simulation_speed(monkeypatch):
    monkeypatch.setenv('SIM_SPEED', '30')  # 1 leitura a cada 2 s reais
    result = query_history(FakeApi(), 'tankvitals', '1h', ranges=RANGES)
    series = {(s['device'], s['field']): s for s in result['series']}
    assert series[('od-01', 'oxygen_mg_l')]['stats']['out_of_range_s'] == 84
    assert series[('aerador-01', 'on')]['stats']['on_s'] == 1800


def test_out_of_range_predicate_uses_normal_band_then_critical():
    predicate = out_of_range_predicate({
        ('od-01', 'oxygen_mg_l'): (5, None, 3, None),
        ('turbidez-01', 'turbidity_ntu'): (None, None, None, 60),
    })
    assert 'r.device == "od-01" and r._field == "oxygen_mg_l" and (r._value < 5.0)' in predicate
    assert 'r._value > 60.0' in predicate
    assert out_of_range_predicate({}) is None


def test_invalid_period_is_rejected():
    with pytest.raises(ValueError):
        query_history(FakeApi(), 'tankvitals', '2h')
