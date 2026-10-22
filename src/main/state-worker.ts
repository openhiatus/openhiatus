import { isMainThread, parentPort, threadId, workerData } from 'node:worker_threads';
import { StateStore } from './storage.js';
import { decodeBootstrap, decodeStateRequest, workerFailure, type StateWorkerResponse } from './platform/persistence/protocol.js';
import { replaceStateFile } from './platform/persistence/state-file-replace.js';

if (isMainThread || !parentPort) throw new Error('Der Verlaufsspeicher darf nur in seinem eigenen Worker gestartet werden.');
const port = parentPort;
const bootstrap: unknown = workerData;
const store = new StateStore(decodeBootstrap(bootstrap).directory, { replaceFile: replaceStateFile });
const send = (message: StateWorkerResponse) => port.postMessage(message);
let lastId = 0, closing = false;
port.on('message', (value: unknown) => {
  try {
    const message = decodeStateRequest(value);
    if (closing) throw new Error('State worker is closing');
    if (message.type === 'close') { closing = true; port.close(); return; }
    if (message.id <= lastId) throw new Error('State commit identifier was reused');
    lastId = message.id;
    // The worker event loop is the FIFO: save is synchronous and its full validation,
    // serialization, primary/backup writes and fsync finish before the next message.
    try { store.save(message.state); send({ version: 1, type: 'committed', id: message.id }); }
    catch (error) { send({ version: 1, type: 'rejected', id: message.id, error: workerFailure(error) }); }
  } catch (error) { closing = true; send({ version: 1, type: 'fatal', error: workerFailure(error) }); port.close(); }
});
send({ version: 1, type: 'ready', threadId });
