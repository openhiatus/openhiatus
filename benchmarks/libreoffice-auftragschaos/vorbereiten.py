"""Controller für Test 2. Nie vom getesteten openhiatus-Worker ausführen."""

from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


HERE = Path(__file__).resolve().parent
INPUT_NAME = "Auftragsexport September 2026.xlsx"
OUTPUT_NAME = "Auftraege September 2026 bereinigt.ods"
DEFAULT_ROOT = Path(os.environ.get("APPDATA", str(Path.home()))) / "openhiatus" / "Arbeitsbereich" / "LibreOffice-Test Auftragschaos September 2026"
COLUMNS = [
    "Datensatz_ID", "Auftragsnummer", "Position", "Kundennummer", "Kunde",
    "Auftragsdatum", "Lieferdatum", "Artikelnummer", "Bezeichnung", "Menge",
    "Einheit", "Einzelpreis_EUR", "Rabatt_Prozent", "Positionssumme_EUR",
    "Status", "Zahlungsbetrag_EUR", "Zahlungsdatum", "Land", "PLZ",
    "Lieferort", "Zahlungsziel_Tage", "Bemerkung",
]
NAMES = [
    "Adler Bau GmbH", "Bergmann IT GmbH", "Cobalt Media GmbH", "Delta Logistik GmbH",
    "Eichenhof KG", "Falken Design GmbH", "Gamma Service GmbH", "Hanse Soft GmbH",
    "Isar Elektro GmbH", "Jade Gastro GmbH", "Komet Werbe GmbH", "Linden Möbel GmbH",
    "Alpenblick Technik GmbH", "Donau Handel GmbH", "Inntal Service GmbH", "Salzburg Büro KG",
    "Aare Systeme AG", "Limmat Design AG", "Rhein Technik AG", "Zürich Medien AG",
]
LOCATIONS = [
    ("DE", "01067", "Dresden"), ("DE", "04109", "Leipzig"), ("DE", "07743", "Jena"),
    ("DE", "10115", "Berlin"), ("DE", "20095", "Hamburg"), ("DE", "28195", "Bremen"),
    ("DE", "30159", "Hannover"), ("DE", "40213", "Düsseldorf"), ("DE", "50667", "Köln"),
    ("DE", "60311", "Frankfurt"), ("DE", "70173", "Stuttgart"), ("DE", "80331", "München"),
    ("AT", "1010", "Wien"), ("AT", "4020", "Linz"), ("AT", "6020", "Innsbruck"),
    ("AT", "5020", "Salzburg"), ("CH", "3001", "Bern"), ("CH", "8001", "Zürich"),
    ("CH", "4001", "Basel"), ("CH", "9000", "St. Gallen"),
]


def cell(value=None, kind=None):
    if kind is None:
        kind = "empty" if value is None else "date" if isinstance(value, date) else "number" if isinstance(value, (int, Decimal)) else "string"
    if kind == "date":
        value = value.isoformat() if isinstance(value, date) else value
    elif kind == "number":
        value = str(value)
    return {"type": kind, "value": value}


def dec(row, field):
    return Decimal(row[field]["value"])


def amount(row):
    return (dec(row, "Menge") * dec(row, "Einzelpreis_EUR") * (1 - dec(row, "Rabatt_Prozent"))).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)


def set_status(row, status):
    row["Status"] = cell(status)
    total = amount(row)
    row["Positionssumme_EUR"] = cell(total)
    ordered = date.fromisoformat(row["Auftragsdatum"]["value"])
    row["Lieferdatum"] = cell(ordered + timedelta(days=2)) if status in {"Bezahlt", "Geliefert"} else cell()
    row["Zahlungsbetrag_EUR"] = cell(total if status == "Bezahlt" else Decimal("0.00"))
    row["Zahlungsdatum"] = cell(ordered + timedelta(days=4)) if status == "Bezahlt" else cell()


def customer(row, index):
    land, plz, place = LOCATIONS[index]
    for key, value in (("Kundennummer", f"K{index + 1:03}"), ("Kunde", NAMES[index]), ("Land", land), ("PLZ", plz), ("Lieferort", place)):
        row[key] = cell(value)


