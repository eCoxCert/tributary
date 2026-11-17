import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address } from "viem";
import { DFSClient } from "@ammora-protocol/sdk";
import { Av, Banner, Spinner, StepList, type ProgressStep } from "./ui";
import { useWallet } from "../hooks/useWallet";
import type { KatkiInfo } from "../hooks/useLaunch";
import type { VaultSnapshot } from "../lib/launches";
import { dfsOptions, explorerAddress, explorerTx, publicClient } from "../lib/chain";
import { fmt } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { sendCalldata } from "../lib/tx";
import { TOTAL_BPS } from "../lib/split";
import { missingFromFile } from "../lib/katki";

type Row = {
  index: number;
  wallet: Address;
  github: string | null;
  bps: number;
  commits: number | null;
  earned: bigint;
  unclaimed: bigint;
  claimedBy: bigint;
};

export function buildRows(v: VaultSnapshot, info: KatkiInfo | undefined): Row[] {
  const handleOf = new Map<string, string>((info?.file?.contributors ?? []).map((c) => [c.wallet.toLowerCase(), c.github]));
  const commitsOf = new Map<string, number>((info?.history ?? []).map((h) => [h.login.toLowerCase(), h.contributions]));
  return v.recipients.map((r) => {
    const gh = handleOf.get(r.recipient.toLowerCase()) ?? null;
    const pendingShare = v.totalShare > 0n ? (v.pendingInFeeVault * r.share) / v.totalShare : 0n;
    return {
      index: r.index,
      wallet: r.recipient,
      github: gh,
      bps: v.totalShare > 0n ? Number((r.share * BigInt(TOTAL_BPS)) / v.totalShare) : 0,
      commits: gh ? commitsOf.get(gh.toLowerCase()) ?? null : null,
      earned: r.claimed + r.claimable + pendingShare,
      unclaimed: r.claimable + pendingShare,
      claimedBy: r.claimed,
    };
  });
}

