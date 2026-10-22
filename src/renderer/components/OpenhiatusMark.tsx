export function OpenhiatusMark({ small = false }: { small?: boolean }) {
  return <span className={`openhiatus-mark ${small ? 'small' : ''}`} aria-hidden="true"><span /><i /></span>;
}