def german(value, grouping=True, suffix=""):
    text = format(Decimal(value), ",.2f" if grouping else ".2f")
    return text.replace(",", "_").replace(".", ",").replace("_", ".") + suffix


def fixtures():
    base = []
    prices = list(map(Decimal, ["12.50", "49.90", "149.95", "299.50", "1250.50", "87.25", "5.00", "600.00"]))
    statuses = ["Offen", "In Bearbeitung", "Geliefert", "Bezahlt", "Storniert"]
    for i in range(1, 351):
        order = (i + 1) // 2
        values = [
            f"D{i:04}", f"A-26-{order:04}", 1 if i % 2 else 2, "", "",
            date(2026, 9, 1) + timedelta(days=order % 25), None, f"ART-{i:04}",
            f"Servicepaket {i:03}", i % 9 + 1, "h" if i % 3 == 0 else "Stk",
            prices[i % len(prices)], Decimal(["0", ".05", ".10", ".15"][i % 4]),
            Decimal(0), "Offen", Decimal(0), None, "", "", "", [0, 14, 30, 60][i % 4],
            f"Bestellreferenz WEB-{i:04}; Ansprechpartner Team {i % 7 + 1}",
        ]
        row = dict(zip(COLUMNS, map(cell, values)))
        customer(row, (order * 7) % len(NAMES))
        set_status(row, statuses[order % len(statuses)])
        base.append(row)

    at = lambda sheet_row: base[sheet_row - 2]
    for row_num, status in ((65, "Bezahlt"), (119, "Bezahlt"), (184, "Offen"), (254, "In Bearbeitung"), (340, "Storniert"), (78, "Geliefert"), (318, "Bezahlt"), (274, "Bezahlt"), (321, "Bezahlt")):
        set_status(at(row_num), status)
    for row_num in (55, 111, 193, 345):
        at(row_num)["Einzelpreis_EUR"] = cell(Decimal("1250.50"))
        set_status(at(row_num), at(row_num)["Status"]["value"])
    at(166)["Rabatt_Prozent"] = cell(Decimal(".05"))
    set_status(at(166), at(166)["Status"]["value"])
    at(345)["Rabatt_Prozent"] = cell(Decimal(".10"))
    set_status(at(345), at(345)["Status"]["value"])
    at(335)["Zahlungsziel_Tage"] = cell(30)
    for row_num in (154, 293, 279):
        customer(at(row_num), 0)
    customer(at(89), 1)
    customer(at(137), 2)
    at(235)["Land"] = cell("DE")
    at(235)["PLZ"] = cell("01067")
    at(235)["Lieferort"] = cell("Dresden")

    for row_num in (52, 163, 281):
        row = at(row_num)
        row["Menge"] = cell(-int(row["Menge"]["value"]))
        row["Auftragsnummer"] = cell(f"RET-26-{row_num:04}")
        row["Position"] = cell(1)
        row["Bemerkung"] = cell(f"Retoure zu A-25-{row_num:04}; Menge und Erstattung mit negativem Vorzeichen.")
        set_status(row, "Bezahlt")
    at(58)["Bemerkung"] = cell("Anlieferung am Tor 2\nAnnahme bis 15 Uhr")
    at(310)["Rabatt_Prozent"] = cell(Decimal(0))
    at(310)["Zahlungsziel_Tage"] = cell(0)
    set_status(at(310), "Offen")

    raw = deepcopy(base)
    issues = []
    duplicate_groups = []

    def issue(sheet_row, difficulty, kind, changes, reason):
        index = sheet_row - 2
        for key, value in changes.items():
            raw[index][key] = value
        issues.append({"id": f"E{len(issues) + 1:02}", "difficulty": difficulty, "kind": kind,
                       "record_id": raw[index]["Datensatz_ID"]["value"], "source_sheet_row": sheet_row,
                       "fields": list(changes), "reason": reason})

    # 28 eindeutig lösbare Fälle, jeweils eine betroffene Exportzeile.
    for row_num, field in ((44, "Auftragsdatum"), (78, "Lieferdatum"), (156, "Auftragsdatum"), (318, "Zahlungsdatum")):
        value = date.fromisoformat(at(row_num)[field]["value"]).strftime("%d.%m.%Y")
        issue(row_num, "clear", "Datum als Text", {field: cell(value)}, "Eindeutiges deutsches Datum in echte Datumzelle umwandeln")
    for row_num, field, value in (
        (55, "Einzelpreis_EUR", german(at(55)["Einzelpreis_EUR"]["value"])),
        (111, "Einzelpreis_EUR", german(at(111)["Einzelpreis_EUR"]["value"], False)),
        (134, "Menge", " " + at(134)["Menge"]["value"] + " "),
        (166, "Rabatt_Prozent", "5 %"),
        (274, "Zahlungsbetrag_EUR", german(at(274)["Zahlungsbetrag_EUR"]["value"], suffix=" €")),
        (335, "Zahlungsziel_Tage", "30 Tage"),
    ):
        issue(row_num, "clear", "Zahl als Text", {field: cell(value)}, "Eindeutigen Wert in echte Zahl umwandeln, keine reine Umformatierung")
    for row_num, value in ((65, "bezahlt "), (119, "BEZAHLT"), (184, " offen"), (254, "In bearbeitung"), (340, "STORNIERT")):
        issue(row_num, "clear", "Statusvariante", {"Status": cell(value)}, "Auf kanonischen Status normalisieren")
    for row_num, field, value in (
        (83, "Kunde", "  " + at(83)["Kunde"]["value"] + "  "),
        (147, "Kunde", at(147)["Kunde"]["value"].replace(" ", "  ", 1)),
        (213, "Bezeichnung", at(213)["Bezeichnung"]["value"].replace(" ", "\n", 1)),
        (235, "Land", " de "),
        (326, "Bemerkung", "  " + at(326)["Bemerkung"]["value"] + "  "),
    ):
        issue(row_num, "clear", "Beschädigter Text", {field: cell(value)}, "Nur eindeutige Rand-/Doppelleerzeichen oder zerbrochene Bezeichnung bereinigen")
    for row_num in (154, 293):
        issue(row_num, "clear", "PLZ-Typ und führende Null", {"PLZ": cell(int(at(row_num)["PLZ"]["value"]))}, "DE-PLZ als fünfstelligen Text rekonstruieren")
    for row_num, delta in ((172, "7.25"), (288, "-11.00")):
        issue(row_num, "clear", "Falsche Positionssumme", {"Positionssumme_EUR": cell(amount(at(row_num)) + Decimal(delta))}, "Summe aus autoritativer Menge, Preis und Rabatt neu berechnen")
    for source, target in ((37, 97), (61, 205), (121, 302), (241, 350)):
        original_id = raw[target - 2]["Datensatz_ID"]
        raw[target - 2] = deepcopy(raw[source - 2])
        raw[target - 2]["Datensatz_ID"] = original_id
        base[target - 2] = deepcopy(raw[target - 2])
        pair = [raw[source - 2]["Datensatz_ID"]["value"], original_id["value"]]
        duplicate_groups.append({"ids": pair, "preferred_keep": pair[0]})
        issue(target, "clear", "Vollständige Dublette", {}, "B–V vollständig identisch; genau ein Mitglied behalten, entfernte ID protokollieren")

    # Acht Fälle benötigen Lookup oder mehrere zusammenhängende Bearbeitungen.
    issue(89, "multistep", "Fehlender Kundenname", {"Kunde": cell()}, "Eindeutige wiederholte Zuordnung K002 zu Bergmann IT GmbH nutzen")
    issue(137, "multistep", "Fehlende Kundennummer", {"Kundennummer": cell()}, "Eindeutige wiederholte Zuordnung Cobalt Media GmbH zu K003 nutzen")
    for row_num in (193, 257, 345):
        changes = {"Einzelpreis_EUR": cell(german(at(row_num)["Einzelpreis_EUR"]["value"], suffix=" €")),
                   "Positionssumme_EUR": cell(amount(at(row_num)) + Decimal("19.00"))}
        if row_num == 257:
            changes["Menge"] = cell(" " + at(row_num)["Menge"]["value"] + " ")
        if row_num == 345:
            changes["Rabatt_Prozent"] = cell("10,0 %")
        issue(row_num, "multistep", "Zahlentypen und abgeleitete Summe", changes, "Preis/Faktoren normalisieren, danach Summe mit Rabatt und Cent-Rundung prüfen")
    issue(221, "multistep", "Menge, Rabatt und Summe", {
        "Menge": cell(at(221)["Menge"]["value"]),
        "Rabatt_Prozent": cell(german(dec(at(221), "Rabatt_Prozent") * 100, False, " %")),
        "Positionssumme_EUR": cell(amount(at(221)) + Decimal("13.00")),
    }, "Textfaktoren numerisch herstellen, Prozentwert richtig skalieren, Summe neu berechnen")
    issue(279, "multistep", "Land und landabhängige PLZ", {"Land": cell("Deutschland"), "PLZ": cell(1067)}, "Zuerst DE zuordnen, danach fünfstellige Text-PLZ herstellen")
    issue(321, "multistep", "Zahlung, Status und Datum", {
        "Status": cell(" bezahlt  "),
        "Zahlungsbetrag_EUR": cell(german(at(321)["Zahlungsbetrag_EUR"]["value"], suffix=" €")),
        "Zahlungsdatum": cell(date.fromisoformat(at(321)["Zahlungsdatum"]["value"]).strftime("%d.%m.%Y")),
    }, "Status, echten Zahlungsbetrag und echtes Zahlungsdatum konsistent herstellen")

    # Vier Fälle sind ausdrücklich nicht durch Raten lösbar.
    customer(raw[171], 19)
    customer(base[171], 19)
    conflict = "Kundenangabe aus Telefonnotiz: Morgenrot Vertrieb GmbH. CRM-Zuordnung bitte bestätigen."
    issue(173, "unclear", "Widersprüchliche Kundenquellen", {"Bemerkung": cell(conflict)}, "CRM-Felder und abweichende Telefonnotiz erhalten, Zuordnung der betroffenen Zeile als unklar kennzeichnen")
    issue(229, "unclear", "Fehlende Auftragsnummer", {"Auftragsnummer": cell()}, "Keine Auftragsnummer aus Export-ID oder Reihenfolge erfinden")
    for field, value in (("Status", cell("Offen")), ("Lieferdatum", cell()), ("Zahlungsbetrag_EUR", cell(Decimal(0))), ("Zahlungsdatum", cell())):
        raw[287][field] = base[287][field] = value
    issue(289, "unclear", "Datum unbekannter Herkunft", {"Auftragsdatum": cell("08/09/2026")}, "8. September oder 9. August, kein Herkunftsformat; Text erhalten und markieren")
    for field, value in (("Status", cell("Offen")), ("Lieferdatum", cell()), ("Zahlungsbetrag_EUR", cell(Decimal(0))), ("Zahlungsdatum", cell())):
        raw[345][field] = base[345][field] = value
    issue(347, "unclear", "Preis unbekannter Herkunft", {"Einzelpreis_EUR": cell("1.250"), "Positionssumme_EUR": cell()}, "1,25 oder 1.250 Euro nicht eindeutig; Preistext und unbekannte Summe erhalten und markieren")

    issue_by_id = {issue["record_id"]: issue for issue in issues}
    duplicate_ids = {group["ids"][1] for group in duplicate_groups}
    records = []
    for index, original in enumerate(raw):
        rid = original["Datensatz_ID"]["value"]
        problem = issue_by_id.get(rid)
        expected = deepcopy(original if problem and problem["difficulty"] == "unclear" else base[index])
        records.append({"id": rid, "source_sheet_row": index + 2, "input": original, "expected": expected,
                        "disposition": "duplicate" if rid in duplicate_ids else "keep",
                        "issue_id": problem["id"] if problem else None,
                        "ambiguous_fields": problem["fields"] if problem and problem["difficulty"] == "unclear" else []})
    controls = [
        {"record_id": at(r)["Datensatz_ID"]["value"], "reason": reason}
        for r, reason in ((32, "Mehrere verschiedene Positionen einer Auftragsnummer sind keine Dublette"),
                          (52, "Dokumentierte Retoure: negative Menge/Summe/Zahlung gültig"),
                          (58, "Mehrzeilige Lieferanweisung ist gültig und zu erhalten"),
                          (163, "Zweite gültige Retoure"), (281, "Dritte gültige Retoure"),
                          (310, "Rabatt/Zahlung/Zahlungsziel null und fehlende optionale Daten gültig"),
                          (351, "Letzte Datenzeile vollständig erhalten"))
    ]
    result = {"benchmark": "Auftragschaos September 2026", "version": 1, "columns": COLUMNS,
              "records": records, "issues": issues, "duplicate_groups": duplicate_groups,
              "controls": controls, "expected_counts": {"checked": 350, "corrected": 32, "removed": 4, "unclear": 4, "remaining": 346}}
    validate(result)
    return result


