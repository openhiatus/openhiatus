"""Benchmark-Controller: Inputs vorbereiten oder eine vollständige Abgabe sichern.

Dieses Skript ist ausschließlich für den Testleiter. Es erstellt keine Office-
Ergebnisse und darf vom getesteten Agenten nicht ausgeführt werden.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import shutil
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path


HERE = Path(__file__).resolve().parent
STICHTAG = date(2026, 9, 30)
PFLICHTDATEIEN = (
    "OP_September_2026.ods",
    "Managementbericht_September_2026.odt",
    "Managementbericht_September_2026.pdf",
)

RECHNUNGEN = """Rechnungs_ID;Kunde;Rechnungsdatum;Faellig_am;Betrag_EUR;Status
R-2401;Adler Bau;2026-08-15;2026-09-05;1200;Aktiv
R-2402;Bergmann IT;2026-08-20;2026-09-10;850;Aktiv
R-2403;Cobalt Media;2026-08-25;2026-09-15;640;Aktiv
R-2404;Delta Logistik;2026-09-01;2026-09-20;1450;Aktiv
R-2405;Eichenhof;2026-09-02;2026-09-25;900;Aktiv
R-2406;Falken Design;2026-09-03;2026-09-30;720;Aktiv
R-2407;Gamma Service;2026-09-04;2026-10-05;1100;Aktiv
R-2408;Hanse Soft;2026-09-05;2026-09-18;430;Aktiv
R-2409;Isar Elektro;2026-09-06;2026-09-22;760;Aktiv
R-2410;Jade Gastro;2026-09-07;2026-09-28;500;Aktiv
R-2411;Komet Werbe;2026-09-08;2026-09-12;300;Storniert
R-2412;Linden Möbel;2026-09-09;2026-09-30;980;Aktiv
R-2413;Marmor GmbH;2026-09-10;2026-10-10;620;Aktiv
R-2414;Nexus GmbH;2026-09-11;2026-09-29;1250;Aktiv
R-2415;Orion Versand;2026-09-12;2026-09-30;460;Aktiv
R-2416;Polartechnik;2026-09-13;2026-09-26;540;Aktiv
R-2417;Quartz Labs;2026-09-14;2026-09-24;390;Aktiv
R-2418;Rhein Druck;2026-09-15;2026-10-15;1200;Aktiv
"""

ZAHLUNGEN = """Buchungs_ID;Datum;Rechnungs_ID;Betrag_EUR
P-001;2026-09-06;R-2401;1200
P-002;2026-09-08;R-2402;350
P-003;2026-09-12;R-2402;500
P-004;2026-09-16;R-2403;640
P-005;2026-09-21;R-2404;1000
P-006;2026-09-22;R-2404;200
P-007;2026-09-26;R-2405;900
P-008;2026-09-28;R-2406;720
P-009;2026-09-29;R-2407;550
P-010;2026-09-20;R-2408;430
P-011;2026-09-27;R-2409;760
P-012;2026-09-28;R-2410;550
P-013;2026-09-29;R-2412;300
P-014;2026-09-30;R-2414;600
P-015;2026-09-30;R-2416;540
P-016;2026-09-30;R-9999;220
P-017;2026-09-30;R-2411;300
P-018;2026-09-30;R-2417;390
P-019;2026-09-29;R-2415;160
P-006;2026-09-22;R-2404;200
"""


def money(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), ".2f")


def rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


def berechnen(korrektur: bool = False) -> dict:
    rechnungen = rows(RECHNUNGEN)
    aktive = {r["Rechnungs_ID"] for r in rechnungen if r["Status"] == "Aktiv"}
    summen: dict[str, Decimal] = defaultdict(Decimal)
    bank = Decimal(0)
    unzugeordnet = Decimal(0)
    dubletten = Decimal(0)
    gesehen: dict[str, dict] = {}
    for original in rows(ZAHLUNGEN):
        p = dict(original)
        if korrektur and p["Buchungs_ID"] == "P-014":
            p["Betrag_EUR"] = "700"
        if p["Buchungs_ID"] in gesehen:
            if p != gesehen[p["Buchungs_ID"]]:
                raise ValueError("Widersprüchliche Dublette in Benchmark-Daten")
            dubletten += Decimal(p["Betrag_EUR"])
            continue
        gesehen[p["Buchungs_ID"]] = p
        if date.fromisoformat(p["Datum"]) > STICHTAG:
            continue
        betrag = Decimal(p["Betrag_EUR"])
        bank += betrag
        if p["Rechnungs_ID"] in aktive:
            summen[p["Rechnungs_ID"]] += betrag
        else:
            unzugeordnet += betrag

    detail = []
    for r in rechnungen:
        aktiv = r["Status"] == "Aktiv"
        forderung = Decimal(r["Betrag_EUR"]) if aktiv else Decimal(0)
        eingang = summen[r["Rechnungs_ID"]] if aktiv else Decimal(0)
        anrechenbar = min(forderung, eingang)
        offen = max(forderung - eingang, Decimal(0))
        detail.append({
            "rechnungs_id": r["Rechnungs_ID"], "kunde": r["Kunde"],
            "faellig_am": r["Faellig_am"], "aktiv": aktiv,
            "forderung": money(forderung), "zahlung_gesamt": money(eingang),
            "anrechenbar": money(anrechenbar), "offen": money(offen),
            "ueberzahlung": money(max(eingang - forderung, Decimal(0))),
            "ueberfaellig": aktiv and offen > 0 and date.fromisoformat(r["Faellig_am"]) < STICHTAG,
        })
    summe = lambda key: sum((Decimal(r[key]) for r in detail), Decimal(0))
    offen = [r for r in detail if Decimal(r["offen"]) > 0]
    kennzahlen = {
        "aktive_rechnungen": len(aktive), "gesamtforderung": money(summe("forderung")),
        "bankeingang_eindeutig": money(bank),
        "zahlungen_aktive_rechnungen": money(sum(summen.values(), Decimal(0))),
        "anrechenbare_zahlungen": money(summe("anrechenbar")),
        "offene_forderungen": money(summe("offen")), "offene_rechnungen": len(offen),
        "ueberfaelliger_betrag": money(sum((Decimal(r["offen"]) for r in detail if r["ueberfaellig"]), Decimal(0))),
        "ueberfaellige_rechnungen": sum(r["ueberfaellig"] for r in detail),
        "nicht_zuordenbar": money(unzugeordnet), "ueberzahlung": money(summe("ueberzahlung")),
        "doppelt_importiert": money(dubletten),
    }
    assert Decimal(kennzahlen["gesamtforderung"]) == Decimal(kennzahlen["anrechenbare_zahlungen"]) + Decimal(kennzahlen["offene_forderungen"])
    assert bank == Decimal(kennzahlen["anrechenbare_zahlungen"]) + Decimal(kennzahlen["ueberzahlung"]) + unzugeordnet
    return {
        "kennzahlen": kennzahlen, "rechnungen": detail,
        "top_drei": sorted(offen, key=lambda r: (-Decimal(r["offen"]), r["rechnungs_id"]))[:3],
    }


def oracle() -> dict:
    vorher, nachher = berechnen(), berechnen(True)
    # Unabhängiger Sollwertevergleich mit der vom Nutzer vorgegebenen Tabelle.
    for phase, offen, bank, anrechenbar, ueberfaellig in (
        (vorher, "4250.00", "10310.00", "9740.00", "900.00"),
        (nachher, "4150.00", "10410.00", "9840.00", "800.00"),
    ):
        k = phase["kennzahlen"]
        assert (k["aktive_rechnungen"], k["gesamtforderung"]) == (17, "13990.00")
        assert (k["offene_forderungen"], k["bankeingang_eindeutig"], k["anrechenbare_zahlungen"], k["ueberfaelliger_betrag"]) == (offen, bank, anrechenbar, ueberfaellig)
        assert (k["ueberfaellige_rechnungen"], k["nicht_zuordenbar"], k["ueberzahlung"], k["doppelt_importiert"], k["offene_rechnungen"]) == (2, "520.00", "50.00", "200.00", 7)
    assert [r["rechnungs_id"] for r in vorher["top_drei"]] == ["R-2418", "R-2412", "R-2414"]
    assert [r["rechnungs_id"] for r in nachher["top_drei"]] == ["R-2418", "R-2412", "R-2413"]
    return {
        "stichtag": STICHTAG.isoformat(), "vorher": vorher, "nachher": nachher,
        "originaldaten": {"rechnungen": rows(RECHNUNGEN), "zahlungen": rows(ZAHLUNGEN)},
        "fehlerfaelle": [
            {"buchungs_id": "P-006", "typ": "identische Dublette", "betrag": "200.00"},
            {"buchungs_id": "P-012", "typ": "Überzahlung", "rechnungs_id": "R-2410", "betrag": "50.00"},
            {"buchungs_id": "P-016", "typ": "unbekannte Rechnung", "rechnungs_id": "R-9999", "betrag": "220.00"},
            {"buchungs_id": "P-017", "typ": "stornierte Rechnung", "rechnungs_id": "R-2411", "betrag": "300.00"},
        ],
    }


def auftrag(root: Path) -> str:
    return f"""Erledige diesen LibreOffice-Praxistest bis zur vollständig geprüften ersten Abgabe.

