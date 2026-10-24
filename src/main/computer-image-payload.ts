import { isWireRecord } from './agent-wire';

/** Pi currently emits detail:auto. Change only marked computer views, at the provider boundary. */
export function applyComputerImageDetail(payload: unknown, messages: readonly unknown[], model: { api: string; provider: string; id: string; baseUrl: string }): unknown {
  // Explicit support list: other providers/models keep their normal request behavior.
  // https://developers.openai.com/api/docs/guides/tools-computer-use-integration
  // https://developers.openai.com/api/docs/guides/images-vision
  if (model.api !== 'openai-responses' || model.provider !== 'openai'
    || !/^https:\/\/api\.openai\.com\/v1\/?$/.test(model.baseUrl)
    || !/^gpt-(?:6\.1-sol|6-astra|6-luna|5\.6-(?:sol|terra|luna)|5\.5|5\.4(?:-mini|-nano)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(model.id)) return payload;
  if (!isWireRecord(payload) || !Array.isArray(payload.input)) return payload;
  const calls = new Map<string, Set<string>>();
  for (const message of messages) {
    if (!isWireRecord(message) || message.role !== 'toolResult' || (message.toolName !== 'computer' && message.toolName !== 'screen_help')
      || typeof message.toolCallId !== 'string' || !isWireRecord(message.details)
      || !Array.isArray(message.details.computerViews) || !Array.isArray(message.content)) continue;
    const callId = message.toolCallId.split('|')[0].replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64).replace(/_+$/, '');
    const images = new Set<string>();
    for (const index of message.details.computerViews) {
      if (!Number.isSafeInteger(index) || typeof index !== 'number') continue;
      const content = message.content[index];
      if (isWireRecord(content) && content.type === 'image' && typeof content.data === 'string' && content.mimeType === 'image/png') {
        images.add(`data:image/png;base64,${content.data}`);
      }
    }
    if (images.size) calls.set(callId, images);
  }
  if (!calls.size) return payload;
  const content = (value: unknown, images: Set<string>): void => {
    if (!Array.isArray(value)) return;
    for (const item of value) if (isWireRecord(item) && item.type === 'input_image'
      && typeof item.image_url === 'string' && images.has(item.image_url)) item.detail = 'original';
  };
  for (const item of payload.input) {
    if (!isWireRecord(item)) continue;
    const images = typeof item.call_id === 'string' ? calls.get(item.call_id) : undefined;
    if (images && (item.type === 'function_call_output' || item.type === 'custom_tool_call_output')) content(item.output, images);
  }
  return payload;
}
