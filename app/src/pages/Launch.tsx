import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Addr, Av, Banner, IconGithub, Sk, Spinner, StatusTag } from "../components/ui";
import { CurveChart } from "../components/CurveChart";
import { TradePanel } from "../components/TradePanel";
import { ContribPanel } from "../components/ContribPanel";
import { AllocationPanel } from "../components/AllocationPanel";
import { statusFromCode } from "../components/LaunchRows";
import { NotFoundError, useAllocation, useBlockTime, useKatkiInfo, useLaunch, useLaunchRecord, useVault } from "../hooks/useLaunch";
import { ADDR, explorerAddress } from "../lib/chain";
import { curveTotals, humanPrice, positionAt, rawPrice, sampleCurve } from "../lib/curveMath";
import { fmt } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS } from "@ammora-protocol/sdk";
import type { Verification } from "../lib/verify";
import { verifyLaunch } from "../lib/cardVerify";
import { useTitle } from "../hooks/useTitle";

export function Launch() {
  const { token } = useParams();
  const [sp] = useSearchParams();
  const debug = sp.get("all") === "1";
  const q = useLaunch(token);
  const data = q.data;
  const meta = data?.meta ?? null;
  const needRec = !!meta || debug; // creation record gives the launch date and the first buy
  const rec = useLaunchRecord(token, !!data && needRec);
  const launchedAt = useBlockTime(rec.data?.block);
  const vault = useVault(meta?.vault);
  const info = useKatkiInfo(meta);
  // null while anything is still loading: the page must never look verified before every check has finished
  const verification: Verification | null = useMemo(() => {
    if (!meta || !data) return null;
    if (vault.isPending || info.isPending) return null;
    return verifyLaunch({
      meta,
      partnerRecipient: data.snap.config.partnerRecipient,
      creatorShareOfNonProtocolBps: data.snap.config.creatorShareOfNonProtocolBps,
      creator: data.snap.state.creator,
      quoteToken: ADDR.weth,
      vault: vault.data ?? null,
      katki: info.data ? info.data.katki : { state: "unavailable", reason: "network" },
      provenance: info.data ? info.data.provenance : { state: "unavailable", reason: "network" },
      handles: info.data ? info.data.handles : { state: "unavailable", reason: "network" },
    });
  }, [meta, data, vault.data, vault.isPending, info.data, info.isPending]);
  const tributary = verification?.status === "verified";
  const checking = !!meta && verification === null;
  const alloc = useAllocation(tributary ? rec.data : null, data?.snap.state.creator, data?.curve);
  useTitle(data ? `${data.snap.name} (${data.snap.symbol})` : "Launch");

  const geometry = useMemo(() => {
    if (!data) return null;
    const { segments, state, decimals } = data.snap;
    const pts = sampleCurve(segments, 64);
    const totals = curveTotals(segments);
    const pos = positionAt(segments, state.sqrtPrice);
    const start = segments[0]?.lowerSqrtPrice ?? state.sqrtPrice;
    return {
      pts,
      totalBase: totals.base,
      nowBase: pos.baseSold,
      price: humanPrice(rawPrice(state.sqrtPrice), decimals),
      change: (rawPrice(state.sqrtPrice) / rawPrice(start) - 1) * 100,
      totalTokens: totals.base / 10 ** decimals,
    };
  }, [data]);

  /* ---------------------------------------------------------- states */
  if (q.isPending) return <LaunchSkeleton />;
  if (q.isError) {
    const notFound = q.error instanceof NotFoundError;
    return (
      <main className="page">
        <div className="wrap">
          <Crumbs name={token ? fmt.short(token) : "launch"} />
          <Banner kind="err" action={notFound ? <Link className="btn btn-sm" to="/launches">All launches</Link> : <button className="btn btn-sm" type="button" onClick={() => q.refetch()}>Try again</button>}>
            <b>{notFound ? "No launch at this address." : "This launch did not load."}</b> {notFound ? q.error.message : `${humanizeError(q.error)} Nothing was sent; your funds are not affected.`}
          </Banner>
        </div>
      </main>
    );
  }
  if (!data || !geometry) return <LaunchSkeleton />;

  if (!meta && !debug) {
    return (
      <main className="page">
        <div className="wrap">
          <Crumbs name={fmt.short(data.token)} />
          <div className="panel">
            <div className="notice notice-c">
              <h3>This token was not launched with Tributary</h3>
              <p>{data.snap.name} ({data.snap.symbol}) is an Ammora launch, but its metadata does not name a repository and fee vault, so Tributary does not list it.</p>
              <Link className="btn btn-sm" to="/launches">See Tributary launches</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const { snap } = data;
  const st = statusFromCode(snap.state.status);
  const title = tributary && meta ? meta.repo : snap.symbol;
  const feeBps = snap.state.currentFeeBps;
  const protocolPct = AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS / 100;
  const firstBuyBase = alloc.data && alloc.data.firstBuy > 0n ? Number(alloc.data.firstBuy) : undefined;
  const sold = geometry.nowBase / 10 ** snap.decimals;
  const lock = snap.config.lockedBaseVesting;
  const hasLock = lock.numberOfPeriods > 0 && lock.amountPerPeriod + lock.cliffUnlockAmount > 0n;

  return (
    <main className="page">
      <div className="wrap">
        <Crumbs name={title} />

        {checking && (
          <p className="hint" role="status" style={{ marginBottom: 24, display: "flex", gap: 8, alignItems: "center" }}>
            <Spinner />
            Checking this launch against the chain and the repository. Nothing about contributors or fees is shown until that finishes.
          </p>
        )}
        {verification?.status === "mismatch" && (
          <div style={{ marginBottom: 24 }}>
            <Banner kind="warn">
              <b>This launch does not follow Tributary's rules.</b> Its metadata names a repository and a fee vault, but the chain or the repository does not back that up, so Tributary shows no contributors, split or fee claims for it.
              <ul className="err-list" style={{ marginTop: 8 }}>{verification.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <p style={{ marginTop: "var(--s-2)" }}>Price, curve and quotes below are real.</p>
            </Banner>
          </div>
        )}
        {verification?.status === "unverifiable" && (
          <div style={{ marginBottom: 24 }}>
            <Banner kind="warn" action={<button className="btn btn-sm" type="button" onClick={() => { void vault.refetch(); void info.refetch(); }}>Check again</button>}>
              <b>Could not check this launch right now.</b> Tributary could not confirm its repository and fee vault, so it shows no contributors, split or fee claims. Nothing was sent; your funds are not affected.
              <ul className="err-list" style={{ marginTop: 8 }}>{verification.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <p style={{ marginTop: "var(--s-2)" }}>Price, curve and quotes below are real.</p>
            </Banner>
          </div>
        )}
        {debug && !meta && (
          <div style={{ marginBottom: 24 }}>
            <Banner kind="warn">Debug view. This launch was not made with Tributary: it has no repository, fee vault or contributor split. Price, curve and quotes are real.</Banner>
          </div>
        )}

        <header className="l-head">
          <div className="l-title">
            <Av seed={title} tone="ink" />
            <h1>
              {snap.name} <span>{snap.symbol}</span>
            </h1>
            <StatusTag status={st} />
          </div>
          <div className="l-meta">
            {tributary && meta && (
              <a href={`https://github.com/${meta.repo}`} target="_blank" rel="noreferrer">
                <IconGithub />
                {meta.repo}
              </a>
            )}
            <span className="addr">
              Token <Addr value={data.token} label="Copy token address" href={explorerAddress(data.token)} />
            </span>
            {launchedAt.data ? <span>Launched <span className="num">{fmt.dateUtc(launchedAt.data)}</span></span> : null}
            {tributary && info.data?.repo && (info.data.repo.language || info.data.repo.stars > 0) ? (
              <span>{[info.data.repo.language, `${fmt.compact(info.data.repo.stars)} stars`].filter(Boolean).join(" · ")}</span>
            ) : null}
          </div>
          <div className="price-row">
            <span className="price-big">{fmt.gwei(geometry.price)}</span>
            <span className={`${Math.abs(geometry.change) < 0.05 ? "faint" : geometry.change > 0 ? "pos" : "neg"} num`}>
              {Math.abs(geometry.change) < 0.05 ? "0.0%" : `${geometry.change > 0 ? "+" : ""}${fmt.pct(geometry.change)}`} since launch
            </span>
            <span className="faint num">Market cap {fmt.ethNum(geometry.price * (Number(snap.totalSupply) / 10 ** snap.decimals), 4)} ETH</span>
          </div>
        </header>

        <div className="l-grid">
          <section className="panel a-chart" aria-labelledby="curve-h">
            <div className="panel-hd">
              <h2 id="curve-h">Bonding curve</h2>
              <div className="legend" aria-hidden="true">
                {firstBuyBase ? <span><i className="h" />Bought at launch (contributor allocation)</span> : null}
                <span><i className="l" />Price</span>
              </div>
            </div>
            <div className="panel-bd">
              <CurveChart
                points={geometry.pts}
                totalBase={geometry.totalBase}
                baseDecimals={snap.decimals}
                nowBase={snap.state.status === 3 ? geometry.totalBase : geometry.nowBase}
                windowBase={firstBuyBase}
                gradLabel={`Graduates at ${fmt.eth(snap.state.migrationQuoteThreshold)} ETH raised`}
                nowLabel={fmt.gwei(geometry.price)}
                ariaLabel={`${snap.symbol} bonding curve. ${Math.round(snap.progress.progressBps / 100)}% of the graduation target raised.`}
                pad={{ l: 0, r: 4, t: 26, b: 26 }}
                grid
                hover
                animate
              />
            </div>
            <dl className="curve-stats">
              <div><dt>Raised</dt><dd>{fmt.eth(snap.progress.current)} of {fmt.eth(snap.progress.target)} ETH</dd></div>
              <div><dt>Sold on curve</dt><dd>{fmt.compact(sold)} of {fmt.compact(geometry.totalTokens)}</dd></div>
              <div><dt>To graduation</dt><dd>{snap.state.status === 3 ? "In pool" : `${fmt.eth(snap.progress.target > snap.progress.current ? snap.progress.target - snap.progress.current : 0n)} ETH`}</dd></div>
              <div><dt>Trading fee</dt><dd>{fmt.pct(feeBps / 100, feeBps % 100 ? 2 : 0)}</dd></div>
            </dl>
          </section>

          <aside className="l-side" aria-label="Trade">
            <TradePanel data={data} recipients={tributary && vault.data ? vault.data.recipients.length : null} />
            {tributary && (
              <section className="panel">
                <div className="panel-hd"><h2>Where the fee goes</h2></div>
                <dl className="kv" style={{ padding: "4px 16px 12px" }}>
                  <div><dt>Protocol</dt><dd>{fmt.pct(protocolPct, 0)} of the fee</dd></div>
                  <div><dt>Fee vault</dt><dd>{fmt.pct(100 - protocolPct, 0)} of the fee</dd></div>
                  <div><dt>Contributors</dt><dd>{vault.data ? `${vault.data.recipients.length}, by commit share` : "–"}</dd></div>
                </dl>
              </section>
            )}
          </aside>

          {checking && (
            <section className="panel a-contrib"><div className="panel-hd"><h2>Contributors and fees</h2></div><table className="ledger stack contrib"><tbody><tr><td className="full"><Sk w="60%" /></td></tr><tr><td className="full"><Sk w="50%" /></td></tr><tr><td className="full"><Sk w="55%" /></td></tr></tbody></table></section>
          )}
          {tributary && meta && vault.data && (
            <>
              <ContribPanel vault={vault.data} info={info.data} infoLoading={false} meta={meta} />
              <AllocationPanel
                token={data.token}
                symbol={snap.symbol}
                decimals={snap.decimals}
                creator={snap.state.creator}
                vault={vault.data}
                info={info.data}
                alloc={alloc.data}
                loading={rec.isPending || alloc.isPending}
                refreshing={alloc.isFetching}
                rec={rec.data ? { txHash: rec.data.txHash, block: rec.data.block, curve: data.curve } : null}
                error={rec.isError || alloc.isError ? "The launch transaction or the token transfers could not be read right now. Nothing was sent; your funds are not affected." : rec.isSuccess && !rec.data ? "The launch creation record was not found in the last 600,000 blocks, so the allocation cannot be shown." : null}
              />
            </>
          )}

          {hasLock && (
            <section className="panel a-lock" aria-labelledby="lock-h">
              <div className="panel-hd"><h2 id="lock-h">Founder allocation</h2><span className="tag" style={{ marginLeft: "auto" }}>Locked</span></div>
              <div className="lock">
                <p className="muted" style={{ fontSize: 14, maxWidth: "62ch" }}>Part of the supply is set aside in the launch configuration and vests to the launch owner. Vesting starts when the launch graduates.</p>
                <dl className="kv">
                  <div><dt>Locked amount</dt><dd>{fmt.tokens(lock.cliffUnlockAmount + lock.amountPerPeriod * BigInt(lock.numberOfPeriods), snap.decimals)} {snap.symbol}</dd></div>
                  <div><dt>Schedule</dt><dd>{lock.numberOfPeriods} periods of {fmt.int(Number(lock.frequency) / 86400)} days after a {fmt.int(Number(lock.cliffDuration) / 86400)}-day cliff</dd></div>
                  <div><dt>Beneficiary</dt><dd><span className="mono">{fmt.short(snap.state.creator)}</span></dd></div>
                </dl>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function Crumbs({ name }: { name: string }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link to="/launches">Launches</Link>
      <span aria-hidden="true">/</span>
      <span>{name}</span>
    </nav>
  );
}

function LaunchSkeleton() {
  return (
    <main className="page" aria-busy="true">
      <div className="wrap">
        <Crumbs name="Loading" />
        <header className="l-head">
          <div className="l-title"><Sk w={48} h={48} r={7} /><Sk w={220} h={30} /></div>
          <div className="price-row"><Sk w={180} h={32} /><Sk w={120} /></div>
        </header>
        <div className="l-grid">
          <section className="panel a-chart"><div className="panel-hd"><h2>Bonding curve</h2></div><div className="panel-bd"><Sk h={260} r={7} /></div></section>
          <aside className="l-side"><section className="panel trade"><div className="trade-bd"><Sk h={52} r={7} /><Sk h={44} r={7} /><Sk h={48} r={7} /></div></section></aside>
        </div>
      </div>
    </main>
  );
}
