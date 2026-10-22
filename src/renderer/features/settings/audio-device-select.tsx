import { ChevronDown } from 'lucide-react';
import type { Preferences, PreferencesPatch } from '../../../shared/contracts';
import { audioDevicePreference, physicalAudioDevices, resolveAudioDevice, type AudioDeviceKind } from '../../../shared/audio-devices';

export function AudioDeviceSelect({ id, kind, preferences, devices, disabled, onChange }: {
  id: string; kind: AudioDeviceKind; preferences?: Preferences; devices: readonly MediaDeviceInfo[];
  disabled: boolean; onChange(patch: PreferencesPatch): void;
}) {
  const choice = preferences && resolveAudioDevice(preferences, kind, devices);
  const available = physicalAudioDevices(devices, kind);
  const name = kind === 'audioinput' ? 'Mikrofon' : 'Lautsprecher';
  const savedName = kind === 'audioinput' ? 'Gespeichertes Mikrofon' : 'Gespeicherter Lautsprecher';
  return <div className="select-wrap"><select id={id} value={choice?.deviceId ?? 'default'} disabled={disabled}
    onChange={event => onChange(audioDevicePreference(kind, event.target.value, devices))}>
    <option value="default">Windows-Standardgerät</option>
    {choice && !choice.connected && <option value={choice.deviceId}>{choice.label || savedName} – {choice.ambiguous ? 'nicht eindeutig erkannt' : 'nicht angeschlossen'}</option>}
    {available.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${name} ${index + 1}`}</option>)}
  </select><ChevronDown size={15} aria-hidden="true" /></div>;
}
