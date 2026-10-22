#!/usr/bin/env python3
"""Focused synthetic ODS tests; no office application or recalculation needed."""
from __future__ import annotations

from copy import deepcopy
from datetime import date
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from xml.etree import ElementTree as ET

import auswerten as checker

COLUMNS = ["Datensatz_ID", "Auftrags_ID", "Position", "Kunden_ID", "Kunde",
           "Auftragsdatum", "Lieferdatum", "Artikel_ID", "Artikel", "Menge",
           "Einheit", "Einzelpreis", "Rabatt", "Netto", "Steuer", "Brutto",
           "Zahlungsdatum", "Land", "PLZ", "Ort", "Zahlungsziel", "Notiz"]


def typed(kind, value):
    return {"type": kind, "value": value}


def text(value):
    return typed("string", value)


def number(value):
    return typed("number", str(value))


def fixture_oracle():
    records = []
    for index in range(1, 7):
        values = {name: text(f"{name} {index}") for name in COLUMNS}
        values.update({"Datensatz_ID": text(f"R{index:03d}"), "Position": number(1),
                       "Auftragsdatum": typed("date", "2026-09-08"),
                       "Lieferdatum": typed("date", "2026-09-10"), "Menge": number(index),
                       "Einzelpreis": number(f"{index}.25"), "Rabatt": number("0.05"),
                       "Netto": number(f"{index}.50"), "Steuer": number("0.19"),
                       "Brutto": number(f"{index}.95"), "Zahlungsdatum": typed("empty", None),
                       "Land": text("DE"), "PLZ": text("01234"), "Zahlungsziel": number(0),
                       "Notiz": text(f"Originalnotiz {index}: Rückgabe möglich.")})
        records.append({"id": f"R{index:03d}", "source_sheet_row": index + 1,
                        "input": deepcopy(values), "expected": deepcopy(values),
                        "disposition": "keep", "issue_id": None, "ambiguous_fields": []})
    records[0]["input"]["Menge"] = text("1")
    records[0]["issue_id"] = "I001"
    records[3]["input"] = deepcopy(records[2]["input"])
    records[3]["expected"] = deepcopy(records[2]["expected"])
    records[3]["input"]["Datensatz_ID"] = text("R004")
    records[3]["expected"]["Datensatz_ID"] = text("R004")
    records[3]["disposition"] = "duplicate"
    records[3]["issue_id"] = "I002"
    records[4]["input"]["Auftragsdatum"] = text("08/09/2026")
    records[4]["expected"]["Auftragsdatum"] = text("08/09/2026")
    records[4]["ambiguous_fields"] = ["Auftragsdatum"]
    records[4]["issue_id"] = "I003"
    return {"columns": COLUMNS, "records": records,
            "issues": [{"id": "I001", "difficulty": "clear", "kind": "numeric_text",
                        "record_id": "R001", "source_sheet_row": 2, "fields": ["Menge"], "reason": "Text quantity"},
                       {"id": "I002", "difficulty": "multistep", "kind": "duplicate",
                        "record_id": "R004", "source_sheet_row": 5, "fields": COLUMNS[1:], "reason": "Exact duplicate"},
                       {"id": "I003", "difficulty": "unclear", "kind": "ambiguous_date",
                        "record_id": "R005", "source_sheet_row": 6, "fields": ["Auftragsdatum"], "reason": "Both date readings possible"}],
            "duplicate_groups": [{"ids": ["R003", "R004"], "preferred_keep": "R003"}],
            "controls": [{"record_id": "R006", "reason": "Valid leading-zero PLZ and zero payment term"}],
            "expected_counts": {"checked": 6, "corrected": 1, "removed": 1, "unclear": 1, "remaining": 5}}


