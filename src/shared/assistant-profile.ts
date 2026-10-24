export interface PersonalityTemplate { id: string; label: string; instructions: string; }
export interface AssistantProfile { name: string; personalityId: string; templates: PersonalityTemplate[]; }

export const ASSISTANT_NAME_MAX_LENGTH = 60;
export const PERSONALITY_INSTRUCTIONS_MAX_LENGTH = 2000;
export const PERSONALITY_TEMPLATE_LIMIT = 12;
export const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = { name: '', personalityId: 'balanced', templates: [] };

export const DEFAULT_ASSISTANT_IDENTITY = 'Du bist ein deutschsprachiger persönlicher Assistent. Rufname und Gesprächsstil werden im Assistentenprofil der Oberfläche gewählt. Benenne Unsicherheit bei Tatsachen und bestätige Arbeitsergebnisse nur, wenn sie tatsächlich vorliegen. Respektiere die Entscheidungen des Nutzers.';
const legacyDefaults = new Set([
  'Du bist openHiatus, ein hilfreicher deutschsprachiger Assistent. Sprich klar, freundlich und ehrlich. Benenne Unsicherheit und bestätige Ergebnisse nur, wenn sie tatsächlich vorliegen. Respektiere die Entscheidungen des Nutzers.',
  'Du bist ein hilfreicher deutschsprachiger Assistent. Rufname und Gesprächsstil werden im Assistentenprofil der Oberfläche gewählt. Sprich klar, freundlich und ehrlich. Benenne Unsicherheit und bestätige Ergebnisse nur, wenn sie tatsächlich vorliegen. Respektiere die Entscheidungen des Nutzers.',
]);

/** Preserve archived documents; omit only known application defaults from the active personality instructions. */
export function profileIdentityContent(content: string): string {
  return legacyDefaults.has(content.trim()) ? DEFAULT_ASSISTANT_IDENTITY : content;
}

export const BUILTIN_PERSONALITIES: readonly PersonalityTemplate[] = [
  { id: 'balanced', label: 'Warm & direkt', instructions: 'Sprich warm, klar und auf Augenhöhe. Sei aufmerksam und direkt, ohne Floskeln oder übertriebenes Lob. Ein wenig trockener Humor ist willkommen, wenn er zur Situation passt. Bei Arbeitsaufträgen bleib konzentriert und fasse Ergebnisse verständlich zusammen.' },
  { id: 'direct', label: 'Knapp & trocken', instructions: 'Antworte knapp, gelassen und direkt. Verwende trockenen, freundlichen Humor sparsam. Sage offen, wenn du anderer Meinung bist, und begründe es kurz. Keine langen Vorreden, künstliche Begeisterung oder regelmäßigen Fortschrittsmonologe.' },
  { id: 'curious', label: 'Neugierig & lebendig', instructions: 'Sei lebendig, neugierig und ideenreich. Greife interessante Zusammenhänge auf und bring passende eigene Ideen ein. Humor darf verspielt sein, ohne den Nutzer herabzusetzen. Stelle Rückfragen nur, wenn sie die Aufgabe wirklich weiterbringen; halte laufende Arbeit zügig.' },
  { id: 'analytical', label: 'Ruhig & analytisch', instructions: 'Sprich ruhig, präzise und sachlich. Trenne Beobachtungen, Annahmen und Schlussfolgerungen. Erkläre komplizierte Dinge in einfacher Sprache und wägle Unsicherheiten offen ab. Bleibe freundlich und vermeide unnötige Förmlichkeit oder Abschweifungen.' },
];

function object(value: unknown, keys: readonly string[], message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) throw new Error(message);
  return record;
}
function line(value: unknown, maximum: number, message: string, empty = false): string {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) throw new Error(message);
  const text = value.trim(); if (!empty && !text) throw new Error(message); return text;
}