Monatsabschluss September 2026 – Nordstern Dienstleistungen GmbH (fiktiv).
Du arbeitest in der Finanzbuchhaltung. Fester Stichtag: 30.09.2026.

Arbeitsordner: {root}
Inputs: Input\\Rechnungen.csv und Input\\Zahlungen.csv
Ergebnisse: Abgabe (Unterordner des Arbeitsordners).

UI-only-Regel: Bearbeite alles in sichtbarem LibreOffice Calc und Writer. Starte LibreOffice bei Bedarf über die sichtbare Windows-Oberfläche. Alle Zugriffe auf Inputs und Dokumente, Importe, Berechnungen, Bearbeitungen, Speichervorgänge, PDF-Exporte und Prüfungen erfolgen ausschließlich über die Oberfläche mit Screenshots, Maus und Tastatur. Normales Einfügen von Tabellen und Formeln in Calc ist erlaubt. Verboten: Shell-/Terminalbefehle, direkte Dateioperationen auch zum CSV-Lesen, Datenverarbeitung mit Python/JavaScript, UNO, Makros, Headless-Konvertierung und externe Rechenwerkzeuge. Keine Codex-Fenster oder weitere Agenten zur Bearbeitung einsetzen. Bei einer UI-Blockade gezielt melden statt die Regel zu umgehen.

