/**
 * Launch discovery and reads against GIWA Sepolia. Everything shown comes from here; nothing is invented.
 *
 * Discovery: Data API first (if it answers), otherwise LaunchCreated logs scanned in 10,000-block chunks,
 * 3 in parallel with retry. Results are cached in localStorage so a return visit only scans new blocks.
 */
import { erc20Abi, type Address, type Hex, type PublicClient } from "viem";
import {
  AmmoraV4LaunchCurveClient,
  DFSClient,
  ammoraLaunchFactoryV4Abi,
  feeVaultAbi,
  ammoraAFSFactoryAbi,
  getAmmoraV4ConfigAtBlock,
  type AmmoraV4Config,
} from "@ammora-protocol/sdk";
import { ADDR, DATA_API, TEMPLATE_CONFIG_ID, core, dfsOptions, publicClient } from "./chain";
import { decodeTributaryMetadata, type TributaryMeta } from "./metadata";
import { scanRanges, splitRangesNewestFirst, splitRanges, type Range } from "./logs";
import type { Segment } from "./curveMath";

export type LaunchRecord = {
  token: Address;
  curve: Address;
  creator: Address;
  configId: bigint;
  block: bigint;
  txHash: Hex;
  meta: TributaryMeta | null;
};

const launchCreated = ammoraLaunchFactoryV4Abi.find((x) => x.type === "event" && x.name === "LaunchCreated");
if (!launchCreated || launchCreated.type !== "event") throw new Error("LaunchCreated ABI is missing from the SDK.");

export async function fetchCreatedRange(client: PublicClient, r: Range, token?: Address): Promise<LaunchRecord[]> {
  const logs = await client.getLogs({
    address: ADDR.factory,
    event: launchCreated as never,
    args: token ? ({ token } as never) : undefined,
    fromBlock: r.from,
    toBlock: r.to,
  });
  return (logs as unknown as { args: { token: Address; curve: Address; creator: Address; configId: bigint; metadataURI: string }; blockNumber: bigint; transactionHash: Hex }[]).map((l) => ({
    token: l.args.token,
    curve: l.args.curve,
    creator: l.args.creator,
    configId: l.args.configId,
    block: l.blockNumber,
    txHash: l.transactionHash,
    meta: decodeTributaryMetadata(l.args.metadataURI),
  }));
}

/* ------------------------------------------------------------------ cache */

const CACHE_KEY = "trib:scan:v1";
type Cache = { from: bigint; to: bigint; launches: LaunchRecord[] };

function loadCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { from: string; to: string; launches: (Omit<LaunchRecord, "configId" | "block"> & { configId: string; block: string })[] };
    return { from: BigInt(j.from), to: BigInt(j.to), launches: j.launches.map((l) => ({ ...l, configId: BigInt(l.configId), block: BigInt(l.block) })) };
  } catch {
    return null;
  }
}
function saveCache(c: Cache) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ from: c.from.toString(), to: c.to.toString(), launches: c.launches.map((l) => ({ ...l, configId: l.configId.toString(), block: l.block.toString() })) }),
    );
  } catch {
    /* blocked or full: the scan just runs again next time */
  }
}

/* ------------------------------------------------------------- data api */

type ApiItem = { address: Address; curveAddress: Address; creatorAddress: Address; configId: string; metadataUri: string; createdBlock: string; createdTxHash: Hex };

