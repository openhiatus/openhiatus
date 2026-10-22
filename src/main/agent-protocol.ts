import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeCommandResult, decodeHostMessage, decodeHostResult, decodeParentMessage, ProtocolError,
  type CommandArgs, type CommandMethod, type CommandResults, type HostNotification, type HostRequest, type HostResponseArgs, type ParentToHost } from './agent-wire.js';
export * from './agent-wire.js';

import { MAX_PACKET_BYTES } from './agent-wire.js';
export type HostPacket = HostRequest | HostNotification;
export interface AgentTransport {
  request<M extends CommandMethod>(method: M, ...args: CommandArgs<M>): Promise<CommandResults[M]>;
  notify<M extends CommandMethod>(method: M, ...args: CommandArgs<M>): void;
  respond(...args: HostResponseArgs): void;
  terminate(): Promise<void>;
  managedProcessCount(): Promise<number>;
}
export interface TransportCallbacks { packet(packet: HostPacket): void; closed(confirmed: boolean): void; }
export interface ProcessTransportOptions { allowHandoff?: boolean; }

/** Deliberately excludes inherited provider keys, proxies, Node preload flags and Pi config. */
export function agentEnvironment(home: string, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = new Set(['systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp',
    'userprofile', 'homedrive', 'homepath', 'appdata', 'localappdata', 'programdata',
    'programfiles', 'programfiles(x86)', 'programw6432', 'username', 'userdomain']);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) if (allowed.has(key.toLowerCase())) env[key] = value;
  const inherited = Object.entries(source).filter(([key]) => key.toLowerCase() === 'path').flatMap(([, value]) => (value ?? '').split(';'));
  const windows = Object.entries(source).find(([key]) => key.toLowerCase() === 'systemroot')?.[1] ?? 'C:\\Windows';
  const candidates = [`${windows}\\System32`, windows, `${windows}\\System32\\WindowsPowerShell\\v1.0`,
    ...inherited.filter(entry => !/\\temp\\/i.test(entry)), ...inherited.filter(entry => /\\temp\\/i.test(entry))];
  const unique: string[] = [], seen = new Set<string>();
  for (const entry of candidates) {
    const normalized = entry.trim().replace(/^"|"$/g, '');
    if (!normalized || seen.has(normalized.toLowerCase()) || unique.join(';').length + normalized.length > 6000) continue;
    seen.add(normalized.toLowerCase()); unique.push(normalized);
  }
  // cmd.exe silently drops PATH above its 8191-character environment expansion limit.
  return { ...env, PATH: unique.join(';'), PI_CODING_AGENT_DIR: home, ELECTRON_RUN_AS_NODE: '1', PI_TELEMETRY: 'off' };
}

/** Bounded framing rejects a partial line before readline could allocate without limit. */
export class PacketReader {
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  push(chunk: Buffer, receive: (packet: unknown) => void): void {
    if (chunk.length + Buffer.byteLength(this.buffer) > MAX_PACKET_BYTES) throw new Error('Agent-Nachricht überschreitet die Größenbegrenzung.');
    this.buffer += this.decoder.write(chunk);
    let end: number;
    while ((end = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      const packet: unknown = JSON.parse(line);
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('Ungültiges Agent-Protokoll.');
      receive(packet);
    }
  }
}

export class ProcessTransport implements AgentTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly control = randomUUID();
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private readonly exited: Promise<void>;
  private closed = false;
  private confirmed = false;
  private nativePid?: number;
  private terminating?: Promise<void>;
  private invalid = false;

