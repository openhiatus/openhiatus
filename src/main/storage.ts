import { APP_DISPLAY_NAME } from '../shared/branding';
import { validateUsage } from './modules/tasks';
export { validateUsage } from './modules/tasks';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Activity, BackgroundJob, Message, Preferences, Task, TaskStatus, Usage } from '../shared/contracts';
import { redact } from './redact';
import { parseSkillFavorites } from '../shared/skill-favorites';
import { computerOverviewDivisor } from '../shared/computer-views';
import { parseComputerTaskSettings } from '../shared/computer-task-settings';
import { parseModelRequestSummaries } from '../shared/model-requests';

export interface SavedState { messages: Message[]; activity: Activity[]; task: Task; preferences: Preferences; jobs?: BackgroundJob[]; usage?: Usage; }
export const MAX_STATE_BYTES = 32 * 1024 * 1024;
const taskStatuses = new Set<TaskStatus>(['idle', 'running', 'stopping', 'completed', 'interrupted', 'failed']);

export function defaultState(): SavedState {
  return {
    messages: [], activity: [], task: { id: '', status: 'idle' },
    preferences: { inputDeviceId: 'default', outputDeviceId: 'default', speakReplies: true, voiceId: 'Dennis', model: '', dialogModel: '', memoryModel: '', memoryAutoSummarize: true, voiceConversation: true, fullAccessAcknowledged: false, chatgptBackgroundUsage: false, computerOverviewScaleDivisor: 1, computerDelegationEnabled: false, computerModel: '', computerFast: true },
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültiges Datenformat.');
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 200000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Ungültiges Textfeld.');
  return value;
}
function optionalString(value: unknown): string | undefined { return value === undefined ? undefined : string(value); }

/** Explicit projection prevents accidental persistence of connection objects or keys. */
function validateState(value: unknown): SavedState {
  const source = object(value);
  if (!Array.isArray(source.messages) || !Array.isArray(source.activity) || source.messages.length > 10000 || source.activity.length > 20000) {
    throw new Error('Ungültiger Verlauf.');
  }
  const messages = source.messages.map((value): Message => {
    const row = object(value);
    if (row.role !== 'user' && row.role !== 'assistant') throw new Error('Ungültige Rolle.');
    const message: Message = { id: string(row.id, 512), role: row.role, text: redact(string(row.text)), at: string(row.at, 100) };
    if (row.jobId !== undefined) message.jobId = string(row.jobId, 512);
    if (row.source !== undefined) {
      if (row.source !== 'agent') throw new Error('Ungültige Nachrichtenquelle.');
      message.source = row.source;
    }
    return message;
  });
  const activity = source.activity.map((value): Activity => {
    const row = object(value);
    if (!['system', 'command', 'file', 'error'].includes(row.kind as string)) throw new Error('Ungültige Aktivität.');
    return { id: string(row.id, 512), at: string(row.at, 100), kind: row.kind as Activity['kind'], title: redact(string(row.title)),
      ...(row.detail !== undefined ? { detail: redact(string(row.detail)) } : {}) };
  });
  const sourceTask = object(source.task);
  if (!taskStatuses.has(sourceTask.status as TaskStatus)) throw new Error('Ungültiger Aufgabenstatus.');
  const task: Task = { id: string(sourceTask.id, 512), status: sourceTask.status as TaskStatus };
  const threadId = optionalString(sourceTask.threadId);
  const turnId = optionalString(sourceTask.turnId);
  const error = optionalString(sourceTask.error);
  if (threadId !== undefined) task.threadId = threadId;
  if (turnId !== undefined) task.turnId = turnId;
  if (error !== undefined) task.error = redact(error);
  const p = object(source.preferences);
  if (typeof p.speakReplies !== 'boolean') throw new Error('Ungültige Spracheinstellung.');
  const memoryAutoSummarize = p.memoryAutoSummarize === undefined ? true : p.memoryAutoSummarize;
  if (typeof memoryAutoSummarize !== 'boolean') throw new Error('Ungültige Einstellung für die automatische Gedächtnisverdichtung.');
  const voiceConversation = p.voiceConversation === undefined ? true : p.voiceConversation;
  if (typeof voiceConversation !== 'boolean') throw new Error('Ungültige Einstellung für den Sprachdialog.');
  if (p.chatgptBackgroundUsage !== undefined && typeof p.chatgptBackgroundUsage !== 'boolean') throw new Error('Ungültige Einstellung für automatische ChatGPT-Nutzung.');
  if (p.computerDelegationEnabled !== undefined && typeof p.computerDelegationEnabled !== 'boolean') throw new Error('Ungültige Einstellung für das Computer-Modell.');
  if (p.computerFast !== undefined && typeof p.computerFast !== 'boolean') throw new Error('Ungültige Fast-Einstellung für das Computer-Modell.');
  const preferences: Preferences = {
    computerOverviewScaleDivisor: p.computerOverviewScaleDivisor === undefined ? 1 : computerOverviewDivisor(p.computerOverviewScaleDivisor),
    computerDelegationEnabled: p.computerDelegationEnabled === true, computerModel: p.computerModel === undefined ? '' : string(p.computerModel, 300), computerFast: p.computerFast !== false,
    inputDeviceId: string(p.inputDeviceId, 1000), outputDeviceId: string(p.outputDeviceId, 1000),
    ...(p.inputDeviceLabel !== undefined ? { inputDeviceLabel: string(p.inputDeviceLabel, 1000) } : {}),
    ...(p.inputDeviceGroupId !== undefined ? { inputDeviceGroupId: string(p.inputDeviceGroupId, 1000) } : {}),
    ...(p.outputDeviceLabel !== undefined ? { outputDeviceLabel: string(p.outputDeviceLabel, 1000) } : {}),
    ...(p.outputDeviceGroupId !== undefined ? { outputDeviceGroupId: string(p.outputDeviceGroupId, 1000) } : {}),
    speakReplies: p.speakReplies, voiceId: string(p.voiceId, 200), model: string(p.model, 300), dialogModel: string(p.dialogModel ?? '', 300), memoryModel: string(p.memoryModel ?? '', 300), memoryAutoSummarize, voiceConversation,
    fullAccessAcknowledged: p.fullAccessAcknowledged === true, chatgptBackgroundUsage: p.chatgptBackgroundUsage === true,
    ...(typeof p.earcons === 'boolean' ? { earcons: p.earcons } : {}),
    ...(p.skillFavorites !== undefined ? { skillFavorites: parseSkillFavorites(p.skillFavorites) } : {}),
  };
  let jobs: BackgroundJob[] | undefined;
  if (source.jobs !== undefined) {
    if (!Array.isArray(source.jobs) || source.jobs.length > 1000) throw new Error('Ungültige Aufgabenliste.');
    jobs = source.jobs.map(value => {
      const row = object(value);
      if (!['queued', 'running', 'stopping', 'completed', 'interrupted', 'failed'].includes(row.status as string)
        || !Array.isArray(row.resources) || row.resources.length > 24) throw new Error('Ungültige Hintergrundaufgabe.');
      const job: BackgroundJob = {
        id: string(row.id, 512), requestId: string(row.requestId, 1024), title: redact(string(row.title, 200)), prompt: redact(string(row.prompt, 32000)),
        status: row.status as BackgroundJob['status'], createdAt: string(row.createdAt, 100), updatedAt: string(row.updatedAt, 100),
        model: string(row.model, 300), resources: row.resources.map(value => redact(string(value, 4096))),
      };
      if (row.usage !== undefined) job.usage = validateUsage(row.usage);
      if (row.computer !== undefined) job.computer = parseComputerTaskSettings(row.computer);
      if (row.modelRequests !== undefined) job.modelRequests = parseModelRequestSummaries(row.modelRequests);
      if (row.runtimeRetained !== undefined) {
        if (typeof row.runtimeRetained !== 'boolean') throw new Error('Ungültiger Aufgabenprozessstatus.');
        job.runtimeRetained = row.runtimeRetained;
      }
      for (const field of ['threadId', 'turnId', 'result', 'error'] as const) if (row[field] !== undefined) job[field] = redact(string(row[field]));
      if (row.identityInstructions !== undefined) job.identityInstructions = redact(string(row.identityInstructions, 32000));
      return job;
    });
    if (new Set(jobs.map(job => job.id)).size !== jobs.length || new Set(jobs.map(job => job.requestId)).size !== jobs.length) throw new Error('Doppelte Aufgabenkennungen.');
  }
  return { messages, activity, task, preferences, ...(source.usage !== undefined ? { usage: validateUsage(source.usage) } : {}), ...(jobs !== undefined ? { jobs } : {}) };
}

function atomicWrite(path: string, contents: string, replace: (temporary: string, target: string) => void = renameSync): void {
  const temporary = `${path}.tmp`;
  const descriptor = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  replace(temporary, path);
}

export class UnsupportedStateVersion extends Error {}

export interface StateStoreOptions { replaceFile?: (temporary: string, target: string) => void; }

export class StateStore {
  private readonly path: string;
  private readonly backup: string;
  constructor(directory: string, private readonly options: StateStoreOptions = {}) {
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, 'state.json');
    this.backup = join(directory, 'state.backup.json');
  }

  private read(path: string): SavedState {
    if (statSync(path).size > MAX_STATE_BYTES) throw new Error('Der gespeicherte Verlauf ist zu groß.');
    const envelope = object(JSON.parse(readFileSync(path, 'utf8')));
    if (envelope.version !== 1) throw new UnsupportedStateVersion(`Dieser Verlauf stammt aus einer nicht unterstützten ${APP_DISPLAY_NAME}-Version.`);
    return validateState(envelope.state);
  }

  load(): SavedState {
    let state: SavedState | undefined;
    let recovered = false;
    const candidates = [this.path, this.backup, `${this.path}.tmp`];
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      try { state = this.read(path); recovered = path !== this.path; break; }
      catch (error) {
        if (error instanceof UnsupportedStateVersion) throw error;
        // A damaged primary may recover from its last known complete backup. No task is re-run.
      }
    }
    if (!state) {
      if (candidates.some(existsSync)) throw new Error('Der lokale Verlauf ist beschädigt und konnte nicht wiederhergestellt werden. Die Dateien bleiben zur Wiederherstellung erhalten.');
      return defaultState();
    }
    if (state.task.status === 'running' || state.task.status === 'stopping') {
      state.task = { ...state.task, status: 'interrupted', error: 'Die App wurde während dieser Aufgabe beendet. Der Auftrag wird nicht automatisch wiederholt.' };
      state.activity.push({ id: randomUUID(), at: new Date().toISOString(), kind: 'system', title: 'Unterbrochene Aufgabe wiederhergestellt', detail: state.task.error });
    }
    for (const job of state.jobs ?? []) {
      job.runtimeRetained = false;
      if (['queued', 'running', 'stopping'].includes(job.status)) {
        job.status = 'interrupted'; job.updatedAt = new Date().toISOString();
        job.error = 'Die App wurde während dieser Aufgabe beendet. Sie wird nicht automatisch wiederholt.';
      }
    }
    if (recovered) {
      // A recovered history is not proof of explicit full-access consent.
      state.preferences.fullAccessAcknowledged = false;
      state.preferences.chatgptBackgroundUsage = false;
      state.activity.push({ id: randomUUID(), at: new Date().toISOString(), kind: 'system', title: 'Verlauf aus lokaler Sicherung wiederhergestellt', detail: 'Bitte den Vollzugriff erneut bestätigen.' });
    }
    return state;
  }

  save(state: unknown): void {
    const serialized = JSON.stringify({ version: 1, state: validateState(state) }, null, 2);
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) throw new Error('Der lokale Verlauf ist zu groß zum Speichern.');
    // Only a validated primary can replace the backup. Preserve a good backup after recovery.
    if (existsSync(this.path)) {
      try {
        const previous = this.read(this.path);
        atomicWrite(this.backup, JSON.stringify({ version: 1, state: previous }, null, 2), this.options.replaceFile);
      } catch (error) {
        if (error instanceof UnsupportedStateVersion) throw error;
        // A malformed primary can be replaced by the caller's recovered state.
      }
    }
    atomicWrite(this.path, serialized, this.options.replaceFile);
  }
}

