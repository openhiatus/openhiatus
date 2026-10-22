/**
 * Compile the local Windows GUI fixture; never launch it unless --launch is
 * explicitly supplied. This script performs no desktop input and kills nothing.
 *
 * npx tsx scripts/computer-fixture-check.ts --directory .test-data/computer-fixture
 * Add --launch only when the user has authorized opening the test window.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ComputerFixtureResult {
  testDirectory: string;
  executable: string;
  resultPath: string;
  launched: boolean;
  pid?: number;
}

export async function prepareComputerFixture(directory: string, launch = false): Promise<ComputerFixtureResult> {
  if (process.platform !== 'win32') throw new Error('The computer fixture requires Windows.');
  const testDirectory = path.resolve(directory);
  await mkdir(testDirectory, { recursive: true });
  const source = fileURLToPath(new URL('./fixtures/OpenhiatusComputerFixture.cs', import.meta.url));
  const executable = path.join(testDirectory, 'openhiatus Computer-Test.exe');
  const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  execFileSync(compiler, [
    '/nologo', '/target:winexe', '/utf8output', '/codepage:65001', `/out:${executable}`,
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    source,
  ], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const result: ComputerFixtureResult = {
    testDirectory, executable, resultPath: path.join(testDirectory, 'Computer-Test-Ergebnis.json'), launched: false,
  };
  if (launch) {
    const child = spawn(executable, ['--test-directory', testDirectory], {
      cwd: testDirectory, windowsHide: false, stdio: 'ignore',
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    result.launched = true;
    result.pid = child.pid;
    child.unref();
  }
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let directory: string | undefined;
  let launch = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--directory') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('--directory requires a test directory.');
      directory = value;
    } else if (args[index] === '--launch') {
      launch = true;
    } else {
      throw new Error(`Unknown option: ${args[index]}`);
    }
  }
  if (!directory) throw new Error('Usage: computer-fixture-check.ts --directory <test directory> [--launch]');
  console.log(JSON.stringify(await prepareComputerFixture(directory, launch), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
