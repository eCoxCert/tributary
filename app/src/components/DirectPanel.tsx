import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address } from "viem";
import { buildClaimFeeVaultFor } from "@ammora-protocol/sdk";
import { Av, Banner, Spinner } from "./ui";
import { useWallet } from "../hooks/useWallet";
import type { ContribFileInfo } from "../hooks/useLaunch";
import type { DirectSnapshot } from "../lib/launches";
import { ADDR, explorerAddress, explorerTx, publicClient } from "../lib/chain";
import { fmt } from "../lib/format";
import { humanizeError } from "../lib/errors";
import { sendCalldata } from "../lib/tx";

/** Contributors table for a launch whose fee goes straight to one wallet (no vault). */
export function DirectPanel({ direct, info, meta }: { direct: DirectSnapshot; info: ContribFileInfo | undefined; meta: { repo: string; fileCommit: string } }) {
  const w = useWallet();
  const { data: wallet } = useWalletClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const entry = info?.file?.contributors.find((c) => c.wallet.toLowerCase() === direct.recipient.toLowerCase());
  const handle = entry?.github ?? null;
  const commits = handle ? info?.history?.find((h) => h.login.toLowerCase() === handle.toLowerCase())?.contributions ?? null : null;
  const mine = w.status === "connected" && (w.address as string).toLowerCase() === direct.recipient.toLowerCase();

  async function claim() {
    if (!wallet || !w.address) return;
    const account = w.address as Address;
    setErr(null);
    setDone(null);
    setBusy(true);
    try {
      const { data } = buildClaimFeeVaultFor(ADDR.weth, account, account);
      const r = await sendCalldata(wallet, publicClient, account, { to: direct.feeVault, data });
      setDone(r.hash);
      await qc.invalidateQueries({ queryKey: ["direct"] });
      await qc.invalidateQueries({ queryKey: ["card"] });
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel a-contrib" aria-labelledby="contrib-h">
      <div className="panel-hd">
        <h2 id="contrib-h">Contributor and fees</h2>
        <span className="faint" style={{ marginLeft: "auto", fontSize: 13 }}>
          From <span className="mono">.tributary.json</span> at <span className="mono">{meta.fileCommit.slice(0, 7)}</span>
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
          <tr className={mine ? "is-you" : undefined}>
            <td className="c-who">
              <div className="who-cell">
                <Av seed={handle ?? direct.recipient} />
                <div style={{ minWidth: 0 }}>
                  <b>{handle ?? fmt.short(direct.recipient)}{mine && <span className="you">You</span>}</b>
                  <a className="mono" href={explorerAddress(direct.recipient)} target="_blank" rel="noreferrer">{fmt.short(direct.recipient)}</a>
                </div>
              </div>
            </td>
            <td data-k="Share" className="c-share"><div className="share"><span className="num">100.0%</span><div className="meter"><i style={{ width: "100%" }} /></div></div></td>
            <td data-k="Commits" className="r c-commits">{commits ?? "–"}</td>
            <td data-k="Earned" className="r c-earned">–</td>
            <td data-k="Unclaimed" className={`r c-un${mine ? " is-mine" : ""}`}>{fmt.eth(direct.pending)}</td>
            <td className={`r c-act${mine ? " is-mine" : ""}`}>
              {mine && (
                <button className="btn btn-sm btn-primary" type="button" disabled={busy || direct.pending === 0n} onClick={claim}>
                  {busy ? <><Spinner />Confirm in wallet</> : `Claim ${fmt.eth(direct.pending)} ETH`}
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="panel-note">
        <span>
          <b>Fees go straight to this wallet.</b> This repository has one contributor, so there is no fee vault and no split. The fee waits in the launch's fee store and this wallet claims it in one step. WETH is paid out and shown here as ETH. Total earned so far is not shown for a single wallet; only what is waiting.
        </span>
        <span>
          After graduation, trading fees go to liquidity positions held by the launch owner and reach this wallet only when the owner sends them; that step is not automatic.
        </span>
        {info?.notes.length ? <span>{info.notes[0]}</span> : null}
        {err && <Banner kind="err">{err}</Banner>}
        {done && <Banner kind="acc">Claimed. <a className="link" href={explorerTx(done)} target="_blank" rel="noreferrer">View transaction</a></Banner>}
      </div>
    </section>
  );
}
