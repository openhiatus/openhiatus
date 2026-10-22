/** Provider-free native paint-delay check. Targets only its newly created, labeled fixture.
 * OPENHIATUS_COMPUTER_POST_ACTION_CHECK=1 npx tsx scripts/computer-post-action-check.ts
 * Replaces the clipboard once; no model, existing window or Enter input.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createNativeComputerSession, NativeComputer, type ComputerSession } from '../src/main/computer.js';

assert.equal(process.env.OPENHIATUS_COMPUTER_POST_ACTION_CHECK, '1', 'Explicit opt-in required for the clipboard and this isolated visible fixture.');
const directory = path.resolve('.test-data', `post-action-paint-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const executable = path.join(directory, 'openhiatus Darstellungs-Test.exe');
const source = path.join(directory, 'openhiatus Darstellungs-Test.cs');
const statePath = path.join(directory, 'Darstellungs-Test-Zustand.json');
const artifact = path.resolve('artifacts/computer-post-action-check.json');
const emptyImage = path.resolve('artifacts/computer-post-action-fixture-empty.png');
const returnedImage = path.resolve('artifacts/computer-post-action-fixture-returned.png');
const text = 'Grüße äöü ÄÖÜ ß – Prüftext ohne Absenden';
const began = performance.now();
const elapsed = () => Math.round((performance.now() - began) * 10) / 10;
const preservedPids = [17648, 6028, 14820, 22872, 23076];
const preservedBefore = preservedPids.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
await Promise.all([mkdir(directory, { recursive: true }), mkdir(path.dirname(artifact), { recursive: true })]);

// The native fixture deliberately accepts paste before rendering its text 450ms
// later. This exercises production capture timing rather than faking driver images.
const fixtureSource = String.raw`using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class PaintFixture : Form {
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  private readonly string directory;
  private readonly DelayedInput input = new DelayedInput();
  private readonly Timer timer = new Timer();
  private readonly DateTime began = DateTime.UtcNow;
  private int sample;
  private sealed class DelayedInput : Control {
    internal string ReceivedText = "", VisibleText = "", PaintedText = "";
    internal int PasteCount, EnterCount;
    internal DateTime? AcceptedAt, PaintedAt;
    private readonly Timer paint = new Timer();
    internal DelayedInput() {
      SetStyle(ControlStyles.Selectable | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
      TabStop = true;
      Font = new Font("Segoe UI", 18);
      BackColor = Color.White;
      paint.Interval = 450;
      paint.Tick += delegate { paint.Stop(); VisibleText = ReceivedText; Invalidate(); };
    }
    protected override void OnKeyDown(KeyEventArgs args) {
      if (args.Control && args.KeyCode == Keys.V) {
        PasteCount++; ReceivedText = Clipboard.GetText(TextDataFormat.UnicodeText); AcceptedAt = DateTime.UtcNow;
        args.Handled = true; args.SuppressKeyPress = true; paint.Start();
      }
      if (args.KeyCode == Keys.Enter) EnterCount++;
      base.OnKeyDown(args);
    }
    protected override void OnPaint(PaintEventArgs args) {
      args.Graphics.Clear(Color.White);
      using (Pen border = new Pen(Color.DarkSlateGray, 2)) args.Graphics.DrawRectangle(border, 1, 1, Width - 3, Height - 3);
      args.Graphics.DrawString(VisibleText.Length == 0 ? "Noch keine sichtbare Eingabe" : VisibleText,
        Font, VisibleText.Length == 0 ? Brushes.Gray : Brushes.Black, new RectangleF(20, 25, Width - 40, Height - 50));
      PaintedText = VisibleText;
      if (VisibleText.Length > 0) PaintedAt = DateTime.UtcNow;
      base.OnPaint(args);
    }
    protected override void Dispose(bool disposing) { if (disposing) { paint.Stop(); paint.Dispose(); } base.Dispose(disposing); }
  }
  private PaintFixture(string value) {
    directory = value;
    Text = "openhiatus Darstellungs-Test (eigener isolierter Test)";
    StartPosition = FormStartPosition.CenterScreen;
    ClientSize = new Size(900, 350);
    FormBorderStyle = FormBorderStyle.FixedDialog;
    MaximizeBox = false; MinimizeBox = false; TopMost = true;
    Controls.Add(new Label { Text = "Isolierter Test: genau einmal einfügen. Anzeige verzögert um 450 ms. Kein Enter.",
      Bounds = new Rectangle(24, 20, 852, 45), Font = new Font("Segoe UI", 12) });
    input.SetBounds(24, 85, 852, 200); Controls.Add(input);
    timer.Interval = 20;
    timer.Tick += delegate { WriteState(); if (File.Exists(Path.Combine(directory, "Testfenster-schließen")) || (DateTime.UtcNow - began).TotalSeconds >= 30) Close(); };
    Shown += delegate {
      uint owner; uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out owner);
      uint currentThread = GetCurrentThreadId();
      bool attached = foregroundThread != currentThread && AttachThreadInput(currentThread, foregroundThread, true);
      try { SetForegroundWindow(Handle); Activate(); input.Focus(); }
      finally { if (attached) AttachThreadInput(currentThread, foregroundThread, false); }
      WriteState(); timer.Start();
    };
    FormClosed += delegate { timer.Stop(); timer.Dispose(); };
  }
  private void WriteState() {
    Point origin = input.PointToScreen(Point.Empty);
    Point[] points = { new Point(5, 5), new Point(input.Width - 6, 5), new Point(5, input.Height - 6),
      new Point(input.Width - 6, input.Height - 6), new Point(input.Width / 2, input.Height / 2) };
    bool ownArea = true; foreach (Point point in points) ownArea &= WindowFromPoint(input.PointToScreen(point)) == input.Handle;
    string json = new JavaScriptSerializer().Serialize(new {
      pid = Process.GetCurrentProcess().Id, processStartedAt = Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("o"),
      foreground = GetForegroundWindow() == Handle, inputFocused = input.Focused, ownArea = ownArea,
      receivedText = input.ReceivedText, paintedText = input.PaintedText, pasteCount = input.PasteCount, enterCount = input.EnterCount,
      acceptedAt = input.AcceptedAt.HasValue ? input.AcceptedAt.Value.ToString("o") : null,
      paintedAt = input.PaintedAt.HasValue ? input.PaintedAt.Value.ToString("o") : null,
      crop = new { x = origin.X, y = origin.Y, width = input.Width, height = input.Height }, sample = ++sample });
    string target = Path.Combine(directory, "Darstellungs-Test-Zustand.json");
    File.WriteAllText(target + ".next", json, new UTF8Encoding(false)); File.Copy(target + ".next", target, true);
  }
  [STAThread] private static int Main(string[] args) {
    if (args.Length == 5 && args[0] == "--crop") {
      // Raw desktop pixels stay in the pipe/memory; only this fixture's input area is exported.
      using (MemoryStream raw = new MemoryStream(Convert.FromBase64String(Console.In.ReadToEnd())))
      using (Bitmap image = new Bitmap(raw))
      using (Bitmap crop = image.Clone(new Rectangle(int.Parse(args[1]), int.Parse(args[2]), int.Parse(args[3]), int.Parse(args[4])), PixelFormat.Format32bppArgb))
      using (MemoryStream result = new MemoryStream()) { crop.Save(result, ImageFormat.Png); Console.Write(Convert.ToBase64String(result.ToArray())); }
      return 0;
    }
    if (args.Length != 1 || !Path.IsPathRooted(args[0]) || !Directory.Exists(args[0])) return 64;
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
    using (PaintFixture fixture = new PaintFixture(args[0])) Application.Run(fixture);
    return 0;
  }
}`;
await writeFile(source, fixtureSource, 'utf8');
const compiler = path.join(process.env.SystemRoot ?? 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
execFileSync(compiler, ['/nologo', '/target:winexe', '/utf8output', '/codepage:65001', `/out:${executable}`,
  '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', source],
{ windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const child = spawn(executable, [directory], { windowsHide: false, cwd: directory, stdio: 'ignore' });
await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
let fixtureExited = false;
const fixtureExit = new Promise<void>(resolve => child.once('exit', () => { fixtureExited = true; resolve(); }));
type State = { pid: number; processStartedAt: string; foreground: boolean; inputFocused: boolean; ownArea: boolean;
  receivedText: string; paintedText: string; pasteCount: number; enterCount: number; acceptedAt: string | null; paintedAt: string | null;
  sample: number; crop: { x: number; y: number; width: number; height: number } };
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function state(): Promise<State> { return JSON.parse(await readFile(statePath, 'utf8')); }
async function waitState(predicate: (value: State) => boolean): Promise<State> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { const value = await state(); if (predicate(value)) return value; } catch { /* Fixture samples are atomically replaced. */ }
    await sleep(20);
  }
  throw new Error('Own isolated fixture did not reach the expected state. No additional input is authorized.');
}
let inputCalls = 0; let captures = 0; let driverDisposed = false;
let phase = 'fixture-start';
/** Inspect only error type identifiers. Never export native text, raw JSON or screenshot payloads. */
function errorTypes(error: unknown): Array<{ name: string; variant?: string }> {
  const output: Array<{ name: string; variant?: string }> = [];
  const seen = new Set<unknown>();
  for (let current = error; current && typeof current === 'object' && output.length < 5 && !seen.has(current);) {
    seen.add(current);
    const row = current as { name?: unknown; constructor?: { name?: unknown }; cause?: unknown; tag?: unknown };
    const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z_$][A-Za-z0-9_$.-]{0,95}$/.test(value) ? value : undefined;
    const name = identifier(row.constructor?.name) ?? identifier(row.name) ?? 'Error';
    const variant = identifier(row.tag);
    output.push({ name, ...(variant ? { variant } : {}) }); current = row.cause;
  }
  return output;
}
const captureTimes: number[] = [];
let ready!: State;
const computer = new NativeComputer({ createSession: async signal => {
  const native = await createNativeComputerSession(signal);
  const guarded: ComputerSession = {
    async screenshot(captureSignal) { phase = 'native-screenshot'; captures++; captureTimes.push(elapsed()); return native.screenshot(captureSignal); },
    screenSize: captureSignal => { phase = 'native-screen-size'; return native.screenSize(captureSignal); },
    async act(input, actionSignal) {
      const current = await state();
      assert.equal(current.pid, ready.pid); assert.equal(current.processStartedAt, ready.processStartedAt);
      assert.ok(current.foreground && current.inputFocused && current.ownArea, 'Never send input when the own fixture is not the verified target.');
      inputCalls++; assert.equal(inputCalls, 1); assert.equal(input.action, 'type');
      phase = 'native-type'; return native.act(input, actionSignal);
    },
    async dispose() { await native.dispose(); driverDisposed = true; },
  };
  return guarded;
} });
async function saveOwnCrop(base64: string, crop: State['crop'], file: string): Promise<void> {
  const helper = spawn(executable, ['--crop', String(crop.x), String(crop.y), String(crop.width), String(crop.height)],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const output: Buffer[] = []; const errors: Buffer[] = [];
  helper.stdout.on('data', bytes => output.push(bytes)); helper.stderr.on('data', bytes => errors.push(bytes));
  const closed = new Promise<void>((resolve, reject) => {
    helper.once('error', reject);
    helper.once('exit', code => code === 0 ? resolve() : reject(new Error(`Own crop helper failed (${code}): ${Buffer.concat(errors).toString('utf8').slice(0, 300)}`)));
  });
  helper.stdin.end(base64, 'ascii'); await closed;
  await writeFile(file, Buffer.from(Buffer.concat(output).toString('ascii'), 'base64'));
}
const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), providerCalls: 0, expectedText: text,
  fixturePaintDelayMs: 450, fixturePid: child.pid, preservedBefore };
