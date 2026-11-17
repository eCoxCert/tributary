import { useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/ui";
import { ContribFileCode } from "../components/ContribFileCode";
import { useTitle } from "../hooks/useTitle";
import { parseContribFile, WALLET_PLACEHOLDER, type ParseResult } from "../lib/contribFile";
import { MAX_RECIPIENTS } from "../lib/split";
import { EXAMPLE_CONTRIBUTORS } from "../lib/examples";

const SAMPLE = JSON.stringify({ version: 1, contributors: EXAMPLE_CONTRIBUTORS.slice(0, 2).map((c) => ({ github: c.github, wallet: WALLET_PLACEHOLDER })) }, null, 2);

export function Format() {
  useTitle(".tributary.json format");
  const [text, setText] = useState("");
  const [res, setRes] = useState<ParseResult | null>(null);
  return (
    <main className="page">
      <div className="wrap">
        <div className="page-hd">
          <div>
            <h1>.tributary.json format</h1>
            <p>One file at the root of your default branch says who gets paid. Version 1.</p>
          </div>
          <Link className="btn btn-primary" to="/create">Launch your repo</Link>
        </div>

        <div className="format-grid">
          <div style={{ display: "grid", gap: 24 }}>
            <section className="panel" aria-labelledby="schema-h">
              <div className="panel-hd"><h2 id="schema-h">The file</h2></div>
              <div className="panel-bd" style={{ display: "grid", gap: 16 }}>
                <ContribFileCode label="Example .tributary.json" wrap rows={EXAMPLE_CONTRIBUTORS.slice(0, 2).map((c) => ({ github: c.github, wallet: WALLET_PLACEHOLDER }))} />
                <dl className="kv fmt">
                  <div><dt><span className="mono">version</span></dt><dd>The number 1</dd></div>
                  <div><dt><span className="mono">contributors[].github</span></dt><dd>A GitHub username. Listed once per person.</dd></div>
                  <div><dt><span className="mono">contributors[].wallet</span></dt><dd>A GIWA Sepolia address, 0x plus 40 hex characters</dd></div>
                </dl>
                <p className="muted-note">There is no weight in the file. Tributary reads each listed person's commit count from the GitHub contributors list of the repository, so nobody has to maintain numbers by hand. Replace the placeholder with each person's real wallet address.</p>
              </div>
            </section>

            <section className="panel" aria-labelledby="rules-h">
              <div className="panel-hd"><h2 id="rules-h">How the split is made</h2></div>
              <div className="panel-bd" style={{ display: "grid", gap: 12 }}>
                <ul className="err-list">
                  <li>One listed contributor with commits: the fee goes straight to that wallet, with no vault. Two to {MAX_RECIPIENTS}: a fee vault splits it. Nobody eligible: the launch is blocked and the page says why.</li>
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

            <section className="panel" aria-labelledby="check-h">
              <div className="panel-hd"><h2 id="check-h">Check a file</h2></div>
              <div className="panel-bd" style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label htmlFor="kt">Paste a .tributary.json</label>
                  <textarea className="input" id="kt" value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setRes(null); }} placeholder='{ "version": 1, "contributors": [ ... ] }' />
                  <span className="hint">This checks the shape, handles and addresses in your browser. Whether each person is a repository contributor is checked when you read the repository on the launch form.</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" type="button" disabled={!text.trim()} onClick={() => setRes(parseContribFile(text))}>Check file</button>
                  <button className="btn btn-quiet" type="button" onClick={() => { setText(SAMPLE); setRes(null); }}>Fill in the example</button>
                </div>
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

          <aside className="format-side panel" aria-label="Summary">
            <div className="panel-hd"><h2>At a glance</h2></div>
            <dl className="kv fmt" style={{ padding: "4px 16px 12px" }}>
              <div><dt>File</dt><dd><span className="mono">.tributary.json</span></dd></div>
              <div><dt>Location</dt><dd>Repository root, default branch</dd></div>
              <div><dt>Fields</dt><dd>version, github, wallet</dd></div>
              <div><dt>Fee recipients</dt><dd>1 to {MAX_RECIPIENTS}, top by commits</dd></div>
              <div><dt>Weights</dt><dd>From GitHub commit counts</dd></div>
            </dl>
            <div className="panel-note"><Link className="btn btn-sm" to="/create">Launch your repo</Link></div>
          </aside>
        </div>
      </div>
    </main>
  );
}
