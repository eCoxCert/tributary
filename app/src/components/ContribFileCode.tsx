/** Syntax-coloured .tributary.json (keys in ink, strings in accent, comments in ink-3), as the design system describes. */
/** `wrap`: the wallet goes on its own line so nothing is cut off in a narrow panel. */
export function ContribFileCode({ rows, more, label, wrap }: { rows: { github: string; wallet: string }[]; more?: boolean; label: string; wrap?: boolean }) {
  return (
    <pre className="code" aria-label={label}>
      <span className="k">{"{"}</span>
      {"\n  "}<span className="n">"version"</span>: <span className="k">1</span>,
      {"\n  "}<span className="n">"contributors"</span>: [
      {rows.map((r, i) => (
        <span key={r.github}>
          {"\n    { "}<span className="n">"github"</span>: <span className="s">"{r.github}"</span>,{wrap ? "\n      " : " "}<span className="n">"wallet"</span>: <span className="s">"{r.wallet}"</span> {"}"}
          {i < rows.length - 1 || more ? "," : ""}
        </span>
      ))}
      {more ? <>{"\n    "}<span className="c">// ...</span></> : null}
      {"\n  ]\n"}
      <span className="k">{"}"}</span>
    </pre>
  );
}
