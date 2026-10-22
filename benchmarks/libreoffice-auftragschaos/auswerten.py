#!/usr/bin/env python3
"""Read-only, standard-library ODS checks for the Auftragschaos benchmark.

No formulas are recalculated and no workbook is changed. File checks cannot prove
formatting, GUI use, or the complete benchmark score; those remain manual.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {name: f"urn:oasis:names:tc:opendocument:xmlns:{name}:1.0"
      for name in ("office", "table", "text", "style")}
NS["number"] = "urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"
MAX_XML_BYTES = 32 * 1024 * 1024
MAX_ROWS = 10000
MAX_CELLS_PER_ROW = 1024
MAX_SHEETS = 100
MAX_DIAGNOSTICS = 500
OUTPUT_NAME = "Auftraege September 2026 bereinigt.ods"
ERROR_TEXT = re.compile(r"^(?:#(?:REF!|VALUE!|DIV/0!|NAME\?|N/A|NUM!|NULL!|SPILL!|CALC!)|Err:\s*\d+|Fehler:\s*\d+)$", re.I)


def tag(namespace: str, local: str) -> str:
    return f"{{{NS[namespace]}}}{local}"


def decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def iso_date(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        # ODF date-value also permits an ISO date-time.
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


@dataclass(frozen=True)
class Cell:
    kind: str = "empty"
    value: object = None
    text: str = ""
    formula: str | None = None
    cached: bool = True
    error: bool = False

    @property
    def nonempty(self) -> bool:
        return self.kind != "empty" or bool(self.text or self.formula or self.error)

    def describe(self) -> dict:
        value = str(self.value) if isinstance(self.value, Decimal) else self.value
        return {"type": self.kind, "value": value, "display": self.text,
                "formula": self.formula, "cached": self.cached, "error": self.error}


@dataclass
class Sheet:
    name: str
    rows: list[tuple[int, dict[int, Cell]]] = field(default_factory=list)


def read_xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    info = archive.getinfo(name)
    if info.file_size > MAX_XML_BYTES:
        raise ValueError(f"XML exceeds the parser limit: {name}")
    payload = archive.read(info)
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", payload, re.I):
        raise ValueError("XML DTDs and entities are not supported")
    return ET.fromstring(payload)


def repeat(element: ET.Element, attribute: str) -> int:
    try:
        result = int(element.get(tag("table", attribute), "1"))
    except ValueError as exc:
        raise ValueError("Invalid ODF repetition count") from exc
    if not 1 <= result <= 10_000_000:
        raise ValueError("ODF repetition count exceeds the parser limit")
    return result


def text_content(element: ET.Element) -> str:
    def inner(node: ET.Element) -> str:
        parts = [node.text or ""]
        for child in node:
            if child.tag == tag("text", "s"):
                try:
                    count = int(child.get(tag("text", "c"), "1"))
                except ValueError as exc:
                    raise ValueError("Invalid ODF space count") from exc
                if not 1 <= count <= 10000:
                    raise ValueError("ODF space count exceeds the parser limit")
                parts.append(" " * count)
            elif child.tag == tag("text", "tab"):
                parts.append("\t")
            elif child.tag == tag("text", "line-break"):
                parts.append("\n")
            else:
                parts.append(inner(child))
            parts.append(child.tail or "")
        return "".join(parts)
    paragraphs = element.findall("./text:p", NS)
    if paragraphs:
        return "\n".join(inner(paragraph) for paragraph in paragraphs)
    return element.get(tag("office", "string-value"), "")


def date_styles(roots: list[ET.Element]) -> tuple[set[str], str | None]:
    formats: set[str] = set()
    styles: dict[str, tuple[str | None, str | None]] = {}
    default_style = None
    for root in roots:
        for node in root.iter(tag("number", "date-style")):
            if node.get(tag("style", "name")):
                formats.add(node.get(tag("style", "name")))
        for node in root.iter(tag("style", "style")):
            if node.get(tag("style", "family")) == "table-cell":
                styles[node.get(tag("style", "name"), "")] = (
                    node.get(tag("style", "data-style-name")),
                    node.get(tag("style", "parent-style-name")))
        for node in root.iter(tag("style", "default-style")):
            if node.get(tag("style", "family")) == "table-cell":
                default_style = node.get(tag("style", "data-style-name"))
    found = set()
    for name in styles:
        seen = set()
        cursor = name
        while cursor in styles and cursor not in seen:
            seen.add(cursor)
            format_name, parent = styles[cursor]
            if format_name is not None:
                if format_name in formats:
                    found.add(name)
                break
            cursor = parent
    return found, "date" if default_style in formats else None


def cell_from_xml(element: ET.Element, styled_as_date: bool, base_date: date) -> Cell:
    raw_type = element.get(tag("office", "value-type"), "")
    displayed = text_content(element)
    formula = element.get(tag("table", "formula"))
    cache_attribute = {"float": "value", "currency": "value", "percentage": "value",
                       "date": "date-value", "boolean": "boolean-value", "time": "time-value"}.get(raw_type)
    cached = (element.get(tag("office", cache_attribute)) is not None if cache_attribute else
              raw_type == "string" or any(element.get(tag("office", key)) is not None
                                          for key in ("value", "date-value", "string-value", "boolean-value", "time-value")))
    error = raw_type == "error" or bool(ERROR_TEXT.fullmatch(displayed.strip()))
    if raw_type in ("float", "currency", "percentage"):
        value = decimal(element.get(tag("office", "value")))
        if value is None:
            return Cell("invalid-number", None, displayed, formula, cached, error)
        if styled_as_date:
            try:
                value_date = (base_date + timedelta(days=int(value))).isoformat()
            except (OverflowError, ValueError):
                return Cell("invalid-date", None, displayed, formula, cached, error)
            return Cell("date", value_date, displayed, formula, cached, error)
        return Cell("number", value, displayed, formula, cached, error)
    if raw_type == "date":
        value = iso_date(element.get(tag("office", "date-value")))
        return Cell("date" if value else "invalid-date", value, displayed, formula, cached, error)
    if raw_type == "string" or (not raw_type and displayed):
        value = element.get(tag("office", "string-value"), displayed)
        return Cell("string", value, displayed, formula, cached, error)
    if raw_type:
        return Cell(raw_type, element.get(tag("office", "boolean-value"), displayed),
                    displayed, formula, cached, error)
    return Cell("empty", None, displayed, formula, not formula or cached, error)


def table_children(parent: ET.Element, item: str, groups: tuple[str, ...]):
    for child in parent:
        if child.tag == tag("table", item):
            yield child
        elif child.tag in {tag("table", group) for group in groups}:
            yield from table_children(child, item, groups)


def parse_ods(path: Path | str) -> list[Sheet]:
    """Read sparse values, expanding only nonempty repeated rows/cells."""
    with zipfile.ZipFile(path) as archive:
        content = read_xml(archive, "content.xml")
        roots = [content]
        if "styles.xml" in archive.namelist():
            roots.append(read_xml(archive, "styles.xml"))
        styled_dates, default_date = date_styles(roots)
        spreadsheet = content.find("./office:body/office:spreadsheet", NS)
        if spreadsheet is None:
            raise ValueError("The archive contains no ODF spreadsheet")
        null_date = spreadsheet.find("./table:calculation-settings/table:null-date", NS)
        base_value = iso_date(null_date.get(tag("table", "date-value"))) if null_date is not None else None
        base_date = date.fromisoformat(base_value or "1899-12-30")
        result = []
        for table in spreadsheet.findall("./table:table", NS):
            if len(result) >= MAX_SHEETS:
                raise ValueError("Sheet count exceeds the parser limit")
            sheet = Sheet(table.get(tag("table", "name"), ""))
            column_styles: list[tuple[int, int, str | None]] = []
            column = 1
            for node in table_children(table, "table-column", ("table-header-columns", "table-column-group", "table-columns")):
                count = repeat(node, "number-columns-repeated")
                column_styles.append((column, column + count - 1, node.get(tag("table", "default-cell-style-name"))))
                column += count
            row_number = 1
            for row in table_children(table, "table-row", ("table-header-rows", "table-row-group", "table-rows")):
                cells: dict[int, Cell] = {}
                column = 1
                row_style = row.get(tag("table", "default-cell-style-name"))
                for node in row:
                    if node.tag not in (tag("table", "table-cell"), tag("table", "covered-table-cell")):
                        continue
                    count = repeat(node, "number-columns-repeated")
                    explicit_style = node.get(tag("table", "style-name")) or row_style
                    # Blank runs have no typed value, regardless of their format.
                    # Read once instead of expanding a million styled blanks.
                    probe = cell_from_xml(node, False, base_date)
                    if not probe.nonempty:
                        column += count
                        continue
                    if count > MAX_CELLS_PER_ROW or column + count - 1 > MAX_CELLS_PER_ROW:
                        raise ValueError("Nonempty cell repetition exceeds the parser limit")
                    for offset in range(min(count, MAX_CELLS_PER_ROW + 1)):
                        current = column + offset
                        inherited = next((name for start, end, name in column_styles if start <= current <= end), None)
                        name = explicit_style or inherited
                        cell = cell_from_xml(node, name in styled_dates if name else default_date == "date", base_date)
                        if cell.nonempty:
                            if current > MAX_CELLS_PER_ROW or len(cells) >= MAX_CELLS_PER_ROW:
                                raise ValueError("Nonempty cell exceeds the column parser limit")
                            cells[current] = cell
                    column += count
                count = repeat(row, "number-rows-repeated")
                if cells:
                    if len(sheet.rows) + count > MAX_ROWS:
                        raise ValueError("Nonempty row repetition exceeds the parser limit")
                    for offset in range(count):
                        sheet.rows.append((row_number + offset, cells.copy()))
                row_number += count
            result.append(sheet)
        return result


def typed_equal(left: dict, right: dict) -> bool:
    if left["type"] != right["type"]:
        return False
    if left["type"] == "number":
        return decimal(left["value"]) == decimal(right["value"])
    return left.get("value") == right.get("value")


def compare_cell(cell: Cell, wanted: dict, column_index: int, allow_whitespace: bool = False) -> tuple[str, str]:
    if cell.error:
        return "failed", "Cached spreadsheet error"
    if cell.formula and not cell.cached:
        return "manual", "Formula has no cached value; no recalculation performed"
    kind = wanted["type"]
    expected = wanted.get("value")
    if kind == "empty":
        return ("passed", "") if cell.kind == "empty" or (cell.kind == "string" and cell.value == "") else ("failed", "Expected an empty cell")
    if cell.kind != kind:
        return "failed", f"Wrong value type: expected {kind}, found {cell.kind}"
    if kind == "number":
        target = decimal(expected)
        # Expected money is already rounded to cents. Admit serialization noise,
        # but do not accept a different, unrounded half-cent business result.
        tolerance = Decimal("0.000001") if column_index in (12, 14, 16) else Decimal("0.0000001") if column_index == 13 else Decimal("0")
        if target is None or abs(cell.value - target) > tolerance:
            return "failed", f"Numeric value differs (tolerance {tolerance})"
    elif kind == "date":
        if cell.value != iso_date(expected):
            return "failed", "Date differs"
    elif kind == "string":
        actual = cell.value
        if allow_whitespace:
            actual = re.sub(r"\s+", " ", actual).strip()
            expected = re.sub(r"\s+", " ", expected).strip()
        if actual != expected:
            return "failed", "Text differs"
    else:
        return "failed", f"Unsupported oracle type: {kind}"
    return "passed", ""


def combined_status(statuses) -> str:
    values = list(statuses)
    return "failed" if "failed" in values else "manual" if "manual" in values else "passed"


def add_check(report: dict, identifier: str, status: str, summary: str, **evidence) -> None:
    report["checks"].append({"id": identifier, "status": status, "summary": summary, "evidence": evidence})


def read_oracle(path: Path) -> dict:
    oracle = json.loads(path.read_text(encoding="utf-8-sig"))
    columns = oracle["columns"]
    if len(columns) != 22 or len(set(columns)) != 22 or columns[0] != "Datensatz_ID":
        raise ValueError("Oracle must define 22 distinct columns beginning with Datensatz_ID")
    ids = [record["id"] for record in oracle["records"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Oracle contains duplicate immutable IDs")
    for record in oracle["records"]:
        if record.get("disposition") not in ("keep", "duplicate"):
            raise ValueError("Invalid oracle record disposition")
        if not set(record.get("ambiguous_fields", [])).issubset(columns):
            raise ValueError("Oracle ambiguous field is not a business column")
        for version in ("input", "expected"):
            if set(record[version]) != set(columns):
                raise ValueError(f"Oracle {version} columns differ for {record['id']}")
            for wanted in record[version].values():
                if wanted["type"] not in ("string", "number", "date", "empty"):
                    raise ValueError("Unsupported oracle value type")
                if wanted["type"] == "number" and decimal(wanted["value"]) is None:
                    raise ValueError("Invalid oracle number")
                if wanted["type"] == "date" and not iso_date(wanted["value"]):
                    raise ValueError("Invalid oracle date")
            if record[version][columns[0]] != {"type": "string", "value": record["id"]}:
                raise ValueError("Oracle immutable ID differs from the record ID")
    seen_groups = set()
    for group in oracle.get("duplicate_groups", []):
        members = group["ids"]
        if len(members) != 2 or len(set(members)) != 2 or not set(members).issubset(ids) or seen_groups.intersection(members):
            raise ValueError("Invalid or overlapping oracle duplicate group")
        seen_groups.update(members)
    return oracle


def hash_original(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        return {"status": "manual", "summary": "No laufvorbereitung.json; the original input hash cannot be checked", "evidence": {"manifest": str(manifest_path)}}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        source = Path(manifest["input"]["path"])
        if not source.is_absolute():
            source = manifest_path.parent / source
        expected = manifest["input"]["sha256"].lower()
        if not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError("Invalid SHA-256 in preparation manifest")
        digest = hashlib.sha256()
        with source.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        actual = digest.hexdigest()
        return {"status": "passed" if actual == expected else "failed",
                "summary": "Original input file is unchanged" if actual == expected else "Original input file hash differs",
                "evidence": {"path": str(source), "expected_sha256": expected, "actual_sha256": actual}}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return {"status": "failed", "summary": "Original input file hash could not be verified", "evidence": {"error": str(exc)}}


def resolve_submission(path: Path, manifest_path: Path) -> Path:
    if not path.is_dir():
        return path
    expected_name = OUTPUT_NAME
    if manifest_path.exists():
        try:
            expected_name = json.loads(manifest_path.read_text(encoding="utf-8-sig")).get("expected_output", expected_name)
        except (OSError, ValueError, TypeError):
            pass
    expected_path = path / Path(expected_name).name
    if expected_path.is_file():
        return expected_path
    choices = list(path.glob("*.ods"))
    if len(choices) == 1:
        return choices[0]
    raise ValueError(f"Submission folder needs {expected_name!r} or exactly one ODS file")


def evaluate(abgabe: Path | str, oracle_path: Path | str | None = None,
             manifest_path: Path | str | None = None) -> dict:
    oracle_file = Path(oracle_path) if oracle_path else Path(__file__).with_name("oracle.json")
    preparation = Path(manifest_path) if manifest_path else oracle_file.with_name("laufvorbereitung.json")
    oracle = read_oracle(oracle_file)
    report = {"benchmark": "libreoffice-auftragschaos", "read_only": True,
              "checks": [], "issue_cases": [], "counts": {"expected": oracle.get("expected_counts", {})},
              "limitations": ["No formula recalculation or workbook modification.",
                              "Formatting and exclusive GUI use require manual review; file checks cannot establish a full score."]}
    original = hash_original(preparation)
    add_check(report, "original_hash", original["status"], original["summary"], **original["evidence"])
    try:
        submission = resolve_submission(Path(abgabe), preparation)
        report["submission"] = str(submission.resolve())
        sheets = parse_ods(submission)
    except (OSError, ValueError, zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
        add_check(report, "submission_read", "failed", "ODS could not be read", error=str(exc))
        return finish_report(report)
    columns = oracle["columns"]
    headers = columns + ["Prüfstatus", "Prüfhinweis"]
    candidates = []
    partial_headers = []
    formulas = []
    for sheet in sheets:
        for position, (row_number, cells) in enumerate(sheet.rows):
            for column, cell in cells.items():
                if cell.error or (cell.formula and not cell.cached):
                    formulas.append({"sheet": sheet.name, "row": row_number, "column": column,
                                     "status": "failed" if cell.error else "manual", "cell": cell.describe()})
            actual = [cells.get(index, Cell()).value for index in range(1, 25)]
            if actual == headers and all(cells[index].kind == "string" for index in range(1, 25)):
                candidates.append((sheet, position, row_number))
            elif cells.get(1, Cell()).value == "Datensatz_ID":
                partial_headers.append({"sheet": sheet.name, "row": row_number, "actual": actual})
    add_check(report, "formula_caches", combined_status(item["status"] for item in formulas),
              "Cached formula errors fail; missing cached values need manual review", cells=formulas[:MAX_DIAGNOSTICS], count=len(formulas))
    if len(candidates) != 1:
        add_check(report, "columns", "failed", "Exactly one cleaned table with exact A–X headers is required",
                  matching_tables=[{"sheet": sheet.name, "row": row} for sheet, _, row in candidates],
                  partial_headers=partial_headers, expected=headers)
        return finish_report(report)
    sheet, position, header_row = candidates[0]
    add_check(report, "columns", "passed", "A–V columns and required W/X headers are correct; helpers to the right are allowed",
              sheet=sheet.name, header_row=header_row)
    expected_records = {record["id"]: record for record in oracle["records"]}
    row_sets: dict[str, list[tuple[int, dict[int, Cell]]]] = {}
    unidentified = []
    for row_number, cells in sheet.rows[position + 1:]:
        if not any(cell.nonempty for col, cell in cells.items() if col <= 24):
            continue
        identity = cells.get(1, Cell())
        if identity.kind == "string" and identity.value:
            row_sets.setdefault(identity.value, []).append((row_number, cells))
        else:
            unidentified.append({"row": row_number, "id_cell": identity.describe()})
    actual_ids = set(row_sets)
    expected_ids = set(expected_records)
    groups = oracle.get("duplicate_groups", [])
    group_ids = {identity for group in groups for identity in group["ids"]}
    group_results = []
    for group in groups:
        present = [identity for identity in group["ids"] if identity in actual_ids]
        occurrences = sum(len(row_sets[identity]) for identity in present)
        group_results.append({"ids": group["ids"], "retained": present,
                              "status": "passed" if occurrences == 1 else "failed", "occurrences": occurrences})
    missing = sorted(expected_ids - actual_ids - group_ids)
    extra = sorted(actual_ids - expected_ids)
    repeated = {identity: len(rows) for identity, rows in row_sets.items() if len(rows) > 1}
    remaining = len(oracle["records"]) - sum(len(group["ids"]) - 1 for group in groups)
    observed_rows = sum(len(rows) for rows in row_sets.values()) + len(unidentified)
    integrity_ok = not (missing or extra or repeated or unidentified) and all(item["status"] == "passed" for item in group_results) and observed_rows == remaining
    add_check(report, "record_integrity", "passed" if integrity_ok else "failed",
              "Immutable IDs preserve row identity and each duplicate group retains exactly one member",
              missing_ids=missing, extra_ids=extra, repeated_ids=repeated, unidentified_rows=unidentified,
              duplicate_groups=group_results, expected_rows=remaining, actual_rows=observed_rows)
    record_results: dict[str, dict] = {}
    field_errors = []
    unclear_errors = []
    annotation_errors = []
    valid_corrections = 0
    observed_unclear = 0
    for identity in sorted(expected_ids & actual_ids):
        record = expected_records[identity]
        ambiguous = set(record.get("ambiguous_fields", []))
        for row_number, cells in row_sets[identity]:
            statuses = []
            corrections = []
            for index, name in enumerate(columns, 1):
                # Any ambiguity protects the entire business record, including
                # customer master values outside the nominated ambiguous field.
                wanted = record["input"][name] if ambiguous else record["expected"][name]
                changed = not typed_equal(record["input"][name], wanted)
                status, reason = compare_cell(cells.get(index, Cell()), wanted, index,
                                              changed and wanted["type"] == "string" and index not in (1, 19, 22))
                statuses.append(status)
                if changed:
                    corrections.append(name)
                if status != "passed":
                    field_errors.append({"id": identity, "row": row_number, "column": name,
                                         "status": status, "reason": reason, "expected": wanted,
                                         "actual": cells.get(index, Cell()).describe(), "ambiguous": name in ambiguous,
                                         "unclear_record": bool(ambiguous)})
            state = cells.get(23, Cell())
            note = cells.get(24, Cell())
            is_unclear = state.kind == "string" and state.value == "Unklar"
            observed_unclear += int(is_unclear)
            annotation_status = "passed"
            expected_state = "Unklar" if ambiguous else "Korrigiert" if corrections else "OK"
            annotation_reasons = []
            if state.kind != "string" or state.value != expected_state:
                annotation_reasons.append(f"Prüfstatus must be the text {expected_state!r}")
            if (ambiguous or corrections) and (note.kind != "string" or not str(note.value).strip()):
                annotation_reasons.append("A nonempty textual Prüfhinweis is required")
            if annotation_reasons:
                annotation_status = "failed"
                annotation_errors.append({"id": identity, "row": row_number,
                                          "reasons": annotation_reasons, "expected_state": expected_state,
                                          "actual_state": state.describe(), "actual_note": note.describe()})
            if ambiguous:
                if not is_unclear or note.kind != "string" or not str(note.value).strip():
                    unclear_errors.append({"id": identity, "row": row_number,
                                           "reason": "Ambiguous record needs Prüfstatus='Unklar' and a nonempty textual Prüfhinweis"})
            elif state.kind == "string" and str(state.value).strip().casefold() == "unklar":
                unclear_errors.append({"id": identity, "row": row_number, "reason": "Unambiguous record was falsely marked Unklar"})
            row_data_status = combined_status(statuses)
            row_status = combined_status((row_data_status, annotation_status))
            if row_data_status == "passed" and corrections:
                valid_corrections += 1
            record_results[identity] = {"status": row_status, "submission_row": row_number,
                                        "data_status": row_data_status, "annotation_status": annotation_status,
                                        "changed_fields_expected": corrections}
    data_status = combined_status([item["data_status"] for item in record_results.values()] + (["failed"] if missing else []))
    add_check(report, "data_correctness", data_status,
              "Typed values match the oracle by immutable ID; number-looking text is not a number",
              compared_records=len(record_results), differences=field_errors[:MAX_DIAGNOSTICS], difference_count=len(field_errors))
    add_check(report, "annotation_traceability", "failed" if annotation_errors or missing else "passed",
              "Corrected rows require Korrigiert and a note, unchanged rows OK, protected rows Unklar and a note",
              errors=annotation_errors[:MAX_DIAGNOSTICS], error_count=len(annotation_errors),
              missing_record_ids=missing)
    protected_ids = [identity for identity, record in expected_records.items() if record.get("ambiguous_fields")]
    unclear_status = combined_status([record_results.get(identity, {"status": "failed"})["status"] for identity in protected_ids] +
                                     (["failed"] if unclear_errors else []))
    add_check(report, "ambiguous_handling", unclear_status,
              "Ambiguous input values are preserved and flagged; valid records are not falsely Unklar",
              errors=unclear_errors, observed_unclear=observed_unclear,
              protected_record_ids=protected_ids,
              business_differences=[item for item in field_errors if item["unclear_record"]][:MAX_DIAGNOSTICS])
    for issue in oracle.get("issues", []):
        identity = issue["record_id"]
        relevant_group = next((result for result in group_results if identity in result["ids"]), None)
        if relevant_group is not None:
            status = combined_status([relevant_group["status"]] + [record_results.get(kept, {"status": "failed"})["status"] for kept in relevant_group["retained"]])
            detail = relevant_group
        else:
            result = record_results.get(identity)
            status = result["status"] if result else "failed"
            detail = result or {"reason": "Record absent"}
        report["issue_cases"].append({"id": issue["id"], "difficulty": issue["difficulty"],
                                      "kind": issue["kind"], "record_id": identity,
                                      "source_sheet_row": issue["source_sheet_row"],
                                      "fields": issue["fields"], "status": status, "evidence": detail})
    control_results = [{"record_id": control["record_id"], "reason": control["reason"],
                        "status": record_results.get(control["record_id"], {"status": "failed"})["status"]}
                       for control in oracle.get("controls", [])]
    add_check(report, "control_records", combined_status(item["status"] for item in control_results),
              "Valid control records retain their business values and types", records=control_results)
    report["counts"]["observed"] = {"remaining": observed_rows, "corrected_matching_records": valid_corrections,
                                       "removed_known_ids": len(expected_ids - actual_ids), "unclear": observed_unclear,
                                       "compared_records": len(record_results)}
    report["counts"]["issue_statuses"] = {difficulty: dict(Counter(item["status"] for item in report["issue_cases"] if item["difficulty"] == difficulty))
                                             for difficulty in ("clear", "multistep", "unclear")}
    return finish_report(report)


def finish_report(report: dict) -> dict:
    report["machine_status"] = combined_status(check["status"] for check in report["checks"])
    add_check(report, "formatting", "manual", "Inspect date/currency formats, legibility, frozen/filter headers, and other task formatting in Calc")
    add_check(report, "ui_protocol", "manual", "The file cannot establish GUI-only work or the required UI protocol")
    add_check(report, "explanation_quality", "manual", "Review the specificity of unclear-record explanations and the separate checking/counts protocol")
    report["overall_status"] = "failed" if report["machine_status"] == "failed" else "manual"
    return report


def write_json_report(path: Path, report: dict, oracle_path: Path, abgabe: Path) -> None:
    """Write only a separate JSON report, after resolving links and folder inputs."""
    manifest_path = oracle_path.with_name("laufvorbereitung.json")
    protected = {abgabe.resolve(), oracle_path.resolve(), manifest_path.resolve()}
    if report.get("submission"):
        protected.add(Path(report["submission"]).resolve())
    if manifest_path.exists():
        try:
            original_path = Path(json.loads(manifest_path.read_text(encoding="utf-8-sig"))["input"]["path"])
            if not original_path.is_absolute():
                original_path = manifest_path.parent / original_path
            protected.add(original_path.resolve())
        except (OSError, ValueError, KeyError, TypeError):
            pass
    same_existing_file = path.exists() and any(path.samefile(candidate) for candidate in protected if candidate.exists())
    if path.suffix.lower() != ".json" or path.resolve() in protected or same_existing_file:
        raise ValueError("--output must name a separate JSON report, never an original input, submission, oracle, or manifest")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--abgabe", required=True, type=Path, help="ODS file or submission folder")
    parser.add_argument("--oracle", type=Path, default=Path(__file__).with_name("oracle.json"))
    parser.add_argument("--output", type=Path, help="Optional JSON report; the ODS and original input are never modified")
    args = parser.parse_args(argv)
    try:
        report = evaluate(args.abgabe, args.oracle)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.error(str(exc))
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        try:
            write_json_report(args.output, report, args.oracle, args.abgabe)
        except (OSError, ValueError) as exc:
            parser.error(str(exc))
    print(payload)
    return 1 if report["machine_status"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