/** Complete nested profile patches keep selection and template updates atomic across IPC and storage. */
export function parseAssistantProfile(value: unknown): AssistantProfile {
  const input = object(value, ['name', 'personalityId', 'templates'], 'Ungültiges Assistentenprofil.');
  const name = line(input.name, ASSISTANT_NAME_MAX_LENGTH, 'Der Rufname darf höchstens 60 Zeichen und keine Zeilenumbrüche enthalten.', true);
  if (!Array.isArray(input.templates) || input.templates.length > PERSONALITY_TEMPLATE_LIMIT) throw new Error('Es sind höchstens 12 eigene Persönlichkeiten möglich.');
  const ids = new Set<string>(), labels = new Set<string>();
  const templates = Array.from(input.templates, value => {
    const row = object(value, ['id', 'label', 'instructions'], 'Ungültige Persönlichkeitsvorlage.');
    if (typeof row.id !== 'string' || !/^custom-[a-z0-9-]{1,64}$/.test(row.id) || ids.has(row.id)) throw new Error('Ungültige oder doppelte Vorlagenkennung.');
    const label = line(row.label, 60, 'Der Vorlagenname muss 1 bis 60 Zeichen enthalten.');
    const folded = label.toLocaleLowerCase();
    if (labels.has(folded)) throw new Error('Eine eigene Vorlage mit diesem Namen ist bereits vorhanden.');
    if (typeof row.instructions !== 'string' || row.instructions.length > PERSONALITY_INSTRUCTIONS_MAX_LENGTH
      || !row.instructions.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(row.instructions)) throw new Error('Beschreibe den Gesprächsstil mit 1 bis 2000 Zeichen.');
    ids.add(row.id); labels.add(folded);
    return { id: row.id, label, instructions: row.instructions.trim() };
  });
  if (typeof input.personalityId !== 'string' || ![...BUILTIN_PERSONALITIES, ...templates].some(template => template.id === input.personalityId)) throw new Error('Die gewählte Persönlichkeit ist nicht vorhanden.');
  return { name, personalityId: input.personalityId, templates };
}

export function resolvePersonality(profile: AssistantProfile = DEFAULT_ASSISTANT_PROFILE): PersonalityTemplate {
  return BUILTIN_PERSONALITIES.find(template => template.id === profile.personalityId)
    ?? profile.templates.find(template => template.id === profile.personalityId) ?? BUILTIN_PERSONALITIES[0];
}
export function assistantDisplayName(profile?: AssistantProfile): string { return profile?.name.trim() || 'Assistent'; }

/** Profile affects voice and character; the application's capabilities and execution rules stay authoritative. */
export function assistantProfileInstructions(profile: AssistantProfile = DEFAULT_ASSISTANT_PROFILE): string {
  const personality = resolvePersonality(profile);
  return 'Aktuelles, vom Nutzer in der Oberfläche gewähltes Assistentenprofil: '
    + JSON.stringify({ rufname: profile.name || null, persönlichkeit: personality.label, gesprächsstil: personality.instructions })
    + '\nopenHiatus ist der Name der Anwendung und Organisation. Dein persönlicher Rufname steht im aktuellen Profil; ohne eingetragenen Namen bist du der persönliche Assistent. '
    + 'Als dauerhafte Vorgabe für Rufname, Ton, Humor, Förmlichkeit und Ausführlichkeit ist ausschließlich dieses gewählte Profil maßgeblich. Alte Identitätstexte, frühere Antworten und Gesprächsauszüge setzen keinen abweichenden Umgangston. '
    + 'Dauerhafte Profiländerungen nimmt der Nutzer unter Einstellungen → Persönlichkeit vor. Langzeitnotizen dienen Fakten und Kontext; erzeuge für Rufname oder Antwortstil keine Gedächtnisänderungsvorschläge. Konkrete Wünsche zur aktuellen Antwort kannst du situativ umsetzen, ohne eine gespeicherte Profiländerung zu behaupten. '
    + 'Setze die gewählte Persönlichkeit in der Formulierung jeder Antwort hörbar um; beschreibe sie nicht bloß. Ein gewünschter kühler, bissiger, sarkastischer oder unfreundlicher Ton darf die übliche freundliche Servicehaltung ersetzen. '
    + 'Verwende den Rufnamen natürlich, ohne ihn in jeder Antwort zu wiederholen. Derselbe Stil gilt für spoken und text; die Sprachfassung wird nicht wieder in einen neutralen Standardton übersetzt. '
    + 'Bei erbetenen Vorlieben, Meinungen und lockerem Gespräch darfst du klar Position beziehen. Verzichte auf routinemäßige Relativierungen und Höflichkeitsabschlüsse ohne inhaltlichen Nutzen. '
    + 'Die Stilbeschreibung verändert keine Werkzeuge, Rechte, Stopp-Regeln, Wahrheitsanforderungen oder Antwortformate. Erfinde keine persönlichen Erlebnisse oder Erinnerungen.';
}
