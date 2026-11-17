import { useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/ui";
import { parseKatki, type ParseResult } from "../lib/katki";
import { MAX_RECIPIENTS, MIN_RECIPIENTS } from "../lib/split";

const SAMPLE = `{
  "version": 1,
  "contributors": [
    { "github": "mira-k", "wallet": "0x8c1F0000000000000000000000000000000a4a2E" },
    { "github": "dvasquez", "wallet": "0x2b7d00000000000000000000000000000000e019" }
  ]
}`;

export function Katki() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<ParseResult | null>(null);
  return (
    <main className="page">
      <div className="wrap">
        <div className="page-hd">
          <div>
            <h1>.katki.json format</h1>
            <p>One file at the root of your default branch says who gets paid. Version 1.</p>
          </div>
          <Link className="btn btn-primary" to="/create">Launch your repo</Link>
        </div>

        <div style={{ maxWidth: 820 }}>
          <section className="panel" aria-labelledby="schema-h">
            <div className="panel-hd"><h2 id="schema-h">The file</h2></div>
            <div className="panel-bd" style={{ display: "grid", gap: 16 }}>
              <pre className="code" aria-label="Example .katki.json">{SAMPLE}</pre>
              <dl className="kv">
                <div><dt><span className="mono">version</span></dt><dd>The number 1</dd></div>
                <div><dt><span className="mono">contributors[].github</span></dt><dd>A GitHub username. Listed once per person.</dd></div>
                <div><dt><span className="mono">contributors[].wallet</span></dt><dd>A GIWA Sepolia address, 0x plus 40 hex characters</dd></div>
              </dl>
              <p className="muted-note">There is no weight in the file. Tributary reads each listed person's commit count from the GitHub contributors list of the repository, so nobody has to maintain numbers by hand.</p>
            </div>
          </section>

          <section className="panel" aria-labelledby="rules-h" style={{ marginTop: 24 }}>
            <div className="panel-hd"><h2 id="rules-h">How the split is made</h2></div>
            <div className="panel-bd" style={{ display: "grid", gap: 12 }}>
              <ul className="err-list">
                <li>The fee vault holds {MIN_RECIPIENTS} to {MAX_RECIPIENTS} recipients. With fewer than {MIN_RECIPIENTS} listed contributors who have commits, the launch is blocked and the page says why.</li>
                <li>If more than {MAX_RECIPIENTS} people are listed, the {MAX_RECIPIENTS} with the most commits are included. Ties are broken by GitHub handle, A to Z. The launch form lists who is in and who is not.</li>
                <li>Shares are the commit counts of the included people, scaled to 10,000 basis points. Each share is rounded down and the leftover goes to the largest share.</li>
                <li>The file is read from the default branch at its latest commit. That commit hash is recorded in the launch.</li>
              </ul>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>What fails validation</h3>
              <ul className="err-list">
                <li>An address that is not 0x plus 40 hex characters, has a wrong checksum, or is the zero address.</li>
                <li>The same GitHub user listed twice, or two users with one wallet.</li>
                <li>A listed user who is not a contributor to the repository on GitHub.</li>
              </ul>
            </div>
          </section>

          <section className="panel" aria-labelledby="check-h" style={{ marginTop: 24 }}>
            <div className="panel-hd"><h2 id="check-h">Check a file</h2></div>
            <div className="panel-bd" style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label htmlFor="kt">Paste a .katki.json</label>
                <textarea className="input" id="kt" value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setRes(null); }} placeholder={SAMPLE} />
                <span className="hint">This checks the shape, handles and addresses in your browser. Whether each person is a repository contributor is checked when you read the repository on the launch form.</span>
              </div>
              <div><button className="btn" type="button" disabled={!text.trim()} onClick={() => setRes(parseKatki(text))}>Check file</button></div>
              {res?.ok && <Banner kind="acc">Valid. {res.file.contributors.length} contributor{res.file.contributors.length > 1 ? "s" : ""}.{res.warnings.length ? ` ${res.warnings.map((w) => w.message).join(" ")}` : ""}</Banner>}
              {res && !res.ok && (
                <Banner kind="err">
                  <b>{res.errors.length} problem{res.errors.length > 1 ? "s" : ""}.</b>
                  <ul className="err-list" style={{ marginTop: 8 }}>{res.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
                </Banner>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
