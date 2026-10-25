/** Device-local Windows state; never persisted as an agent/profile preference. */
export interface AutostartSettings {
  available: boolean;
  enabled: boolean;
  disabledByWindows: boolean;
  unavailableReason?: string;
}
