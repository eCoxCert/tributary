import { useTitle } from "../hooks/useTitle";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Av, IconCheck, IconDown, IconLock, StatusTag } from "../components/ui";
import { CurveChart } from "../components/CurveChart";
import { FeeRouter, type RouterRow } from "../components/FeeRouter";
import { LaunchRow, LaunchSkeletonRows, LaunchesHead, isListed, statusFromCode } from "../components/LaunchRows";
import { useCards, useDiscovery, usePayouts, useTemplate, type Card } from "../hooks/useChainData";
import { AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS } from "@ammora-protocol/sdk";
import { fmt } from "../lib/format";
import { plural } from "../lib/visibility";
import { allocationNote } from "../lib/copy";
import { selectVaultRecipients } from "../lib/split";
import { EXAMPLE_CONTRIBUTORS } from "../lib/examples";
import { KatkiCode } from "../components/KatkiCode";

/** Illustration only: shown when no real launch exists yet. Commit counts are invented and labelled as such. */
const EXAMPLE = selectVaultRecipients(EXAMPLE_CONTRIBUTORS.map((c) => ({ github: c.github, wallet: c.wallet, commits: c.commits })));

export function Landing() {
  useTitle("Token launches that pay a repo's contributors");
  const d = useDiscovery(false);
  const tpl = useTemplate();
  const recs = d.launches.slice(0, 8); // at most what the page can show: each verified launch costs GitHub requests
  const queries = useCards(recs);
  const cards = (queries.map((q) => q.data).filter(Boolean) as Card[]).filter((c) => isListed(c, false));
  const visible = recs.map((rec, i) => ({ rec, q: queries[i]! })).filter((x) => !x.q.data || isListed(x.q.data, false));
  const live = visible.filter((x) => !x.q.data || statusFromCode(x.q.data.snap.state.status) !== "grad");
  const [paused, setPaused] = useState(false);

  const withVault = cards.filter((c) => c.vault && c.verified?.status === "verified"); // router and payouts: verified launches only
  const pay = usePayouts(withVault.map((c) => ({ vault: c.vault!.vault, block: c.rec.block })));
  const symbolOf = useMemo(() => new Map(withVault.map((c) => [c.vault!.vault.toLowerCase(), c.snap.symbol])), [withVault]);

  const feature = withVault[0];
  const routerRows: RouterRow[] = feature?.vault
    ? feature.vault.recipients.map((r) => ({
        name: fmt.short(r.recipient),
        av: r.recipient,
        bps: feature.vault!.totalShare > 0n ? Number((r.share * 10_000n) / feature.vault!.totalShare) : 0,
        detail: `${fmt.eth(r.claimed + r.claimable)} ETH`,
      }))
    : EXAMPLE.included.map((r) => ({ name: r.github, av: r.github, bps: r.bps, detail: `${r.commits} commits` }));

  const feeBps = tpl.data?.feeBps;
  const protocolPct = AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS / 100;
  const noLaunches = !d.scanning && !d.error && visible.length === 0 && queries.every((q) => !q.isPending);
  const phaseWide = typeof window !== "undefined" && window.innerWidth >= 900;

  const payouts = pay.data ?? [];
  const paidWallets = new Set(payouts.map((p) => p.recipient.toLowerCase())).size;
  const claimedTotal = payouts.reduce((a, p) => a + p.amount, 0n);

  return (
    <main>
      {/* Hero */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1 className="h1">Token launches that pay a repo's contributors</h1>
            <p className="lead">
              Add a <span className="mono">.katki.json</span> to your repository and launch its token on a bonding curve. Every trade pays a fee. After the protocol's share, the rest goes to a vault that pays the 5 contributors with the most commits, split by commit share.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" to="/create">Launch your repo</Link>
              <Link className="btn btn-lg" to="/launches">See live launches</Link>
            </div>
            <p className="hero-facts">
              <span>Network <b>GIWA Sepolia</b></span>
              {feeBps !== undefined && <span>Trading fee <b>{fmt.pct(feeBps / 100, feeBps % 100 ? 2 : 0)}</b></span>}
              <span>Fee recipients <b>top 5 by commits</b></span>
            </p>
          </div>

          <div className="panel router" aria-label={feature ? `Fee split for ${feature.rec.meta?.repo}` : "Example of a fee split"}>
            <div className="panel-hd">
              <Av seed={feature?.rec.meta?.repo ?? "your-org/your-repo"} tone="ink" small />
              <h2>{feature?.rec.meta?.repo ? <><span className="faint">{feature.rec.meta.repo.split("/")[0]}/</span>{feature.rec.meta.repo.split("/")[1]}</> : <><span className="faint">your-org/</span>your-repo</>}</h2>
              {feature ? <span style={{ marginLeft: "auto" }}><StatusTag status={statusFromCode(feature.snap.state.status)} /></span> : <span className="tag" style={{ marginLeft: "auto" }}>Example</span>}
            </div>
            <div className="router-body">
              <div className="router-file">
                <div className="router-file-hd"><span className="mono">.katki.json</span><span>{feature?.rec.meta ? `main · ${feature.rec.meta.katkiCommit.slice(0, 7)}` : "version 1"}</span></div>
                <KatkiCode label=".katki.json excerpt" wrap more rows={EXAMPLE_CONTRIBUTORS.slice(0, 2).map((c) => ({ github: c.github, wallet: `${c.wallet.slice(0, 6)}…${c.wallet.slice(-4)}` }))} />
              </div>
              <FeeRouter rows={routerRows} paused={paused} />
            </div>
            <div className="router-foot">
              <span>
                {feature?.vault
                  ? <>Fees earned by this vault <b className="num">{fmt.eth(feature.vault.totalFunded + feature.vault.pendingInFeeVault)} ETH</b></>
                  : <>Illustration with invented commit counts, not a live launch</>}
              </span>
              <button className="btn btn-sm btn-quiet" type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section-hd split">
            <h2 className="h2">How a launch moves along its curve</h2>
            <p className="prose">A launch is one bonding curve. The owner can buy the first stretch in the launch transaction and hand it to the contributors, then the curve is open to everyone. When it fills, the token graduates to a liquidity pool.</p>
          </div>
          <div className="phases">
            <div className="phase-curve">
              {tpl.data ? (
                <CurveChart
                  points={tpl.data.points}
                  totalBase={tpl.data.totalBase}
                  baseDecimals={tpl.data.tokenDecimals}
                  nowBase={tpl.data.totalBase * (phaseWide ? 0.62 : 0.5)}
                  windowBase={tpl.data.totalBase * (phaseWide ? 0.62 : 0.5)}
                  yClip={0.86}
                  gradLabel={phaseWide ? "Graduates to a pool" : "Pool"}
                  ariaLabel="Bonding curve with the contributor allocation shaded"
                  height={phaseWide ? 170 : 150}
                  pad={{ l: 0, r: 0, t: 26, b: 22 }}
                  lead={phaseWide ? 280 : 56}
                />
              ) : (
                <div className="muted-note" style={{ height: 150 }}>{tpl.isError ? "The curve shape could not be read from the chain right now." : "Reading the curve from the chain…"}</div>
              )}
            </div>
            <ol className="phase-list">
              <li className="phase">
                <span className="phase-n">1</span>
                <div>
                  <h3>Commit .katki.json</h3>
                  <p>List contributor GitHub handles and wallets in one file at the repo root. Tributary reads it from the default branch at launch and counts each person's commits, so the split is public before anyone buys.</p>
                </div>
              </li>
              <li className="phase">
                <span className="phase-n">2</span>
                <div>
                  <h3>Contributor allocation</h3>
                  <p>{allocationNote}</p>
                </div>
              </li>
              <li className="phase">
                <span className="phase-n">3</span>
                <div>
                  <h3>Anyone trades, then it graduates</h3>
                  <p>
                    The curve is open to everyone.{tpl.data ? ` At ${fmt.eth(tpl.data.graduationWei)} ETH raised, liquidity moves to a pool and trading continues there.` : " When the raise target is met, liquidity moves to a pool."} Fees from the curve keep flowing to the fee vault.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Live launches */}
      <section className="section" id="live">
        <div className="wrap">
          <div className="live-hd">
            <h2 className="h2">Launches on testnet now</h2>
            <Link className="link" to="/launches">{visible.length ? `See all ${plural(visible.length, "launch")}` : "See all launches"}</Link>
          </div>
          <div className="panel">
            <table className="ledger stack launches">
              <LaunchesHead />
              <tbody>
                {noLaunches ? (
                  <tr>
                    <td className="full" colSpan={7}>
                      <div className="notice notice-c">
                        <h3>No Tributary launches yet</h3>
                        <p>Nobody has launched a repository on GIWA Sepolia from Tributary so far. The first launch will show up here with its curve, contributors and fees.</p>
                        <Link className="btn btn-sm" to="/create">Launch your repo</Link>
                      </div>
                    </td>
                  </tr>
                ) : d.scanning && recs.length === 0 ? (
                  <LaunchSkeletonRows rows={4} />
                ) : (
                  live.slice(0, 5).map((x) => <LaunchRow key={x.rec.curve} rec={x.rec} q={x.q} />)
                )}
              </tbody>
            </table>
          </div>
          {d.error && <p className="hint" style={{ marginTop: 12 }}>{d.error} Nothing was sent; your funds are not affected.</p>}
        </div>
      </section>

      {/* Fees */}
      <section className="section" id="fees">
        <div className="wrap fees-grid">
          <div>
            <h2 className="h2">Where the trading fee goes</h2>
            <p className="prose" style={{ marginTop: 16 }}>
              {feeBps !== undefined ? `${fmt.pct(feeBps / 100, feeBps % 100 ? 2 : 0)} of every buy and sell is the trading fee. ${fmt.pct(protocolPct, 0)} of it goes to the protocol; the rest goes to a fee vault that splits it across the wallets in .katki.json by commit share.` : "Every buy and sell pays a trading fee. Part of it goes to the protocol; the rest goes to a fee vault that splits it across the wallets in .katki.json by commit share."} Each contributor claims their part when they want it. After graduation, trading fees go to liquidity positions held by the launch owner, who adds them to the vault; that step is not automatic.
            </p>
            <ul className="rules">
              <li><IconCheck /><span><b>Split by commit share.</b> Shares come from GitHub commit counts, read when the launch is made. A vault holds the 1 to 5 contributors with the most commits (with one contributor, the fee goes straight to that wallet), and the site lists who is in and who is not.</span></li>
              <li><IconLock /><span><b>The split is fixed.</b> The recipients and shares are written into the vault, or the single recipient into the launch configuration, at creation. Nobody can change who is paid.</span></li>
              <li><IconDown /><span><b>Fees wait until claimed.</b> They accrue in the launch contract and move into the vault when a contributor claims, then to that contributor's wallet.</span></li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-hd"><h3>Recent fee payouts</h3><span className="faint" style={{ marginLeft: "auto", fontSize: 13 }}>All launches</span></div>
            {withVault.length === 0 ? (
              <>
                <ul className="feed" aria-label="Example payouts">
                  {EXAMPLE.included.slice(0, 3).map((r) => (
                    <li key={r.github}>
                      <Av seed={r.github} />
                      <div style={{ minWidth: 0 }}><div className="who">{r.github}</div><div className="why">Example payout, not real</div></div>
                      <div className="amt"><span className="tag">Example</span></div>
                    </li>
                  ))}
                </ul>
                <p className="panel-note">Real payouts appear here once a Tributary launch has fees and a contributor claims them.</p>
              </>
            ) : pay.isPending && withVault.length > 0 ? (
              <ul className="feed">{[0, 1, 2].map((i) => <li key={i}><span className="av" /><div><span className="sk" style={{ width: "50%" }} /></div><span className="sk" style={{ width: 60 }} /></li>)}</ul>
            ) : payouts.length === 0 ? (
              <div className="notice">
                <h3>No payouts yet</h3>
                <p>{withVault.length === 0 ? "Payouts appear here once a Tributary launch has fees and a contributor claims them." : "Nobody has claimed from these launches in the scanned blocks."}</p>
              </div>
            ) : (
              <>
                <ul className="feed">
                  {payouts.slice(0, 6).map((p) => (
                    <li key={p.tx + p.recipient}>
                      <Av seed={p.recipient} />
                      <div style={{ minWidth: 0 }}>
                        <div className="who">{fmt.short(p.recipient)}</div>
                        <div className="why">{symbolOf.get(p.vault.toLowerCase()) ?? "Launch"} · claim</div>
                      </div>
                      <div className="amt">{fmt.eth(p.amount)} ETH<span className="ago">{p.time ? fmt.ago(p.time) : ""}</span></div>
                    </li>
                  ))}
                </ul>
                <dl className="totals">
                  <div><dt>Claimed, scanned blocks</dt><dd>{fmt.eth(claimedTotal)} ETH</dd></div>
                  <div><dt>Wallets paid</dt><dd>{paidWallets}</dd></div>
                  <div><dt>Live launches</dt><dd>{live.length}</dd></div>
                </dl>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="close">
        <div className="wrap close-grid">
          <div>
            <h2 className="h2">Your repo already has contributors. Launch it with them.</h2>
            <p className="prose" style={{ marginTop: 16 }}>Launching takes four steps and a few transactions. If the repo has no .katki.json yet, the launch form shows you how to write one.</p>
            <div className="hero-cta"><Link className="btn btn-primary btn-lg" to="/create">Launch your repo</Link></div>
          </div>
          <div className="panel">
            <div className="panel-hd"><h3>Before you launch</h3></div>
            <ul className="rules" style={{ margin: 0, padding: 16 }}>
              <li><IconCheck /><span>A public GitHub repository with at least 1 listed contributor who has commits</span></li>
              <li><IconCheck /><span><span className="mono">.katki.json</span> on the default branch, with each person's GitHub handle and wallet</span></li>
              <li><IconCheck /><span>A wallet on GIWA Sepolia with test ETH for gas</span></li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
