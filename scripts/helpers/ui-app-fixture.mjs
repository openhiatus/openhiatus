import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Test-only app copy: the production bundle stays untouched and cloud fetches cannot leave Main. */
export async function createUiAppFixture(prefix) {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(path.resolve(`.test-data/${prefix}-`));
  const appDirectory = path.join(directory, 'app');
  await cp(path.resolve('dist'), path.join(appDirectory, 'dist'), { recursive: true });
  const { name, productName, version } = JSON.parse(await readFile('package.json', 'utf8'));
  await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({ name, productName, version, main: 'dist/main.cjs' }));
  await cp(path.join(appDirectory, 'dist/main.cjs'), path.join(appDirectory, 'dist/real-main.cjs'));
  await writeFile(path.join(appDirectory, 'dist/main.cjs'), `
const request = globalThis.fetch;
globalThis.__openhiatusUiBlockedFetches = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)) return request(input, init);
  globalThis.__openhiatusUiBlockedFetches.push({ origin: url.origin, method: init?.method || 'GET' });
  return new Response(JSON.stringify({ error: 'External fetch blocked in the synthetic UI fixture.' }), { status: 401, headers: { 'content-type': 'application/json' } });
};
require('./real-main.cjs');
`);
  return { directory, appDirectory };
}
