/** Public connection metadata only. OAuth credentials belong to the concrete adapter. */
export interface ServiceConnection {
  id: string;
  provider: string;
  label: string;
  account: string;
  status: 'connecting' | 'ready' | 'reauth-required' | 'error';
  capabilities: string[];
}

export type ServiceData = null | boolean | number | string | ServiceData[] | { [key: string]: ServiceData };
export interface ServiceResource {
  provider: string;
  connectionId: string;
  kind: string;
  id: string;
  title?: string;
}
/** Bounded domain data; adapters must project API replies instead of returning authentication objects. */
export interface ServiceResult {
  data: ServiceData;
  resources?: ServiceResource[];
  nextCursor?: string;
}
