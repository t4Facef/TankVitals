"""Parâmetros Flux embutidos no texto: o InfluxDB OSS não aceita o `params=` do cliente."""
import pytest

from app import flux


def test_text_is_escaped_including_flux_interpolation():
    assert flux.literal('a"b\\c${x}\n') == r'"a\"b\\c\${x}\n"'


def test_bind_builds_a_params_record_with_lists_and_numbers():
    text = flux.bind('from(bucket: params.bucket)', {'bucket': 'tankvitals', 'devices': ['od-01'], 'n': 3, 'empty': []})
    assert text.splitlines()[0] == 'params = {bucket: "tankvitals", devices: ["od-01"], n: 3, empty: []}'
    assert text.endswith('from(bucket: params.bucket)')


def test_bind_variables_defines_one_variable_per_param():
    assert flux.bind_variables('x', {'bucket': 'b', 'tank': 't'}) == 'bucket = "b"\ntank = "t"\nx'


def test_query_never_sends_the_cloud_only_params_argument():
    calls = []

    class Api:
        def query(self, text, **kwargs):
            calls.append((text, kwargs))
            return []

    flux.query(Api(), 'from(bucket: params.bucket)', {'bucket': 'tankvitals'})
    assert 'params' not in calls[0][1] and calls[0][0].startswith('params = {')


def test_parameter_names_must_be_identifiers():
    with pytest.raises(ValueError):
        flux.bind('x', {'a b': 1})
