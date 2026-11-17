import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { githubNewFileUrl, templateFor, type RepoContributor } from "../lib/katki";
import type { RepoInfo, RepoRef } from "../lib/github";
import { plural } from "../lib/visibility";

/**
 * The "no .katki.json yet" guide. The file is created on GitHub through a pre-filled "new file" link, so nobody has to
 * write JSON by hand. A connected wallet fills in the chosen contributor's wallet. Coming back to this tab after the
 * GitHub tab was opened checks the repository once, automatically.
 */
export function MissingGuide({ result, wallet, onCheck }: { result: { ref: RepoRef; info: RepoInfo; history: RepoContributor[]; authors: number }; wallet?: string; onCheck: () => void }) {
  const { ref, info, history } = result;
  const shown = history.slice(0, 4);
  const sole = history.length === 1 ? (history[0] as RepoContributor).login : null;
  const [picked, setPicked] = useState<string | null>(null);
  const handle = sole ?? picked;
  const mine = wallet && handle ? { github: handle, wallet } : undefined;
  const json = useMemo(() => templateFor(history, 4, mine), [history, mine?.github, mine?.wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = githubNewFileUrl(ref, info.defaultBranch, json);

  // one automatic re-check when the user comes back from the GitHub tab
  const waiting = useRef(false);
  useEffect(() => {
    const back = () => {
      if (!waiting.current || document.visibilityState !== "visible") return;
      waiting.current = false;
      onCheck();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [onCheck]);

  const [copied, setCopied] = useState(false);
  const many = history.length > 1;

  return (
    <section className="step-card panel" id="katki" aria-labelledby="miss-h">
      <div className="panel-hd"><h3 id="miss-h">No .katki.json in {ref.owner}/{ref.name}</h3><span className="tag" style={{ marginLeft: "auto" }}>Step 2 blocked</span></div>
      <div className="missing">
        <p className="muted" style={{ fontSize: 14, maxWidth: "62ch" }}>
          Tributary pays fees only to wallets listed in this file, so a launch cannot start without it.
          {result.authors ? ` GitHub lists ${plural(result.authors, "commit author")} on ${info.defaultBranch}.` : " Add each contributor's GitHub handle and wallet."}
        </p>
        <ol>
          <li>
            <div>
              <h3>Create the file on GitHub</h3>
              {many ? (
                <div className="field" style={{ marginBottom: 12 }}>
                  <span className="label" id="who-l">Which of these is you?</span>
                  {wallet ? (
                    <div className="chip-list" role="radiogroup" aria-labelledby="who-l">
                      {shown.map((h) => (
                        <button key={h.login} type="button" role="radio" aria-checked={picked === h.login} className="chip" style={picked === h.login ? { borderColor: "var(--accent)", color: "var(--ink)" } : undefined} onClick={() => setPicked(h.login)}>
                          {h.login} <span className="faint">{h.contributions}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">Connect your wallet to put your address into your row. The other rows keep a placeholder their owners replace.</p>
                  )}
                </div>
              ) : sole ? (
                <p className="hint" style={{ marginBottom: 12 }}>{wallet ? `${sole} is the only contributor, so your connected wallet is filled in for them.` : `${sole} is the only contributor. Connect your wallet and it is filled in for you.`}</p>
              ) : null}
              <pre className="code" aria-label=".katki.json template">{json}</pre>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => { waiting.current = true; }}>Create the file on GitHub</a>
                <button className="btn btn-sm" type="button" onClick={() => { navigator.clipboard?.writeText(json).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? "Copied" : "Copy template"}</button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>GitHub opens with the file filled in. Commit it, then come back and press Check again.</p>
            </div>
          </li>
          {many && (
            <li>
              <div>
                <h3>Ask each contributor to add their wallet</h3>
                <p>One pull request per person is the cleanest record: the wallet then comes from the account that wrote the code. Leave out anyone who does not want a share.</p>
              </div>
            </li>
          )}
          <li>
            <div>
              <h3>Check again</h3>
              <p>Tributary reads the file at the latest commit on <span className="mono">{info.defaultBranch}</span> and records that commit hash in the launch. Coming back to this tab checks once on its own.</p>
              <div style={{ marginTop: 12 }}><button className="btn btn-sm" type="button" onClick={onCheck}>Check again</button> <Link className="btn btn-sm btn-quiet" to="/katki">Format reference</Link></div>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