  constructor(executable: string, hostEntry: string, private readonly processHost: string, cwd: string, home: string,
    private readonly callbacks: TransportCallbacks, options: ProcessTransportOptions = {}) {
    if (process.platform !== 'win32' || !processHost) throw new Error('Der Windows-Prozessschutz ist nicht verfügbar.');
    this.processHost = resolve(processHost);
    const env = agentEnvironment(home);
    if (options.allowHandoff) {
      const directory = join(resolve(home), 'agent-sessions');
      mkdirSync(directory, { recursive: true });
      env.OPENHIATUS_PROCESS_HOST = this.processHost;
      env.OPENHIATUS_AGENT_SESSIONS_DIR = directory;
    }
    // Breakaway remains an explicit native helper operation. Ordinary subprocesses,
    // including detached Start-Process calls, continue to inherit the managed job.
    this.child = spawn(this.processHost, ['--parent', String(process.pid), '--control', this.control,
      ...(options.allowHandoff ? ['--allow-handoff'] : []), '--', executable, hostEntry],
      { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.exited = new Promise(resolve => {
      this.child.once('error', () => { this.close(true); resolve(); });
      this.child.once('close', code => { this.close(code !== null && code !== 70 && code !== 71); resolve(); });
    });
    this.child.stderr.resume(); // Raw SDK/provider diagnostics never enter openHiatus logs.
    this.child.stdin.on('error', () => { void this.terminate().catch(() => {}); });
    const reader = new PacketReader();
    this.child.stdout.on('data', (chunk: Buffer) => {
      if (this.closed || this.invalid) return;
      try { reader.push(chunk, packet => this.receive(packet)); }
      catch { this.invalid = true; void this.terminate().catch(() => {}); }
    });
  }
  private receive(value: unknown): void {
    const packet = decodeHostMessage(value);
    if (packet.method === 'openhiatus/host/child') {
      if (packet.params?.control === this.control && Number.isSafeInteger(packet.params.pid) && packet.params.pid > 0) this.nativePid = packet.params.pid;
      return;
    }
    if (packet.method === undefined) {
      const pending = this.pending.get(packet.id);
      if (!pending) return;
      this.pending.delete(packet.id); clearTimeout(pending.timer);
      if (packet.error !== undefined) pending.reject(new Error(packet.error));
      else { try { pending.resolve(packet.result); } catch { pending.reject(new ProtocolError()); throw new ProtocolError(); } }
    } else this.callbacks.packet(packet);
  }
  request<M extends CommandMethod>(method: M, ...args: CommandArgs<M>): Promise<CommandResults[M]> {
    if (this.closed || this.invalid) return Promise.reject(new Error('Agent-Verbindung ist geschlossen oder ihr Protokoll ist ungültig.'));
    const [params = {}, timeoutMs = 30_000] = args;
    const id = randomUUID();
    const packet = decodeParentMessage({ id, method, params });
    if (packet.method === undefined) return Promise.reject(new ProtocolError());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Agent antwortet nicht auf ${method}.`)); }, timeoutMs);
      this.pending.set(id, { resolve: value => resolve(decodeCommandResult(method, value)), reject, timer });
      try { this.write(packet); } catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  notify<M extends CommandMethod>(method: M, ...args: CommandArgs<M>): void {
    this.ensureWritable();
    const packet = decodeParentMessage({ method, params: args[0] ?? {} });
    if (packet.method === undefined) throw new ProtocolError();
    this.write(packet);
  }
  respond(...[request, result]: HostResponseArgs): void { this.ensureWritable(); this.write({ id: request.id, result: decodeHostResult(request.method, result) }); }
  private ensureWritable(): void { if (this.closed || this.invalid) throw new Error('Agent-Verbindung ist geschlossen oder ihr Protokoll ist ungültig.'); }
  private write(packet: ParentToHost): void {
    this.ensureWritable();
    const line = JSON.stringify(packet) + '\n';
    if (Buffer.byteLength(line) > MAX_PACKET_BYTES) throw new Error('Agent-Nachricht ist zu groß.');
    this.child.stdin.write(line);
  }
  private close(confirmed: boolean): void {
    if (this.closed) return;
    this.closed = true; this.confirmed = confirmed;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Agent-Prozess wurde beendet.')); }
    this.pending.clear(); this.callbacks.closed(confirmed);
  }
  private helper(args: string[], timeoutMs = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.processHost, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let result = '', settled = false;
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
      const timer = setTimeout(() => { child.kill(); finish(new Error('Prozessschutz antwortet nicht.')); }, timeoutMs);
      child.stdout.on('data', chunk => { result += String(chunk); if (result.length > 2048) { child.kill(); finish(new Error('Ungültige Prozessschutz-Antwort.')); } });
      child.once('error', () => finish(new Error('Prozessschutz konnte nicht gestartet werden.')));
      child.once('close', code => finish(code === 0 ? undefined : new Error('Prozessschutz hat die Aktion nicht bestätigt.')));
    });
  }
  async managedProcessCount(): Promise<number> {
    if (this.closed) return 0;
    if (!this.nativePid) throw new Error('Aufgabenprozess ist noch nicht bestätigt.');
    const result: unknown = JSON.parse(await this.helper(['--inspect-job', `Local\\openhiatusWork-${this.control.replaceAll('-', '')}`, String(this.nativePid)]));
    if (!result || typeof result !== 'object' || !('managedProcesses' in result) || typeof result.managedProcesses !== 'number'
      || !Number.isSafeInteger(result.managedProcesses) || result.managedProcesses < 1) throw new Error('Ungültige Prozesszählung.');
    return result.managedProcesses - 1; // Pi host itself is not retained user work.
  }
  terminate(): Promise<void> { return this.terminating ??= this.kill(); }
  private async kill(): Promise<void> {
    if (!this.closed && this.child.pid) await this.helper(['--stop', this.control]).catch(error => { if (!this.closed) throw error; });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([this.exited, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Ende des Agent-Prozessbaums unbestätigt.')), 7000); })]);
      if (!this.confirmed) throw new Error('Ende des Agent-Prozessbaums unbestätigt.');
    } finally { if (timer) clearTimeout(timer); }
  }
}
