import type { UiLanguage } from '../../../shared/ui-language';

function star(x: number, y: number, radius: number, rotation = -90): string {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = (rotation + index * 36) * Math.PI / 180, length = radius * (index % 2 ? 0.382 : 1);
    return `${x + Math.cos(angle) * length},${y + Math.sin(angle) * length}`;
  }).join(' ');
}

/** Local vector symbols render consistently without relying on flag emoji fonts. */
export function LanguageFlag({ language }: { language: UiLanguage }) {
  return <svg className="language-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false" data-language-flag={language}>
    {language === 'en' && <>
      <path fill="#fff" d="M0 0h30v20H0z" />
      {Array.from({ length: 7 }, (_, row) => <rect key={row} y={row * 40 / 13} width="30" height={20 / 13} fill="#b22234" />)}
      <path fill="#3c3b6e" d="M0 0h12v10.77H0z" />
      {Array.from({ length: 9 }, (_, row) => Array.from({ length: row % 2 ? 5 : 6 }, (_, column) =>
        <polygon key={`${row}-${column}`} fill="#fff" points={star(1 + column * 2 + row % 2, 0.8 + row * 1.14, 0.6)} />))}
    </>}
    {language === 'es' && <>
      <path fill="#aa151b" d="M0 0h30v20H0z" /><path fill="#f1bf00" d="M0 5h30v10H0z" />
      <path fill="#fff" d="M7 8h1v5H7zm7 0h1v5h-1z" />
      <path fill="#aa151b" d="M9 8h4v4c0 2-4 2-4 0zM9 6h4v1H9z" />
      <path fill="#f1bf00" d="M9 8h2v2H9zm2 2h2v2h-2z" />
    </>}
    {language === 'fr' && <><path fill="#fff" d="M0 0h30v20H0z" /><path fill="#002654" d="M0 0h10v20H0z" /><path fill="#ed2939" d="M20 0h10v20H20z" /></>}
    {language === 'de' && <><path fill="#ffce00" d="M0 0h30v20H0z" /><path fill="#111" d="M0 0h30v6.67H0z" /><path fill="#d00" d="M0 6.67h30v6.67H0z" /></>}
    {language === 'zh-CN' && <>
      <path fill="#de2910" d="M0 0h30v20H0z" /><polygon fill="#ffde00" points={star(5, 5, 3)} />
      {[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y]) => <polygon key={y} fill="#ffde00" points={star(x, y, 1, Math.atan2(5 - y, 5 - x) * 180 / Math.PI)} />)}
    </>}
    {language === 'ja' && <><path fill="#fff" d="M0 0h30v20H0z" /><circle fill="#bc002d" cx="15" cy="10" r="6" /></>}
    {language === 'pt-BR' && <>
      <path fill="#009739" d="M0 0h30v20H0z" /><path fill="#ffdf00" d="m15 2 12 8-12 8L3 10z" />
      <circle fill="#002776" cx="15" cy="10" r="5" /><path fill="none" stroke="#fff" strokeWidth="1.2" d="M10.1 9c3-1 6.3-.3 9.4 2.5" />
      <g fill="#fff"><circle cx="13" cy="12" r=".3" /><circle cx="16" cy="13" r=".3" /><circle cx="17" cy="8" r=".3" /></g>
    </>}
  </svg>;
}