export function ContribPanel({ vault, info, infoLoading, meta }: { vault: VaultSnapshot; info: KatkiInfo | undefined; infoLoading: boolean; meta: { repo: string; katkiCommit: string } }) {
  const w = useWallet();
  const { data: wallet } = useWalletClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const rows = buildRows(vault, info);
  const me = w.status === "connected" ? (w.address as string).toLowerCase() : null;
  const top = Math.max(1, ...rows.map((r) => r.bps));
  const sumEarned = rows.reduce((a, r) => a + r.earned, 0n);
  const sumUn = rows.reduce((a, r) => a + r.unclaimed, 0n);
  const commitsKnown = rows.every((r) => r.commits !== null);
  const sumCommits = rows.reduce((a, r) => a + (r.commits ?? 0), 0);

  const inFileNotInVault = info?.file ? info.file.contributors.filter((c) => !vault.recipients.some((r) => r.recipient.toLowerCase() === c.wallet.toLowerCase())) : [];
  const notInFile = info?.file && info.history ? missingFromFile(info.file, info.history) : [];

  async function claim(row: Row) {
    if (!wallet || !w.address) return;
    const account = w.address as Address;
    setErr(null);
    setDone(null);
    setBusy(true);
    const needFund = vault.pendingInFeeVault > 0n;
    let list: ProgressStep[] = [
      { id: "fund", label: "Move fees from the launch fee store into the vault", state: needFund ? "todo" : "skipped", note: needFund ? undefined : "Nothing waiting there" },
      { id: "claim", label: "Claim your share to your wallet", state: "todo" },
    ];
    setSteps(list);
    let current = "";
    const mark = (id: string, state: ProgressStep["state"], note?: string) => {
      list = list.map((s) => (s.id === id ? { ...s, state, note } : s));
      setSteps(list);
    };
    try {
      const dfs = new DFSClient(publicClient, vault.vault, dfsOptions);
      let hash = "";
      if (needFund) {
        current = "fund";
        mark("fund", "active");
        const plan = await dfs.planAtomicFundingWithPreflight({ kind: "feeVault", source: vault.feeVault, caller: account });
        if (!plan.ready || !plan.transaction) {
          throw new Error(
            plan.issues.length
              ? `The vault cannot pull the waiting fees yet: ${plan.issues.join(" ")} The vault owner may need to enable the fee store as a source.`
              : "The vault cannot pull the waiting fees yet. The vault owner may need to enable the fee store as a source.",
          );
        }
        const r = await sendCalldata(wallet, publicClient, account, plan.transaction as { to: Address; data: `0x${string}`; value?: bigint });
        hash = r.hash;
        mark("fund", "done");
      }
      current = "claim";
      mark("claim", "active", "Confirm in your wallet");
      const tx = dfs.planClaim(row.index);
      const r = await sendCalldata(wallet, publicClient, account, tx as { to: Address; data: `0x${string}`; value?: bigint });
      hash = r.hash;
      mark("claim", "done");
      setDone(hash);
      await Promise.all([qc.invalidateQueries({ queryKey: ["vault"] }), qc.invalidateQueries({ queryKey: ["card"] })]);
    } catch (e) {
      setErr(humanizeError(e));
      if (current) mark(current, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel a-contrib" aria-labelledby="contrib-h">
      <div className="panel-hd">
        <h2 id="contrib-h">Contributors and fees</h2>
        <span className="faint" style={{ marginLeft: "auto", fontSize: 13 }}>
          From <span className="mono">.katki.json</span> at <span className="mono">{meta.katkiCommit.slice(0, 7)}</span>
        </span>
      </div>
      <table className="ledger stack contrib">
        <thead>
          <tr>
            <th>Contributor</th>
            <th>Share of fees</th>
            <th className="r">Commits</th>
            <th className="r">Fees earned</th>
            <th className="r">Unclaimed</th>
            <th className="r"><span className="visually-hidden">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mine = me === r.wallet.toLowerCase();
            const total = r.unclaimed;
            return (
              <tr key={r.wallet} className={mine ? "is-you" : undefined}>
                <td className="c-who">
                  <div className="who-cell">
                    <Av seed={r.github ?? r.wallet} />
                    <div style={{ minWidth: 0 }}>
                      <b>
                        {r.github ?? (infoLoading ? "…" : fmt.short(r.wallet))}
                        {mine && <span className="you">You</span>}
                      </b>
                      <a className="mono" href={explorerAddress(r.wallet)} target="_blank" rel="noreferrer">{fmt.short(r.wallet)}</a>
                    </div>
                  </div>
                </td>
                <td data-k="Share" className="c-share">
                  <div className="share">
                    <span className="num">{fmt.bpsPct(r.bps)}</span>
                    <div className="meter"><i style={{ width: `${(r.bps / top) * 100}%` }} /></div>
                  </div>
                </td>
                <td data-k="Commits" className="r c-commits">{r.commits ?? "–"}</td>
                <td data-k="Earned" className="r c-earned">{fmt.eth(r.earned)}</td>
                <td data-k="Unclaimed" className={`r c-un${mine ? " is-mine" : ""}`}>{fmt.eth(r.unclaimed)}</td>
                <td className={`r c-act${mine ? " is-mine" : ""}`}>
                  {mine && (
                    <button className="btn btn-sm btn-primary" type="button" disabled={busy || total === 0n} onClick={() => claim(r)}>
                      {busy ? <><Spinner />Confirm in wallet</> : `Claim ${fmt.eth(total)} ETH`}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="is-total">
            <td className="c-who"><b>{rows.length} contributors</b></td>
            <td data-k="Share" className="c-share num">100.0%</td>
            <td data-k="Commits" className="r c-commits">{commitsKnown ? fmt.int(sumCommits) : "–"}</td>
            <td data-k="Earned" className="r c-earned"><b>{fmt.eth(sumEarned)}</b></td>
            <td data-k="Unclaimed" className="r c-un"><b>{fmt.eth(sumUn)}</b></td>
            <td className="c-act" />
          </tr>
        </tbody>
      </table>
      <div className="panel-note">
        <span>
          The vault holds WETH and pays contributors in WETH, shown here as ETH. Fees reach the vault from the launch's fee store when someone claims, so "Unclaimed" includes fees still waiting there ({fmt.eth(vault.pendingInFeeVault)} ETH in total).
          Vault: <a className="link mono" href={explorerAddress(vault.vault)} target="_blank" rel="noreferrer">{fmt.short(vault.vault)}</a>, owner <a className="link mono" href={explorerAddress(vault.owner)} target="_blank" rel="noreferrer">{fmt.short(vault.owner)}</a>.
        </span>
        {!vault.claimSourceEnabled && (
          <Banner kind="warn">The vault owner has not enabled the launch fee store as a source yet, so waiting fees cannot be pulled in. Claiming works for fees already in the vault.</Banner>
        )}
        {info?.notes.length ? <span>{info.notes[0]}</span> : null}
        {(inFileNotInVault.length > 0 || notInFile.length > 0) && (
          <div className="pick">
            {inFileNotInVault.length > 0 && (
              <span>
                <b>In .katki.json but not in the vault</b> (the vault takes the 5 contributors with the most commits):{" "}
                {inFileNotInVault.map((c) => c.github).join(", ")}.
              </span>
            )}
            {notInFile.length > 0 && (
              <span>
                <b>Repository contributors not in .katki.json:</b> {notInFile.slice(0, 12).map((c) => c.login).join(", ")}
                {notInFile.length > 12 ? ` and ${notInFile.length - 12} more` : ""}.
              </span>
            )}
          </div>
        )}
        {steps && <StepList steps={steps} />}
        {err && <Banner kind="err">{err}</Banner>}
        {done && <Banner kind="acc">Claimed. <a className="link" href={explorerTx(done)} target="_blank" rel="noreferrer">View transaction</a></Banner>}
      </div>
    </section>
  );
}