def fixture_rows(oracle, keep_duplicate="R003"):
    result = []
    for record in oracle["records"]:
        if record["id"] in ("R003", "R004") and record["id"] != keep_duplicate:
            continue
        corrected = any(not checker.typed_equal(record["input"][name], record["expected"][name]) for name in COLUMNS)
        result.append([deepcopy(record["expected"][name]) for name in COLUMNS] +
                      [text("Unklar" if record["ambiguous_fields"] else "Korrigiert" if corrected else "OK"),
                       text("Datum hat zwei mögliche Lesarten." if record["ambiguous_fields"] else
                            "Menge von Text in Zahl umgewandelt." if corrected else "")])
    return result


def add_cell(row, value):
    attributes = {}
    kind, payload = value["type"], value.get("value")
    if kind == "number":
        attributes = {checker.tag("office", "value-type"): "float", checker.tag("office", "value"): str(payload)}
    elif kind == "date":
        attributes = {checker.tag("office", "value-type"): "date", checker.tag("office", "date-value"): payload}
    elif kind == "string":
        attributes = {checker.tag("office", "value-type"): "string"}
    if value.get("style"):
        attributes[checker.tag("table", "style-name")] = value["style"]
    if value.get("formula"):
        attributes[checker.tag("table", "formula")] = value["formula"]
    if value.get("repeat"):
        attributes[checker.tag("table", "number-columns-repeated")] = str(value["repeat"])
    cell = ET.SubElement(row, checker.tag("table", "table-cell"), attributes)
    if kind != "empty":
        ET.SubElement(cell, checker.tag("text", "p")).text = str(payload)
    return cell


def write_ods(path, rows, headers=None, shared_date_style=False):
    root = ET.Element(checker.tag("office", "document-content"))
    if shared_date_style:
        styles = ET.SubElement(root, checker.tag("office", "automatic-styles"))
        ET.SubElement(styles, checker.tag("style", "style"), {
            checker.tag("style", "name"): "date_child", checker.tag("style", "family"): "table-cell",
            checker.tag("style", "parent-style-name"): "date_parent"})
    body = ET.SubElement(root, checker.tag("office", "body"))
    spreadsheet = ET.SubElement(body, checker.tag("office", "spreadsheet"))
    table = ET.SubElement(spreadsheet, checker.tag("table", "table"), {checker.tag("table", "name"): "Bereinigt"})
    header = ET.SubElement(table, checker.tag("table", "table-row"))
    for name in headers or COLUMNS + ["Prüfstatus", "Prüfhinweis"]:
        add_cell(header, text(name))
    for values in rows:
        row = ET.SubElement(table, checker.tag("table", "table-row"))
        for value in values:
            add_cell(row, value)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet")
        archive.writestr("content.xml", ET.tostring(root, encoding="utf-8", xml_declaration=True))
        if shared_date_style:
            shared = ET.Element(checker.tag("office", "document-styles"))
            styles = ET.SubElement(shared, checker.tag("office", "styles"))
            ET.SubElement(styles, checker.tag("number", "date-style"), {checker.tag("style", "name"): "date_format"})
            ET.SubElement(styles, checker.tag("style", "style"), {
                checker.tag("style", "name"): "date_parent", checker.tag("style", "family"): "table-cell",
                checker.tag("style", "data-style-name"): "date_format"})
            archive.writestr("styles.xml", ET.tostring(shared, encoding="utf-8", xml_declaration=True))


class EvaluatorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="openhiatus-auftragschaos-tests-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.oracle = fixture_oracle()
        self.oracle_path = self.directory / "oracle.json"
        self.oracle_path.write_text(json.dumps(self.oracle, ensure_ascii=False), encoding="utf-8")
        self.source = self.directory / "Originaleingabe.xlsx"
        self.source.write_bytes(b"Synthetic immutable input fixture")
        self.manifest = self.directory / "laufvorbereitung.json"
        self.manifest.write_text(json.dumps({"input": {"path": str(self.source), "sha256": hashlib.sha256(self.source.read_bytes()).hexdigest()},
                                             "expected_output": checker.OUTPUT_NAME}), encoding="utf-8")
        self.submission = self.directory / checker.OUTPUT_NAME

    def evaluate(self, rows=None, **kwargs):
        write_ods(self.submission, fixture_rows(self.oracle) if rows is None else rows, **kwargs)
        before = self.submission.read_bytes()
        report = checker.evaluate(self.submission, self.oracle_path)
        self.assertEqual(before, self.submission.read_bytes(), "Evaluator modified the ODS")
        return report

    def check(self, report, identifier):
        return next(item for item in report["checks"] if item["id"] == identifier)

    def test_correct_sorted_rows_accepted_without_claiming_ui_pass(self):
        rows = list(reversed(fixture_rows(self.oracle)))
        report = self.evaluate(rows)
        self.assertEqual(report["machine_status"], "passed")
        self.assertEqual(report["overall_status"], "manual")
        self.assertEqual(self.check(report, "ui_protocol")["status"], "manual")
        self.assertTrue(all(issue["status"] == "passed" for issue in report["issue_cases"]))

    def test_sorting_only_one_column_detected(self):
        rows = fixture_rows(self.oracle)
        rows[0][21], rows[1][21] = rows[1][21], rows[0][21]
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "record_integrity")["status"], "passed")
        self.assertEqual(self.check(report, "data_correctness")["status"], "failed")

    def test_either_exact_duplicate_can_be_retained(self):
        report = self.evaluate(fixture_rows(self.oracle, "R004"))
        self.assertEqual(report["machine_status"], "passed")
        group = self.check(report, "record_integrity")["evidence"]["duplicate_groups"][0]
        self.assertEqual(group["retained"], ["R004"])

    def test_both_duplicates_retained_fail(self):
        rows = fixture_rows(self.oracle)
        duplicate = fixture_rows(self.oracle, "R004")[2]
        rows.append(duplicate)
        self.assertEqual(self.check(self.evaluate(rows), "record_integrity")["status"], "failed")

    def test_missing_and_extra_ids_fail(self):
        rows = fixture_rows(self.oracle)
        rows[0][0] = text("INVENTED-ID")
        integrity = self.check(self.evaluate(rows), "record_integrity")
        self.assertEqual(integrity["status"], "failed")
        self.assertEqual(integrity["evidence"]["missing_ids"], ["R001"])
        self.assertEqual(integrity["evidence"]["extra_ids"], ["INVENTED-ID"])

    def test_numeric_text_rejected(self):
        rows = fixture_rows(self.oracle)
        rows[0][9] = text("1")
        data = self.check(self.evaluate(rows), "data_correctness")
        self.assertEqual(data["status"], "failed")
        self.assertIn("Wrong value type", data["evidence"]["differences"][0]["reason"])

    def test_ambiguous_guess_fails(self):
        rows = fixture_rows(self.oracle)
        rows[3][5] = typed("date", "2026-09-08")
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "ambiguous_handling")["status"], "failed")
        self.assertEqual(next(item for item in report["issue_cases"] if item["id"] == "I003")["status"], "failed")

    def test_unclear_reason_required_and_false_unclear_rejected(self):
        rows = fixture_rows(self.oracle)
        rows[3][23] = text("")
        rows[0][22] = text("Unklar")
        report = self.evaluate(rows)
        self.assertEqual(len(self.check(report, "ambiguous_handling")["evidence"]["errors"]), 2)

    def test_original_hash_mismatch(self):
        self.source.write_bytes(b"Changed source")
        report = self.evaluate()
        self.assertEqual(self.check(report, "original_hash")["status"], "failed")
        self.assertEqual(self.check(report, "data_correctness")["status"], "passed")

    def test_original_hash_missing_manifest_is_manual(self):
        self.manifest.unlink()
        report = self.evaluate()
        self.assertEqual(self.check(report, "original_hash")["status"], "manual")
        self.assertEqual(report["machine_status"], "manual")

    def test_untouched_text_postal_code_and_note_exact(self):
        rows = fixture_rows(self.oracle)
        rows[4][18] = text("1234")
        rows[4][21] = text(rows[4][21]["value"] + " ")
        differences = self.check(self.evaluate(rows), "data_correctness")["evidence"]["differences"]
        self.assertEqual({item["column"] for item in differences}, {"PLZ", "Notiz"})

    def test_helpers_allowed_but_header_order_required(self):
        rows = [row + [number(10)] for row in fixture_rows(self.oracle)]
        report = self.evaluate(rows, headers=COLUMNS + ["Prüfstatus", "Prüfhinweis", "Hilfswert"])
        self.assertEqual(report["machine_status"], "passed")
        headers = COLUMNS + ["Prüfstatus", "Prüfhinweis"]
        headers[1], headers[2] = headers[2], headers[1]
        self.assertEqual(self.check(self.evaluate(headers=headers), "columns")["status"], "failed")

    def test_date_serial_with_inherited_shared_date_style_accepted(self):
        rows = fixture_rows(self.oracle)
        serial = (date(2026, 9, 8) - date(1899, 12, 30)).days
        rows[0][5] = {**number(serial), "style": "date_child"}
        self.assertEqual(self.evaluate(rows, shared_date_style=True)["machine_status"], "passed")
        rows[0][5].pop("style")
        self.assertEqual(self.check(self.evaluate(rows), "data_correctness")["status"], "failed")

    def test_money_tolerance_quantity_exact_and_rate_tight(self):
        rows = fixture_rows(self.oracle)
        rows[0][11] = number("1.25000001")
        rows[0][12] = number("0.05000001")
        self.assertEqual(self.evaluate(rows)["machine_status"], "passed")
        rows[0][9] = number("1.000001")
        rows[0][11] = number("1.254")
        rows[0][12] = number("0.05001")
        differences = self.check(self.evaluate(rows), "data_correctness")["evidence"]["differences"]
        self.assertEqual({item["column"] for item in differences}, {"Menge", "Einzelpreis", "Rabatt"})

    def test_error_formula_fails_missing_cache_manual(self):
        rows = fixture_rows(self.oracle)
        rows[0][9] = {**typed("empty", None), "formula": "of:=1+0"}
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "data_correctness")["status"], "manual")
        self.assertEqual(self.check(report, "formula_caches")["status"], "manual")
        rows[0][9] = {**text("#DIV/0!"), "formula": "of:=1/0"}
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "formula_caches")["status"], "failed")

    def test_numeric_formula_type_without_value_is_missing_cache(self):
        element = ET.Element(checker.tag("table", "table-cell"), {
            checker.tag("office", "value-type"): "float", checker.tag("table", "formula"): "of:=1+0"})
        cell = checker.cell_from_xml(element, False, date(1899, 12, 30))
        self.assertEqual(checker.compare_cell(cell, number(1), 10)[0], "manual")

    def test_submission_folder_and_no_recalculation(self):
        self.evaluate()
        report = checker.evaluate(self.directory, self.oracle_path)
        self.assertEqual(report["machine_status"], "passed")

    def test_missing_correction_flag_and_note_separate_from_business_values(self):
        rows = fixture_rows(self.oracle)
        rows[0][22] = text("OK")
        rows[0][23] = text("")
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "data_correctness")["status"], "passed")
        self.assertEqual(self.check(report, "annotation_traceability")["status"], "failed")
        self.assertEqual(next(issue for issue in report["issue_cases"] if issue["id"] == "I001")["status"], "failed")

    def test_missing_numeric_or_wrong_status_rejected(self):
        for state in (typed("empty", None), number(1), text("Korrigiert")):
            with self.subTest(state=state):
                rows = fixture_rows(self.oracle)
                rows[1][22] = state
                report = self.evaluate(rows)
                self.assertEqual(self.check(report, "annotation_traceability")["status"], "failed")
                self.assertEqual(self.check(report, "data_correctness")["status"], "passed")

    def test_json_writer_creates_parent_and_blocks_direct_overwrite(self):
        report = self.evaluate()
        path = self.directory / "Neue Berichte" / "Prüfbericht.json"
        checker.write_json_report(path, report, self.oracle_path, self.directory)
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["machine_status"], "passed")
        for target in (self.submission, self.source, self.oracle_path, self.manifest):
            before = target.read_bytes()
            with self.assertRaises(ValueError):
                checker.write_json_report(target, report, self.oracle_path, self.directory)
            self.assertEqual(before, target.read_bytes())

    def test_json_link_to_submission_or_source_cannot_overwrite(self):
        report = self.evaluate()
        for index, target in enumerate((self.submission, self.source)):
            link = self.directory / f"Verknüpfung-{index}.json"
            try:
                link.symlink_to(target)
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f"Creating symbolic links is unavailable: {exc}")
            before = target.read_bytes()
            with self.assertRaises(ValueError):
                checker.write_json_report(link, report, self.oracle_path, self.directory)
            self.assertEqual(before, target.read_bytes())

    def test_json_hardlink_to_submission_or_source_cannot_overwrite(self):
        report = self.evaluate()
        for index, target in enumerate((self.submission, self.source)):
            link = self.directory / f"Dateialias-{index}.json"
            try:
                link.hardlink_to(target)
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f"Creating hard links is unavailable: {exc}")
            before = target.read_bytes()
            with self.assertRaises(ValueError):
                checker.write_json_report(link, report, self.oracle_path, self.directory)
            self.assertEqual(before, target.read_bytes())


