import type { Preferences, PreferencesPatch } from './contracts';

export type AudioDeviceKind = 'audioinput' | 'audiooutput';
export interface AudioDeviceInfo { deviceId: string; kind: string; label: string; groupId: string; }
export interface AudioDeviceChoice { deviceId: string; label: string; connected: boolean; ambiguous: boolean; }

export function physicalAudioDevices(devices: readonly AudioDeviceInfo[], kind: AudioDeviceKind): AudioDeviceInfo[] {
  return devices.filter(device => device.kind === kind && device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications');
}

/** Keep the saved choice while disconnected. Never substitute a system-default alias. */
export function resolveAudioDevice(preferences: Preferences, kind: AudioDeviceKind, devices: readonly AudioDeviceInfo[]): AudioDeviceChoice {
  const input = kind === 'audioinput';
  const deviceId = (input ? preferences.inputDeviceId : preferences.outputDeviceId) || 'default';
  const label = (input ? preferences.inputDeviceLabel : preferences.outputDeviceLabel) || '';
  const groupId = input ? preferences.inputDeviceGroupId : preferences.outputDeviceGroupId;
  if (deviceId === 'default') return { deviceId, label, connected: true, ambiguous: false };
  const candidates = physicalAudioDevices(devices, kind);
  const found = (device: AudioDeviceInfo): AudioDeviceChoice => ({ deviceId: device.deviceId, label: device.label || label, connected: true, ambiguous: false });
  const exact = candidates.find(device => device.deviceId === deviceId);
  if (exact) return found(exact);
  const normalize = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  const named = label ? candidates.filter(device => normalize(device.label) === normalize(label)) : [];
  const grouped = groupId ? candidates.filter(device => device.groupId === groupId && (!label || normalize(device.label) === normalize(label))) : [];
  if (grouped.length === 1) return found(grouped[0]);
  if (named.length === 1) return found(named[0]);
  return { deviceId, label, connected: false, ambiguous: grouped.length > 1 || named.length > 1 };
}

/** Capture device metadata only when the user selects a device; reconnection never erases it. */
export function audioDevicePreference(kind: AudioDeviceKind, deviceId: string, devices: readonly AudioDeviceInfo[]): PreferencesPatch {
  const device = physicalAudioDevices(devices, kind).find(item => item.deviceId === deviceId);
  return kind === 'audioinput'
    ? { inputDeviceId: deviceId, inputDeviceLabel: device?.label || '', inputDeviceGroupId: device?.groupId || '' }
    : { outputDeviceId: deviceId, outputDeviceLabel: device?.label || '', outputDeviceGroupId: device?.groupId || '' };
}