A – Datenaufbereitung:
Importiere beide CSVs (UTF-8, Semikolon, Datumsformat JJJJ-MM-TT) in eine gemeinsame Calc-Arbeitsmappe. Erhalte die Originaldaten in getrennten Blättern mit allen Zeilen einschließlich Dubletten unverändert; auch die Input-CSVs bleiben unverändert. Erstelle einen nachvollziehbaren Abgleich in Arbeitsdaten nach diesen Regeln:
- Stornierte Rechnungen zählen nicht zur Gesamtforderung.
- Zahlungen je Rechnung addieren; doppelte Buchungs-IDs nur einmal berücksichtigen.
- Zahlungen ohne gültige aktive Rechnungsreferenz gesondert ausweisen.
- Anrechenbar je Rechnung ist höchstens ihr Rechnungsbetrag. Mehrbeträge sind Überzahlungen, keine Verrechnung mit anderen offenen Rechnungen. Offene Beträge sind niemals negativ.
- Überfällig bedeutet: aktive Rechnung, positiver Restbetrag, Fälligkeit VOR dem 30.09.2026. Am Stichtag fällige Rechnungen sind noch nicht überfällig. Nicht mit dem heutigen Datum rechnen.
Dokumentiere Datenprobleme und ihre Behandlung in der Arbeitsmappe.

B – Calc-Dashboard:
Zeige Anzahl aktiver Rechnungen und Gesamtforderung, eindeutige Bankeingänge, auf Forderungen anrechenbare Zahlungen, Anzahl/Summe offener Forderungen, Anzahl/Summe überfälliger Rechnungen, nicht zuordenbare Zahlungen, Überzahlungen und doppelt importierten ausgeschlossenen Betrag. Zeige die drei größten offenen Rechnungen absteigend mit Kunde, Rechnungs-ID und Restbetrag. Erstelle ein Diagramm offener Beträge nach Kunden. Verwende nachvollziehbare Formeln für Abgleich und Kennzahlen, keine fest eingetragenen Ergebnissummen. Euroformat, passende Spaltenbreiten, klare Überschriften und sichtbare Hervorhebung überfälliger Rechnungen sind erforderlich.