class ParserTests(unittest.TestCase):
    def test_repeated_cells_rows_and_large_empty_runs(self):
        with tempfile.TemporaryDirectory(prefix="openhiatus-repeated-ods-") as temporary:
            path = Path(temporary) / "Wiederholungen.ods"
            xml = f'''<office:document-content xmlns:office="{checker.NS['office']}" xmlns:table="{checker.NS['table']}" xmlns:text="{checker.NS['text']}">
              <office:body><office:spreadsheet><table:table table:name="Test">
                <table:table-row table:number-rows-repeated="2">
                  <table:table-cell office:value-type="string"><text:p>A<text:s text:c="2"/>B<text:tab/>C<text:line-break/>D</text:p></table:table-cell>
                  <table:table-cell table:number-columns-repeated="2"/>
                  <table:table-cell office:value-type="float" office:value="7" table:number-columns-repeated="3"/>
                  <table:table-cell table:number-columns-repeated="1000000"/>
                </table:table-row>
                <table:table-row table:number-rows-repeated="1000000"><table:table-cell/></table:table-row>
                <table:table-row><table:table-cell office:value-type="string"><text:p>Ende</text:p></table:table-cell></table:table-row>
              </table:table></office:spreadsheet></office:body></office:document-content>'''
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("content.xml", xml)
            rows = checker.parse_ods(path)[0].rows
            self.assertEqual([number for number, _ in rows], [1, 2, 1000003])
            self.assertEqual(rows[0][1][1].value, "A  B\tC\nD")
            self.assertEqual(set(rows[0][1]), {1, 4, 5, 6})
            self.assertEqual(rows[0][1][6].value, checker.Decimal(7))

    def test_nonempty_repetition_limit_fails(self):
        with tempfile.TemporaryDirectory(prefix="openhiatus-ods-limit-") as temporary:
            path = Path(temporary) / "Grenze.ods"
            write_ods(path, [[{**text("x"), "repeat": 1000000}]])
            with self.assertRaisesRegex(ValueError, "parser limit"):
                checker.parse_ods(path)


