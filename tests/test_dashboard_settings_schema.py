import unittest

from src.dashboard.settings_schema import ENV_FIELDS, ENV_FIELD_MAP


class DashboardSettingsSchemaTests(unittest.TestCase):
    def test_keys_are_unique_and_map_is_complete(self):
        keys = [field["key"] for field in ENV_FIELDS]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(set(keys), set(ENV_FIELD_MAP))

    def test_every_field_has_complete_display_and_runtime_metadata(self):
        required = {
            "key",
            "type",
            "label",
            "hint",
            "options",
            "secret",
            "restart_required",
            "runtime_binding",
        }
        for field in ENV_FIELDS:
            with self.subTest(key=field["key"]):
                self.assertTrue(required <= set(field))
                self.assertIsInstance(field["options"], list)
                self.assertEqual(field["secret"], field["type"] == "secret")

    def test_select_fields_define_options(self):
        for field in ENV_FIELDS:
            if field["type"] == "select":
                with self.subTest(key=field["key"]):
                    self.assertTrue(field["options"])

    def test_namuh_domestic_fields_are_editable_and_credentials_are_secret(self):
        expected = {
            "DOMESTIC_STOCK_BROKER",
            "NHPLUG_ENVIRONMENT",
            "NHPLUG_ACCOUNT",
            "NHPLUG_APP_KEY",
            "NHPLUG_APP_SECRET",
        }
        self.assertTrue(expected <= set(ENV_FIELD_MAP))
        self.assertEqual(ENV_FIELD_MAP["DOMESTIC_STOCK_BROKER"]["options"], ["namuh"])
        self.assertEqual(ENV_FIELD_MAP["NHPLUG_ENVIRONMENT"]["options"], ["mock", "live"])
        for key in expected:
            if key.endswith(("APP_KEY", "APP_SECRET")):
                self.assertTrue(ENV_FIELD_MAP[key]["secret"])

    def test_non_domestic_broker_fields_are_not_editable(self):
        forbidden_prefixes = ("MISTOCK_", "NAMUH_US_", "BYBIT_", "LS_")
        self.assertFalse(any(key.startswith(forbidden_prefixes) for key in ENV_FIELD_MAP))


if __name__ == "__main__":
    unittest.main()
