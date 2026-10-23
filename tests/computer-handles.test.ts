import test from 'node:test';
import assert from 'node:assert/strict';
import { computerHandle } from '../src/main/computer-handles';

test('observation handles stay short and unique across frame and view allocations in one process', () => {
  const handles = Array.from({ length: 10000 }, (_, index) => computerHandle(index % 2 ? 'view' : 'frame'));
  assert.equal(new Set(handles).size, handles.length);
  assert.ok(handles.every(handle => handle.length <= 24));
  assert.ok(handles.every((handle, index) => handle.startsWith(index % 2 ? 'v' : 'f')));
  const namespaces = new Set(handles.map(handle => handle.split('-')[1]));
  assert.equal(namespaces.size, 1, 'one stable namespace per process reduces copying overhead');
  assert.match([...namespaces][0], /^[a-f0-9]{12}$/);
});