/** Tries the Data API. Returns null on any failure (it has been down: HTTP 503). Shape taken from SDK types, not seen live. */
export async function fetchFromDataApi(signal?: AbortSignal): Promise<LaunchRecord[] | null> {
  try {
    const out: LaunchRecord[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const url = `${DATA_API}/v1/tokens?chainId=91342${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(4000), ...(signal ? [signal] : [])]) });
      if (!res.ok) return null;
      const j = (await res.json()) as { items?: ApiItem[]; nextCursor?: string | null };
      if (!Array.isArray(j.items)) return null;
      for (const it of j.items) {
        out.push({
          token: it.address,
          curve: it.curveAddress,
          creator: it.creatorAddress,
          configId: BigInt(it.configId),
          block: BigInt(it.createdBlock),
          txHash: it.createdTxHash,
          meta: decodeTributaryMetadata(it.metadataUri),
        });
      }
      cursor = j.nextCursor ?? null;
      if (!cursor) break;
    }
    return out;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- discovery */

export const DEFAULT_LOOKBACK = 200_000n; // about 2.3 days at 1 s blocks
export type DiscoveryState = {
  launches: LaunchRecord[];
  scannedFrom: bigint;
  head: bigint;
  source: "data-api" | "chain";
  done: boolean;
};

/**
 * Streams discovery results through `onUpdate`. `extend` scans another `lookback` blocks further back.
 */
export async function discoverLaunches(opts: {
  client?: PublicClient;
  lookback?: bigint;
  extend?: boolean;
  signal?: AbortSignal;
  onUpdate: (s: DiscoveryState) => void;
}): Promise<DiscoveryState> {
  const client = opts.client ?? publicClient;
  const lookback = opts.lookback ?? DEFAULT_LOOKBACK;
  const head = await client.getBlockNumber();

  if (!opts.extend) {
    const api = await fetchFromDataApi(opts.signal);
    if (api) {
      const s: DiscoveryState = { launches: api.sort((a, b) => (a.block > b.block ? -1 : 1)), scannedFrom: 0n, head, source: "data-api", done: true };
      opts.onUpdate(s);
      return s;
    }
  }

  const cache = loadCache();
  const byToken = new Map<string, LaunchRecord>();
  let from = head - lookback < 0n ? 0n : head - lookback;
  let to = head;
  const ranges: Range[] = [];
  if (cache) {
    cache.launches.forEach((l) => byToken.set(l.token.toLowerCase(), l));
    // new blocks since the last visit, then (if asked) further back
    if (head > cache.to) ranges.push(...splitRangesNewestFirst(cache.to + 1n, head));
    from = cache.from;
    if (opts.extend) {
      const older = cache.from - lookback < 0n ? 0n : cache.from - lookback;
      if (cache.from > 0n) ranges.push(...splitRangesNewestFirst(older, cache.from - 1n));
      from = older;
    } else if (cache.from > head - lookback) {
      const older = head - lookback < 0n ? 0n : head - lookback;
      ranges.push(...splitRangesNewestFirst(older, cache.from - 1n));
      from = older;
    }
  } else {
    ranges.push(...splitRangesNewestFirst(from, to));
  }
  to = head;

  const emit = (done: boolean): DiscoveryState => {
    const launches = [...byToken.values()].sort((a, b) => (a.block > b.block ? -1 : 1));
    return { launches, scannedFrom: from, head, source: "chain", done };
  };
  opts.onUpdate(emit(ranges.length === 0));
  if (ranges.length === 0) return emit(true);

  await scanRanges(ranges, (r) => fetchCreatedRange(client, r), {
    signal: opts.signal,
    onChunk: (_r, items) => {
      items.forEach((l) => byToken.set(l.token.toLowerCase(), l));
      if (items.length) opts.onUpdate(emit(false));
    },
  });
  const final = emit(true);
  saveCache({ from, to, launches: final.launches });
  opts.onUpdate(final);
  return final;
}

/** Finds one launch's creation record by scanning backwards (used when a launch page is opened directly). */
export async function findLaunch(token: Address, opts: { client?: PublicClient; maxBlocks?: bigint; signal?: AbortSignal } = {}): Promise<LaunchRecord | null> {
  const client = opts.client ?? publicClient;
  const cached = loadCache()?.launches.find((l) => l.token.toLowerCase() === token.toLowerCase());
  if (cached) return cached;
  const head = await client.getBlockNumber();
  const max = opts.maxBlocks ?? 600_000n;
  const lo = head - max < 0n ? 0n : head - max;
  const ranges = splitRangesNewestFirst(lo, head);
  // newest first in waves of 3 so a recent launch resolves after one round trip
  for (let i = 0; i < ranges.length; i += 3) {
    const wave = ranges.slice(i, i + 3);
    const found = (await scanRanges(wave, (r) => fetchCreatedRange(client, r, token), { signal: opts.signal })).find(Boolean);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------ live reads */

export type CurveSnapshot = {
  head: bigint;
  state: Awaited<ReturnType<AmmoraV4LaunchCurveClient["getStateAtBlock"]>>;
  progress: Awaited<ReturnType<AmmoraV4LaunchCurveClient["getMigrationProgressAtBlock"]>>;
  config: AmmoraV4Config;
  segments: readonly Segment[];
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
};

export async function readCurveSnapshot(curve: Address, token: Address, client: PublicClient = publicClient): Promise<CurveSnapshot> {
  const head = await client.getBlockNumber();
  const c = new AmmoraV4LaunchCurveClient(client, curve, core);
  const [state, progress] = await Promise.all([c.getStateAtBlock(head), c.getMigrationProgressAtBlock(head)]);
  const [cfg, name, symbol, decimals, totalSupply] = await Promise.all([
    getAmmoraV4ConfigAtBlock(client, ADDR.registry, state.configId, head),
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
  ]);
  return { head, state, progress, config: cfg.config, segments: cfg.segments, name, symbol, decimals, totalSupply };
}

export type VaultSnapshot = {
  vault: Address;
  owner: Address;
  token: Address;
  base: Address;
  /** DFS factory's own record (isVault): true, false, or null when it could not be read. */
  fromFactory: boolean | null;
  recipients: { index: number; recipient: Address; share: bigint; claimed: bigint; claimable: bigint }[];
  totalShare: bigint;
  totalFunded: bigint;
  totalClaimed: bigint;
  /** Fees credited to the vault by the launch contract that nobody has pulled into the vault yet. */
  pendingInFeeVault: bigint;
  feeVault: Address;
  claimSourceEnabled: boolean;
};

export async function readVaultSnapshot(vault: Address, client: PublicClient = publicClient): Promise<VaultSnapshot> {
  const dfs = new DFSClient(client, vault, dfsOptions);
  const feeVault = (await client.readContract({ address: ADDR.factory, abi: ammoraLaunchFactoryV4Abi, functionName: "feeVault" })) as Address;
  const [s, pending, claimSourceEnabled, fromFactory] = await Promise.all([
    dfs.getState(),
    client.readContract({ address: feeVault, abi: feeVaultAbi, functionName: "claimable", args: [ADDR.weth, vault] }) as Promise<bigint>,
    dfs.isClaimSource(feeVault),
    client.readContract({ address: ADDR.dfsFactory, abi: ammoraAFSFactoryAbi, functionName: "isVault", args: [vault] }).then((v) => v as boolean).catch(() => null),
  ]);
  return {
    vault,
    owner: s.owner,
    token: s.token,
    base: s.base,
    fromFactory,
    recipients: s.recipients.map((r) => ({ index: r.index, recipient: r.recipient, share: r.share, claimed: r.feeClaimed, claimable: r.claimable })),
    totalShare: s.totalShare,
    totalFunded: s.totalFunded,
    totalClaimed: s.totalClaimed,
    pendingInFeeVault: pending,
    feeVault,
    claimSourceEnabled,
  };
}

/** Reads the template Config used for every Tributary launch. null when it cannot be read (nothing is guessed). */
export async function readTemplateConfig(client: PublicClient = publicClient, id: bigint = TEMPLATE_CONFIG_ID) {
  try {
    const head = await client.getBlockNumber();
    return await getAmmoraV4ConfigAtBlock(client, ADDR.registry, id, head);
  } catch {
    return null;
  }
}

export { splitRanges };
