import { ArrowRight, Mail, Unplug } from 'lucide-react';

/** Personal services have their own destination, separate from model and voice credentials. */
export function ServicesView({ onSettings }: { onSettings(): void }) {
  return <main className="services-scroll"><div className="services-content">
    <div className="eyebrow">DEINE PERSÖNLICHEN KONTEN</div>
    <h1>Deine Dienste.</h1>
    <p className="services-lead">Hier werden persönliche Konten für Aufgaben wie das Suchen und Lesen von Nachrichten angebunden.</p>
    <section className="services-empty"><Unplug size={30} aria-hidden="true" />
      <h2>Dienstanbindungen folgen.</h2>
      <p>Persönliche Dienste sind in dieser Version noch nicht verfügbar. Deine Modellanbieter und den Sprachzugang verwaltest du in den Einstellungen.</p>
      <button className="secondary-button" onClick={onSettings}>Modell- und Sprachzugänge <ArrowRight size={14} /></button>
    </section>
    <section className="services-plan"><Mail size={21} aria-hidden="true" /><div><small>In Vorbereitung</small><h2>Gmail</h2><p>Nachrichten gezielt suchen, Quellen nachlesen und Antworten vorbereiten.</p></div></section>
  </div></main>;
}
