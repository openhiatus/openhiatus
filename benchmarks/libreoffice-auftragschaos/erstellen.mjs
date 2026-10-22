// Fixture authoring belongs to the controller, never to the benchmark worker.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const fixture = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Auftragsexport');
const columns = fixture.columns;
const decode = (cell) => cell.type === 'date' ? new Date(`${cell.value}T00:00:00Z`)
  : cell.type === 'number' ? Number(cell.value) : cell.value;
sheet.getRange('A1:V351').values = [columns, ...fixture.rows.map(row => columns.map(key => decode(row[key])))];
sheet.getRange('A1:V351').format.font = { name: 'Arial', size: 10, color: '#242424' };
sheet.getRange('A1:V351').format.rowHeight = 22;
sheet.getRange('A1:V351').format.verticalAlignment = 'center';
sheet.getRange('A1:V1').format = { fill: '#E7EBF0', font: { name: 'Arial', size: 10, bold: true, color: '#242424' }, wrapText: true, rowHeight: 34 };
const widths = [112,138,65,115,220,122,122,130,180,75,75,147,135,174,155,180,145,85,85,150,175,390];
for (let i = 0; i < columns.length; i++) {
  const letter = String.fromCharCode(65 + i);
  sheet.getRange(`${letter}1:${letter}351`).format.columnWidthPx = widths[i];
}
for (const col of ['F','G','Q']) sheet.getRange(`${col}2:${col}351`).setNumberFormat('yyyy-mm-dd');
for (const col of ['L','N','P']) sheet.getRange(`${col}2:${col}351`).setNumberFormat('#,##0.00 "€"');
for (const col of ['C','J','U']) sheet.getRange(`${col}2:${col}351`).setNumberFormat('0');
sheet.getRange('M2:M351').setNumberFormat('0.0%');
// Text remains text even in cells that are deliberately malformed numbers.
for (const col of ['A','B','D','H','S']) sheet.getRange(`${col}2:${col}351`).setNumberFormat('@');
sheet.getRange('V58').format.wrapText = true;
sheet.getRange('A58:V58').format.rowHeight = 36;
sheet.freezePanes.freezeRows(1);
sheet.showGridLines = true;
workbook.recalculate();
await fs.mkdir(fixture.preview_dir, { recursive: true });
for (const [label, range] of [['Anfang A bis H', 'A1:H12'], ['Rechte Spalten und ferne Zeilen', 'R340:V351']]) {
  const preview = await workbook.render({sheetName: sheet.name, range, scale: 1.5, format: 'png'});
  await fs.writeFile(path.join(fixture.preview_dir, `${label}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const inspect = await workbook.inspect({kind:'region', sheetId:sheet.name, range:'A1:F4', tableMaxRows:4, tableMaxCols:6, maxChars:1800});
await fs.writeFile(path.join(fixture.preview_dir, 'Artifact-Pruefung.jsonl'), inspect.ndjson + '\n', 'utf8');
const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(fixture.output);
console.log(JSON.stringify({status:'input_created', rows:350, columns:22, file:fixture.output}));