try {
  ready = await waitState(value => value.pid === child.pid && value.foreground && value.inputFocused && value.ownArea);
  const provenance = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}' | Select-Object ExecutablePath,CreationDate | ConvertTo-Json -Compress`],
  { windowsHide: true, encoding: 'utf8' }));
  assert.equal(provenance.ExecutablePath.toLowerCase(), executable.toLowerCase());
  const creation = /^\/Date\((\d+)\)\/$/.exec(provenance.CreationDate);
  assert.ok(creation); assert.ok(Math.abs(Number(creation[1]) - Date.parse(ready.processStartedAt)) <= 2);
  phase = 'first-screenshot';
  const before = await computer.execute({ action: 'screenshot' });
  assert.equal(captures, 1);
  const current = await waitState(value => value.sample > ready.sample && value.foreground && value.inputFocused && value.ownArea);
  phase = 'export-empty-fixture-crop';
  await saveOwnCrop(before.image.base64, current.crop, emptyImage);
  const submittedAtMs = elapsed();
  phase = 'post-action-capture';
  const returned = await computer.execute({ action: 'type', frameId: before.frameId, text });
  const returnedAtMs = elapsed();
  const returnedAtUtc = Date.now();
  phase = 'verify-painted-fixture';
  const after = await state();
  assert.equal(after.receivedText, text); assert.equal(after.paintedText, text);
  assert.equal(after.pasteCount, 1); assert.equal(after.enterCount, 0);
  assert.ok(after.foreground && after.inputFocused && after.ownArea);
  assert.ok(after.paintedAt && Date.parse(after.paintedAt) <= returnedAtUtc, 'The own control actually painted the text before the action returned.');
  assert.equal(inputCalls, 1); assert.ok(captures >= 2 && captures <= 10);
  assert.notEqual(returned.image.base64, before.image.base64);
  phase = 'export-painted-fixture-crop';
  await saveOwnCrop(returned.image.base64, after.crop, returnedImage);
  assert.notDeepEqual(await readFile(returnedImage), await readFile(emptyImage), 'The first returned image must differ visibly from the empty input.');
  Object.assign(evidence, { passed: true, nativeInputCalls: inputCalls, pasteCount: after.pasteCount, enterCount: after.enterCount,
    exactReceivedUnicode: true, textPaintedBeforeReturn: true, renderingWait: JSON.parse(returned.text).renderingWait,
    actionReturnMs: Math.round((returnedAtMs - submittedAtMs) * 10) / 10, nativeScreenshotCalls: captures,
    extraExplicitScreenshotCalls: 0, screenshots: { before: emptyImage, firstReturnedActionImage: returnedImage } });
} catch (error) {
  evidence.phase = phase; evidence.errorTypes = errorTypes(error);
  evidence.passed = false; evidence.error = error instanceof Error ? error.message : String(error); process.exitCode = 1;
} finally {
  try { await computer.dispose(); }
  catch (error) { evidence.passed = false; evidence.cleanupError = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
  await writeFile(path.join(directory, 'Testfenster-schließen'), '', 'utf8');
  await Promise.race([fixtureExit, sleep(3000)]);
  if (!fixtureExited) { child.kill(); await fixtureExit; evidence.fixtureForcedCleanup = true; }
  const preservedAfter = preservedBefore.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
  Object.assign(evidence, { nativeInputCalls: inputCalls, nativeScreenshotCalls: captures, captureTimes,
    driverDisposed, ownFixtureExited: fixtureExited, preservedAfter, totalMs: elapsed() });
  if (preservedAfter.length !== preservedBefore.length || !driverDisposed || !fixtureExited) { evidence.passed = false; process.exitCode = 1; }
  await writeFile(artifact, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify(evidence, null, 2));
