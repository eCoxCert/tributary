import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address } from "viem";
import { Banner, Spinner, StepList, type ProgressStep } from "./ui";
import { useWallet } from "../hooks/useWallet";
import type { KatkiInfo } from "../hooks/useLaunch";
import type { VaultSnapshot } from "../lib/launches";
import type { AllocationRead } from "../lib/allocation";
import { splitByShares } from "../lib/allocation";
import { explorerTx, publicClient } from "../lib/chain";
import { fmt } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { tokenBalance, transferToken } from "../lib/tx";

export type AllocRow = { wallet: Address; github: string | null; due: bigint; sent: bigint };

export function allocationRows(vault: VaultSnapshot, info: KatkiInfo | undefined, alloc: AllocationRead): AllocRow[] {
  const handleOf = new Map<string, string>((info?.file?.contributors ?? []).map((c) => [c.wallet.toLowerCase(), c.github]));
  const dues = alloc.firstBuy > 0n ? splitByShares(alloc.firstBuy, vault.recipients.map((r) => r.share)) : vault.recipients.map(() => 0n);
  return vault.recipients.map((r, i) => ({
    wallet: r.recipient,
    github: handleOf.get(r.recipient.toLowerCase()) ?? null,
    due: dues[i] as bigint,
    sent: alloc.sent.get(r.recipient.toLowerCase()) ?? 0n,
  }));
}

export function AllocationPanel(p: {
  token: Address;
  symbol: string;
  decimals: number;
  creator: Address;
  vault: VaultSnapshot;
  info: KatkiInfo | undefined;
  alloc: AllocationRead | undefined;
  loading: boolean;
  error: string | null;
  autoStart?: boolean;
}) {
  const w = useWallet();
  const { data: wallet } = useWalletClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const isOwner = w.status === "connected" && (w.address as string).toLowerCase() === p.creator.toLowerCase();

  const ownerBal = useQuery({
    queryKey: ["bal-owner", p.token, p.creator],
    enabled: isOwner,
    queryFn: () => tokenBalance(publicClient, p.token, p.creator),
  });

  const rows = p.alloc ? allocationRows(p.vault, p.info, p.alloc) : [];
  const pending = rows.filter((r) => r.sent < r.due);
  const sentCount = rows.filter((r) => r.due > 0n && r.sent >= r.due).length;
  const dueCount = rows.filter((r) => r.due > 0n).length;
  const remaining = pending.reduce((a, r) => a + (r.due - r.sent), 0n);

  async function send() {
    if (!wallet || !w.address) return;
    const account = w.address as Address;
    setErr(null);
    setBusy(true);
    let list: ProgressStep[] = pending.map((r) => ({ id: r.wallet, label: `Send ${fmt.tokens(r.due - r.sent, p.decimals)} ${p.symbol} to ${r.github ?? fmt.short(r.wallet)}`, state: "todo" as const }));
    setSteps(list);
    let current = "";
    const mark = (id: string, state: ProgressStep["state"], note?: string) => {
      list = list.map((s) => (s.id === id ? { ...s, state, note } : s));
      setSteps(list);
    };
    try {
      const bal = await tokenBalance(publicClient, p.token, account);
      if (bal < remaining) throw new Error(`This wallet holds ${fmt.tokens(bal, p.decimals)} ${p.symbol}, which is less than the ${fmt.tokens(remaining, p.decimals)} still to send.`);
      for (const r of pending) {
        current = r.wallet;
        mark(r.wallet, "active", "Confirm in your wallet");
        const res = await transferToken(wallet, publicClient, account, p.token, r.wallet, r.due - r.sent);
        setLastTx(res.hash);
        mark(r.wallet, "done");
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["alloc"] }), qc.invalidateQueries({ queryKey: ["bal-owner"] })]);
    } catch (e) {
      setErr(humanizeError(e));
      if (current) mark(current, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel a-alloc" aria-labelledby="alloc-h">
      <div className="panel-hd">
        <h2 id="alloc-h">Contributor allocation</h2>
        {p.alloc && p.alloc.firstBuy > 0n && <span className={`tag${sentCount === dueCount && dueCount > 0 ? " tag-window" : ""}`} style={{ marginLeft: "auto" }}>{sentCount} of {dueCount} sent</span>}
      </div>
      <div className="alloc-sum">
        {p.loading && !p.alloc ? (
          <p>Reading the launch transaction and token transfers…</p>
        ) : p.error ? (
          <Banner kind="err">{p.error}</Banner>
        ) : p.alloc && p.alloc.firstBuy === 0n ? (
          <p>The launch owner did not buy at launch, so there is no allocation to send. Contributors earn the trading fee either way.</p>
        ) : p.alloc ? (
          <>
            <p>
              The launch owner bought <b>{fmt.tokens(p.alloc.firstBuy, p.decimals)} {p.symbol}</b> in the launch transaction and sends them to the fee recipients by commit share. The sends are ordinary token transfers by the owner. Nothing on chain forces them, so this table shows what has actually been sent.
            </p>
            <table className="ledger stack alloc">
              <thead>
                <tr><th>Contributor</th><th className="r">Due</th><th className="r">Received</th><th className="r">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.wallet}>
                    <td className="c-who full"><b>{r.github ?? fmt.short(r.wallet)}</b> {r.github && <span className="mono faint">{fmt.short(r.wallet)}</span>}</td>
                    <td data-k="Due" className="r">{fmt.tokens(r.due, p.decimals)}</td>
                    <td data-k="Received" className="r">{fmt.tokens(r.sent, p.decimals)}</td>
                    <td data-k="Status" className="r c-state">{r.sent >= r.due ? <span className="status-ok">Sent</span> : <span className="status-wait">Waiting</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.alloc.truncated && <p className="muted-note">This launch is older than the 400,000 blocks scanned for transfers, so older sends may be missing.</p>}
            {isOwner && pending.length > 0 && (
              <div>
                <button className="btn btn-primary" type="button" onClick={send} disabled={busy || (ownerBal.data !== undefined && ownerBal.data < remaining)}>
                  {busy ? <><Spinner />Sending</> : `Send ${fmt.tokens(remaining, p.decimals)} ${p.symbol} to ${pending.length} contributor${pending.length > 1 ? "s" : ""}`}
                </button>
                <p className="muted-note" style={{ marginTop: 8 }}>One transfer per contributor, each confirmed in your wallet. You can stop and come back: this page works out what is left.</p>
              </div>
            )}
            {!isOwner && pending.length > 0 && <p className="muted-note">Only the launch owner, <span className="mono">{fmt.short(p.creator)}</span>, can send these tokens.</p>}
            {steps && <StepList steps={steps} />}
            {err && <Banner kind="err">{err}</Banner>}
            {lastTx && !busy && !err && pending.length === 0 && <Banner kind="acc">All allocations sent. <a className="link" href={explorerTx(lastTx)} target="_blank" rel="noreferrer">Last transaction</a></Banner>}
          </>
        ) : null}
      </div>
    </section>
  );
}
