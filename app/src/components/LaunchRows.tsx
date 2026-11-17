import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import { Av, Sk, StatusTag, type LaunchStatus } from "./ui";
import { fmt } from "../lib/format";
import type { Card } from "../hooks/useChainData";
import { isListedVerdict, rowTitle } from "../lib/visibility";
import type { LaunchRecord } from "../lib/launches";

export function statusOf(card: Card): LaunchStatus {
  return statusFromCode(card.snap.state.status);
}

export function statusFromCode(code: number): LaunchStatus {
  switch (code) {
    case 1:
      return "public";
    case 2:
      return "ready";
    case 3:
      return "grad";
    default:
      return "pending";
  }
}

/** Listed on the launches page: verified Tributary launches only (debug view adds everything else). */
export function isListed(card: Card, debug: boolean): boolean {
  return isListedVerdict(!!card.rec.meta, card.verified, debug);
}

export type RowModel = {
  title: string; // owner/name (verified rows only) or symbol + short token address
  repo: boolean; // true only when `title` is the verified repo from metadata
  status: LaunchStatus;
  pct: number;
  left: string;
  fees: string | null;
  recipients: number | null;
  symbol: string;
  name: string;
  sub: string;
  unchecked: boolean;
};

export function rowModel(card: Card): RowModel {
  const { rec, snap, vault, timestamp } = card;
  const st = statusOf(card);
  const pct = Math.min(100, Math.round(snap.progress.progressBps / 100));
  const remaining = snap.progress.target > snap.progress.current ? snap.progress.target - snap.progress.current : 0n;
  const remEth = Number(remaining) / 1e18;
  const left = st === "grad" ? "In pool" : snap.progress.progressBps >= 10_000 ? "Ready" : `${remEth > 1000 ? fmt.compact(remEth) : fmt.eth(remaining)} ETH`;
  const claims = !rec.meta || card.verified?.status === "verified"; // no contributor or fee claims for anything unchecked
  const fees = vault ? `${fmt.eth(vault.totalFunded + vault.pendingInFeeVault)} ETH` : null;
  const age = timestamp ? fmt.ago(timestamp) : null;
  return {
    title: rowTitle(card.verified?.status === "verified" ? rec.meta?.repo ?? null : null, snap.symbol, rec.token),
    repo: card.verified?.status === "verified" && !!rec.meta,
    status: st,
    pct: st === "grad" ? 100 : pct,
    left,
    fees: claims ? fees : null,
    recipients: claims && vault ? vault.recipients.length : null,
    unchecked: card.verified?.status === "unverifiable",
    symbol: snap.symbol,
    name: snap.name,
    sub: [!rec.meta ? "Not a Tributary launch" : null, age].filter(Boolean).join(" · "),
  };
}

function useVisible(onVisible?: () => void) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onVisible) return;
    if (typeof IntersectionObserver === "undefined") {
      onVisible();
      return;
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        onVisible();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);
  return ref;
}

export function LaunchRow({ rec, q, debug, onVisible }: { rec: LaunchRecord; q: UseQueryResult<Card>; debug?: boolean; onVisible?: () => void }) {
  const nav = useNavigate();
  const rowRef = useVisible(onVisible);
  const to = `/launch/${rec.token}${debug ? "?all=1" : ""}`;
  const title = fmt.short(rec.token); // never the repo from metadata until the chain and the repository agree

  if (q.isPending) {
    return (
      <tr ref={rowRef}>
        <td className="c-repo">
          <div className="repo">
            <Av seed={rec.token} tone="ink" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Sk w="60%" />
              <div style={{ height: 6 }} />
              <Sk w="40%" h={10} />
            </div>
          </div>
        </td>
        <td data-k="Token" className="c-tok"><Sk w="60%" /></td>
        <td data-k="Curve" className="c-curve"><Sk w="80%" /></td>
        <td data-k="To graduation" className="r c-left"><Sk w="60%" /></td>
        <td data-k="Contributors" className="r c-contrib"><Sk w="30%" /></td>
        <td data-k="Fees earned" className="r c-fees"><Sk w="60%" /></td>
        <td className="c-status"><Sk w={64} /></td>
      </tr>
    );
  }
  if (q.isError || !q.data) {
    return (
      <tr ref={rowRef}>
        <td className="c-repo full" colSpan={7}>
          <div className="repo">
            <Av seed={title} tone="ink" />
            <div style={{ minWidth: 0 }}>
              <Link className="repo-name" to={to}>{title}</Link>
              <div className="repo-sub">This launch could not be read from the chain right now. Reload to try again.</div>
            </div>
          </div>
        </td>
      </tr>
    );
  }
  const m = rowModel(q.data);
  // only a verified repo from the launch metadata is ever formatted as owner/name; a token name or symbol never is
  const [owner2, name2] = m.repo && m.title.includes("/") ? (m.title.split("/") as [string, string]) : ["", m.title];
  return (
    <tr ref={rowRef} className="is-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) nav(to); }}>
      <td className="c-repo">
        <div className="repo">
          <Av seed={title} tone="ink" />
          <div style={{ minWidth: 0 }}>
            <Link className="repo-name" to={to}>
              {owner2 ? <span>{owner2}/</span> : null}
              {name2}
            </Link>
            <div className="repo-sub">{m.sub}</div>
          </div>
        </div>
      </td>
      <td data-k="Token" className="c-tok">
        <span className="sym">{m.symbol}</span> <span className="faint hide-s">{m.name}</span>
      </td>
      <td data-k="Curve" className="c-curve">
        <div className="prog-cell">
          <div className={`meter${m.status === "grad" ? " is-grad" : ""}`}>
            <i style={{ width: `${m.pct}%` }} />
          </div>
          <span className="num">{m.pct}%</span>
        </div>
      </td>
      <td data-k="To graduation" className="r c-left">{m.left}</td>
      <td data-k="Contributors" className="r c-contrib">{m.recipients ?? "–"}</td>
      <td data-k="Fees earned" className="r c-fees">{m.fees ?? "–"}</td>
      <td className="c-status">{m.unchecked ? <span className="tag">Could not be checked</span> : <StatusTag status={m.status} />}</td>
    </tr>
  );
}

export function LaunchesHead() {
  return (
    <thead>
      <tr>
        <th>Repository</th>
        <th>Token</th>
        <th>Curve</th>
        <th className="r">To graduation</th>
        <th className="r">Contributors</th>
        <th className="r">Fees earned</th>
        <th>Status</th>
      </tr>
    </thead>
  );
}

/** Loading rows that use the same cell classes as real rows, so the columns line up. */
export function LaunchSkeletonRows({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          <td className="c-repo">
            <div className="repo">
              <span className="av" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Sk w={`${55 + ((i * 13) % 25)}%`} />
                <div style={{ height: 6 }} />
                <Sk w="35%" h={10} />
              </div>
            </div>
          </td>
          <td data-k="Token" className="c-tok"><Sk w="60%" /></td>
          <td data-k="Curve" className="c-curve"><Sk w="80%" /></td>
          <td data-k="To graduation" className="r c-left"><Sk w="60%" /></td>
          <td data-k="Contributors" className="r c-contrib"><Sk w="30%" /></td>
          <td data-k="Fees earned" className="r c-fees"><Sk w="60%" /></td>
          <td className="c-status"><Sk w={64} /></td>
        </tr>
      ))}
    </>
  );
}
