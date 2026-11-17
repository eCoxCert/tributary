/** Syntax-coloured .katki.json (keys in ink, strings in accent, comments in ink-3), as the design system describes. */
export function KatkiCode({ rows, more, label }: { rows: { github: string; wallet: string }[]; more?: boolean; label: string }) {
  return (
    <pre className="code" aria-label={label}>
      <span className="k">{"{"}</span>
      {"\n  "}<span className="n">"version"</span>: <span className="k">1</span>,
      {"\n  "}<span className="n">"contributors"</span>: [
      {rows.map((r, i) => (
        <span key={r.github}>
          {"\n    { "}<span className="n">"github"</span>: <span className="s">"{r.github}"</span>, <span className="n">"wallet"</span>: <span className="s">"{r.wallet}"</span> {"}"}
          {i < rows.length - 1 || more ? "," : ""}
        </span>
      ))}
      {more ? <>{"\n    "}<span className="c">// ...</span></> : null}
      {"\n  ]\n"}
      <span className="k">{"}"}</span>
    </pre>
  );
}
