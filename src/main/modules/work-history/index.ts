import type { BackgroundJob, Message, Task } from '../../../shared/contracts';
import { decodeWorkItems, jobWorkId, requestWorkId, type WorkActionEvent, type WorkItem } from '../../../shared/work-history';

const active = (status: string) => ['queued', 'running', 'stopping'].includes(status);

/** Shared journal projection. It is committed with the existing admission/rollback barrier. */
export class WorkHistory {
  private items: WorkItem[];
  private observedJobs = new Set<string>();
  constructor(initial: readonly WorkItem[] = [], private readonly clean = (text: string) => text, private readonly now = () => new Date().toISOString()) {
    this.items = decodeWorkItems(structuredClone(initial));
    for (const item of this.items) if (active(item.status)) {
      item.status = 'interrupted'; item.updatedAt = this.now();
      item.error = 'Die vorherige Sitzung wurde unterbrochen. Es wird nichts automatisch wiederholt.';
      this.endActions(item);
    }
  }
  snapshot(): WorkItem[] {
    const items = structuredClone(this.items);
    for (const item of items) {
      item.prompt = this.clean(item.prompt); item.title = this.clean(item.title);
      item.resources = item.resources.map(this.clean);
      if (item.result !== undefined) item.result = this.clean(item.result);
      if (item.error !== undefined) item.error = this.clean(item.error);
      for (const action of item.actions) if (action.target !== undefined) action.target = this.clean(action.target);
    }
    return items;
  }
  private endActions(item: WorkItem): void {
    for (const action of item.actions) if (action.status === 'running') { action.status = 'interrupted'; action.updatedAt = item.updatedAt; }
  }
  foreground(messages: readonly Message[], task: Task, kind: 'conversation' | 'direct', answerId?: string): void {
    const sessionId = messages[0]?.id;
    if (!sessionId) return; // Starting a new conversation retains the preceding session.
    const ids = new Set(messages.map(message => message.id));
    // Failed admissions remove their tentative record in the same rollback as their source.
    this.items = this.items.filter(item => item.kind === 'background' || item.sessionId !== sessionId || ids.has(item.requestId));
    const index = messages.findIndex(message => message.id === task.id && message.role === 'user');
    if (index < 0 || task.status === 'idle') return;
    for (const message of messages.slice(index).filter(message => message.role === 'user')) {
      const current = message.id === task.id;
      const id = requestWorkId(message.id);
      let item = this.items.find(item => item.id === id);
      if (!item) {
        item = { id, kind, sessionId, requestId: message.id, title: this.clean(message.text).replace(/\s+/g, ' ').slice(0, 200),
          prompt: this.clean(message.text), status: current ? task.status : 'queued', createdAt: message.at, updatedAt: message.at, resources: [], actions: [] };
        this.items.push(item);
      }
      const status = current ? task.status : ['stopping', 'interrupted'].includes(task.status) ? 'interrupted' : item.status;
      const result = current && answerId ? messages.find(message => message.id === answerId)?.text : undefined;
      if (current && answerId) item.answerId = answerId;
      if (item.status !== status || (result !== undefined && result !== item.result) || (current && task.error !== item.error)) item.updatedAt = this.now();
      item.status = status;
      if (current) {
        if (result !== undefined) item.result = this.clean(result);
        if (task.error !== undefined) item.error = this.clean(task.error); else delete item.error;
      }
      if (!active(item.status)) this.endActions(item);
    }
  }
  jobs(jobs: readonly BackgroundJob[]): void {
    const ids = new Set(jobs.map(job => jobWorkId(job.id)));
    // Only tentative queued jobs can disappear through failed admission. Retired results stay.
    this.items = this.items.filter(item => !(this.observedJobs.has(item.id) && !ids.has(item.id) && item.status === 'queued'));
    this.observedJobs = ids;
    for (const job of jobs) {
      const id = jobWorkId(job.id);
      let item = this.items.find(item => item.id === id);
      const parent = job.parentRequestId ? this.items.find(item => item.id === requestWorkId(job.parentRequestId!)) : undefined;
      if (!item) { item = { id, kind: 'background', sessionId: parent?.sessionId ?? id, requestId: job.requestId,
        title: '', prompt: '', status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, resources: [], actions: [] }; this.items.push(item); }
      Object.assign(item, { title: this.clean(job.title), prompt: this.clean(job.prompt), status: job.status, updatedAt: job.updatedAt > item.updatedAt ? job.updatedAt : item.updatedAt, resources: job.resources.map(this.clean) });
      if (parent) item.parentId = parent.id;
      if (job.result !== undefined) item.result = this.clean(job.result); else delete item.result;
      if (job.error !== undefined) item.error = this.clean(job.error); else delete item.error;
      if (!active(item.status)) this.endActions(item);
    }
  }
  action(workId: string, event: WorkActionEvent): void {
    const item = this.items.find(item => item.id === workId);
    if (!item || !active(item.status)) return;
    const at = this.now();
    let action = item.actions.find(action => action.id === event.id);
    if (action && (action.tool !== event.tool || action.status !== 'running')) return;
    if (!action) { action = { id: event.id, tool: event.tool, status: event.status, startedAt: at, updatedAt: at }; item.actions.push(action); }
    action.status = event.status; action.updatedAt = at;
    if (event.target !== undefined) action.target = this.clean(event.target);
    item.updatedAt = at;
  }
  /** An admission can roll back to an empty transcript, including the first request. */
  rollbackMissing(previous: readonly Message[], current: readonly Message[]): void {
    const ids = new Set(current.map(message => message.id));
    const removed = new Set(previous.filter(message => message.role === 'user' && !ids.has(message.id)).map(message => requestWorkId(message.id)));
    this.items = this.items.filter(item => !removed.has(item.id));
  }
}
