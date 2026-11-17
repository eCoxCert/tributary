import { useCallback, useEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { publicClient } from "../lib/chain";
import {
  discoverLaunches,
  readCurveSnapshot,
  readTemplateConfig,
  readVaultSnapshot,
  type CurveSnapshot,
  type DiscoveryState,
  type LaunchRecord,
  type VaultSnapshot,
} from "../lib/launches";
import { humanizeError } from "../lib/errors";
import type { Verification } from "../lib/verify";
import { verifyLaunch } from "../lib/cardVerify";
import { readKatkiState } from "../lib/katkiCheck";
import { ADDR } from "../lib/chain";
import { sampleCurve, curveTotals, humanPrice } from "../lib/curveMath";
import { scanRanges, splitRangesNewestFirst } from "../lib/logs";
import { ammoraAFSVaultAbi } from "@ammora-protocol/sdk";

const fx = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("fixture"));

export type Discovery = {
  launches: LaunchRecord[];
  scanning: boolean;
  error: string | null;
  source: DiscoveryState["source"] | null;
  scannedFrom: bigint | null;
  head: bigint | null;
  extend: () => void;
  retry: () => void;
};

/** Streams launches from the Data API or from chain logs. `all` includes launches not made with Tributary (debug). */
export function useDiscovery(all: boolean): Discovery {
  const [state, setState] = useState<DiscoveryState | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const run = useCallback((extend: boolean) => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setScanning(true);
    setError(null);
    const go = async () => {
      if (import.meta.env.DEV && fx()?.startsWith("list")) {
        const real = await discoverLaunches({ extend: false, signal: ac.signal, onUpdate: () => {} });
        const f = await import("../fixtures/tributary");
        const fixed = f.fixtureRecords(real.launches);
        if (!ac.signal.aborted) setState({ ...real, launches: fixed, source: "chain", done: true });
        return;
      }
      await discoverLaunches({ extend, signal: ac.signal, onUpdate: (s) => !ac.signal.aborted && setState(s) });
    };
    go()
      .catch((e) => {
        if (!ac.signal.aborted) setError(humanizeError(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setScanning(false);
      });
  }, []);

  useEffect(() => {
    run(false);
    return () => acRef.current?.abort();
  }, [run]);

  const launches = (state?.launches ?? []).filter((l) => all || l.meta);
  return {
    launches,
    scanning,
    error,
    source: state?.source ?? null,
    scannedFrom: state?.scannedFrom ?? null,
    head: state?.head ?? null,
    extend: () => run(true),
    retry: () => run(false),
  };
}

export type Card = {
  rec: LaunchRecord;
  snap: CurveSnapshot;
  vault: VaultSnapshot | null;
  timestamp: number | null;
  /** Chain check of a Tributary claim; null for launches that make no such claim. */
  verified: Verification | null;
};

async function readCard(rec: LaunchRecord): Promise<Card> {
  if (import.meta.env.DEV && fx()?.startsWith("list")) return (await import("../fixtures/tributary")).fixtureCard(rec, fx() === "list-loading");
  const [snap, vault, block, katki] = await Promise.all([
    readCurveSnapshot(rec.curve, rec.token),
    rec.meta ? readVaultSnapshot(rec.meta.vault).catch(() => null) : Promise.resolve(null),
    publicClient.getBlock({ blockNumber: rec.block }).catch(() => null),
    rec.meta ? readKatkiState(rec.meta.repo, rec.meta.katkiCommit) : Promise.resolve(null),
  ]);
  const verified = rec.meta && katki
    ? verifyLaunch({
        meta: rec.meta,
        partnerRecipient: snap.config.partnerRecipient,
        creatorShareOfNonProtocolBps: snap.config.creatorShareOfNonProtocolBps,
        creator: snap.state.creator,
        quoteToken: ADDR.weth,
        vault,
        katki: katki.state,
        provenance: katki.provenance,
        handles: katki.handles,
      })
    : null;
  return { rec, snap, vault, timestamp: block ? Number(block.timestamp) * 1000 : null, verified };
}

/** Live data for several launches. Each is its own query so one failure does not hide the others. */
export function useCards(records: LaunchRecord[]) {
  return useQueries({
    queries: records.map((rec) => ({
      queryKey: ["card", rec.curve],
      queryFn: () => readCard(rec),
      staleTime: 30_000,
    })),
  });
}

export function useTemplate() {
  return useQuery({
    queryKey: ["template"],
    queryFn: async () => {
      const t = await readTemplateConfig();
      if (!t) throw new Error("The template configuration could not be read.");
      const totals = curveTotals(t.segments);
      const tokenDecimals = t.config.tokenDecimals;
      return {
        feeBps: t.config.cliffFeeBps,
        graduationWei: t.config.migrationQuoteThreshold,
        points: sampleCurve(t.segments, 64),
        totalBase: totals.base,
        tokenDecimals,
        supply: t.config.totalSupply,
        startPrice: humanPrice(Number(t.config.startSqrtPrice) ** 2 / 2 ** 128, tokenDecimals),
      };
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export type Payout = { vault: Address; recipient: Address; amount: bigint; block: bigint; tx: string; time: number | null };

const feeClaimed = ammoraAFSVaultAbi.find((x) => x.type === "event" && x.name === "FeeClaimed");

/** FeeClaimed events of the given vaults (recent window only). */
export function usePayouts(vaults: { vault: Address; block: bigint }[]) {
  return useQuery<Payout[]>({
    queryKey: ["payouts", vaults.map((v) => v.vault).join(",")],
    enabled: vaults.length > 0 && !!feeClaimed,
    staleTime: 60_000,
    queryFn: async () => {
      const head = await publicClient.getBlockNumber();
      const oldest = vaults.reduce((a, v) => (v.block < a ? v.block : a), head);
      const from = head - oldest > 200_000n ? head - 200_000n : oldest;
      const logs = await scanRanges(splitRangesNewestFirst(from, head), (r) =>
        publicClient.getLogs({ address: vaults.map((v) => v.vault), event: feeClaimed as never, fromBlock: r.from, toBlock: r.to }),
      );
      const out: Payout[] = (logs as unknown as { address: Address; args: { recipient: Address; amount: bigint }; blockNumber: bigint; transactionHash: string }[])
        .map((l) => ({ vault: l.address, recipient: l.args.recipient, amount: l.args.amount, block: l.blockNumber, tx: l.transactionHash, time: null as number | null }))
        .sort((a, b) => (a.block > b.block ? -1 : 1));
      await Promise.all(
        out.slice(0, 6).map(async (p) => {
          const b = await publicClient.getBlock({ blockNumber: p.block }).catch(() => null);
          if (b) p.time = Number(b.timestamp) * 1000;
        }),
      );
      return out;
    },
  });
}