export interface CredentialCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

type CredentialEnvelope = { version: 1; keys: Record<string, string> };
function validName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-zA-Z][a-zA-Z0-9:_.-]{0,127}$/.test(name) && !['__proto__', 'prototype', 'constructor', 'version'].includes(name);
}
function validKey(name: string, key: unknown): key is string {
  if (name === 'provider:chatgpt') {
    if (typeof key !== 'string' || !key || Buffer.byteLength(key, 'utf8') > 64 * 1024 || /[\u0000-\u001f\u007f]/u.test(key)) return false;
    try { const value = JSON.parse(key); return !!value && typeof value === 'object' && !Array.isArray(value); } catch { return false; }
  }
  return typeof key === 'string' && key.length > 0 && key.length <= 8192 && !/[\u0000-\u001f\u007f]/u.test(key)
    && (name !== 'inworld' || /^[A-Za-z0-9+/]+={0,2}$/.test(key));
}
function credentialLabel(name: string): string { return name === 'inworld' ? 'Inworld-Schlüssel' : name === 'provider:chatgpt' ? 'ChatGPT-Zugang' : 'API-Schlüssel'; }

/** Main process only. Electron safeStorage supplies Windows DPAPI; never plaintext fallback. */
export class CredentialStore {
  private readonly path: string;
  constructor(directory: string, private readonly crypto: CredentialCrypto) {
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, 'credentials.json');
  }
  private ensureAvailable(): void {
    if (!this.crypto.isEncryptionAvailable()) throw new Error('Windows-Schlüsselschutz ist nicht verfügbar. Zugangsdaten werden nicht unverschlüsselt gespeichert.');
  }
  private name(name: string): void { if (!validName(name)) throw new Error('Unbekannte Verbindung.'); }

  private read(): CredentialEnvelope {
    const path = existsSync(this.path) ? this.path : `${this.path}.tmp`;
    if (!existsSync(path)) return { version: 1, keys: {} };
    try {
      if (statSync(path).size > 256 * 1024) throw new Error('size');
      const envelope = object(JSON.parse(readFileSync(path, 'utf8')));
      if (envelope.version !== 1 || Object.keys(envelope).some(key => !['version', 'keys'].includes(key))) throw new Error('format');
      const keys = object(envelope.keys);
      for (const [name, ciphertext] of Object.entries(keys)) {
        if (!validName(name) || typeof ciphertext !== 'string' || !ciphertext.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)
          || Buffer.from(ciphertext, 'base64').toString('base64') !== ciphertext) throw new Error('format');
      }
      return envelope as CredentialEnvelope;
    } catch {
      throw new Error('Die gespeicherten Zugangsdaten sind beschädigt oder haben ein unbekanntes Format. Die Datei bleibt unverändert erhalten.');
    }
  }

  get(name: string): string | undefined {
    this.name(name);
    const encrypted = this.read().keys[name];
    if (encrypted === undefined) return undefined;
    this.ensureAvailable();
    try {
      const key = this.crypto.decryptString(Buffer.from(encrypted, 'base64'));
      if (!validKey(name, key)) throw new Error('key');
      return key;
    } catch { throw new Error(`Der gespeicherte ${credentialLabel(name)} kann unter diesem Windows-Benutzer nicht gelesen werden. Bitte in Verbindungen erneut speichern.`); }
  }

  set(name: string, key: string): void {
    this.name(name);
    const envelope = this.read();
    this.ensureAvailable();
    if (typeof key !== 'string' || !validKey(name, name === 'provider:chatgpt' ? key : key.trim())) {
      throw new Error(name === 'inworld' ? 'Bitte die Base64-Zugangsdaten aus dem Inworld-Portal verwenden.' : 'Bitte einen gültigen API-Schlüssel eingeben.');
    }
    try {
      const encrypted = this.crypto.encryptString(key.trim());
      if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error('encryption');
      const serialized = JSON.stringify({ version: 1, keys: { ...envelope.keys, [name]: encrypted.toString('base64') } });
      if (Buffer.byteLength(serialized, 'utf8') > 256 * 1024) throw new Error('size');
      atomicWrite(this.path, serialized);
    } catch { throw new Error(`Der ${credentialLabel(name)} konnte nicht verschlüsselt gespeichert werden.`); }
  }

  remove(name: string): void {
    this.name(name);
    const envelope = this.read();
    delete envelope.keys[name];
    // Removal also works if OS decryption is unavailable; no secret history/backup is kept.
    if (Object.keys(envelope.keys).length > 0) {
      atomicWrite(this.path, JSON.stringify(envelope));
    } else {
      for (const path of [this.path, `${this.path}.tmp`]) if (existsSync(path)) unlinkSync(path);
    }
  }
}
