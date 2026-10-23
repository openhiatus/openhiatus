import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComputerFrameContent, ComputerPreview } from '../src/renderer/ComputerPreview';
import type { ComputerFrame } from '../src/shared/contracts';

function frameFixture(): ComputerFrame {
  const dataUrl = 'data:image/png;base64,synthetic-overview';
  return { dataUrl, frameId: 'frame', width: 240, height: 135, at: '2026-10-22T12:34:56Z', observation: {
    version: 2, frameId: 'frame', at: '2026-10-22T12:34:56Z', displayId: 'primary', screenWidth: 3840, screenHeight: 2160,
    scaleFactor: 1.5, overviewScaleDivisor: 16, selection: { reason: 'manual' }, timings: { imageProcessingMs: 0, regionSelectionMs: 0 },
    views: [
      { viewId: 'overview-image', kind: 'overview', dataUrl, imageWidth: 240, imageHeight: 135, sourceRect: { x: 0, y: 0, width: 3840, height: 2160 } },
      { viewId: 'detail-image', kind: 'detail', dataUrl: 'data:image/png;base64,synthetic-detail', imageWidth: 960, imageHeight: 540, sourceRect: { x: 960, y: 540, width: 960, height: 540 } },
    ],
  } };
}

test('preview renders the exact overview/detail images in order with native and image coordinate labels', () => {
  const frame = frameFixture(), html = renderToStaticMarkup(createElement(ComputerFrameContent, { frame }));
  const sources = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(sources, frame.observation!.views.map(view => view.dataUrl));
  assert.match(html, /Bildschirm: 3840 × 2160 Pixel/);
  assert.match(html, /Windows-Skalierungsfaktor: 1.5/); assert.match(html, /Übersicht: 1:16/);
  assert.match(html, /overview-image/); assert.match(html, /detail-image/);
  assert.match(html, /240 × 135 Bildpixel/); assert.match(html, /960 × 540 Bildpixel/);
  assert.match(html, /Bildkoordinaten: \(0, 0\) bis \(239, 134\)/);
  assert.match(html, /Bildschirmursprung: \(960, 540\) · Quellgröße: 960 × 540 Pixel/);
  assert.match(html, /class="computer-preview-detail-rect"[^>]*aria-hidden="true"[^>]*style="left:25%;top:25%;width:25%;height:25%"/);
  assert.match(html, /width="240" height="135"/); assert.match(html, /width="960" height="540"/);
});

test('overview-only and legacy previews render one image without inventing a detail selection', () => {
  const frame = frameFixture(); frame.observation!.views.pop();
  let html = renderToStaticMarkup(createElement(ComputerFrameContent, { frame }));
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.ok(!html.includes('computer-preview-detail-rect'));
  delete frame.observation;
  html = renderToStaticMarkup(createElement(ComputerFrameContent, { frame }));
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /Vollbild/); assert.match(html, /240 × 135 Bildpixel/);
  assert.ok(html.includes(frame.dataUrl)); assert.ok(!html.includes('computer-preview-detail-rect'));
});

test('preview mounts without browser automation and retains the snapshot wording and Stop control', () => {
  const html = renderToStaticMarkup(createElement(ComputerPreview, { enabled: true, onStop: async () => assert.fail('Static rendering must not stop tasks') }));
  assert.match(html, /<dialog[^>]*aria-labelledby="computer-preview-title"/);
  assert.match(html, /Momentaufnahme, kein Livebild/); assert.match(html, /class="stop-all"/); assert.match(html, /Stopp/);
  assert.match(html, /Umrandung[^<]*gehört nur zur Vorschau/);
  assert.ok(!html.includes('Diese Aufnahme wurde von deinem gewählten Arbeitsmodell ausgewertet'));
});