C – Writer-Bericht:
Erstelle einen professionellen Bericht mit höchstens einer Seite: Titel, Berichtszeitraum, Stichtag, wichtigste Kennzahlen, drei größte offene Rechnungen, Einschätzung der Zahlungssituation, wichtigste Datenprobleme und mindestens zwei konkrete Handlungsempfehlungen. Verwende ausschließlich tatsächlich berechnete Calc-Ergebnisse.

D – Lieferung im Unterordner Abgabe:
OP_September_2026.ods
Managementbericht_September_2026.odt
Managementbericht_September_2026.pdf
Prüfe alle gespeicherten Dateien über die Oberfläche. Kontrolliere das vollständige PDF: eine Seite, lesbar, nichts abgeschnitten. Zielabschluss erst nach Speicherung und sichtbarer Prüfung aller drei Dateien. Melde die fertige Abgabe knapp; lasse die Dokumente für einen Folgeauftrag verfügbar.

Zielzeit 60–90 Minuten, keine harte Abbruchgrenze. Die Arbeit ist ausdrücklich freigegeben; beginne ohne weitere Rückfrage. Bei fehlenden notwendigen Angaben gezielt nachfragen.
"""


def korrektur(root: Path) -> str:
    return f"""Aktualisiere die bestehende LibreOffice-Abgabe nach folgender Korrektur bis zur geprüften Lieferung.

Es gibt eine Korrektur aus der Buchhaltung: Die Zahlung mit Buchungs-ID P-014 betrug tatsächlich 700 € statt 600 €.
Bitte aktualisiere den Rechnungsabgleich, sämtliche betroffenen Dashboard-Kennzahlen, die Rangliste der drei größten offenen Rechnungen, das Kundendiagramm, den Managementbericht und das PDF entsprechend.

Arbeite an den vorhandenen Dateien in:
{root / 'Abgabe'}

Die Eingabe-CSV-Dateien und beide Originaldatenblätter sollen unverändert als Ausgangszustand erhalten bleiben. Erfasse die Korrektur in den Arbeitsdaten oder einer gesonderten Korrekturtabelle und dokumentiere Buchungs-ID, alten Betrag, neuen Betrag und den Anlass. P-014 bleibt im Originaldatenblatt bei 600 €. Der Stichtag bleibt 30.09.2026.

Alle Zugriffe auf Daten und Dokumente sowie alle Änderungen müssen weiterhin ausschließlich über die sichtbare LibreOffice-Oberfläche erfolgen. Keine Shell-/Terminalbefehle, direkten Dateioperationen, Skripte, UNO, Makros, Headless-Konvertierung oder externen Rechenwerkzeuge. Öffne keine Codex-Fenster und delegiere die Bearbeitung nicht an einen anderen Agenten. Unterbreche nicht unnötig den bestehenden Arbeitszustand und setze die Anwendung nicht zurück.

