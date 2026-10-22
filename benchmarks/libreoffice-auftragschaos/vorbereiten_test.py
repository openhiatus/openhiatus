"""Fixture- und Schutzprüfungen ohne Office-Steuerung oder Modellaufrufe."""

from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
from xml.etree import ElementTree as ET
import zipfile

import vorbereiten as controller


class FixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = controller.fixtures()

    def test_issue_distribution_and_offscreen_anchors(self):
        issues = self.data['issues']
        self.assertEqual(Counter(i['difficulty'] for i in issues), {'clear': 28, 'multistep': 8, 'unclear': 4})
        self.assertEqual(len({i['source_sheet_row'] for i in issues}), 40)
        self.assertTrue({173, 289, 347}.issubset(i['source_sheet_row'] for i in issues))
        self.assertTrue(all(i['source_sheet_row'] > 31 for i in issues))
        fields = {field for i in issues for field in i['fields']}
        self.assertTrue({'Land', 'PLZ', 'Zahlungsziel_Tage', 'Bemerkung'}.issubset(fields))

    def test_counts_and_unchanged_first_thirty(self):
        records = self.data['records']
        corrected = [r for r in records if r['input'] != r['expected']]
        unclear = [r for r in records if r['ambiguous_fields']]
        self.assertEqual((len(records), len(corrected), len(unclear)), (350, 32, 4))
        self.assertTrue(all(r['input'] == r['expected'] and r['issue_id'] is None for r in records[:30]))
        self.assertEqual(len([r for r in records if r['issue_id'] is None]), 310)
        for r in records:
            self.assertEqual(r['id'], f"D{r['source_sheet_row'] - 1:04}")

    def test_ambiguity_does_not_prescribe_guesses(self):
        records = {r['source_sheet_row']: r for r in self.data['records']}
        for r in records.values():
            if r['ambiguous_fields']:
                self.assertEqual(r['expected'], r['input'])
        date_row = records[289]['input']
        self.assertEqual(date_row['Auftragsdatum']['value'], '08/09/2026')
        self.assertEqual(date_row['Lieferdatum']['type'], 'empty')
        self.assertEqual(date_row['Zahlungsdatum']['type'], 'empty')
        price_row = records[347]['input']
        self.assertEqual(price_row['Einzelpreis_EUR']['value'], '1.250')
        self.assertEqual(price_row['Positionssumme_EUR']['type'], 'empty')
        self.assertEqual(sum(r['input']['Artikelnummer'] == price_row['Artikelnummer'] for r in records.values()), 1)

    def test_duplicate_members_are_identical_except_export_id(self):
        records = {r['id']: r for r in self.data['records']}
        for group in self.data['duplicate_groups']:
            first, second = [records[rid] for rid in group['ids']]
            self.assertNotEqual(first['id'], second['id'])
            for field in self.data['columns'][1:]:
                self.assertEqual(first['input'][field], second['input'][field])
                self.assertEqual(first['expected'][field], second['expected'][field])

    def test_legitimate_returns_and_multiline_note_remain_valid(self):
        records = {r['source_sheet_row']: r for r in self.data['records']}
        for index in (52, 163, 281):
            r = records[index]
            self.assertIsNone(r['issue_id'])
            for column in ('Menge', 'Positionssumme_EUR', 'Zahlungsbetrag_EUR'):
                self.assertLess(Decimal(r['input'][column]['value']), 0)
        self.assertEqual(records[58]['input']['Bemerkung']['value'], 'Anlieferung am Tor 2\nAnnahme bis 15 Uhr')
        self.assertIsNone(records[58]['issue_id'])

    def test_task_fits_openhiatus_without_goal_command(self):
        text = controller.prompt(controller.DEFAULT_ROOT)
        self.assertLessEqual(len(text.strip().replace('\n', '\r\n')), 4000)
        self.assertFalse(text.startswith('/goal '))
        self.assertNotIn('350', text)
        self.assertNotIn('346', text)


