import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

// Real renderer and IPC, fresh local data, and fixture-level cloud blocking. No model/audio requests.
await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/responsive-navigation-'));
const fixture = await createUiAppFixture('responsive-navigation-build');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const instance = await electron.launch({
  executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
  args: [fixture.appDirectory, `--data-dir=${profile}`], env, timeout: 30000,
});
const errors = [];
const diagnostics = [];
try {
  const page = await instance.firstWindow();
  const mainWindow = await instance.browserWindow(page);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  const rail = page.getByRole('navigation', { name: 'Hauptnavigation' });
  const settleSidebar = async () => {
    const { mode, width } = await page.evaluate(async () => ({ mode: (await window.openhiatus.snapshot()).preferences.sidebarMode ?? 'auto', width: innerWidth }));
    const collapsed = mode === 'collapsed' || (mode === 'auto' && width < 960);
    await expect.poll(() => page.locator('.sidebar-region').evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(collapsed ? 68 : 216);
  };
  const resize = async (width, height) => {
    await mainWindow.evaluate((window, bounds) => {
      window.setMinimumSize(400, 300); window.setContentSize(bounds.width, bounds.height);
    }, { width, height });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(height);
    await settleSidebar();
  };
  const checkViewport = async label => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bounds = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return { viewport: [innerWidth, innerHeight], pageWidth: document.documentElement.scrollWidth,
        sidebar: box('.sidebar-region'), main: box('.main-shell'), toggle: box('.sidebar-toggle'),
        symbol: document.querySelector('.workspace-view:not([hidden]) .presence') ? box('.workspace-view:not([hidden]) .presence') : undefined };
    });
    assert.ok(bounds.pageWidth <= bounds.viewport[0], `${label}: horizontal document overflow`);
    assert.ok(bounds.main.x + bounds.main.width <= bounds.viewport[0] + 1, `${label}: main content outside viewport`);
    assert.ok(bounds.toggle.y >= 0 && bounds.toggle.y + bounds.toggle.height <= bounds.viewport[1], `${label}: sidebar control outside viewport`);
    const clippedControls = await page.locator('.topbar button,.composer button,.speech-mode-choice button,.settings-tabs button').evaluateAll(elements => elements.flatMap(element => {
      if (!element.checkVisibility()) return [];
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 1)
        ? [{ name: element.getAttribute('aria-label') || element.textContent, left: rect.left, right: rect.right }] : [];
    }));
    assert.deepEqual(clippedControls, [], `${label}: clipped controls`);
    diagnostics.push({ label, ...bounds });
  };
  const symbolSizes = [];
  for (const [width, height] of [[560, 440], [760, 560], [1360, 900]]) {
    await resize(width, height);
    const collapsed = width < 960;
    await expect(page.locator('.sidebar-toggle')).toHaveAttribute('aria-expanded', String(!collapsed));
    for (const name of ['Aufgaben', 'Dienste', 'Gedächtnis', 'Skills', 'Einstellungen', 'Gespräch']) {
      const destination = rail.getByRole('button', { name, exact: true });
      await destination.click(); await expect(destination).toHaveAttribute('aria-current', 'page');
      await checkViewport(`${width}x${height}/${name}`);
      if (name === 'Einstellungen') {
        for (const tab of ['Modelle & Zugänge', 'Sprache & Geräte', 'Persönlichkeit', 'Bedienung']) {
          await page.getByRole('tab', { name: tab, exact: true }).click();
          await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
          const settingsWidth = await page.locator('.settings-scroll').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
          assert.ok(settingsWidth.content <= settingsWidth.width + 1, `${width}x${height}/${tab}: settings overflow`);
        }
        await expect(page.getByRole('combobox', { name: 'Linke Navigation', exact: true })).toBeEnabled();
      }
    }
    const symbol = page.locator('.voice-stage .presence.large');
    await expect(symbol).toBeVisible();
    symbolSizes.push((await symbol.boundingBox()).width);
    await expect(page.getByRole('button', { name: 'Auftrag senden', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Verlauf/ }).click();
    await expect(page.locator('.voice-stage .presence.compact')).toBeVisible();
    await checkViewport(`${width}x${height}/history`);
    await page.getByRole('button', { name: /^Verlauf/ }).click();
    await page.screenshot({ path: `artifacts/openhiatus-responsive-${width}x${height}.png` });
  }
  assert.ok(symbolSizes[2] > symbolSizes[0], 'The central symbol should grow with the conversation stage');

  // Keyboard operation, manual preference surviving reload, then return to automatic behavior.
  const collapse = page.getByRole('button', { name: 'Navigation einklappen', exact: true });
  await collapse.focus(); await collapse.press('Enter');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.sidebarMode)).toBe('collapsed');
  await page.reload();
  await expect(page.locator('.sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
  await resize(560, 440);
  await page.getByRole('button', { name: 'Navigation ausklappen', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.sidebarMode)).toBe('expanded');
  await expect(page.locator('.sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
  await settleSidebar();
  await checkViewport('560x440/manual-expanded');
  await rail.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  for (const tab of ['Modelle & Zugänge', 'Sprache & Geräte', 'Persönlichkeit', 'Bedienung']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await checkViewport(`560x440/manual-expanded/${tab}`);
    const settingsWidth = await page.locator('.settings-scroll').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
    assert.ok(settingsWidth.content <= settingsWidth.width + 1, `Manual expansion/${tab}: settings overflow`);
  }
  await rail.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await resize(1360, 900);
  await expect(page.locator('.sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Navigation automatisch anpassen', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.sidebarMode)).toBe('auto');
  await resize(560, 440);
  await expect(page.locator('.sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar-toggle')).toBeFocused();
  await mainWindow.evaluate(window => { window.setMinimumSize(560, 440); window.setSize(560, 440); });
  await settleSidebar();
  await rail.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  for (const tab of ['Modelle & Zugänge', 'Sprache & Geräte', 'Persönlichkeit', 'Bedienung']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await checkViewport(`native-560x440/${tab}`);
    const settingsWidth = await page.locator('.settings-scroll').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
    assert.ok(settingsWidth.content <= settingsWidth.width + 1, `Native minimum/${tab}: settings overflow`);
  }
  await rail.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await checkViewport('native-560x440/Gespräch');
  await page.screenshot({ path: 'artifacts/openhiatus-responsive-native-560x440.png' });
  assert.deepEqual(errors, []);
  const blockedRequests = await instance.evaluate(() => globalThis.__openhiatusUiBlockedFetches);
  assert.deepEqual(blockedRequests, [], 'Layout checks must not request cloud services');
  const result = { status: 'passed', profile, symbolSizes, diagnostics, errors, checked: ['all navigation targets at three viewport sizes', 'all settings tabs and manually expanded narrow navigation', 'native 560x440 outer window minimum', 'no document overflow or clipped controls', 'visible bottom toggle', 'symbol scales in both dimensions', 'compact history layout', 'keyboard toggle and focus restoration', 'manual choice persists on reload', 'automatic sizing reset', 'fresh profile and no cloud requests'] };
  await writeFile(path.join(profile, 'responsive-navigation-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await instance.close(); }
