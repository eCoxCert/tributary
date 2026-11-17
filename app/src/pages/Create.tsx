import { useTitle } from "../hooks/useTitle";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address } from "viem";
import { DFSClient, createConfigAndPoolWithFirstBuy, parseAmmoraV4LaunchCreatedReceipt } from "@ammora-protocol/sdk";
import { Av, Banner, CopyButton, IconErr, IconOk, Spinner, StepList, type ProgressStep } from "../components/ui";
import { AllocationPanel } from "../components/AllocationPanel";
import { MissingGuide } from "../components/MissingGuide";
import { useWallet } from "../hooks/useWallet";
import { useTemplate } from "../hooks/useChainData";
import { readRepository, type ReadResult } from "../lib/readRepo";
import { fmt, parseAmount } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { buildCreatePlan, createStepIds, simulateCreate, type CreatePlan, type SimStep } from "../lib/create";
import { ADDR, dfsOptions, explorerAddress, explorerTx, publicClient } from "../lib/chain";
import { allowanceOf, approveToken, sendCalldata, wethBalance, wrapEth } from "../lib/tx";
import { estimateFirstBuy } from "../lib/curveMath";
import { MAX_RECIPIENTS } from "../lib/split";
import { AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS } from "@ammora-protocol/sdk";
import { readAllocation, type AllocationRead } from "../lib/allocation";
import type { VaultSnapshot } from "../lib/launches";
import { readVaultSnapshot } from "../lib/launches";
import { useQuery } from "@tanstack/react-query";

type Phase = "empty" | "loading" | "result" | "review" | "running" | "done";
const SYMBOL = /^[A-Za-z0-9]{2,6}$/;

function defaultName(repoName: string): string {
  const n = repoName.replace(/[-_.]+/g, " ").trim();
  return (n.charAt(0).toUpperCase() + n.slice(1)).slice(0, 32) || "Token";
}
function defaultSymbol(repoName: string): string {
  const letters = repoName.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const s = letters.length > 1 ? letters.map((w) => w[0]).join("") : (letters[0] ?? "TKN");
  return s.toUpperCase().slice(0, 6).padEnd(2, "X");
}

