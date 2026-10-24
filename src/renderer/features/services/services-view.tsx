import { ArrowRight, Mail } from 'lucide-react';
import { GoogleCalendarCard } from './google-calendar-card';

/** Personal services have their own destination, separate from model and voice credentials. */
export function ServicesView({ onSettings, active = true }: { onSettings(): void; active?: boolean }) {
  return <main className="services-scroll"><div className="services-content">
    <div className="eyebrow">DEINE PERSÖNLICHEN KONTEN</div>
    <h1>Deine Dienste.</h1>
    <p className="services-lead">Verbinde persönliche Konten, damit dein Assistent deinen Alltag kennt und dich bei Terminen unterstützt.</p>
    <GoogleCalendarCard active={active} />
    <button className="secondary-button" onClick={onSettings}>Modell- und Sprachzugänge <ArrowRight size={14} /></button>
    <section className="services-plan"><Mail size={21} aria-hidden="true" /><div><small>In Vorbereitung</small><h2>Gmail</h2><p>Nachrichten gezielt suchen, Quellen nachlesen und Antworten vorbereiten.</p></div></section>
  </div></main>;
}
