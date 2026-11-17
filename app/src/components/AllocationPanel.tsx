import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address } from "viem";
import { Av, Banner, Spinner, StepList, type ProgressStep } from "./ui";
import { useWallet } from "../hooks/useWallet";
import type { ContribFileInfo } from "../hooks/useLaunch";
import type { AllocationRead } from "../lib/allocation";
import { runDistribution, readAllocation, splitByShares } from "../lib/allocation";
import { explorerTx, publicClient } from "../lib/chain";
import { fmt } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { tokenBalance, transferToken } from "../lib/tx";

export type AllocRow = { wallet: Address; github: string | null; due: bigint; sent: bigint };

export type AllocRecipient = { recipient: Address; share: bigint };

export function allocationRows(recipients: readonly AllocRecipient[], info: ContribFileInfo | undefined, alloc: AllocationRead): AllocRow[] {
  const handleOf = new Map<string, string>((info?.file?.contributors ?? []).map((c) => [c.wallet.toLowerCase(), c.github]));
  const dues = alloc.firstBuy > 0n ? splitByShares(alloc.firstBuy, recipients.map((r) => r.share)) : recipients.map(() => 0n);
  return recipients.map((r, i) => ({
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
  /** Who the fee goes to: the vault's recipients, or the one wallet. Shares are weights. */
  recipients: readonly AllocRecipient[];
  info: ContribFileInfo | undefined;
  alloc: AllocationRead | undefined;
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  rec: { txHash: `0x${string}`; block: bigint; curve: Address } | null;
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

  const rows = p.alloc ? allocationRows(p.recipients, p.info, p.alloc) : [];
  const pending = rows.filter((r) => r.sent < r.due);
  const sentCount = rows.filter((r) => r.due > 0n && r.sent >= r.due).length;
  const dueCount = rows.filter((r) => r.due > 0n).length;
  const remaining = pending.reduce((a, r) => a + (r.due - r.sent), 0n);

  async function send() {
    if (!wallet || !w.address || !p.rec) return;
    const account = w.address as Address;
    const rec = p.rec;
    setErr(null);
    setBusy(true);
    let list: ProgressStep[] = pending.map((r) => ({ id: r.wallet, label: `Send ${r.github ?? fmt.short(r.wallet)} their remaining ${p.symbol}`, state: "todo" as const }));
    setSteps(list);
    const mark = (id: string, state: ProgressStep["state"], note?: string) => {
      list = list.map((s) => (s.id === id ? { ...s, state, note } : s));
      setSteps(list);
    };
    let current = "";
    try {
      const fresh = await readAllocation({ token: p.token, curve: rec.curve, creator: p.creator, txHash: rec.txHash, block: rec.block });
      const dues = new Map(allocationRows(p.recipients, p.info, fresh).map((r) => [r.wallet.toLowerCase(), r.due]));
      await runDistribution({
        items: pending.map((r) => ({ wallet: r.wallet, due: dues.get(r.wallet.toLowerCase()) ?? r.due })),
        // re-read on chain before every transfer: never pay a wallet twice
        readSent: async (wlt) => (await readAllocation({ token: p.token, curve: rec.curve, creator: p.creator, txHash: rec.txHash, block: rec.block })).sent.get(wlt.toLowerCase()) ?? 0n,
        send: async (wlt, amount) => {
          current = wlt;
          mark(wlt, "active", "Confirm in your wallet");
          const bal = await tokenBalance(publicClient, p.token, account);
          if (bal < amount) throw new Error(`This wallet holds ${fmt.tokens(bal, p.decimals)} ${p.symbol}, less than the ${fmt.tokens(amount, p.decimals)} to send.`);
          const res = await transferToken(wallet, publicClient, account, p.token, wlt as Address, amount);
          setLastTx(res.hash);
        },
        onStep: (wlt, st) => {
          if (st === "done") mark(wlt, "done");
          else if (st === "skipped") mark(wlt, "skipped", "Already received");
          else mark(wlt, "active", "Checking the chain");
        },
      });
    } catch (e) {
      setErr(humanizeError(e));
      if (current) mark(current, "error");
    } finally {
      // stay locked until fresh chain data is back
      await Promise.all([qc.invalidateQueries({ queryKey: ["alloc"] }), qc.invalidateQueries({ queryKey: ["done-alloc"] }), qc.invalidateQueries({ queryKey: ["bal-owner"] })]);
      setBusy(false);
    }
  }
  const locked = busy || p.refreshing;
  const disabledReason = busy
    ? null
    : !p.rec
      ? "The launch transaction is still being read. Try again in a moment."
      : ownerBal.data !== undefined && ownerBal.data < remaining
        ? `This wallet holds ${fmt.tokens(ownerBal.data, p.decimals)} ${p.symbol}, less than the ${fmt.tokens(remaining, p.decimals)} still to send.`
        : p.refreshing
          ? "Refreshing what has been sent. Try again in a moment."
          : null;

  return (
    <section className="panel a-alloc" aria-labelledby="alloc-h">
      <div className="panel-hd">
        <h2 id="alloc-h">Contributor allocation</h2>
        {p.alloc && p.alloc.firstBuy > 0n && <span className={`tag${sentCount === dueCount && dueCount > 0 ? " tag-window" : ""}`} style={{ marginLeft: "auto" }}>{sentCount} of {dueCount} sent</span>}
      </div>
      {p.loading && !p.alloc ? (
        <div className="alloc-sum"><p>Reading the launch transaction and token transfers…</p></div>
      ) : p.error ? (
        <div className="alloc-sum"><Banner kind="err">{p.error}</Banner></div>
      ) : p.alloc && p.alloc.firstBuy === 0n ? (
        <div className="alloc-sum"><p>The launch owner did not buy at launch, so there is no allocation to send. Contributors earn the trading fee either way.</p></div>
      ) : p.alloc ? (
        <>
          <div className="alloc-sum">
            <p>
              The launch owner bought <b>{fmt.tokens(p.alloc.firstBuy, p.decimals)} {p.symbol}</b> in the launch transaction and sends them to the fee recipients by commit share. Each send is an ordinary token transfer from the owner. Nothing on chain forces them, so this table shows what has actually been sent.
            </p>
          </div>
          <table className="ledger stack alloc">
            <thead>
              <tr><th>Contributor</th><th className="r">Due</th><th className="r">Received</th><th className="r">Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.wallet}>
                  <td className="c-who full">
                    <div className="who-cell"><Av seed={r.github ?? r.wallet} small /><div style={{ minWidth: 0 }}><b>{r.github ?? fmt.short(r.wallet)}</b><span className="mono">{fmt.short(r.wallet)}</span></div></div>
                  </td>
                  <td data-k="Due" className="r">{fmt.tokens(r.due, p.decimals)}</td>
                  <td data-k="Received" className="r">{fmt.tokens(r.sent, p.decimals)}</td>
                  <td data-k="Status" className="r c-state">{r.sent >= r.due ? <span className="status-ok"><svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 10.5 8 14.5 16 5.5" /></svg> Sent</span> : <span className="status-wait">Waiting</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="alloc-sum">
            {isOwner && pending.length > 0 && (
              <div>
                <button className="btn btn-primary" type="button" onClick={send} disabled={locked || !p.rec || (ownerBal.data !== undefined && ownerBal.data < remaining)}>
                  {busy ? <><Spinner />Sending</> : `Send ${fmt.tokens(remaining, p.decimals)} ${p.symbol} to ${pending.length} contributor${pending.length > 1 ? "s" : ""}`}
                </button>
                {disabledReason && <p className="err" style={{ marginTop: 8 }}>{disabledReason}</p>}
                <p className="muted-note" style={{ marginTop: 8 }}>One transfer per contributor, each confirmed in your wallet. You can stop and come back: this page works out what is left.</p>
              </div>
            )}
            {!isOwner && pending.length > 0 && <p className="muted-note">Only the launch owner, <span className="mono">{fmt.short(p.creator)}</span>, can send these tokens.</p>}
            {steps && <StepList steps={steps} />}
            {err && <Banner kind="err">{err}</Banner>}
            {lastTx && !busy && !err && pending.length === 0 && <Banner kind="acc">All allocations sent. <a className="link" href={explorerTx(lastTx)} target="_blank" rel="noreferrer">Last transaction</a></Banner>}
          </div>
        </>
      ) : null}
    </section>
  );
}