export function Create() {
  const w = useWallet();
  const { data: wallet } = useWalletClient();
  const qc = useQueryClient();
  const loc = useLocation();
  useTitle("Launch a repo");
  const tpl = useTemplate();

  const [repo, setRepo] = useState("");
  const [phase, setPhase] = useState<Phase>("empty");
  const [result, setResult] = useState<ReadResult | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [firstBuy, setFirstBuy] = useState("");
  const [plan, setPlan] = useState<CreatePlan | null>(null);
  const [sims, setSims] = useState<SimStep[] | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProgressStep[] | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [sentLaunchTx, setSentLaunchTx] = useState<`0x${string}` | null>(null);
  const [launched, setLaunched] = useState<{ token: Address; curve: Address; hash: `0x${string}`; block: bigint; vault: Address | null } | null>(null);
  const reviewRef = useRef<HTMLElement>(null);

  const found = result?.stage === "found" ? result : null;
  const selection = found?.selection;
  const canLaunch = !!found && !!selection && selection.ok;
  const symbolOk = SYMBOL.test(symbol);
  const nameOk = name.trim().length > 0 && name.length <= 32;
  const firstBuyWei = firstBuy.trim() === "" ? 0n : parseAmount(firstBuy, 18);
  const firstBuyOk = firstBuyWei !== null;
  const hasBuy = firstBuyWei !== null && firstBuyWei > 0n;
  const currentStep = phase === "done" ? 4 : phase === "review" || phase === "running" ? 3 : result?.stage === "found" ? 2 : result?.stage === "missing" || result?.stage === "invalid" ? 1 : 0;

  async function read(value: string) {
    setPhase("loading");
    setResult(null);
    setPlan(null);
    setSims(null);
    const r = await readRepository(value);
    setResult(r);
    if (r.stage === "found") {
      setName(defaultName(r.ref.name));
      setSymbol(defaultSymbol(r.ref.name));
    }
    setPhase("result");
  }

  useEffect(() => {
    if (loc.hash === "#katki") document.getElementById("katki")?.scrollIntoView();
  }, [loc.hash]);

  /* Simulate as soon as the review is open and a wallet is connected. */
  const simKey = `${found?.sha}|${w.address}|${name}|${symbol}|${firstBuy}`;
  useEffect(() => {
    if (phase !== "review" || !found || !selection?.ok || w.status !== "connected" || !w.address) return;
    let live = true;
    setSimBusy(true);
    setSimError(null);
    setSims(null);
    (async () => {
      try {
        const p = await buildCreatePlan({
          owner: w.address as Address,
          repo: `${found.ref.owner}/${found.ref.name}`,
          katkiCommit: found.sha,
          recipients: selection.included.map((i) => ({ wallet: i.wallet as Address, bps: i.bps })),
          name: name.trim(),
          symbol: symbol.toUpperCase(),
        });
        const s = await simulateCreate(p, w.address as Address, undefined, firstBuyWei && firstBuyWei > 0n ? firstBuyWei : 0n);
        if (live) {
          setPlan(p);
          setSims(s);
        }
      } catch (e) {
        if (live) setSimError(humanizeError(e));
      } finally {
        if (live) setSimBusy(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, simKey]);

  const simsOk = !!sims && sims.every((s) => s.ok);
  // vault + launch only: the launch call already registers the configuration
  const gasUnits = sims ? sims.filter((s) => s.id !== "config").reduce((a, s) => a + (s.gas ?? 0n), 0n) : 0n;
  const gasPrice = useQuery({ queryKey: ["gasprice"], queryFn: () => publicClient.getGasPrice(), staleTime: 30_000, enabled: phase === "review" });

  async function launch() {
    if (!wallet || !w.address || !plan || !found || !selection?.ok) return;
    const owner = w.address as Address;
    setPhase("running");
    setRunErr(null);
    const hasBuy = !!firstBuyWei && firstBuyWei > 0n;
    const labels: Record<string, string> = {
      vault: "Create the fee vault",
      source: "Let the vault pull fees from the launch fee store",
      wrap: "Wrap ETH for the first buy",
      approve: "Approve WETH for the first buy",
      launch: hasBuy ? "Create the token and make the first buy" : "Create the token and its curve",
    };
    let list: ProgressStep[] = createStepIds(plan.mode, hasBuy).map((id) => ({
      id,
      label: labels[id] as string,
      state: id === "vault" && plan.vault?.existing ? ("skipped" as const) : ("todo" as const),
      note: id === "vault" && plan.vault?.existing ? "A vault with these recipients already exists" : undefined,
    }));
    setSteps(list);
    let current = "";
    const mark = (id: string, state: ProgressStep["state"], note?: string) => {
      list = list.map((s) => (s.id === id ? { ...s, state, note } : s));
      setSteps(list);
    };
    try {
      let vaultAddr: Address | null = null;
      if (plan.vault) {
        // 1. vault
        if (!plan.vault.existing) {
          current = "vault";
          mark("vault", "active", "Confirm in your wallet");
          await sendCalldata(wallet, publicClient, owner, plan.vault.tx);
          mark("vault", "done");
        }
        // 2. claim source
        current = "source";
        mark("source", "active");
        vaultAddr = plan.vault.predicted;
        const dfs = new DFSClient(publicClient, vaultAddr, dfsOptions);
        const snap: VaultSnapshot = await readVaultSnapshot(vaultAddr);
        if (!snap.claimSourceEnabled) {
          mark("source", "active", "Confirm in your wallet");
          const tx = await dfs.planSetClaimSource({ source: snap.feeVault, allowed: true, caller: owner });
          await sendCalldata(wallet, publicClient, owner, tx as { to: Address; data: `0x${string}`; value?: bigint });
          mark("source", "done");
        } else mark("source", "skipped", "Already enabled");
      }
      // 3. launch
      let receipt;
      let hash: `0x${string}`;
      if (hasBuy) {
        current = "wrap";
        mark("wrap", "active");
        const need = firstBuyWei as bigint;
        const have = await wethBalance(publicClient, owner);
        if (have < need) {
          await wrapEth(wallet, publicClient, owner, need - have);
          mark("wrap", "done");
        } else mark("wrap", "skipped", "Enough WETH already");
        current = "approve";
        const feeBps = plan.config.cliffFeeBps;
        const est = estimateFirstBuy(plan.segments as never, need, feeBps);
        const minOut = (est * 99n) / 100n; // 1% slippage floor
        const params = async () =>
          createConfigAndPoolWithFirstBuy(publicClient, {
            account: owner,
            config: plan.config,
            segments: plan.segments,
            launch: { name: name.trim(), symbol: symbol.toUpperCase(), metadataURI: plan.metadataURI, creatorMetadataURI: plan.metadataURI, tokenDecimals: plan.config.tokenDecimals },
            firstBuys: [{ includedQuoteAmountRaw: need, minimumBaseAmountOutRaw: minOut, allowPartialFill: false, recipient: owner }],
            deadline: BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
            gas: { maxFeePerGasNativeRaw: (await publicClient.getGasPrice()) * 2n, safetyMarginBps: 2000n },
            blockNumber: await publicClient.getBlockNumber(),
          });
        mark("approve", "active");
        let p = await params();
        if (p.status === "APPROVAL_REQUIRED") {
          const req = p.approvalRequirements[0];
          if (req && (await allowanceOf(publicClient, req.token, owner, req.spender)) < req.exactAmountRaw) {
            await approveToken(wallet, publicClient, owner, req.token, req.spender, req.exactAmountRaw);
          }
          mark("approve", "done");
          p = await params();
        } else mark("approve", "skipped", "Already approved");
        if (p.status !== "READY") throw new Error("The first-buy plan still needs an approval after approving. Try again.");
        current = "launch";
        mark("launch", "active", "Confirm in your wallet");
        const r = await sendCalldata(wallet, publicClient, owner, p.transaction as { to: Address; data: `0x${string}`; value?: bigint });
        receipt = r.receipt;
        hash = r.hash;
      } else {
        current = "launch";
        mark("launch", "active", "Confirm in your wallet");
        const r = await sendCalldata(wallet, publicClient, owner, plan.launchTx);
        receipt = r.receipt;
        hash = r.hash;
      }
      setSentLaunchTx(hash);
      let parsed;
      try {
        parsed = parseAmmoraV4LaunchCreatedReceipt(receipt, ADDR.factory);
      } catch {
        throw new Error(`The launch transaction ${hash} confirmed, but its receipt could not be read here. Do not launch again: open the transaction in the explorer to find your token. ${explorerTx(hash)}`);
      }
      mark("launch", "done");
      setLaunched({ token: parsed.token, curve: parsed.curve, hash, block: receipt.blockNumber, vault: vaultAddr });
      setPhase("done");
      await qc.invalidateQueries({ queryKey: ["card"] });
    } catch (e) {
      setRunErr(humanizeError(e));
      if (current) mark(current, "error");
      setPhase("review");
    }
  }

  const doneAlloc = useQuery({
    queryKey: ["done-alloc", launched?.token],
    enabled: !!launched && hasBuy,
    queryFn: async () => {
      return readAllocation({ token: launched!.token, curve: launched!.curve, creator: w.address as Address, txHash: launched!.hash, block: launched!.block });
    },
  });

  const feePct = tpl.data ? tpl.data.feeBps / 100 : null;
  const protocolPct = AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS / 100;
  const katkiInfoForPanel = useMemo(() => (found ? { file: found.file, history: found.history, repo: found.info, notes: [], katki: { state: "ok" as const, wallets: found.file.contributors.map((c) => c.wallet) }, provenance: { state: "ok" as const }, handles: { state: "ok" as const } } : undefined), [found]);

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-hd">
          <div>
            <h1>Launch a repo</h1>
            <p>Four steps. A few transactions on GIWA Sepolia (one fewer for a single contributor), each simulated before your wallet opens.</p>
          </div>
        </div>

        <div className="create-grid">
          <ol className="steps" aria-label="Launch steps">
            {["Repository", "Contributors", "Token", "Review"].map((label, i) => (
              <li key={label} className={i < currentStep ? "is-done" : undefined} aria-current={i === currentStep ? "step" : undefined}>
                <i>{i < currentStep ? "✓" : i + 1}</i>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          <div>
            {/* Step 1 */}
            <section className="step-card" aria-labelledby="s1">
              <div className="step-hd">
                <h2 id="s1">Repository</h2>
                <p>Paste a public GitHub repository. Tributary reads <span className="mono">.katki.json</span> from its default branch.</p>
              </div>
              <form className="field" noValidate onSubmit={(e) => { e.preventDefault(); void read(repo); }}>
                <label htmlFor="repo">GitHub repository</label>
                <div className="url-row">
                  <div className="input-group">
                    <span className="affix">github.com/</span>
                    <input className="input" id="repo" name="repo" placeholder="owner/repository" autoComplete="off" spellCheck={false} value={repo} onChange={(e) => setRepo(e.target.value)} aria-invalid={result?.stage === "error"} aria-describedby="repo-err" />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={phase === "loading" || !repo.trim()}>Read repository</button>
                </div>
                {result?.stage === "error" && (
                  <p className="err" id="repo-err" role="alert">
                    {result.message}{" "}
                    {result.retryable && <button type="button" className="link" onClick={() => void read(repo)}>Try again</button>}
                  </p>
                )}
              </form>
              <p className="hint">Try <button type="button" className="link" onClick={() => { setRepo("octocat/Hello-World"); void read("octocat/Hello-World"); }}>octocat/Hello-World</button>, a real public repository. It has no <span className="mono">.katki.json</span>, so it shows the "missing file" guide, not a launch.</p>
              {(phase === "empty" || result?.stage === "error") && (
                <dl className="kv reads fmt">
                  <div><dt>Tributary reads</dt><dd><span className="mono">.katki.json</span> at the root of the default branch</dd></div>
                  <div><dt>It records</dt><dd>the commit hash the file was read at</dd></div>
                  <div><dt>It weighs</dt><dd>each listed person by their GitHub commit count</dd></div>
                  <div><dt>It never asks for</dt><dd>repository write access or a GitHub login</dd></div>
                </dl>
              )}
            </section>

            {phase === "loading" && (
              <section className="step-card panel" aria-busy="true" aria-label="Reading repository">
                <div className="panel-hd"><Spinner /><h3>Reading {repo.trim()}</h3></div>
                <table className="ledger stack"><tbody>
                  {[60, 48, 55, 40].map((x, i) => (
                    <tr key={i}><td className="full"><span className="sk" style={{ width: `${x}%` }} /></td><td><span className="sk" style={{ width: "80%" }} /></td><td><span className="sk" style={{ width: "50%" }} /></td></tr>
                  ))}
                </tbody></table>
              </section>
            )}

            {/* Missing */}
            {result?.stage === "missing" && <MissingGuide result={result} wallet={w.status === "connected" ? w.address : undefined} onCheck={() => void read(repo)} />}

            {/* Invalid */}
            {result?.stage === "invalid" && (
              <section className="step-card panel" aria-labelledby="inv-h">
                <div className="panel-hd"><h3 id="inv-h">.katki.json needs changes</h3><span className="tag" style={{ marginLeft: "auto" }}>Step 2 blocked</span></div>
                <div className="missing">
                  <p className="muted" style={{ fontSize: 14, maxWidth: "62ch" }}>
                    Found the file at <span className="mono">{result.sha.slice(0, 7)}</span> on <span className="mono">{result.info.defaultBranch}</span>, but it failed validation. Nothing was sent to the chain. Fix the {result.errors.length} problem{result.errors.length > 1 ? "s" : ""} below, merge, then check again.
                  </p>
                  <ul className="err-list">{result.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
                  <div><button className="btn btn-sm" type="button" onClick={() => void read(repo)}>Check again</button> <Link className="btn btn-sm" to="/katki">Format reference</Link></div>
                </div>
              </section>
            )}

            {/* Step 2 */}
            {found && selection && (
              <section className="step-card" aria-labelledby="s2" style={{ marginTop: 32 }}>
                <div className="step-hd">
                  <h2 id="s2">Contributors</h2>
                  <p>{selection?.ok && selection.mode === "direct" ? "This repository has one listed contributor, so the trading fee goes straight to that wallet: there is no fee vault and no split." : `These wallets receive the trading fee. The vault holds at most ${MAX_RECIPIENTS} recipients: the ${MAX_RECIPIENTS} listed contributors with the most commits.`}</p>
                </div>
                <div className="found">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ color: "var(--pos)" }} aria-hidden="true"><path d="M4 10.5 8 14.5 16 5.5" /></svg>
                  <span>Found <span className="mono">.katki.json</span> on <span className="mono">{found.info.defaultBranch}</span> at <span className="mono">{found.sha.slice(0, 7)}</span>. {found.file.contributors.length} listed, all are repository contributors with a valid wallet.</span>
                </div>
                {found.warnings.length > 0 && <Banner kind="warn">{found.warnings.map((x) => x.message).join(" ")}</Banner>}
                {!selection.ok && <Banner kind="err"><b>This launch is blocked.</b> {selection.reason}</Banner>}
                <div className="panel">
                  <table className="ledger stack">
                    <thead><tr><th>Contributor</th><th>Wallet</th><th className="r">Commits on {found.info.defaultBranch}</th><th className="r">Share of fees</th></tr></thead>
                    <tbody>
                      {[...(selection.ok ? selection.included : []), ...selection.excluded].map((c) => {
                        const inc = selection.ok ? selection.included.find((i) => i.github === c.github) : undefined;
                        return (
                          <tr key={c.github}>
                            <td className="full"><div className="who-cell"><Av seed={c.github} /><b>{c.github}</b></div></td>
                            <td data-k="Wallet"><span className="mono">{fmt.short(c.wallet)}</span></td>
                            <td data-k="Commits" className="r">{fmt.int(c.commits)}</td>
                            <td data-k="Share of fees" className="r r-m">{inc ? <span className="num">{fmt.bpsPct(inc.bps)}</span> : <span className="tag">Not in vault</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="pick">
                  {selection.ok && selection.excluded.length > 0 && (
                    <span><b>Not included in the vault ({selection.excluded.length}):</b> {selection.excluded.map((e) => e.github).join(", ")}. They are listed in .katki.json but rank below the top {MAX_RECIPIENTS} by commits.</span>
                  )}
                  {found.notInFile.length > 0 && (
                    <span><b>Not in .katki.json ({found.notInFile.length}):</b> {found.notInFile.slice(0, 10).map((c) => c.login).join(", ")}{found.notInFile.length > 10 ? ` and ${found.notInFile.length - 10} more` : ""}. They get no share.</span>
                  )}
                  {selection.ok && selection.mode === "vault" && <span>Shares are the commit counts of the {selection.included.length} included contributors, scaled to 10,000 basis points. Rounding goes to the largest share.</span>}
                </div>
              </section>
            )}

            {/* Step 3 */}
            {canLaunch && (
              <section className="step-card" aria-labelledby="s3" style={{ marginTop: 32 }}>
                <div className="step-hd">
                  <h2 id="s3">Token</h2>
                  <p>The name and symbol are permanent once the launch transaction confirms.</p>
                </div>
                <div className="two">
                  <div className="field">
                    <label htmlFor="tname">Token name</label>
                    <input className="input" id="tname" value={name} maxLength={32} autoComplete="off" onChange={(e) => setName(e.target.value)} />
                    <span className="hint">Up to 32 characters. Most launches use the project name.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="tsym">Symbol</label>
                    <input className="input" id="tsym" value={symbol} maxLength={6} autoComplete="off" spellCheck={false} style={{ textTransform: "uppercase" }} aria-invalid={!symbolOk} onChange={(e) => setSymbol(e.target.value)} />
                    {symbolOk ? <span className="hint">2 to 6 letters or digits.</span> : <span className="err">Use 2 to 6 letters or digits.</span>}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="fb">Contributor allocation, optional</label>
                  <div className="input-group" style={{ maxWidth: 320 }}>
                    <input className="input" id="fb" inputMode="decimal" placeholder="0" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} aria-invalid={!firstBuyOk} />
                    <span className="affix">ETH</span>
                  </div>
                  <span className="hint">
                    Buy {firstBuy.trim() && firstBuyOk ? "" : "some "}tokens in the launch transaction itself, at the starting price, then send them to the {selection?.ok ? selection.included.length : ""} fee recipients by commit share. Each send is an ordinary token transfer from your wallet, and nothing on chain forces them. Leave empty for no allocation.
                  </span>
                  {!firstBuyOk && <span className="err">Enter an ETH amount, for example 0.01.</span>}
                </div>
                <div className="panel token-preview">
                  <Av seed={`${found!.ref.owner}/${found!.ref.name}`} tone="ink" />
                  <div>
                    <b>{name || "Untitled"} <span className="faint">{symbol.toUpperCase()}</span></b>
                    <span className="hint">{found!.ref.owner}/{found!.ref.name}{tpl.data ? ` · ${fmt.compact(Number(tpl.data.supply) / 10 ** tpl.data.tokenDecimals)} supply` : ""}</span>
                  </div>
                </div>
                {phase !== "review" && phase !== "running" && phase !== "done" && (
                  <div>
                    <button className="btn btn-primary" type="button" disabled={!symbolOk || !nameOk || !firstBuyOk} onClick={() => { setPhase("review"); setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 50); }}>
                      Review launch
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Step 4 */}
            {(phase === "review" || phase === "running" || phase === "done") && found && selection?.ok && (
              <section className="step-card panel" style={{ marginTop: 32 }} aria-labelledby="s4" ref={reviewRef}>
                <div className="panel-hd"><h2 id="s4">Review</h2></div>
                <div className="panel-bd">
                  <dl className="kv">
                    <div><dt>Repository</dt><dd>{found.ref.owner}/{found.ref.name}</dd></div>
                    <div><dt>.katki.json</dt><dd><span className="mono">{found.info.defaultBranch} @ {found.sha.slice(0, 7)}</span>, {selection.mode === "direct" ? "1, paid directly" : `${selection.included.length} in the fee vault`}</dd></div>
                    <div><dt>Token</dt><dd>{name.trim()} ({symbol.toUpperCase()})</dd></div>
                    {tpl.data && <div><dt>Supply</dt><dd>{fmt.compact(Number(tpl.data.supply) / 10 ** tpl.data.tokenDecimals)}, of which {fmt.compact(tpl.data.totalBase / 10 ** tpl.data.tokenDecimals)} on the curve</dd></div>}
                    <div><dt>Contributor allocation</dt><dd>{firstBuyWei && firstBuyWei > 0n ? `${fmt.eth(firstBuyWei)} ETH first buy, then ${selection.included.length} transfers` : "None"}</dd></div>
                    {feePct !== null && <div><dt>Trading fee</dt><dd>{fmt.pct(feePct, feePct % 1 ? 2 : 0)} of each trade, {fmt.pct(100 - protocolPct, 0)} of it {selection.mode === "direct" ? "to the contributor's wallet" : "to the fee vault"}</dd></div>}
                    {tpl.data && <div><dt>Graduates at</dt><dd>{fmt.eth(tpl.data.graduationWei)} ETH raised</dd></div>}
                    {selection.mode === "vault" ? <div><dt>Fee vault owner</dt><dd>{w.address ? <span className="mono">{fmt.short(w.address)}</span> : "The wallet you connect"}</dd></div> : <div><dt>Fee recipient</dt><dd><span className="mono">{fmt.short(selection.included[0]!.wallet)}</span>, paid directly (no vault)</dd></div>}
                    <div><dt>Network</dt><dd>GIWA Sepolia</dd></div>
                    {sims && gasPrice.data !== undefined && <div><dt>Estimated gas</dt><dd>{fmt.eth(gasUnits * gasPrice.data, 5)} ETH, {fmt.compact(Number(gasUnits))} gas units</dd></div>}
                  </dl>
                  <div className="panel" style={{ marginTop: 16 }}>
                    <table className="ledger stack">
                      <thead><tr><th>Fee recipient (full address)</th><th className="r">Basis points</th><th className="r">Share</th></tr></thead>
                      <tbody>
                        {selection.included.map((c) => (
                          <tr key={c.wallet}>
                            <td className="full"><b>{c.github}</b> <span className="mono">{c.wallet}</span></td>
                            <td data-k="Basis points" className="r">{c.bps}</td>
                            <td data-k="Share" className="r r-m">{fmt.bpsPct(c.bps, 2)}</td>
                          </tr>
                        ))}
                        <tr className="is-total"><td className="full"><b>Total</b></td><td data-k="Basis points" className="r"><b>{selection.included.reduce((a, c) => a + c.bps, 0)}</b></td><td data-k="Share" className="r r-m"><b>100.00%</b></td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="pick" style={{ marginTop: 12 }}>
                    <span><b>Who can change what.</b> {selection.mode === "direct" ? "You are the launch creator. The fee recipient is written into the launch configuration and cannot be changed. There is no vault." : "You own the fee vault and are the launch creator. The recipient list and shares are fixed in the vault when it is created."} After graduation, trading fees go to liquidity positions held by your wallet and reach {selection.mode === "direct" ? "the contributor" : "the vault"} only when you send them on.</span>
                    <span>Your recorded commit is <span className="mono">{found.sha.slice(0, 7)}</span>; the launch metadata names this repository, commit and {selection.mode === "direct" ? "fee recipient" : "vault"}.</span>
                  </div>
                  {w.status === "connected" && (
                    <div style={{ marginTop: 16 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Simulation, nothing sent</h3>
                      {simBusy && <p className="muted-note"><Spinner /> Simulating {selection.mode === "direct" ? "the configuration and the launch" : "the vault, the configuration and the launch"}…</p>}
                      {simError && <Banner kind="err" action={<button className="btn btn-sm" type="button" onClick={() => { setSims(null); setPhase("empty"); setTimeout(() => setPhase("review"), 0); }}>Try again</button>}>{simError}</Banner>}
                      {sims && (
                        <div className="sim-list">
                          {sims.map((s) => (
                            <div key={s.id} className={s.ok ? "ok" : "bad"}>
                              {s.ok ? <IconOk /> : <IconErr />}
                              <span>{s.label}<small>{s.detail}</small></span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {steps && (phase === "running" || runErr) && <StepList steps={steps} />}
                  {runErr && <div style={{ marginTop: 12 }}><Banner kind="err">{runErr} Steps already confirmed stay done; starting again skips them.</Banner></div>}
                </div>
                <div className="confirm-bar">
                  <p>{selection.mode === "direct" ? "The fee recipient is written into the launch configuration and cannot be changed after the transaction confirms." : "The split is written into the fee vault and the launch configuration. Neither can be changed after the transactions confirm."}</p>
                  {phase !== "done" && w.status === "connected" && (
                    <button className="btn btn-primary btn-lg" type="button" onClick={launch} disabled={phase === "running" || !simsOk || simBusy || !wallet || !!sentLaunchTx}>
                      {sentLaunchTx ? "Launch sent" : phase === "running" ? <><Spinner />Confirm in your wallet</> : `Launch ${symbol.toUpperCase() || "token"}`}
                    </button>
                  )}
                  {phase !== "done" && w.status === "disconnected" && <button className="btn btn-ink btn-lg" type="button" onClick={w.connect}>Connect wallet</button>}
                  {phase !== "done" && w.status === "wrong" && <button className="btn btn-warn btn-lg" type="button" onClick={w.switchNetwork}>Switch to GIWA Sepolia</button>}
                </div>
              </section>
            )}

            {/* Done */}
            {phase === "done" && launched && (
              <section className="step-card" style={{ marginTop: 32 }}>
                <Banner kind="acc" action={<Link className="btn btn-sm btn-primary" to={`/launch/${launched.token}`}>Open launch page</Link>}>
                  <b>{symbol.toUpperCase()} is live.</b>{" "}
                  {firstBuyWei && firstBuyWei > 0n ? "Send the bought tokens to your contributors below." : "Share the launch page with your contributors."}{" "}
                  <a className="link" href={explorerTx(launched.hash)} target="_blank" rel="noreferrer">View transaction</a>
                </Banner>
                {hasBuy && selection?.ok && (
                  <AllocationPanel
                    token={launched.token}
                    symbol={symbol.toUpperCase()}
                    decimals={tpl.data?.tokenDecimals ?? 9}
                    creator={w.address as Address}
                    recipients={selection.included.map((i) => ({ recipient: i.wallet as Address, share: BigInt(i.bps) }))}
                    info={katkiInfoForPanel}
                    alloc={doneAlloc.data as AllocationRead | undefined}
                    loading={doneAlloc.isPending}
                    refreshing={doneAlloc.isFetching}
                    rec={{ txHash: launched.hash, block: launched.block, curve: launched.curve }}
                    error={doneAlloc.isError ? "The allocation could not be read yet. Open the launch page in a moment." : null}
                  />
                )}
                <p className="muted-note">{launched.vault ? <>Vault <a className="link mono" href={explorerAddress(launched.vault)} target="_blank" rel="noreferrer">{fmt.short(launched.vault)}</a></> : "Fees go straight to the contributor's wallet"} · token <span className="mono">{fmt.short(launched.token)}</span> <CopyButton value={launched.token} label="Copy token address" /></p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
