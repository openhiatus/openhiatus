import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { IDENTITY_FILES, type IdentityDocument } from '../../../shared/identity-documents';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Receipt = { hash: string; version: number };
/** Markdown is editable outside the app; the ledger retains versions and approvals. */
export class IdentityFiles {
  private receipts: Record<string, Receipt> = {};
  private observed = new Map<string, string | undefined>();
  warnings: string[] = [];
  private readonly index: string;
  constructor(readonly directory: string) {
    this.index = join(directory, 'identity-files.index.json');
    try {
      const info = lstatSync(this.index); if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw Error('Invalid receipt file');
      const value = JSON.parse(readFileSync(this.index, 'utf8'));
      for (const file of IDENTITY_FILES) {
        const item = value[file.id];
        if (item && /^[a-f0-9]{64}$/.test(item.hash) && Number.isSafeInteger(item.version) && item.version > 0) this.receipts[file.id] = item;
      }
    } catch { /* Missing receipts cause existing Markdown to be imported, never overwritten. */ }
  }
  private read(filename: string): string | undefined {
    const path = join(this.directory, filename);
    if (!existsSync(path)) return undefined;
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768) throw Error('Keine reguläre Markdown-Datei bis 32 KiB.');
    const bytes = readFileSync(path), value = bytes.toString('utf8');
    if (!Buffer.from(value, 'utf8').equals(bytes) || value.replace(/^\uFEFF/, '').length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw Error('Ungültiger UTF-8-Text oder mehr als 8000 Zeichen.');
    return value;
  }
  changes(documents: readonly IdentityDocument[]): Array<{ id: string; content: string }> {
    this.warnings = []; this.observed.clear();
    const updates: Array<{ id: string; content: string }> = [];
    for (const file of IDENTITY_FILES) {
      const document = documents.find(document => document.id === file.id); if (!document) continue;
      try {
        const content = this.read(file.filename), digest = content === undefined ? undefined : hash(content);
        this.observed.set(file.id, digest);
        if (content !== undefined && digest !== hash(document.content) && digest !== this.receipts[file.id]?.hash) updates.push({ id: file.id, content: content.replace(/^\uFEFF/, '') });
      } catch { this.warnings.push(`${file.filename}: Datei nicht übernommen. Prüfe UTF-8, Dateityp und die Grenze von 8000 Zeichen; sie bleibt unverändert.`); }
    }
    return updates;
  }
  publish(documents: readonly IdentityDocument[], imported: ReadonlySet<string> = new Set()): void {
    for (const file of IDENTITY_FILES) {
      const document = documents.find(document => document.id === file.id); if (!document || !this.observed.has(file.id)) continue;
      try {
        const current = this.read(file.filename), digest = current === undefined ? undefined : hash(current);
        if (digest !== this.observed.get(file.id)) throw Error('Concurrent edit');
        if (digest !== undefined && digest !== hash(document.content) && digest !== this.receipts[file.id]?.hash && !imported.has(file.id)) throw Error('Unimported edit');
        if (digest !== hash(document.content)) {
          const target = join(this.directory, file.filename), temporary = `${target}.${randomUUID()}.tmp`;
          writeFileSync(temporary, document.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); renameSync(temporary, target);
        }
        this.receipts[file.id] = { hash: hash(document.content), version: document.version };
      } catch { this.warnings.push(`${file.filename}: Dateisynchronisierung ausstehend. Eine zwischenzeitliche Änderung wird nicht überschrieben.`); }
    }
    try {
      const temporary = `${this.index}.${randomUUID()}.tmp`; writeFileSync(temporary, JSON.stringify(this.receipts), { encoding: 'utf8', mode: 0o600, flag: 'wx' }); renameSync(temporary, this.index);
    } catch { this.warnings.push('Dateisynchronisierung konnte nicht bestätigt werden. Die gespeicherten Dokumentversionen bleiben erhalten.'); }
  }
}