class PreparationSafetyTests(unittest.TestCase):
    def test_existing_changed_input_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'Test'
            source = root / 'Input' / controller.INPUT_NAME
            source.parent.mkdir(parents=True)
            source.write_bytes(b'existing personal data')
            with patch.object(controller, 'HERE', Path(directory) / 'Controller'):
                with self.assertRaisesRegex(ValueError, 'nicht überschrieben'):
                    controller.prepare(root, Path('missing-runtime'), Path('missing-marker'))
            self.assertEqual(source.read_bytes(), b'existing personal data')

    def test_filled_submission_blocks_preparation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'Abgabe').mkdir()
            (root / 'Abgabe' / 'Ergebnis.ods').write_bytes(b'existing result')
            with self.assertRaisesRegex(ValueError, 'bereits gefüllt'):
                controller.prepare(root, Path('missing-runtime'), Path('missing-marker'))

    def test_long_task_rejected_before_file_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / ('Long' * 150)
            with self.assertRaisesRegex(ValueError, 'Auftrag zu lang'):
                controller.prepare(root, Path('missing-runtime'), Path('missing-marker'))
            self.assertFalse(root.exists())

    def test_empty_submission_cannot_be_archived(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'Abgabe fehlt'):
                controller.archive(Path(directory))


@unittest.skipUnless((controller.HERE / "laufvorbereitung.json").is_file(), "Frische lokale XLSX-Vorbereitung fehlt; Exportprüfung nach vorbereiten.py erneut ausführen.")
class SavedInputTests(unittest.TestCase):
    def test_all_saved_cells_and_types_match_fixture(self):
        manifest = json.loads((controller.HERE / 'laufvorbereitung.json').read_text(encoding='utf-8'))
        source = Path(manifest['input']['path'])
        self.assertEqual([p.name for p in source.parent.iterdir()], [controller.INPUT_NAME])
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), manifest['input']['sha256'])
        data = controller.fixtures()
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        with zipfile.ZipFile(source) as archive:
            wb = ET.fromstring(archive.read('xl/workbook.xml'))
            sheets = wb.findall('s:sheets/s:sheet', ns)
            self.assertEqual(len(sheets), 1)
            self.assertIn(sheets[0].get('state', 'visible'), ('visible', ''))
            style = ET.fromstring(archive.read('xl/styles.xml'))
            formats = {int(n.get('numFmtId')): n.get('formatCode') for n in style.findall('s:numFmts/s:numFmt', ns)}
            xfs = style.findall('s:cellXfs/s:xf', ns)
            shared = ET.fromstring(archive.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in archive.namelist() else []
            strings = [''.join(n.itertext()) for n in shared]
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            cells = {c.get('r'): c for c in sheet.findall('.//s:sheetData/s:row/s:c', ns)}
            # XLSX dimension metadata is optional; inspect actual cell addresses.
            self.assertEqual(max(int(re.search(r'\d+$', address).group()) for address in cells), 351)
            self.assertTrue(all(re.fullmatch(r'[A-V]\d+', address) for address in cells))
            self.assertIsNone(sheet.find('s:autoFilter', ns))
            self.assertFalse(any(n.get('hidden') in ('1', 'true') for n in sheet.findall('.//s:row', ns) + sheet.findall('.//s:col', ns)))
            self.assertFalse(sheet.findall('.//s:f', ns))
            for rindex in range(1, 352):
                for cindex, column in enumerate(data['columns']):
                    address = f'{chr(65 + cindex)}{rindex}'
                    wanted = controller.cell(column) if rindex == 1 else data['records'][rindex - 2]['input'][column]
                    element = cells.get(address)
                    if element is None:
                        self.assertEqual(wanted['type'], 'empty', address)
                        continue
                    raw_type = element.get('t', 'n')
                    value = element.findtext('s:v', namespaces=ns)
                    if raw_type == 's':
                        value, kind = strings[int(value)], 'string'
                    elif raw_type == 'inlineStr':
                        value, kind = ''.join(element.find('s:is', ns).itertext()), 'string'
                    elif raw_type == 'str':
                        kind = 'string'
                    elif value is None:
                        value, kind = None, 'empty'
                    else:
                        kind = 'number'
                        fmt_id = int(xfs[int(element.get('s', '0'))].get('numFmtId', '0'))
                        fmt = re.sub(r'"[^"]*"|\\.', '', formats.get(fmt_id, '')).lower()
                        if 14 <= fmt_id <= 22 or re.search('[ymd]', fmt):
                            value, kind = (date(1899, 12, 30) + timedelta(days=int(Decimal(value)))).isoformat(), 'date'
                    self.assertEqual(kind, wanted['type'], address)
                    if kind == 'number':
                        self.assertLessEqual(abs(Decimal(value) - Decimal(wanted['value'])), Decimal('.000001'), address)
                    else:
                        self.assertEqual(value, wanted['value'], address)


if __name__ == '__main__':
    unittest.main(verbosity=2)