class ActualOracleTests(unittest.TestCase):
    """Exercise every production row using transient ZIP/XML fixtures only."""

    def setUp(self):
        source_oracle = Path(__file__).with_name("oracle.json")
        if not source_oracle.exists():
            self.skipTest("Production oracle is not installed")
        self.oracle = checker.read_oracle(source_oracle)
        self.temporary = tempfile.TemporaryDirectory(prefix="openhiatus-production-oracle-tests-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.oracle_path = self.directory / "oracle.json"
        self.oracle_path.write_text(json.dumps(self.oracle, ensure_ascii=False), encoding="utf-8")
        source = self.directory / "Original.xlsx"
        source.write_bytes(b"Production oracle test input hash fixture")
        self.directory.joinpath("laufvorbereitung.json").write_text(json.dumps({
            "input": {"path": str(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}}), encoding="utf-8")
        self.path = self.directory / "Oracle-Prüfung.ods"
        self.headers = self.oracle["columns"] + ["Prüfstatus", "Prüfhinweis"]

    def rows(self, alternative_duplicates=False):
        discarded = {group["ids"][0 if alternative_duplicates else 1] for group in self.oracle["duplicate_groups"]}
        rows = []
        for record in self.oracle["records"]:
            if record["id"] in discarded:
                continue
            changed = any(not checker.typed_equal(record["input"][name], record["expected"][name]) for name in self.oracle["columns"])
            rows.append([deepcopy(record["expected"][name]) for name in self.oracle["columns"]] +
                        [text("Unklar" if record["ambiguous_fields"] else "Korrigiert" if changed else "OK"),
                         text("Sachverhalt ist nicht eindeutig; Rückfrage erforderlich." if record["ambiguous_fields"] else
                              "Geschäftswert nach gesicherter Quelle korrigiert." if changed else "")])
        return rows

    def evaluate(self, rows):
        write_ods(self.path, rows, self.headers)
        return checker.evaluate(self.path, self.oracle_path)

    def check(self, report, identifier):
        return next(item for item in report["checks"] if item["id"] == identifier)

    def test_full_sorted_oracle_all_40_issues(self):
        report = self.evaluate(list(reversed(self.rows())))
        self.assertEqual(report["machine_status"], "passed")
        self.assertEqual(len(report["issue_cases"]), 40)
        self.assertTrue(all(issue["status"] == "passed" for issue in report["issue_cases"]))
        self.assertEqual(report["counts"]["observed"]["corrected_matching_records"], 32)
        self.assertEqual(report["counts"]["observed"]["remaining"], 346)
        self.assertEqual(report["counts"]["observed"]["unclear"], 4)

    def test_full_oracle_all_alternative_duplicates(self):
        self.assertEqual(self.evaluate(self.rows(True))["machine_status"], "passed")

    def test_collateral_customer_edit_on_ambiguous_record_fails(self):
        rows = self.rows()
        row = next(row for row in rows if row[0]["value"] == "D0172")
        row[3] = text("K001")
        row[4] = text("Morgenrot Vertrieb GmbH")
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "ambiguous_handling")["status"], "failed")
        self.assertEqual(next(issue for issue in report["issue_cases"] if issue["id"] == "E37")["status"], "failed")

    def test_valid_early_row_collateral_edit_and_false_unclear_fail(self):
        rows = self.rows()
        rows[0][18] = text("1234")
        rows[1][22] = text("Unklar")
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "data_correctness")["status"], "failed")
        self.assertEqual(self.check(report, "ambiguous_handling")["status"], "failed")
        self.assertEqual(self.check(report, "record_integrity")["status"], "passed")

    def test_full_oracle_single_column_sort_detected(self):
        rows = self.rows()
        sorted_names = sorted((deepcopy(row[4]) for row in rows), key=lambda value: value["value"])
        for row, name in zip(rows, sorted_names):
            row[4] = name
        report = self.evaluate(rows)
        self.assertEqual(self.check(report, "data_correctness")["status"], "failed")
        self.assertEqual(self.check(report, "record_integrity")["status"], "passed")


if __name__ == "__main__":
    unittest.main()
