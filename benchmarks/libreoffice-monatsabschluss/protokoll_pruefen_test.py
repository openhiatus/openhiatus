"""Offline-Regressionsprüfungen für die UI-only-Protokollbewertung."""

import json
from pathlib import Path
import tempfile
import unittest

from protokoll_pruefen import inspect


class ProtocolTests(unittest.TestCase):
    def inspect_rows(self, *payloads):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / "isolierter-test.jsonl"
            log.write_text("".join(json.dumps({
                "type": "response_item", "payload": payload,
            }) + "\n" for payload in payloads), encoding="utf-8")
            return inspect(log)

    def test_freeform_wrapper_is_counted_and_requires_review(self):
        call = {"type": "custom_tool_call", "name": "exec", "call_id": "goal",
                "input": 'text(await tools.update_goal({status:"complete"}));'}
        report = self.inspect_rows(
            {"type": "function_call", "name": "computer", "call_id": "screen",
             "arguments": '{"action":"screenshot"}'}, call, call,
            {"type": "custom_tool_call_output", "call_id": "goal", "output": "done"},
        )
        self.assertEqual(report["tool_counts"], {"computer": 1, "exec": 1})
        self.assertEqual(report["tool_call_types"], {"function_call": 1, "custom_tool_call": 1})
        self.assertEqual(report["ui_only_status"], "manual")
        self.assertEqual(report["manual_tool_calls"][0]["input_preview"], call["input"])

    def test_freeform_with_allowed_name_cannot_bypass_review(self):
        for name in ("computer", "update_goal"):
            with self.subTest(name=name):
                report = self.inspect_rows({
                    "type": "custom_tool_call", "name": name, "call_id": "custom",
                    "input": "untrusted free-form content",
                })
                self.assertEqual(report["ui_only_status"], "manual")
                self.assertEqual(report["ui_action_counts"], {})

    def test_prohibited_function_remains_a_failure(self):
        report = self.inspect_rows({"type": "function_call", "name": "exec_command",
                                    "call_id": "shell", "arguments": "{}"})
        self.assertEqual(report["ui_only_status"], "failed")
        self.assertEqual(len(report["prohibited_tool_calls"]), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
