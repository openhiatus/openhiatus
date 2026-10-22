#!/usr/bin/env python3
"""Lesende Bestandsprüfung des LibreOffice-Benchmarks; kein vollständiger UI-Nachweis.

Python-Standardbibliothek genügt für ODS/ODT. PDF-Text und Seitenanzahl werden
optional mit PyMuPDF oder pypdf gelesen. Formeln werden NICHT neu berechnet.
Der JSON-Bericht unterscheidet passed, failed und manual; er vergibt keine Punkte.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
import unittest
import zipfile
from xml.etree import ElementTree as ET

NS = {key: f"urn:oasis:names:tc:opendocument:xmlns:{value}:1.0" for key, value in {
    "office": "office", "table": "table", "text": "text", "chart": "chart",
}.items()}
MAX_XML_BYTES = 32 * 1024 * 1024
MAX_NONEMPTY_ROWS = 10000
MAX_NONEMPTY_CELLS = 2000
FILES = ("OP_September_2026.ods", "Managementbericht_September_2026.odt",
         "Managementbericht_September_2026.pdf")
LABELS = {
    "aktive_rechnungen": ("aktive rechnungen", "anzahl aktiver rechnungen"),
    "gesamtforderung": ("gesamtforderung", "gesamte rechnungsforderung", "rechnungsforderung", "gesamtforderung eur"),
    "bankeingang_eindeutig": ("eindeutige bankeingange", "bankeingange eindeutig", "eindeutige bankeingange insgesamt"),
    "anrechenbare_zahlungen": ("anrechenbare zahlungen", "summe anrechenbarer zahlungen"),
    "zahlungen_aktive_rechnungen": ("zahlungen auf aktive rechnungen", "zahlungen aktive rechnungen", "bankeingange auf aktive rechnungen"),
    "offene_forderungen": ("offene forderungen", "gesamtbetrag offener forderungen", "gesamtbetrag aller offenen forderungen"),
    "ueberfaelliger_betrag": ("davon uberfallig", "uberfalliger betrag", "uberfallige forderungen", "summe uberfalliger rechnungen"),
    "ueberfaellige_rechnungen": ("anzahl uberfalliger rechnungen", "uberfallige rechnungen anzahl"),
    "nicht_zuordenbar": ("nicht zuordenbare zahlungen", "nicht zuordenbar"),
    "ueberzahlung": ("uberzahlung", "uberzahlungen"),
    "doppelt_importiert": ("doppelt importierter betrag", "doppelt importiert"),
    "offene_rechnungen": ("offene rechnungen", "anzahl offener rechnungen"),
}


def tag(namespace: str, local: str) -> str:
    return f"{{{NS[namespace]}}}{local}"


def normalized(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value.casefold().replace("ß", "ss"))
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in plain if not unicodedata.combining(c))).strip()


def decimal(value: object) -> Decimal | None:
    if isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def canonical_date(value: str) -> str | None:
    for pattern in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(value[:10], pattern).date().isoformat()
        except ValueError:
            pass
    return None


@dataclass
class Cell:
    text: str = ""
    number: Decimal | None = None
    date: str | None = None
    formula: str | None = None
    value_type: str = ""

    @property
    def nonempty(self) -> bool:
        return bool(self.text or self.number is not None or self.date or self.formula)

    def matches(self, expected: object) -> bool:
        value = str(expected)
        if canonical_date(value):
            return canonical_date(value) == (canonical_date(self.date or self.text))
        expected_number = decimal(value)
        if expected_number is not None:
            return expected_number == (self.number if self.number is not None else decimal(self.text))
        return self.text == value

    def describe(self) -> dict:
        return {"text": self.text, "value": str(self.number) if self.number is not None else None,
                "date": self.date, "formula": self.formula}


@dataclass
class Sheet:
    name: str
    rows: list[tuple[int, dict[int, Cell]]] = field(default_factory=list)


def read_xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    info = archive.getinfo(name)
    if info.file_size > MAX_XML_BYTES:
        raise ValueError(f"XML-Datei zu groß für diesen Prüfer: {name}")
    content = archive.read(info)
    if b"<!DOCTYPE" in content or b"<!ENTITY" in content:
        raise ValueError("XML mit DTD/Entities wird nicht verarbeitet")
    return ET.fromstring(content)


def cell_from_xml(element: ET.Element) -> Cell:
    text = "\n".join("".join(p.itertext()) for p in element.findall("./text:p", NS))
    if not text:
        text = element.get(tag("office", "string-value"), "")
    kind = element.get(tag("office", "value-type"), "")
    return Cell(text=text, number=decimal(element.get(tag("office", "value"))) if kind in ("float", "currency", "percentage") else None,
                date=element.get(tag("office", "date-value")), formula=element.get(tag("table", "formula")), value_type=kind)


def positive_repeat(element: ET.Element, attribute: str) -> int:
    count = int(element.get(tag("table", attribute), "1"))
    if count < 1:
        raise ValueError("Ungültige ODF-Wiederholungszahl")
    return count


def parse_sheets(root: ET.Element) -> tuple[list[Sheet], list[str]]:
    sheets, limitations = [], []
    spreadsheet = root.find("./office:body/office:spreadsheet", NS)
    if spreadsheet is None:
        raise ValueError("Kein Calc-Dokument im ODS-Container")
    for table in spreadsheet.findall("./table:table", NS):
        sheet = Sheet(table.get(tag("table", "name"), ""))
        row_index = 1
        # Gruppen und Kopfzeilen sind erlaubt; verschachtelte Zelltabellen nicht.
        def table_rows(parent: ET.Element):
            for child in parent:
                if child.tag == tag("table", "table-row"):
                    yield child
                elif child.tag in {tag("table", name) for name in ("table-header-rows", "table-row-group", "table-rows")}:
                    yield from table_rows(child)
        for row in table_rows(table):
            cells, column = {}, 1
            for element in row:
                if element.tag not in (tag("table", "table-cell"), tag("table", "covered-table-cell")):
                    continue
                repeat = positive_repeat(element, "number-columns-repeated")
                cell = cell_from_xml(element)
                if cell.nonempty:
                    remaining = MAX_NONEMPTY_CELLS - len(cells)
                    for offset in range(min(repeat, remaining)):
                        cells[column + offset] = cell
                    if repeat > remaining:
                        limitations.append(f"Zellenlimit in {sheet.name}, Zeile {row_index}")
                column += repeat
            repeat = positive_repeat(row, "number-rows-repeated")
            if cells:
                remaining = MAX_NONEMPTY_ROWS - len(sheet.rows)
                for offset in range(min(repeat, remaining)):
                    sheet.rows.append((row_index + offset, cells.copy()))
                if repeat > remaining:
                    limitations.append(f"Zeilenlimit in {sheet.name}")
            row_index += repeat
        sheets.append(sheet)
    return sheets, sorted(set(limitations))


def check(report: dict, key: str, status: str, summary: str, **evidence) -> None:
    report["checks"].append({"id": key, "status": status, "summary": summary, "evidence": evidence})


def source_candidates(sheets: list[Sheet], originals: list[dict]) -> tuple[list[str], list[str]]:
    """Compare source values/row order, including duplicates, without assuming sheet names."""
    if not originals:
        return [], []
    headers = list(originals[0])
    matches, candidates = [], []
    for sheet in sheets:
        for position, (_, cells) in enumerate(sheet.rows):
            columns = {}
            for header in headers:
                found = [col for col, cell in cells.items() if normalized(cell.text) == normalized(header)]
                if len(found) == 1:
                    columns[header] = found[0]
            if len(columns) != len(headers):
                continue
            candidates.append(sheet.name)
            subsequent = sheet.rows[position + 1:]
            # An original-data sheet may have a title above the header, but no extra data below it.
            if len(subsequent) != len(originals):
                continue
            if all(all(row.get(columns[h], Cell()).matches(original[h]) for h in headers)
                   for (_, row), original in zip(subsequent, originals)):
                matches.append(sheet.name)
    return sorted(set(matches)), sorted(set(candidates))


def metric_candidates(sheets: list[Sheet], key: str) -> list[dict]:
    """Only direct labelled neighbouring numeric cells, never a number anywhere in a workbook."""
    labels = set(LABELS.get(key, ())) | {normalized(key)}
    candidates = []
    for sheet in sheets:
        row_lookup = dict(sheet.rows)
        for index, cells in sheet.rows:
            for col, label in cells.items():
                if normalized(label.text) not in labels:
                    continue
                # At most two adjacent cells, or directly underneath the label.
                # A dashboard may show count AND amount beside one label. Neither
                # value can be chosen without units/header evidence; keep it manual.
                right = next(((index, column) for column in (col + 1, col + 2)
                              if cells.get(column, Cell()).nonempty), None)
                adjacent = [right] if right else [(index + 1, col)]
                if right == (index, col + 1) and cells[col + 1].number is not None and cells.get(col + 2, Cell()).number is not None:
                    adjacent.append((index, col + 2))
                for row_num, column in adjacent:
                    value = row_lookup.get(row_num, {}).get(column)
                    if value and value.number is not None:
                        candidates.append({"sheet": sheet.name, "label_row": index, "label_column": col,
                                           "row": row_num, "column": column,
                                           "ambiguous_row": len(adjacent) > 1, **value.describe()})
    return candidates


def inspect_ods(path: Path, oracle: dict, phase: str, report: dict) -> None:
    with zipfile.ZipFile(path) as archive:
        root = read_xml(archive, "content.xml")
        sheets, limitations = parse_sheets(root)
        charts = []
        for name in archive.namelist():
            if name.endswith("/content.xml") and len(charts) < 100:
                child = read_xml(archive, name)
                if child.find(".//chart:chart", NS) is not None:
                    charts.append(name)
        if root.find(".//chart:chart", NS) is not None:
            charts.append("content.xml")
    report["ods"] = {"sheets": [{"name": sheet.name, "nonempty_rows": len(sheet.rows)} for sheet in sheets],
                     "limitations": limitations}
    check(report, "ods.parse", "passed", "ODS-Inhalt lesbar.", sheets=[s.name for s in sheets])
    check(report, "ods.bounds", "manual" if limitations else "passed", "Parsergrenzen geprüft.", limitations=limitations)
    formulas, errors = [], []
    for sheet in sheets:
        for index, cells in sheet.rows:
            for col, cell in cells.items():
                if cell.formula:
                    formulas.append({"sheet": sheet.name, "row": index, "column": col, **cell.describe()})
                if re.match(r"^(?:#(?:DIV/0!|VALUE!|REF!|NAME\?|NUM!|N/A|SPILL!|CALC!)|Err:\s*\d+|Fehler:\s*\d+)$", cell.text.strip(), re.I):
                    errors.append({"sheet": sheet.name, "row": index, "column": col, "text": cell.text})
    check(report, "ods.formulas", "passed" if formulas else ("manual" if limitations else "failed"),
          "Formelzellen vorhanden; ihre fachliche Vollständigkeit ist separat zu prüfen." if formulas else "Keine Formelzellen gefunden.",
          count=len(formulas), sample=formulas[:20])
    check(report, "ods.cell_errors", "failed" if errors else "manual", "Sichtbare gespeicherte Zellfehler gefunden." if errors else
          "Keine offensichtlichen gespeicherten Zellfehler; keine Neuberechnung oder vollständige Fehlerfreiheit bewiesen.", errors=errors[:50])
    check(report, "ods.chart", "passed" if charts else "manual", "Eingebettetes Diagramm gefunden." if charts else
          "Kein eingebettetes ODF-Diagramm erkannt; Diagramm und Kundenzuordnung visuell prüfen.", entries=charts)
    source_names = {}
    for kind in ("rechnungen", "zahlungen"):
        originals = oracle.get("originaldaten", {}).get(kind, [])
        matches, candidates = source_candidates(sheets, originals)
        source_names[kind] = matches
        status = "passed" if matches and not limitations else "manual"
        if originals and candidates and not matches and not limitations:
            status = "failed"
        check(report, "ods.original." + kind, status,
              "Originalwerte und Zeilenfolge unverändert gefunden." if status == "passed" else
              "Originaldaten nicht exakt bestätigt; Kandidatentabellen und Import-Datentypen prüfen.",
              matching_sheets=matches, candidate_sheets=candidates, expected_rows=len(originals))
    distinct = any(a != b for a in source_names.get("rechnungen", []) for b in source_names.get("zahlungen", []))
    check(report, "ods.separate_originals", "passed" if distinct else "manual", "Getrennte Originaltabellen bestätigt." if distinct else
          "Getrennte unveränderte Originaltabellen nicht automatisch bestätigt.")
    for key, expected in oracle[phase]["kennzahlen"].items():
        candidates = metric_candidates(sheets, key)
        values = {decimal(candidate["value"]) for candidate in candidates}
        expected_decimal = decimal(expected)
        if len(values) != 1 or expected_decimal is None or limitations or any(c.get("ambiguous_row") for c in candidates):
            status = "manual"
        else:
            status = "passed" if next(iter(values)) == expected_decimal else "failed"
        check(report, "ods.metric." + key, status,
              "Beschrifteter gespeicherter Wert stimmt mit Sollwert überein." if status == "passed" else
              "Beschrifteter gespeicherter Wert weicht ab." if status == "failed" else
              "Kennzahl nicht eindeutig über eine bekannte Beschriftung identifiziert; manuell vergleichen.",
              expected=str(expected), candidates=candidates)
        if candidates:
            check(report, "ods.metric_formula." + key, "passed" if all(c["formula"] for c in candidates) else "manual",
                  "Gefundene Kennzahlzellen enthalten Formeln." if all(c["formula"] for c in candidates) else
                  "Nicht alle gefundenen Kennzahlzellen enthalten Formeln; Fachformeln und mögliche falsche Zuordnung prüfen.")
    check(report, "ods.accounting_logic", "manual", "Rechnungsabgleich, Fehlerfälle, Stichtagslogik, Kundendiagramm und Top drei fachlich prüfen.",
          expected_top_three=oracle[phase].get("top_drei"), expected_errors=oracle.get("fehlerfaelle"))


def inspect_odt(path: Path, oracle: dict, phase: str, report: dict) -> None:
    with zipfile.ZipFile(path) as archive:
        root = read_xml(archive, "content.xml")
    body = root.find("./office:body/office:text", NS)
    if body is None:
        raise ValueError("Kein Writer-Dokument im ODT-Container")
    paragraphs = ["".join(element.itertext()) for element in body.iter()
                  if element.tag in (tag("text", "p"), tag("text", "h"))]
    headings = ["".join(element.itertext()) for element in body.iter(tag("text", "h"))]
    report["odt"] = {"text": "\n".join(paragraphs), "headings": headings,
                     "table_count": len(body.findall(".//table:table", NS))}
    check(report, "odt.parse", "passed", "Writer-Inhalt lesbar.")
    check(report, "odt.content", "manual", "Kennzahlen, Top drei, Datenprobleme und mindestens zwei konkrete Empfehlungen im Text prüfen.",
          expected_metrics=oracle[phase]["kennzahlen"], expected_top_three=oracle[phase].get("top_drei"))
    check(report, "odt.layout", "manual", "Professionelle Gestaltung und einseitiges Layout visuell prüfen; Textauszug beweist kein Layout.")


def inspect_pdf(path: Path, report: dict) -> None:
    # Optional reader installed only for this controller, without changing the
    # system Python or any agent document. Keep its location outside Abgabe.
    local_dependencies = Path(__file__).resolve().parents[2] / ".test-data" / "libreoffice-benchmark-python"
    if local_dependencies.is_dir() and str(local_dependencies) not in sys.path:
        sys.path.insert(0, str(local_dependencies))
    try:
        import pymupdf as fitz  # type: ignore
    except ImportError:
        try:
            import fitz  # type: ignore
        except ImportError:
            fitz = None
    if fitz is not None:
        with fitz.open(path) as document:
            page_count = len(document)
            text = "\n".join(page.get_text() for page in document)
        backend = "PyMuPDF"
    else:
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:
            check(report, "pdf.parse", "manual", "Kein optionaler PDF-Leser installiert. PDF öffnen und vollständig manuell prüfen.")
            check(report, "pdf.layout", "manual", "Seitenzahl, Lesbarkeit, abgeschnittene Texte/Tabellen und Konsistenz visuell prüfen.")
            return
        reader = PdfReader(path)
        page_count = len(reader.pages)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        backend = "pypdf"
    report["pdf"] = {"backend": backend, "page_count": page_count, "text": text}
    check(report, "pdf.parse", "passed", "PDF lesbar.", backend=backend)
    check(report, "pdf.one_page", "passed" if page_count == 1 else "failed", "PDF-Seitenzahl geprüft.", page_count=page_count, expected=1)
    check(report, "pdf.layout", "manual", "PDF visuell auf abgeschnittene Inhalte prüfen und mit ODT/ODS vergleichen. Extrahierter Text beweist keine visuelle Unversehrtheit.")


def evaluate(folder: Path, oracle: dict, phase: str) -> dict:
    if phase not in oracle or not isinstance(oracle[phase].get("kennzahlen"), dict):
        raise ValueError(f"Oracle enthält keine Kennzahlen für {phase}")
    report = {"schema_version": 1, "phase": phase, "abgabe": str(folder.resolve()), "checks": [],
              "scope": "Nur lesende Bestandsprüfung. Gespeicherte Formelwerte werden nicht neu berechnet. Keine Gesamtpunktzahl und kein vollständiger Benchmark-Pass."}
    inspectors = (lambda path: inspect_ods(path, oracle, phase, report),
                  lambda path: inspect_odt(path, oracle, phase, report),
                  lambda path: inspect_pdf(path, report))
    for name, inspector in zip(FILES, inspectors):
        path = folder / name
        if not path.is_file() or path.stat().st_size == 0:
            check(report, "file." + name, "failed", "Erwartete Datei fehlt oder ist leer.")
            continue
        check(report, "file." + name, "passed", "Erwartete Datei vorhanden und nicht leer.", size_bytes=path.stat().st_size)
        try:
            inspector(path)
        except Exception as exc:
            check(report, "parse." + name, "failed", "Datei konnte nicht zuverlässig gelesen werden.", error=f"{type(exc).__name__}: {exc}")
    check(report, "ui_only_provenance", "manual", "Tool-Protokoll/Screenshots auf ausschließliche sichtbare LibreOffice-Bedienung prüfen. Dateien allein beweisen die UI-only-Regel nicht.")
    check(report, "correction_history", "manual", "Vorher-Abgabe und Korrekturprotokoll getrennt prüfen. Ein Nachher-Dokument allein beweist keinen erfolgreichen Änderungsablauf.")
    counts = Counter(item["status"] for item in report["checks"])
    report["summary"] = {"counts": {key: counts[key] for key in ("passed", "failed", "manual")},
                         "overall_status": "failed" if counts["failed"] else "manual",
                         "score": None}
    return report


class ParserTests(unittest.TestCase):
    def root(self, cells: str, repeat: str = "") -> ET.Element:
        return ET.fromstring(f'<office:document-content xmlns:office="{NS["office"]}" xmlns:table="{NS["table"]}" xmlns:text="{NS["text"]}"><office:body><office:spreadsheet><table:table table:name="Test"><table:table-row {repeat}>{cells}</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>')

    def test_repeated_blanks_values_formulas_dates(self):
        root = self.root('<table:table-cell table:number-columns-repeated="1000000"/><table:table-cell office:value-type="float" office:value="12.5" table:formula="of:=SUM([.A1:.A2])" table:number-columns-repeated="2"/><table:table-cell office:value-type="date" office:date-value="2026-09-30"><text:p>30.09.2026</text:p></table:table-cell>', 'table:number-rows-repeated="2"')
        sheets, limits = parse_sheets(root)
        self.assertFalse(limits)
        self.assertEqual(len(sheets[0].rows), 2)
        cells = sheets[0].rows[0][1]
        self.assertEqual(cells[1000001].number, Decimal("12.5"))
        self.assertIsNotNone(cells[1000002].formula)
        self.assertTrue(cells[1000003].matches("2026-09-30"))

    def test_bounded_repeat(self):
        root = self.root('<table:table-cell office:value-type="float" office:value="1" table:number-columns-repeated="1000000"/>')
        sheets, limits = parse_sheets(root)
        self.assertTrue(limits)
        self.assertEqual(len(sheets[0].rows[0][1]), MAX_NONEMPTY_CELLS)

    def test_source_duplicates_and_change(self):
        originals = [{"Buchungs_ID": "P-006", "Betrag_EUR": "200"}] * 2
        sheet = Sheet("Original", [(1, {1: Cell("Buchungs_ID"), 2: Cell("Betrag_EUR")}),
                                   (2, {1: Cell("P-006"), 2: Cell(number=Decimal(200))}),
                                   (3, {1: Cell("P-006"), 2: Cell(number=Decimal(200))})])
        self.assertEqual(source_candidates([sheet], originals)[0], ["Original"])
        sheet.rows.pop()
        self.assertEqual(source_candidates([sheet], originals)[0], [])

    def test_metric_not_any_number(self):
        sheet = Sheet("Daten", [(1, {1: Cell("Irrelevant"), 2: Cell(number=Decimal(4250))})])
        self.assertEqual(metric_candidates([sheet], "offene_forderungen"), [])
        sheet.rows[0][1][1] = Cell("Offene Forderungen")
        self.assertEqual(metric_candidates([sheet], "offene_forderungen")[0]["value"], "4250")
        sheet.rows[0][1][2] = Cell("Andere Kennzahl")
        sheet.rows[0][1][3] = Cell(number=Decimal(4250))
        self.assertEqual(metric_candidates([sheet], "offene_forderungen"), [])

    def test_missing_documents_never_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            report = evaluate(Path(directory), {"vorher": {"kennzahlen": {}}}, "vorher")
        self.assertEqual(report["summary"]["overall_status"], "failed")
        self.assertEqual(report["summary"]["counts"]["failed"], 3)
        self.assertIsNone(report["summary"]["score"])

    def test_adjacent_count_and_amount_remain_ambiguous(self):
        sheet = Sheet("Dashboard", [(1, {1: Cell("Offene Forderungen"),
                                        2: Cell(number=Decimal(7)), 3: Cell(number=Decimal(4250))})])
        candidates = metric_candidates([sheet], "offene_forderungen")
        self.assertEqual([c["value"] for c in candidates], ["7", "4250"])
        self.assertTrue(all(c["ambiguous_row"] for c in candidates))
        # The amount must not be selected merely because it matches the oracle.
        sheet.rows[0][1][3] = Cell(number=Decimal(7))
        self.assertTrue(all(c["ambiguous_row"] for c in metric_candidates([sheet], "offene_forderungen")))

    def test_xml_entities_rejected(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("content.xml", '<!DOCTYPE doc [<!ENTITY a "bad">]><doc/>')
        with zipfile.ZipFile(buffer) as archive:
            with self.assertRaises(ValueError):
                read_xml(archive, "content.xml")

    def test_archive_is_read_only_and_errors_detected(self):
        root = self.root('<table:table-cell><text:p>Offene Forderungen</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="4250" table:formula="of:=SUM([.A1:.A2])"/><table:table-cell><text:p>#DIV/0!</text:p></table:table-cell>')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.ods"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("content.xml", ET.tostring(root, encoding="utf-8"))
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            report = {"checks": []}
            inspect_ods(path, {"vorher": {"kennzahlen": {"offene_forderungen": "4250.00"}}}, "vorher", report)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
        checks = {item["id"]: item for item in report["checks"]}
        self.assertEqual(checks["ods.metric.offene_forderungen"]["status"], "passed")
        self.assertEqual(checks["ods.cell_errors"]["status"], "failed")
        self.assertEqual(checks["ods.chart"]["status"], "manual")
        self.assertEqual(checks["ods.accounting_logic"]["status"], "manual")


def main() -> int:
    # Windows-Pipes sonst oft mit lokaler Codepage; JSON und Hilfe bleiben UTF-8.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--abgabe", type=Path, help="Ordner mit den drei unverändert zu lesenden Abgaben")
    parser.add_argument("--oracle", type=Path, help="Evaluator-exklusive Sollwerte (JSON)")
    parser.add_argument("--phase", choices=("vorher", "nachher"), default="vorher")
    parser.add_argument("--output", type=Path, help="Optionaler Prüfbericht außerhalb des Abgabeordners; sonst stdout")
    parser.add_argument("--self-test", action="store_true", help="Isolierte Parser-Prüfungen; keine echten Office-Abgaben")
    args = parser.parse_args()
    if args.self_test:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ParserTests))
        return 0 if result.wasSuccessful() else 1
    if not args.abgabe or not args.oracle:
        parser.error("--abgabe und --oracle sind erforderlich")
    if args.output and (args.output.resolve() == args.abgabe.resolve() or args.abgabe.resolve() in args.output.resolve().parents):
        parser.error("--output muss außerhalb des Abgabeordners liegen; Abgaben werden nicht verändert")
    if args.output and args.output.resolve() == args.oracle.resolve():
        parser.error("--output darf die Oracle-Datei nicht überschreiben")
    try:
        oracle = json.loads(args.oracle.read_text(encoding="utf-8-sig"))
        report = evaluate(args.abgabe, oracle, args.phase)
        content = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.write_text(content, encoding="utf-8")
        else:
            sys.stdout.write(content)
        return 1 if report["summary"]["counts"]["failed"] else 0
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f"Prüfung nicht ausführbar: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
