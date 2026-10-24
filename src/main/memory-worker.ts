import { isMainThread, parentPort, threadId, workerData } from 'node:worker_threads';
import { MemoryStore } from './memory.js';
import { redact } from './redact.js';
import { decodeMemoryBootstrap, decodeMemoryRequest, memoryFailure, updatesInstructionCache, type MemoryCall, type MemoryMethod, type MemoryResult, type MemoryWorkerResponse } from './platform/persistence/memory-protocol.js';

if (isMainThread || !parentPort) throw new Error('Der Gedächtnisspeicher darf nur in seinem eigenen Worker gestartet werden.');
const port = parentPort;
const bootstrap: unknown = workerData;
const directory = decodeMemoryBootstrap(bootstrap).directory;
let store: MemoryStore | undefined, secrets: string[] = [], lastId = 0, closing = false;
const sanitize = (value: string) => redact(value, secrets);
const send = (response: MemoryWorkerResponse) => port.postMessage(response);
function respond<M extends MemoryMethod>(request: MemoryCall<M>, result: MemoryResult<M>, memory: MemoryStore): void {
  send({ version: 1, type: 'result', id: request.id, method: request.method, result,
    ...(updatesInstructionCache(request.method) ? { instructions: memory.instructionDocuments() } : {}) });
}
function execute(request: MemoryCall, memory: MemoryStore): void {
  // Each method is synchronous. The worker's event loop is the single FIFO;
  // validation, draft mutation, backup and fsync all finish before the next call.
  switch (request.method) {
    case 'initializeProfile': return respond(request, memory.initializeProfile(...request.args), memory);
    case 'capture': return respond(request, memory.capture(...request.args), memory);
    case 'snapshot': return respond(request, memory.snapshot(...request.args), memory);
    case 'source': return respond(request, memory.source(...request.args), memory);
    case 'retrieve': return respond(request, memory.retrieve(...request.args), memory);
    case 'rebuild': return respond(request, memory.rebuild(...request.args), memory);
    case 'edit': return respond(request, memory.edit(...request.args), memory);
    case 'propose': return respond(request, memory.propose(...request.args), memory);
    case 'decide': return respond(request, memory.decide(...request.args), memory);
    case 'search': return respond(request, memory.search(...request.args), memory);
    case 'readPeriod': return respond(request, memory.readPeriod(...request.args), memory);
    case 'planSummaries': return respond(request, memory.planSummaries(...request.args), memory);
    case 'summaryInput': return respond(request, memory.summaryInput(...request.args), memory);
    case 'applySummary': return respond(request, memory.applySummary(...request.args), memory);
  }
}
port.on('message', (value: unknown) => {
  try {
    const request = decodeMemoryRequest(value);
    if (closing) throw new Error('Memory worker is closing');
    if (request.type === 'close') { closing = true; port.close(); return; }
    secrets = request.secrets;
    if (request.type === 'initialize') {
      if (store) throw new Error('Memory worker was already initialized');
      store = new MemoryStore(directory, { sanitize });
      send({ version: 1, type: 'ready', threadId, instructions: store.instructionDocuments() });
      return;
    }
    if (!store || request.id <= lastId) throw new Error('Invalid memory operation order');
    lastId = request.id;
    try { execute(request, store); }
    catch (error) { send({ version: 1, type: 'rejected', id: request.id, method: request.method, error: memoryFailure(error, sanitize) }); }
  } catch (error) {
    closing = true; send({ version: 1, type: 'fatal', error: memoryFailure(error, sanitize) }); port.close();
  } finally { secrets = []; }
});
