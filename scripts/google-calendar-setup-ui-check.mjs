import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.test-data', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/google-calendar-setup-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const options = { executablePath: process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe'), args: [...(process.env.OPENHIATUS_TEST_APP ? [] : ['.']), `--data-dir=${profile}`], env };
let instance;
try {
  instance = await electron.launch(options); let page = await instance.firstWindow();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click(); await page.getByRole('button', { name: 'Dienste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mit Google verbinden', exact: true })).toBeDisabled();
  await page.getByLabel('Desktop-Client-ID', { exact: true }).fill('synthetic-calendar.apps.googleusercontent.com'); await page.getByLabel(/^Client-Secret/).fill('synthetic-private-client');
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click(); await page.getByRole('button', { name: 'Dienste', exact: true }).click(); await expect(page.getByLabel(/^Client-Secret/)).toHaveValue('synthetic-private-client');
  await page.getByRole('button', { name: 'OAuth-App speichern', exact: true }).click(); await expect(page.getByRole('button', { name: 'Mit Google verbinden', exact: true })).toBeEnabled(); await expect(page.getByLabel(/^Client-Secret/)).toHaveValue('');
  const snapshot = await page.evaluate(() => window.openhiatus.googleCalendarSnapshot()); assert.equal(snapshot.configured, true); assert.ok(!JSON.stringify(snapshot).includes('synthetic-private-client'));
  assert.ok(!(await readFile(path.join(profile, 'credentials.json'), 'utf8')).includes('synthetic-private-client'));
  await instance.close(); instance = undefined; instance = await electron.launch(options); page = await instance.firstWindow(); await page.getByRole('button', { name: 'Dienste', exact: true }).click(); await expect(page.getByRole('button', { name: 'Mit Google verbinden', exact: true })).toBeEnabled();
  await page.getByText('Google-Anmeldung einrichten', { exact: true }).click(); await expect(page.getByLabel('Desktop-Client-ID', { exact: true })).toHaveValue('synthetic-calendar.apps.googleusercontent.com');
  console.log(JSON.stringify({ status: 'passed', profile, checks: ['actual app Google setup', 'draft survives navigation', 'encrypted client credentials and sanitized IPC', 'restart preserves setup', 'no login, provider calls or real calendar access'] }));
} finally { if (instance) await instance.close(); }