def validate(data):
    assert len(data["records"]) == 350 and len(COLUMNS) == 22
    assert len({r["id"] for r in data["records"]}) == 350
    assert len(data["issues"]) == 40
    assert Counter(i["difficulty"] for i in data["issues"]) == {"clear": 28, "multistep": 8, "unclear": 4}
    assert len({i["source_sheet_row"] for i in data["issues"]}) == 40
    assert all(i["source_sheet_row"] > 31 for i in data["issues"])
    assert {173, 289, 347}.issubset(i["source_sheet_row"] for i in data["issues"])
    assert all(len(r["input"]) == 22 for r in data["records"])
    for record in data["records"]:
        if not record["ambiguous_fields"]:
            assert amount(record["expected"]) == dec(record["expected"], "Positionssumme_EUR")
    payloads = Counter(json.dumps({k: r["input"][k] for k in COLUMNS[1:]}, sort_keys=True) for r in data["records"])
    assert sum(count - 1 for count in payloads.values()) == 4
    for group in data["duplicate_groups"]:
        members = [r for r in data["records"] if r["id"] in group["ids"]]
        assert all(not r["ambiguous_fields"] for r in members)
        assert all(members[0]["input"][k] == members[1]["input"][k] for k in COLUMNS[1:])


def prompt(root):
    return f"""Bereinige den Auftragsexport vollständig in sichtbarem LibreOffice Calc. Liefere eine geprüfte neue ODS-Datei.

Nordstern Servicehandel GmbH (fiktiv), Exportstand 30.09.2026; auch ältere Aufträge sind möglich.
Arbeitsordner: {root}
Input: Input\\{INPUT_NAME}
Ergebnis: Abgabe\\{OUTPUT_NAME}

Untersuche den gesamten Bereich einschließlich ferner Zeilen und rechter Spalten. Ein sichtbares Blatt; bestimme die Ausdehnung selbst. Originaldatei unverändert erhalten, per Speichern unter eine neue ODS-Datei erstellen. Geschäftsspalten A–V und Datensatz_IDs bewahren. Hilfsspalten rechts und ein Prüfprotokollblatt sind erlaubt.

Regeln des Exports:
- Datensatz_ID ist eine unveränderliche Exportzeilen-ID, keine Auftragsnummer. Verschiedene Positionen desselben Auftrags sind gültig. Nur vollständig gleiche Geschäftsdaten B–V sind Dubletten: genau eine Zeile behalten, entfernte ID und erhaltene ID im Prüfprotokoll dokumentieren. Keine andere Zeile löschen.
- Vereinheitliche echte Datums-, Zahlen- und Statuswerte, nicht nur deren Darstellung. Eindeutige ISO-Daten und TT.MM.JJJJ sind konvertierbar. Datumszeichenfolgen mit Schrägstrichen ohne bekannte Herkunft sind unklar; das Programmgebietsschema beweist ihre Bedeutung nicht.
- Eindeutige deutsche Geldtexte wie 1.250,50 oder 1250,50 € sind konvertierbar. Ein alleiniger Punkt ohne eindeutigen Dezimal-/Tausendernachweis ist unklar. Zahlen dürfen danach kein Text sein. IDs und PLZ bleiben Text.
- Menge, Einzelpreis und Rabatt sind maßgeblich. Positionssumme = Menge × Einzelpreis × (1 − Rabatt), kaufmännisch auf zwei Nachkommastellen runden. Rabatt ist ein Anteil: 0,10 bedeutet 10 %, 10 % als Text wird zu 0,10. Eine widersprechende Positionssumme darf anhand eindeutiger Faktoren korrigiert werden.
- Kanonische Statuswerte: Offen, In Bearbeitung, Geliefert, Bezahlt, Storniert. Groß-/Kleinschreibung und überflüssige Randzeichen vereinheitlichen. Zahlungen nicht ohne Beleg passend machen.
- Land: DE/AT/CH; Deutschland entspricht DE. DE-PLZ haben fünf, AT/CH vier Stellen; führende Nullen erhalten. Zahlungsziel ist eine Zahl in Tagen.
- Kundennummer und Kunde sind Pflichtwerte. Fehlende Werte nur ergänzen, wenn die vorhandenen Daten eine eindeutige Zuordnung belegen. Bei widersprüchlichen Quellen die betroffene Zeile samt Angaben erhalten und zur Klärung markieren. Auftragsnummern nicht aus IDs, Reihenfolge oder Zahlenmustern erfinden.
- Null bei Rabatt, Zahlung oder Zahlungsziel ist gültig. Lieferdatum darf bei noch nicht gelieferten/stornierten Aufträgen fehlen; Zahlungsdatum bei Zahlung null. Dokumentierte Retouren mit negativen Mengen, Summen und Erstattungen sind gültig. Sinnvolle mehrzeilige Lieferhinweise erhalten. Bereinige ausschließlich erkennbare Textschäden.

Füge W=Prüfstatus und X=Prüfhinweis hinzu. Prüfstatus: OK, Korrigiert oder Unklar. Unklare Werte unverändert erhalten und ihren konkreten Klärungsbedarf in X beschreiben. Kennzeichne korrigierte Zeilen nachvollziehbar. Dokumentiere entfernte Dubletten im Prüfprotokoll. Beim Sortieren müssen IDs und sämtliche zugehörigen Spalten zusammenbleiben. Formatiere Zahlen/Euro/Datum lesbar.

Speichere und prüfe die vollständige ODS-Datei über die Oberfläche. Berichte: geprüfte ursprüngliche Datensätze, korrigierte verbleibende Zeilen, entfernte Dubletten, verbleibende unklare Zeilen. Zeilen jeweils einmal zählen; Dubletten nicht zusätzlich als korrigiert. Kein Writer/PDF nötig.

UI-only: Alle Datei-/Datenzugriffe und Bearbeitungen nur über sichtbares LibreOffice und Screenshot/Maus/Tastatur. Calc-Formeln und normales Einfügen sind erlaubt. Keine Shell, Skripte, direkten Dateioperationen, Python/JavaScript, UNO, Makros oder Headless-Verarbeitung. Keine Codex-Fenster oder weiteren Agenten. Bei einer Blockade gezielt melden. Beginne ohne weitere Rückfrage.
"""


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(root, runtime, marker=None):
    root = root.resolve()
    output = root / "Abgabe"
    source = root / "Input" / INPUT_NAME
    manifest_file = HERE / "laufvorbereitung.json"
    if output.exists() and any(output.iterdir()):
        raise ValueError("Abgabe ist bereits gefüllt. Neuen Arbeitsordner verwenden.")
    task = prompt(root)
    task_chars = len(task.strip().replace("\n", "\r\n"))
    if task_chars > 4000:
        raise ValueError(f"Auftrag zu lang: {task_chars} Windows-Zeichen, höchstens 4000.")
    if source.exists():
        manifest = json.loads(manifest_file.read_text(encoding="utf-8")) if manifest_file.exists() else {}
        expected = manifest.get("input", {})
        if expected.get("path") != str(source) or expected.get("sha256") != hash_file(source):
            raise ValueError("Vorhandener abweichender Input wird nicht überschrieben.")
        print(json.dumps({"status": "bereits vorbereitet", "arbeitsordner": str(root), "auftrag_zeichen": task_chars}, ensure_ascii=False))
        return
    if runtime is None:
        raise ValueError("XLSX-Erstellung benötigt --runtime mit bin/node.exe und node_modules/@oai/artifact-tool.")
    node = runtime / "bin" / "node.exe"
    modules = runtime / "node_modules"
    if not node.is_file() or not (modules / "@oai" / "artifact-tool").is_dir():
        raise ValueError("Node oder @oai/artifact-tool fehlt im angegebenen Runtime-Verzeichnis.")
    if marker is not None and not marker.is_file():
        raise ValueError("Der optionale --marker existiert nicht.")
    data = fixtures()
    write_json(HERE / "oracle.json", data)
    write_json(HERE / "fixture.json", {"columns": COLUMNS, "rows": [r["input"] for r in data["records"]], "output": str(source), "preview_dir": str(HERE / "Vorbereitung")})
    task_file = HERE / "Vorbereitung" / "Arbeitsauftrag für openhiatus.txt"
    task_file.parent.mkdir(parents=True, exist_ok=True)
    task_file.write_text(task, encoding="utf-8")
    source.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    junction = HERE / "node_modules"
    if not junction.exists():
        command = f"New-Item -ItemType Junction -Path '{str(junction).replace(chr(39), chr(39) * 2)}' -Target '{str(modules).replace(chr(39), chr(39) * 2)}' | Out-Null"
        subprocess.run(["powershell", "-NoProfile", "-Command", command], check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    if junction.resolve() != modules.resolve():
        raise ValueError("Vorhandene node_modules-Verknüpfung verweist auf ein anderes Verzeichnis.")
    # A supplied environment-specific marker precedes workbook authoring.
    if marker is not None:
        subprocess.run([str(node), str(marker), "--operation-kind", "create", "--expected-output-count", "1", "--output-format", "xlsx"], check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    subprocess.run([str(node), str(HERE / "erstellen.mjs"), str(HERE / "fixture.json")], check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    # Artifact Tool may emit inspection metadata beside its workbook. That
    # controller material is not part of the agent's input.
    sidecar = source.with_name(source.name + ".inspect.ndjson")
    if sidecar.is_file():
        metadata = HERE / "Vorbereitung" / f"Export-Metadaten-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.ndjson"
        metadata.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(sidecar), str(metadata))
    write_json(manifest_file, {"benchmark": data["benchmark"], "erstellt_am": datetime.now(timezone.utc).isoformat(),
                              "arbeitsordner": str(root), "input": {"path": str(source), "sha256": hash_file(source), "bytes": source.stat().st_size},
                              "expected_output": OUTPUT_NAME, "auftrag_zeichen_windows": task_chars,
                              "datenzeilen": 350, "spalten": 22, "abgabe_leer": True})
    print(json.dumps({"status": "vorbereitet", "arbeitsordner": str(root), "datenzeilen": 350, "spalten": 22, "auftrag_zeichen": task_chars}, ensure_ascii=False))


def check_source():
    manifest = json.loads((HERE / "laufvorbereitung.json").read_text(encoding="utf-8"))
    path = Path(manifest["input"]["path"])
    if hash_file(path) != manifest["input"]["sha256"]:
        raise ValueError("Originaldatei wurde verändert.")
    print("Originaldatei ist unverändert.")


def archive(root):
    source = root.resolve() / "Abgabe" / OUTPUT_NAME
    if not source.is_file() or not source.stat().st_size:
        raise ValueError("Vollständige nichtleere Abgabe fehlt.")
    destination = HERE / "auswertungen" / datetime.now(timezone.utc).strftime("Abgabe-%Y%m%d-%H%M%S-%f")
    before = hash_file(source)
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copy2(source, destination / source.name)
    copied = hash_file(destination / source.name)
    if copied != before or hash_file(source) != before:
        raise ValueError("Abgabe änderte sich während der Archivierung; erneut nach Speicherung sichern.")
    write_json(destination / "Archivnachweis.json", {"ursprung": str(source), "sha256": copied, "bytes": source.stat().st_size})
    print(json.dumps({"status": "archiviert", "ordner": str(destination)}, ensure_ascii=False))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--arbeitsordner", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--runtime", type=Path, help="Node-Runtime mit bin/node.exe und installiertem @oai/artifact-tool")
    parser.add_argument("--marker", type=Path, help="Optionaler Operationsmarker der verwendeten Autorenumgebung")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--pruefen-input", action="store_true")
    modes.add_argument("--archivieren", action="store_true")
    args = parser.parse_args()
    try:
        if args.pruefen_input:
            check_source()
        elif args.archivieren:
            archive(args.arbeitsordner)
        else:
            prepare(args.arbeitsordner, args.runtime, args.marker)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"Fehler: {exc}\n")


if __name__ == "__main__":
    main()
