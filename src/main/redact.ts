/** Defence in depth for UI errors and local activity. Do not log request headers/bodies. */
export function redact(text: string, secrets: string[] = []): string {
  let result = String(text);
  for (const secret of [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join('[geschützt]');
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) result = result.split(encoded).join('[geschützt]');
  }
  return result
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/_=.~-]+/gi, '$1 [geschützt]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[geschützt]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[geschützt]')
    .replace(/\b(?:gsk_|hf_|pplx-)[A-Za-z0-9_-]{20,}\b/g, '[geschützt]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[geschützt]')
    .replace(/((?:["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|password|client[_-]?secret)["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}\]]+)/gi, '$1[geschützt]');
}
