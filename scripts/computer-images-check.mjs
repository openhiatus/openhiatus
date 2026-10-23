import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import electronPath from 'electron';

// This app has no windows, driver, desktop capture, input, model or account access.
// Each launch owns a fresh profile and only processes synthetic in-memory PNGs.
async function syntheticChecks() {
  app.disableHardwareAcceleration();
  app.setPath('userData', path.join(__dirname, `profile-${process.argv.at(-1)}`));
  await app.whenReady();
  try {
    const processor = await createComputerImageProcessor();
    const matrix = process.argv.includes('--matrix');
    const screens = matrix ? [
      [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160],
      [1080, 1920], [3440, 1440], [137, 91], [1, 1], [1, 63], [63, 1],
    ] : [[137, 91], [1, 1]];
    let overviews = 0, crops = 0, scaledCrops = 0;
    for (const [width, height] of screens) {
      const bgra = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        bgra[offset] = x % 251; bgra[offset + 1] = y % 253;
        bgra[offset + 2] = (x * 17 + y * 13) % 256; bgra[offset + 3] = 255;
      }
      const original = nativeImage.createFromBitmap(bgra, { width, height, scaleFactor: 1 });
      const png = original.toPNG({ scaleFactor: 1 }).toString('base64');
      const decoded = processor.decode(png, { width, height });
      assert.deepEqual(decoded.data, bgra, 'decode preserves every scale-1 BGRA pixel');
      assert.equal(processor.overview(decoded, 1).base64, png, 'identity overview keeps the original PNG');
      for (const divisor of [4, 8, 16, 32]) {
        const overview = processor.overview(decoded, divisor), expected = overviewSize({ width, height }, divisor);
        assert.equal(overview.width, expected.width); assert.equal(overview.height, expected.height);
        assert.ok(overview.width <= width && overview.height <= height, 'tiny sources are never enlarged');
        const actual = processor.decode(overview.base64, expected);
        assert.equal(actual.data.length, expected.width * expected.height * 4);
        const view = createViewDescriptor('overview', 'overview', { x: 0, y: 0, width, height }, expected);
        assert.deepEqual(mapViewRect(view, { x: 0, y: 0, ...expected }), { x: 0, y: 0, width, height });
        overviews++;
      }
      const regions = [
        { x: Math.floor(width / 3), y: Math.floor(height / 4), width: Math.min(17, width - Math.floor(width / 3)), height: Math.min(13, height - Math.floor(height / 4)) },
        { x: width - Math.min(43, width), y: height - Math.min(31, height), width: Math.min(43, width), height: Math.min(31, height) },
      ];
      for (const rect of regions) {
        const crop = processor.crop(decoded, rect);
        assert.equal(crop.width, rect.width); assert.equal(crop.height, rect.height);
        const actual = processor.decode(crop.base64, rect);
        for (let row = 0; row < rect.height; row++) {
          const begin = ((rect.y + row) * width + rect.x) * 4;
          assert.deepEqual(actual.data.subarray(row * rect.width * 4, (row + 1) * rect.width * 4), bgra.subarray(begin, begin + rect.width * 4), 'crop is an exact original-pixel rectangle');
        }
        crops++;
        for (const divisor of [2, 4]) {
          const scaled = processor.crop(decoded, rect, divisor), expected = detailSize(rect, divisor);
          assert.deepEqual({ width: scaled.width, height: scaled.height }, expected);
          const scaledPixels = processor.decode(scaled.base64, expected);
          assert.equal(scaledPixels.data.length, expected.width * expected.height * 4);
          const scaledView = createViewDescriptor('detail', 'scaled-detail', rect, expected);
          assert.deepEqual(mapViewRect(scaledView, { x: 0, y: 0, ...expected }), rect, 'scaled crop maps to the exact physical source rectangle');
          assert.deepEqual(mapViewPoint(scaledView, { x: expected.width - 1, y: expected.height - 1 }), {
            x: rect.x + Math.min(rect.width - 1, Math.round((expected.width - 1) * rect.width / expected.width)),
            y: rect.y + Math.min(rect.height - 1, Math.round((expected.height - 1) * rect.height / expected.height)),
          }, 'scaled crop uses real rounded dimensions independently of process DPI');
          scaledCrops++;
        }
      }
      assert.throws(() => processor.decode(png, { width: width + 1, height }), /dimensions/);
      assert.throws(() => processor.crop(decoded, { x: width - 1, y: 0, width: 2, height: 1 }), /outside/);
      assert.throws(() => processor.overview(decoded, 0), /divisor/);
      for (const divisor of [0, 1.5, 3, 8, NaN, Infinity]) assert.throws(() => processor.crop(decoded, regions[0], divisor), /detail divisor/);
      if (width >= 1920 && height >= 1080) assert.throws(() => processor.crop(decoded, { x: 0, y: 0, width: 1025, height: 1024 }), /pixel limit/);
      if (width === 137) {
        const bytes = Buffer.from(png, 'base64');
        assert.throws(() => processor.decode(bytes.subarray(0, -12).toString('base64'), { width, height }), /Incomplete/);
        assert.throws(() => processor.decode(` ${png}`, { width, height }), /encoding/);
        assert.throws(() => processor.decode(Buffer.from('not a PNG').toString('base64'), { width, height }));
        const corrupt = Buffer.from(bytes);
        let offset = 8;
        while (corrupt.toString('ascii', offset + 4, offset + 8) !== 'IDAT') offset += corrupt.readUInt32BE(offset) + 12;
        corrupt.fill(255, offset + 8, offset + 8 + corrupt.readUInt32BE(offset));
        assert.throws(() => processor.decode(corrupt.toString('base64'), { width, height }), /scale-1/);
      }
    }
    // NativeImage's BGRA data may contain premultiplied alpha. Detail crops must
    // preserve the decoded source pixels even for a non-opaque synthetic source.
    const alpha = Buffer.from(Array.from({ length: 7 * 5 }, (_, index) => [17, 31, 53, [0, 64, 128, 255][index % 4]]).flat());
    const alphaNative = nativeImage.createFromBitmap(alpha, { width: 7, height: 5, scaleFactor: 1 });
    const alphaSource = processor.decode(alphaNative.toPNG({ scaleFactor: 1 }).toString('base64'), { width: 7, height: 5 });
    const alphaCrop = processor.crop(alphaSource, { x: 2, y: 1, width: 3, height: 3 });
    const alphaResult = processor.decode(alphaCrop.base64, { width: 3, height: 3 });
    for (let row = 0; row < 3; row++) {
      assert.deepEqual(alphaResult.data.subarray(row * 12, (row + 1) * 12), alphaSource.data.subarray(((row + 1) * 7 + 2) * 4, ((row + 1) * 7 + 5) * 4));
    }
    crops++;
    const report = { scaleFactor: process.argv.at(-1), screens: screens.length, overviews, crops, scaledCrops, windows: 0, desktopCaptures: 0, desktopInputs: 0 };
    writeFileSync(path.join(__dirname, `result-${process.argv.at(-1)}.json`), JSON.stringify(report));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}

