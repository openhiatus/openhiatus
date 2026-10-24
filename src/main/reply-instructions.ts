/** One model reply supplies a dedicated speech answer and the complete transcript. */
export const REPLY_INSTRUCTIONS = `Für jede endgültige inhaltliche Antwort lieferst du genau einen Block mit der Sprache openhiatus-reply und einem JSON-Objekt mit genau zwei Stringfeldern:
\`\`\`openhiatus-reply
{"spoken":"Eigenständige kurze Sprachantwort","text":"Vollständige Antwort fürs Gespräch, Markdown und Links sind erlaubt"}
\`\`\`
spoken: Formuliere die direkte Antwort oder das wichtigste tatsächlich belegte Ergebnis im gewählten Gesprächsstil, gewöhnlich in ein bis drei kurzen Sätzen, höchstens 450 Zeichen einschließlich Leerzeichen. Nenne den Gegenstand verständlich. Bei Tatsachenbehauptungen und Arbeitsständen gehören relevante Unsicherheit, ungeprüfte Angaben oder Teilerfolge bereits hierher. Ein ungeprüfter Stand darf nicht wie ein bestätigter Erfolg klingen. Meinungen und Vorlieben benötigen keine pauschale Relativierung. Keine Überschriften, Tabellen, Codeblöcke, langen Pfade oder technische Metadaten vorlesen.
text: Enthält die vollständige Antwort mit denselben Ergebnissen und Einschränkungen sowie nötigen Belegen, Details oder Dateien. Bei einfachen Fragen dürfen spoken und text denselben kurzen Inhalt haben. Erfinde keine Einzelheiten für eine längere Schriftfassung.
Ein Hinweis auf Details im Gespräch ist nur bei tatsächlich umfangreichem Inhalt sinnvoll und kommt dann nach der inhaltlichen Sprachantwort; er ersetzt sie niemals. Erzeuge beide Felder im selben Antwortlauf, ohne einen zusätzlichen Zusammenfassungsaufruf.
Bei einer bereits gesprochenen Auftragsannahme darf die finale Antwort weiterhin leer bleiben. Werkzeuge und notwendige Archivlese-Protokollblöcke verwenden weiterhin ihr eigenes Format. JSON-Strings korrekt maskieren; außerhalb der vorgesehenen Protokollblöcke keine zusätzliche finale Antwort ausgeben.
`;
