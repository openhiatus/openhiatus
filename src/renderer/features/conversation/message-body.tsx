import { t } from '../../../shared/i18n';
import { FileText } from 'lucide-react';
import { markdownLinkPattern } from '../../../shared/spoken-text';

function MessageLinks({ text, onError }: { text: string; onError: (error: unknown) => void }) {
  const elements = [];
  let cursor = 0;
  for (const match of text.matchAll(markdownLinkPattern())) {
    const start = match.index;
    if (start > cursor) elements.push(text.slice(cursor, start));
    const target = (match[2] ?? match[3]).trim();
    const label = match[1];
    const local = /^(?:\/?[a-z]:[\\/]|\\\\|\/|\.{1,2}[\\/])/i.test(target) || (!/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith('#'));
    if (local) {
      const filePath = target.replace(/^\/([a-z]:[\\/])/i, '$1');
      elements.push(<button key={start} className="message-file-link" title={t("{0} im Datei-Explorer anzeigen", label)} onClick={() => void window.openhiatus.revealFile(filePath).catch(onError)}><FileText size={12} />{label}</button>);
    } else {
      elements.push(<span key={start} className="message-web-reference">{label}<span className="message-link-target"> ({target})</span></span>);
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) elements.push(text.slice(cursor));
  return <>{elements}</>;
}
export function MessageBody({ text, onError }: { text: string; onError: (error: unknown) => void }) {
  return <div className="message-body">{text.split(/(```[\s\S]*?```)/g).map((part, i) => part.startsWith('```')
    ? <pre key={i}><code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre>
    : <span key={i}>{part.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g).map((bit, j) => bit.startsWith('**') ? <strong key={j}><MessageLinks text={bit.slice(2, -2)} onError={onError} /></strong> : bit.startsWith('`') ? <code key={j}>{bit.slice(1, -1)}</code> : <MessageLinks key={j} text={bit} onError={onError} />)}</span>)}</div>;
}
