"""Token da API e do worker: buckets `tankvitals` e `lab`, criando o `lab` na primeira subida."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bootstrap_influx_api  # noqa: E402


def _calls(responses):
    calls = []

    def fake(base_url, admin_token, method, path, body=None):
        calls.append((method, path, body))
        return responses.pop(0)

    return calls, fake


class InfluxApiTokenBootstrapTests(unittest.TestCase):
    def run_main(self, responses):
        calls, fake = _calls(responses)
        with patch.object(bootstrap_influx_api, "_api_json", side_effect=fake), patch.object(
            bootstrap_influx_api, "_write_private_token"
        ) as save, patch.dict(os.environ, {"INFLUXDB_ADMIN_TOKEN": "admin"}):
            code = bootstrap_influx_api.main()
        return code, calls, save

    def test_first_start_creates_the_lab_bucket_without_filtering_by_a_missing_name(self):
        code, calls, save = self.run_main([
            {"orgs": [{"id": "org", "name": "unifacef"}]},
            {"buckets": [{"id": "live", "name": "tankvitals"}]},
            {"buckets": [{"id": "live", "name": "tankvitals"}, {"id": "sys", "name": "_monitoring"}]},
            {"id": "lab-id", "name": "lab"},
            {"token": "api-token"},
        ])
        self.assertEqual(code, 0)
        self.assertNotIn("name=lab", calls[2][1])
        self.assertEqual(calls[3][0], "POST")
        self.assertEqual(calls[3][2]["name"], "lab")
        targets = {p["resource"]["id"] for p in calls[4][2]["permissions"]}
        self.assertEqual(targets, {"live", "lab-id"})
        save.assert_called_once()

    def test_existing_lab_bucket_is_reused(self):
        code, calls, _ = self.run_main([
            {"orgs": [{"id": "org", "name": "unifacef"}]},
            {"buckets": [{"id": "live", "name": "tankvitals"}]},
            {"buckets": [{"id": "lab-id", "name": "lab"}]},
            {"token": "api-token"},
        ])
        self.assertEqual(code, 0)
        self.assertEqual([c[0] for c in calls], ["GET", "GET", "GET", "POST"])
        self.assertIn("authorizations", calls[3][1])


if __name__ == "__main__":
    unittest.main()
