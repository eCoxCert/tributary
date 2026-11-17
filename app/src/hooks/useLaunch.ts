import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { ammoraLaunchFactoryV4Abi } from "@ammora-protocol/sdk";
import { ADDR, publicClient } from "../lib/chain";
import { findLaunch, readCurveSnapshot, readVaultSnapshot, type CurveSnapshot, type LaunchRecord } from "../lib/launches";
import { decodeTributaryMetadata, type TributaryMeta } from "../lib/metadata";
import { getContributors, getRepoInfo, parseRepoInput, type RepoInfo } from "../lib/github";
import type { KatkiFile, RepoContributor } from "../lib/katki";
import { readKatkiState } from "../lib/katkiCheck";
import type { KatkiState, RepoCheck } from "../lib/verify";
import { readAllocation, type AllocationRead } from "../lib/allocation";

const ZERO = "0x0000000000000000000000000000000000000000";

export type LaunchData = { token: Address; curve: Address; snap: CurveSnapshot; meta: TributaryMeta | null };

export class NotFoundError extends Error {
  constructor() {
    super("No launch was found for this token address on GIWA Sepolia.");
    this.name = "NotFoundError";
  }
}

const fx = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("fixture"));

export function useLaunch(token: string | undefined) {
  const ok = !!token && isAddress(token, { strict: false });
  return useQuery<LaunchData>({
    queryKey: ["launch", token?.toLowerCase()],
    enabled: ok,
    refetchInterval: 20_000,
    retry: (n, e) => !(e instanceof NotFoundError) && n < 1,
    queryFn: async () => {
      if (import.meta.env.DEV && fx()) {
        const f = await import("../fixtures/tributary");
        return f.fixtureLaunch(fx() as string);
      }
      const t = token as Address;
      const curve = (await publicClient.readContract({ address: ADDR.factory, abi: ammoraLaunchFactoryV4Abi, functionName: "curveForToken", args: [t] })) as Address;
      if (!curve || curve === ZERO) throw new NotFoundError();
      const [snap, uri] = await Promise.all([
        readCurveSnapshot(curve, t),
        publicClient.readContract({ address: ADDR.factory, abi: ammoraLaunchFactoryV4Abi, functionName: "creatorMetadataURI", args: [curve] }).catch(() => ""),
      ]);
      return { token: t, curve, snap, meta: decodeTributaryMetadata(uri as string) };
    },
  });
}

/** The creation record (block, tx). Needed for the launch date and the allocation. Scans back until found. */
export function useLaunchRecord(token: string | undefined, enabled: boolean) {
  return useQuery<LaunchRecord | null>({
    queryKey: ["rec", token?.toLowerCase()],
    enabled: enabled && !!token,
    staleTime: Infinity,
    queryFn: async () => {
      if (import.meta.env.DEV && fx()) return (await import("../fixtures/tributary")).fixtureRecord;
      return findLaunch(token as Address);
    },
  });
}

export function useBlockTime(block: bigint | undefined) {
  return useQuery({
    queryKey: ["blocktime", block?.toString()],
    enabled: block !== undefined,
    staleTime: Infinity,
    queryFn: async () => Number((await publicClient.getBlock({ blockNumber: block as bigint })).timestamp) * 1000,
  });
}

export function useVault(vault: Address | undefined) {
  return useQuery({
    queryKey: ["vault", vault?.toLowerCase()],
    enabled: !!vault,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (import.meta.env.DEV && fx()) return (await import("../fixtures/tributary")).fixtureVault(fx() as string);
      return readVaultSnapshot(vault as Address);
    },
  });
}

export type KatkiInfo = {
  file: KatkiFile | null;
  history: RepoContributor[] | null;
  repo: RepoInfo | null;
  notes: string[];
  /** What .katki.json looked like at the recorded commit (404 / invalid / unreachable / ok). */
  katki: KatkiState;
  provenance: RepoCheck;
  handles: RepoCheck;
};

/** Handles and commit counts for a launch's recipients. Best effort: GitHub may be rate limited. */
export function useKatkiInfo(meta: TributaryMeta | null) {
  return useQuery<KatkiInfo>({
    queryKey: ["katki-info", meta?.repo, meta?.katkiCommit],
    enabled: !!meta,
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: async () => {
      if (import.meta.env.DEV && fx()) return (await import("../fixtures/tributary")).fixtureInfoAsync(fx() as string);
      const ref = parseRepoInput((meta as TributaryMeta).repo);
      if (!ref) return { file: null, history: null, repo: null, notes: ["The repository name in the launch metadata is not valid."], katki: { state: "invalid" } as KatkiState, provenance: { state: "ok" } as RepoCheck, handles: { state: "ok" } as RepoCheck };
      const notes: string[] = [];
      let file: KatkiFile | null = null;
      let history: RepoContributor[] | null = null;
      let repo: RepoInfo | null = null;
      const kr = await readKatkiState((meta as TributaryMeta).repo, (meta as TributaryMeta).katkiCommit);
      file = kr.file;
      if (kr.state.state === "unavailable") notes.push(`.katki.json could not be read from GitHub (${kr.state.reason}).`);
      else if (!file) notes.push(".katki.json is missing or invalid at the recorded commit.");
      try {
        history = await getContributors(ref);
      } catch (e) {
        notes.push((e as Error).message);
      }
      try {
        repo = await getRepoInfo(ref);
      } catch {
        /* optional */
      }
      return { file, history, repo, notes, katki: kr.state, provenance: kr.provenance, handles: kr.handles };
    },
  });
}

export function useAllocation(rec: LaunchRecord | null | undefined, creator: Address | undefined, curve: Address | undefined) {
  return useQuery<AllocationRead>({
    queryKey: ["alloc", rec?.token.toLowerCase()],
    enabled: !!rec && !!creator && !!curve,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      if (import.meta.env.DEV && fx()) return (await import("../fixtures/tributary")).fixtureAllocation();
      return readAllocation({ token: (rec as LaunchRecord).token, curve: curve as Address, creator: creator as Address, txHash: (rec as LaunchRecord).txHash, block: (rec as LaunchRecord).block });
    },
  });
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