Speichere die aktualisierten Dateien unter denselben Namen:
OP_September_2026.ods
Managementbericht_September_2026.odt
Managementbericht_September_2026.pdf
Prüfe alle gespeicherten Ergebnisse über die Oberfläche und kontrolliere das PDF vollständig auf eine Seite, Lesbarkeit und abgeschnittene Inhalte. Das Ziel ist erst abgeschlossen, wenn alle drei Dateien mit der Korrektur konsistent aktualisiert und geprüft sind. Melde die fertige Lieferung knapp.
"""


def csv_bytes(text: str) -> bytes:
    # BOM assists Windows GUI import; source values remain exactly as specified.
    return ("\ufeff" + text.replace("\n", "\r\n")).encode("utf-8")


def write_identical_or_new(path: Path, content: bytes) -> None:
    if path.exists():
        if path.read_bytes() != content:
            raise ValueError(f"Vorhandene abweichende Datei wird nicht überschrieben: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def prepare(root: Path) -> None:
    root = root.resolve()
    abgabe = root / "Abgabe"
    if abgabe.exists() and any(abgabe.iterdir()):
        raise ValueError("Abgabe ist bereits gefüllt. Für einen neuen Lauf einen neuen --arbeitsordner verwenden.")
    if len(auftrag(root).strip().replace('\n', '\r\n')) > 4000:
        raise ValueError("Arbeitsordnerpfad ist für die 4.000-Zeichen-Grenze dieses Benchmarkauftrags zu lang. Kürzeren --arbeitsordner wählen.")
    manifest_path = HERE / "laufvorbereitung.json"
    previous_root = None
    if manifest_path.is_file():
        previous_root = Path(json.loads(manifest_path.read_text(encoding="utf-8"))["arbeitsordner"])
    prompt_updates = []
    for name, template in (("Arbeitsauftrag für openhiatus.txt", auftrag), ("Korrekturauftrag für openhiatus.txt", korrektur)):
        path = HERE / "Vorbereitung" / name
        content = template(root).encode("utf-8")
        if path.exists() and path.read_bytes() != content:
            if previous_root is None or path.read_bytes() != template(previous_root).encode("utf-8"):
                raise ValueError(f"Manuell geänderte Anweisung wird nicht überschrieben: {path}")
        prompt_updates.append((path, content))
    oracle_data = oracle()
    manifest = {"benchmark": "LibreOffice Monatsabschluss September 2026", "arbeitsordner": str(root), "inputs": {}}
    for name, text in (("Rechnungen.csv", RECHNUNGEN), ("Zahlungen.csv", ZAHLUNGEN)):
        content = csv_bytes(text)
        write_identical_or_new(root / "Input" / name, content)
        manifest["inputs"][name] = {"sha256": hashlib.sha256(content).hexdigest(), "zeilen": len(rows(text))}
    abgabe.mkdir(parents=True, exist_ok=True)
    for path, content in prompt_updates:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    # Solutions remain exclusively in the controller's project directory.
    oracle_path = HERE / "oracle.json"
    oracle_path.write_text(json.dumps(oracle_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "vorbereitet", "arbeitsordner": str(root), "abgabe_leer": True, "rechnungen": 18, "zahlungszeilen": 20}, ensure_ascii=False))


def archive(root: Path, phase: str) -> None:
    root = root.resolve()
    source = root / "Abgabe"
    files = [source / name for name in PFLICHTDATEIEN]
    if not all(p.is_file() and p.stat().st_size > 0 for p in files):
        raise ValueError("Archivierung erst nach drei vorhandenen, nichtleeren Pflichtdateien möglich.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    destination = HERE / "auswertungen" / f"{phase}-{stamp}"
    destination.mkdir(parents=True, exist_ok=False)
    manifest = {"phase": phase, "archiviert_am": datetime.now(timezone.utc).isoformat(), "ursprung": str(source), "dateien": []}
    for file in files:
        before = hashlib.sha256(file.read_bytes()).hexdigest()
        shutil.copy2(file, destination / file.name)
        archived = hashlib.sha256((destination / file.name).read_bytes()).hexdigest()
        after = hashlib.sha256(file.read_bytes()).hexdigest()
        if before != archived or before != after:
            raise ValueError("Abgabe wurde während der Archivierung verändert. Korrektur noch nicht senden; nach Speicherung erneut archivieren.")
        manifest["dateien"].append({"name": file.name, "sha256": archived, "bytes": file.stat().st_size})
    (destination / "Archivnachweis.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "archiviert", "phase": phase, "ordner": str(destination)}, ensure_ascii=False))


def check_inputs(root: Path) -> None:
    for name, text in (("Rechnungen.csv", RECHNUNGEN), ("Zahlungen.csv", ZAHLUNGEN)):
        path = root / "Input" / name
        if path.read_bytes() != csv_bytes(text):
            raise ValueError(f"Original-Input verändert: {path}")
    print("Original-CSV-Dateien sind unverändert.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    default = Path(os.environ.get("APPDATA", str(Path.home()))) / "openhiatus" / "Arbeitsbereich" / "LibreOffice-Test Monatsabschluss September 2026"
    parser.add_argument("--arbeitsordner", type=Path, default=default)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--archivieren", choices=("vorher", "nachher"))
    mode.add_argument("--pruefen-input", action="store_true")
    args = parser.parse_args()
    try:
        if args.archivieren:
            archive(args.arbeitsordner, args.archivieren)
        elif args.pruefen_input:
            check_inputs(args.arbeitsordner)
        else:
            prepare(args.arbeitsordner)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Fehler: {exc}\n")


if __name__ == "__main__":
    main()
