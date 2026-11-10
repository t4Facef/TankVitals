"""Bounded aggregate plots and raw statistics from the telemetry measurement.

A telemetria mistura variáveis numéricas (`oxygen_mg_l`, `flow_l_min`...) com
campos de estado booleanos (`on` dos atuadores, `running` da bomba). O Flux não
calcula média, mínimo ou máximo de booleano, então os dois grupos são
consultados separados: o estado vira 0/1 (`toInt`) e devolve quanto tempo
ficou ligado e quantas vezes ligou.

As estatísticas saem das leituras cruas, não dos pontos agregados do gráfico:
é delas que o dashboard tira o "tempo fora da faixa" e o "ligou N vezes".
"""
import json
import os
from datetime import datetime, timedelta, timezone

from app.influx_repo import RepositoryUnavailable

PERIODS = {'1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800}
STATE_FIELDS = ('on', 'running')

_IS_STATE = ' or '.join(f'r._field == "{f}"' for f in STATE_FIELDS)
NUMERIC = f'|> filter(fn: (r) => not ({_IS_STATE}))\n'
STATE = f'|> filter(fn: (r) => {_IS_STATE})\n|> toInt()\n'


def reading_interval_s() -> float:
    """Segundos reais entre duas leituras: 1 leitura = 1 min simulado (SIM_SPEED=60 → 1 s)."""
    try:
        speed = float(os.getenv('SIM_SPEED', '60'))
    except ValueError:
        speed = 60.0
    return 60.0 / speed if speed > 0 else 1.0


def _flux_string(value: str) -> str:
    # O JSON de um texto simples é um literal de texto válido no Flux.
    return json.dumps(str(value))


def out_of_range_predicate(ranges: dict) -> str | None:
    """`(device, field) → (ok_min, ok_max, crit_min, crit_max)` vira o filtro "fora da faixa normal"."""
    terms = []
    for (device, field), bounds in sorted(ranges.items()):
        ok_min, ok_max, crit_min, crit_max = bounds
        low = ok_min if ok_min is not None else crit_min
        high = ok_max if ok_max is not None else crit_max
        sides = []
        if low is not None:
            sides.append(f'r._value < {float(low)!r}')
        if high is not None:
            sides.append(f'r._value > {float(high)!r}')
        if sides:
            terms.append(f'(r.device == {_flux_string(device)} and r._field == {_flux_string(field)}'
                         f' and ({" or ".join(sides)}))')
    return ' or '.join(terms) or None


def _collect(tables, stats, rename=None):
    for table in tables:
        for record in table.records:
            key = (record.values['device'], record.get_field())
            op = record.values['result']
            stats.setdefault(key, {})[(rename or {}).get(op, op)] = record.get_value()


def query_history(api, bucket, period, devices=None, variable=None, ranges=None):
    if period not in PERIODS:
        raise ValueError('Período inválido')
    ranges = ranges or {}
    end = datetime.now(timezone.utc)
    step = max(10, PERIODS[period] // 360)
    interval = reading_interval_s()
    params = {'bucket': bucket, 'period': '-' + period, 'devices': devices or [],
              'variable': variable or '', 'step': f'{step}s'}
    base = '''from(bucket: params.bucket) |> range(start: duration(v: params.period))
      |> filter(fn: (r) => r._measurement == "telemetry")
      |> filter(fn: (r) => length(arr: params.devices) == 0 or contains(value: r.device, set: params.devices))
      |> filter(fn: (r) => params.variable == "" or r._field == params.variable)
      |> group(columns: ["device", "_field"])
    '''
    window = '|> aggregateWindow(every: duration(v: params.step), fn: mean, createEmpty: false)'

    def yields(source, ops):
        # Yields separados preservam o tipo inteiro do count numa requisição só.
        return 'base = ' + source + '\n' + '\n'.join(f'base |> {op} |> yield(name: "{name}")' for name, op in ops)

    stats: dict = {}
    try:
        tables = list(api.query(base + NUMERIC + window, params=params))
        tables += list(api.query(base + STATE + window, params=params))
        _collect(api.query(yields(base + NUMERIC, [(op, f'{op}()') for op in ('count', 'min', 'max', 'mean', 'last')]),
                           params=params), stats, {'mean': 'avg'})
        _collect(api.query(yields(base + STATE, [
            ('count', 'count()'), ('last', 'last()'), ('on', 'sum()'),
            ('turn_ons', 'difference() |> filter(fn: (r) => r._value == 1) |> count()'),
        ]), params=params), stats)
        predicate = out_of_range_predicate(ranges)
        if predicate:
            _collect(api.query(yields(base + NUMERIC + f'|> filter(fn: (r) => {predicate})\n',
                                      [('out', 'count()')]), params=params), stats)
    except Exception as exc:
        raise RepositoryUnavailable('Histórico indisponível') from exc

    series = []
    for table in tables:
        if not table.records:
            continue
        first = table.records[0]
        key = (first.values['device'], first.get_field())
        raw = stats.get(key, {})
        if key[1] in STATE_FIELDS:
            item = {'count': raw.get('count', 0), 'on_s': round(raw.get('on', 0) * interval),
                    'turn_ons': raw.get('turn_ons', 0)}
            if 'last' in raw:
                item['last'] = raw['last']
        else:
            item = {k: raw[k] for k in ('count', 'min', 'max', 'avg', 'last') if k in raw}
            if key in ranges:
                item['out_of_range_s'] = round(raw.get('out', 0) * interval)
        series.append({'device': key[0], 'field': key[1], 'stats': item,
                       'points': [{'t': r.get_time().isoformat(), 'v': r.get_value()} for r in table.records]})
    return {'range': period, 'from': (end - timedelta(seconds=PERIODS[period])).isoformat(),
            'to': end.isoformat(), 'step_s': step, 'series': series}