await mkdir('.test-data', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/computer-images-'));
const main = path.join(directory, 'main.cjs');
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openhiatus-computer-images-check', version: '1.0.0', main: 'main.cjs' }));
await build({
  stdin: { contents: `
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { app, nativeImage } from 'electron';
import { createComputerImageProcessor } from './src/main/computer-images.ts';
import { createViewDescriptor, detailSize, mapViewPoint, mapViewRect, overviewSize } from './src/main/computer-views.ts';
(${syntheticChecks.toString()})();
`, resolveDir: process.cwd(), sourcefile: 'computer-images-synthetic-main.ts', loader: 'ts' },
  bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron'], outfile: main,
});
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const reports = [];
for (const scale of [1, 1.25, 1.5, 2]) {
  let output = '';
  const child = spawn(electronPath, [directory, '--headless', `--force-device-scale-factor=${scale}`, ...(scale === 1 ? ['--matrix'] : []), String(scale)], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill(), 120_000);
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(code, 0, `Synthetic image app failed at scale ${scale}:\n${output}`);
    reports.push(JSON.parse(await readFile(path.join(directory, `result-${scale}.json`), 'utf8')));
  } finally { clearTimeout(timer); }
}
console.log(JSON.stringify({ passed: true, reports }, null, 2));
