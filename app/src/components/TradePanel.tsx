import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import { formatUnits, type Address } from "viem";
import { AmmoraV4LaunchCurveClient, classifyAmmoraV4ExactInputFill, parseAmmoraV4SwapReceipt } from "@ammora-protocol/sdk";
import { Banner, Spinner, StepList, type ProgressStep } from "./ui";
import { useWallet } from "../hooks/useWallet";
import { useDebounced, type LaunchData } from "../hooks/useLaunch";
import { core, explorerAddress, explorerTx, publicClient } from "../lib/chain";
import { fmt, parseAmount } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { humanPrice, rawPrice } from "../lib/curveMath";
import { allowanceOf, approveToken, sendCalldata, tokenBalance, unwrapEth, wethBalance, wrapEth } from "../lib/tx";

type Side = "buy" | "sell";
const SLIPPAGE = [50, 100, 300];
const GAS_RESERVE = 2_000_000_000_000_000n; // 0.002 ETH kept for gas when using Max

export function TradePanel({ data, recipients, ownerNote }: { data: LaunchData; recipients: number | null; ownerNote?: string }) {
  const { snap, curve, token } = data;
  const w = useWallet();
  const { data: wallet } = useWalletClient();
  const qc = useQueryClient();
  const [side, setSide] = useState<Side>("buy");
  const [amt, setAmt] = useState("0.01");
  const [slip, setSlip] = useState(100); // default 1%
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; text: string } | null>(null);

  const status = snap.state.status;
  const sym = snap.symbol;
  const dec = snap.decimals;
  const account = w.status === "connected" ? (w.address as Address) : undefined;

  const bal = useQuery({
    queryKey: ["bal", account, token],
    enabled: !!account,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [eth, weth, tok] = await Promise.all([
        publicClient.getBalance({ address: account as Address }),
        wethBalance(publicClient, account as Address),
        tokenBalance(publicClient, token, account as Address),
      ]);
      return { eth, weth, tok };
    },
  });

  const debounced = useDebounced(amt);
  const amountRaw = parseAmount(debounced, side === "buy" ? 18 : dec);
  const curveClient = new AmmoraV4LaunchCurveClient(publicClient, curve, core);
  const quote = useQuery({
    queryKey: ["quote", curve, side, amountRaw?.toString()],
    enabled: !!amountRaw && amountRaw > 0n && status === 1,
    retry: 0,
    queryFn: async () => {
      const q = await curveClient.quoteExactInput(amountRaw as bigint, side === "sell");
      return { q, fill: classifyAmmoraV4ExactInputFill(q, side === "sell") };
    },
  });

  const typedRaw = parseAmount(amt, side === "buy" ? 18 : dec);
  const stale = debounced !== amt;
  const available = bal.data ? (side === "buy" ? bal.data.eth + bal.data.weth : bal.data.tok) : undefined;
  const insufficient = typedRaw !== null && available !== undefined && typedRaw > available;
  const feePct = snap.state.currentFeeBps / 100;

  const priceAfter = quote.data ? fmt.gwei(humanPrice(rawPrice(quote.data.q.nextSqrtPrice), dec)) : null;
  const receive = quote.data
    ? side === "buy"
      ? `${fmt.tokens(quote.data.q.amountOut, dec)} ${sym}`
      : `${fmt.eth(quote.data.q.amountOut)} WETH`
    : null;

  function setChip(v: string) {
    if (!bal.data) return;
    if (v === "max") {
      if (side === "buy") {
        const max = bal.data.eth + bal.data.weth > GAS_RESERVE ? bal.data.eth + bal.data.weth - GAS_RESERVE : 0n;
        setAmt(formatUnits(max, 18));
      } else setAmt(formatUnits(bal.data.tok, dec));
    } else if (v.endsWith("%")) {
      const pct = BigInt(v.slice(0, -1));
      setAmt(formatUnits((bal.data.tok * pct) / 100n, dec));
    } else setAmt(v);
  }

  function mark(list: ProgressStep[], id: string, state: ProgressStep["state"], note?: string) {
    const next = list.map((s) => (s.id === id ? { ...s, state, note } : s));
    setSteps(next);
    return next;
  }

  async function trade() {
    if (!wallet || !account || !amountRaw || !quote.data) return;
    setErr(null);
    setDone(null);
    setBusy(true);
    const buy = side === "buy";
    let list: ProgressStep[] = buy
      ? [
          { id: "wrap", label: "Wrap ETH into WETH", state: "todo" },
          { id: "approve", label: "Approve WETH for the curve", state: "todo" },
          { id: "swap", label: `Buy ${sym}`, state: "todo" },
        ]
      : [
          { id: "approve", label: `Approve ${sym} for the curve`, state: "todo" },
          { id: "swap", label: `Sell ${sym}`, state: "todo" },
        ];
    setSteps(list);
    let current = "";
    try {
      const plan = await curveClient.planSwapExactInput({
        includedAmountIn: amountRaw,
        baseForQuote: !buy,
        allowPartialFill: quote.data.fill.allowPartialFill,
        slippageBps: slip,
        recipient: account,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
      });
      if (buy) {
        current = "wrap";
        list = mark(list, "wrap", "active");
        const weth = await wethBalance(publicClient, account);
        if (weth < amountRaw) {
          await wrapEth(wallet, publicClient, account, amountRaw - weth);
          list = mark(list, "wrap", "done");
        } else list = mark(list, "wrap", "skipped", "Enough WETH already");
      }
      current = "approve";
      list = mark(list, "approve", "active");
      const req = plan.approvalRequirement;
      const have = await allowanceOf(publicClient, req.token, account, req.spender);
      if (have < req.amount) {
        await approveToken(wallet, publicClient, account, req.token, req.spender, req.amount);
        list = mark(list, "approve", "done");
      } else list = mark(list, "approve", "skipped", "Already approved");
      current = "swap";
      list = mark(list, "swap", "active", "Confirm in your wallet");
      const { hash, receipt } = await sendCalldata(wallet, publicClient, account, plan.transaction);
      list = mark(list, "swap", "done");
      let text = buy ? "Buy confirmed." : "Sell confirmed.";
      try {
        const r = parseAmmoraV4SwapReceipt(receipt, curve, { trader: account });
        text = buy ? `Bought ${fmt.tokens(r.amountOut, dec)} ${sym}.` : `Sold for ${fmt.eth(r.amountOut)} WETH.`;
      } catch {
        /* the receipt parse is cosmetic */
      }
      setDone({ hash, text });
      await Promise.all([qc.invalidateQueries({ queryKey: ["launch"] }), qc.invalidateQueries({ queryKey: ["bal"] }), qc.invalidateQueries({ queryKey: ["quote"] }), qc.invalidateQueries({ queryKey: ["vault"] })]);
    } catch (e) {
      setErr(humanizeError(e));
      if (current) mark(list, current, "error");
    } finally {
      setBusy(false);
    }
  }

  async function graduate() {
    if (!wallet || !account) return;
    setErr(null);
    setDone(null);
    setBusy(true);
    try {
      const head = await publicClient.getBlockNumber();
      const plan = await curveClient.planMigrateAtBlock(head);
      const { hash } = await sendCalldata(wallet, publicClient, account, plan.transaction);
      setDone({ hash, text: "Graduation sent. Liquidity now moves to a pool." });
      await qc.invalidateQueries({ queryKey: ["launch"] });
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function unwrap() {
    if (!wallet || !account || !bal.data || bal.data.weth === 0n) return;
    setErr(null);
    setBusy(true);
    try {
      await unwrapEth(wallet, publicClient, account, bal.data.weth);
      await qc.invalidateQueries({ queryKey: ["bal"] });
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------- states */
  if (status === 3) {
    const pool = snap.state.canonicalPool;
    return (
      <section className="panel trade" aria-label={`Trade ${sym}`}>
        <div className="panel-hd"><h2>Graduated</h2><span className="tag tag-grad" style={{ marginLeft: "auto" }}>Graduated</span></div>
        <div className="trade-bd">
          <p className="trade-note">The curve is closed. {sym} now trades on its liquidity pool, not on this page.</p>
          <dl className="kv">
            <div><dt>Pool</dt><dd><a className="link mono" href={explorerAddress(pool)} target="_blank" rel="noreferrer">{fmt.short(pool)}</a></dd></div>
            <div><dt>Pool fee</dt><dd>{fmt.pct(snap.config.postMigrationFeeBps / 100, 2)}</dd></div>
          </dl>
          <a className="btn btn-lg btn-block" href={explorerAddress(pool)} target="_blank" rel="noreferrer">Trade on the pool</a>
        </div>
      </section>
    );
  }
  if (status === 2) {
    return (
      <section className="panel trade" aria-label={`Graduate ${sym}`}>
        <div className="panel-hd"><h2>Ready to graduate</h2></div>
        <div className="trade-bd">
          <p className="trade-note">The curve reached its graduation threshold. Anyone can send the graduation transaction; it moves the raised ETH and the remaining tokens into a pool.</p>
          {account ? (
            <button className="btn btn-primary btn-lg btn-block" type="button" onClick={graduate} disabled={busy}>{busy ? <><Spinner />Confirm in wallet</> : `Graduate ${sym}`}</button>
          ) : (
            <ConnectCta w={w} />
          )}
          {err && <Banner kind="err">{err}</Banner>}
          {done && <Banner kind="acc">{done.text} <a className="link" href={explorerTx(done.hash)} target="_blank" rel="noreferrer">View transaction</a></Banner>}
        </div>
      </section>
    );
  }
  if (status !== 1) {
    return (
      <section className="panel trade"><div className="trade-bd"><p className="trade-note">Trading has not started on this launch.</p></div></section>
    );
  }

  const invalid = typedRaw === null || typedRaw === 0n;
  const quoteErr = quote.isError ? humanizeError(quote.error) : null;
  const cta = side === "buy" ? `Buy ${sym}` : `Sell ${sym}`;

  return (
    <section className="panel trade" aria-label={`Buy or sell ${sym}`}>
      <div className="panel-bd" style={{ paddingBottom: 0 }}>
        <div className="seg" role="tablist" aria-label="Trade side">
          {(["buy", "sell"] as Side[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => { setSide(s); setAmt(s === "buy" ? "0.01" : ""); setErr(null); setDone(null); setSteps(null); }}>
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
      </div>
      <div className="trade-bd">
        <div className="amount">
          <div className="amount-row">
            <label htmlFor="amt">{side === "buy" ? "You pay" : "You sell"}</label>
            <span className="num">
              {account && bal.data
                ? side === "buy"
                  ? `Balance ${fmt.eth(bal.data.eth)} ETH${bal.data.weth > 0n ? ` + ${fmt.eth(bal.data.weth)} WETH` : ""}`
                  : `Balance ${fmt.tokens(bal.data.tok, dec)} ${sym}`
                : ""}
            </span>
          </div>
          <div className="input-group">
            <input className="input" id="amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} autoComplete="off" aria-invalid={insufficient || (amt !== "" && typedRaw === null)} />
            <span className="affix">{side === "buy" ? "ETH" : sym}</span>
          </div>
          <div className="chips">
            {(side === "buy" ? ["0.01", "0.05", "0.1", "max"] : ["25%", "50%", "75%", "max"]).map((v) => (
              <button key={v} className="chip" type="button" onClick={() => setChip(v)} disabled={v === "max" || v.endsWith("%") ? !bal.data : false}>
                {v === "max" ? "Max" : v}
              </button>
            ))}
          </div>
          {insufficient && <span className="err">This wallet holds less than that.</span>}
        </div>

        <div className="receive">
          <span>{side === "buy" ? "You receive about" : "You get about"}</span>
          <b>{stale || quote.isFetching ? "…" : quoteErr ? "–" : receive ?? "0"}</b>
        </div>
        {quoteErr && <span className="err">{quoteErr}</span>}
        {quote.data && quote.data.fill.kind !== "full" && side === "buy" && (
          <p className="trade-note">This buy reaches the graduation threshold. Only {fmt.eth(quote.data.fill.consumedAmountIn)} ETH is used; the rest stays in your wallet.</p>
        )}

        <dl className="kv">
          <div><dt>Price after trade</dt><dd>{priceAfter ?? "–"}</dd></div>
          <div><dt>Trading fee, {fmt.pct(feePct, feePct % 1 ? 2 : 0)}</dt><dd>{quote.data ? `${fmt.eth(quote.data.q.fee, 6)} ${side === "buy" ? "ETH" : "WETH"}` : "–"}</dd></div>
          <div><dt>Fee goes to</dt><dd>{recipients !== null ? `${recipients} contributors` : "Launch partner"}</dd></div>
        </dl>
        <div className="slip">
          <span>Slippage</span>
          <div className="seg" role="group" aria-label="Slippage tolerance">
            {SLIPPAGE.map((b) => (
              <button key={b} type="button" aria-pressed={slip === b} onClick={() => setSlip(b)}>{b / 100}%</button>
            ))}
          </div>
        </div>

        {w.status === "disconnected" && (
          <div>
            <ConnectCta w={w} />
            <p className="trade-note" style={{ marginTop: 12 }}>Connect a wallet on GIWA Sepolia to trade. Quotes above come from the chain and need no wallet.</p>
          </div>
        )}
        {w.status === "wrong" && (
          <div>
            <button className="btn btn-warn btn-lg btn-block" type="button" onClick={w.switchNetwork} disabled={w.switching}>Switch to GIWA Sepolia</button>
            <p className="trade-note" style={{ marginTop: 12 }}>Your wallet is on another network. {sym} trades only on GIWA Sepolia.</p>
          </div>
        )}
        {w.status === "connected" && (
          <div>
            <button className="btn btn-primary btn-lg btn-block" type="button" onClick={trade} disabled={busy || invalid || insufficient || stale || !quote.data || !wallet}>
              {busy ? <><Spinner />Confirm in wallet</> : cta}
            </button>
            <p className="trade-note" style={{ marginTop: 12 }}>
              {side === "buy"
                ? "Buying wraps ETH into WETH and approves it for the curve when needed. Each transaction is simulated before your wallet opens."
                : `Selling pays out WETH.${bal.data && bal.data.weth > 0n ? "" : " You can turn WETH back into ETH afterwards."}`}
            </p>
            {ownerNote && <p className="trade-note" style={{ marginTop: 8 }}>{ownerNote}</p>}
            {bal.data && bal.data.weth > 0n && (
              <button className="btn btn-sm" type="button" style={{ marginTop: 8 }} onClick={unwrap} disabled={busy}>Unwrap {fmt.eth(bal.data.weth)} WETH to ETH</button>
            )}
          </div>
        )}
        {steps && <StepList steps={steps} />}
        {err && <Banner kind="err">{err}</Banner>}
        {done && <Banner kind="acc">{done.text} <a className="link" href={explorerTx(done.hash)} target="_blank" rel="noreferrer">View transaction</a></Banner>}
      </div>
    </section>
  );
}

function ConnectCta({ w }: { w: ReturnType<typeof useWallet> }) {
  return (
    <button className="btn btn-ink btn-lg btn-block" type="button" onClick={w.connect} disabled={w.connecting}>
      Connect wallet
    </button>
  );
}

