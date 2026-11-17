/**
 * Contributor Launchpad - Ammora SDK read-only spike (GIWA Sepolia, chain 91342).
 *
 * Salt-okuma: private key yok, islem gonderilmez. Yalnizca eth_call / getLogs / HTTP GET.
 * Calistir: cd spike && npm i && npx tsx read.ts
 *
 * Adimlar bagimsizdir; bir adim basarisiz olursa nedeni basilir ve digerleri surer.
 */
import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  AmmoraDataApiClient,
  AmmoraTokenLockClient,
  AmmoraV4LaunchCurveClient,
  DFSFactoryClient,
  createAmmoraDeploymentSource,
  ammoraEligibilityGuardAbi,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
  buildCreateAmmoraV4Launch,
  buildCreateExistingConfigAmmoraV4LaunchAndCall,
  buildCreateAmmoraV4Config,
  classifyAmmoraV4ExactInputFill,
  getAmmoraV4ConfigAtBlock,
  giwaSepoliaAutoRouteDeployment as DEP,
  giwaSepoliaAtomicLaunchTargets,
  giwaSepoliaTokenLockDeployment,
  planCreateAmmoraV4Config,
  previewAmmoraLaunchFeeDistribution,
  type AmmoraV4Config,
  type AmmoraV4Segment,
} from "@ammora-protocol/sdk";

// ---------------------------------------------------------------- yardimcilar
const DATA_API = process.env.DATA_API_URL ?? "https://ammora-giwa-sepolia-data.fly.dev";
const RPC = process.env.GIWA_RPC_URL ?? DEP.chain.rpcUrls[0];
const WETH = DEP.contracts.tokens.wrappedNative as Address;
const FACTORY = DEP.contracts.launch.factory as Address;
const REGISTRY = DEP.contracts.launch.configRegistry as Address;
const FEE_POLICY = DEP.contracts.launch.feePolicy as Address;
const FEE_SHARING_FACTORY = getAddress(DEP.contracts.feeSharing.factory);
/** DFS istemcisi varsayilan olarak ESKI (legacy) kasa fabrikasini bekler; auto-route icin kaynak acikca verilmeli. */
const DFS_OPTIONS = { deploymentSource: createAmmoraDeploymentSource([DEP]) };

const results: { name: string; ok: boolean; note?: string }[] = [];
const json = (v: unknown, space = 0) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), space);
const short = (s: string, n = 160) => (s.length > n ? s.slice(0, n) + `...(${s.length} karakter)` : s);
const errMsg = (e: unknown) => {
  const x = e as { shortMessage?: string; details?: string; message?: string };
  return short((x.shortMessage ?? x.message ?? String(e)).replace(/\s+/g, " "), 300) + (x.details ? ` | ${short(x.details, 200)}` : "");
};
const log = (...a: unknown[]) => console.log(...a);
async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  log(`\n=== ${name}`);
  try {
    const r = await fn();
    results.push({ name, ok: true });
    return r;
  } catch (e) {
    log(`  [BASARISIZ] ${errMsg(e)}`);
    results.push({ name, ok: false, note: errMsg(e) });
    return undefined;
  }
}
/** Rastgele 20 bayt -> adres. Anahtar uretilmez; yalnizca eth_call "from" degeri. */
const randomAddress = (): Address => getAddress(("0x" + randomBytes(20).toString("hex")) as Hex);

/** Commit sayilarindan basis point agirligi (toplam tam 10000, en buyuk kalan yontemi). */
export function commitsToBps(commits: Record<string, number>): Record<string, number> {
  const entries = Object.entries(commits).filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (total === 0) throw new Error("toplam commit 0");
  const raw = entries.map(([k, n]) => ({ k, exact: (n * 10000) / total }));
  const out = raw.map((r) => ({ k: r.k, bps: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let left = 10000 - out.reduce((a, r) => a + r.bps, 0);
  for (const r of [...out].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    r.bps += 1;
    left -= 1;
  }
  return Object.fromEntries(out.map((r) => [r.k, r.bps]));
}

// -------------------------------------------------------------------- istemci
const chain = defineChain({
  id: DEP.chain.id,
  name: DEP.chain.name,
  nativeCurrency: DEP.chain.nativeCurrency,
  rpcUrls: { default: { http: [RPC] } },
});
const client: PublicClient = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 6, retryDelay: 500 }) });

type LaunchRow = { token: Address; curve: Address; creator: Address; configId: bigint; block: bigint };

async function main() {
  // 1 ---------------------------------------------------------------- zincir
  const head = (await step("1. Zincir baglantisi", async () => {
    const id = await client.getChainId();
    const block = await client.getBlockNumber();
    log(`  rpc=${RPC}`);
    log(`  chainId=${id} (beklenen ${DEP.chain.id}) head=${block}`);
    if (id !== DEP.chain.id) throw new Error(`yanlis zincir ${id}`);
    return block;
  })) as bigint | undefined;
  if (head === undefined) return finish();

  // 2 ------------------------------------------------- SDK sabitleri (adresler)
  await step("2. SDK sabit adresleri (giwaSepoliaAutoRouteDeployment)", async () => {
    const c = DEP.contracts;
    log(`  launch.factory               ${c.launch.factory}`);
    log(`  launch.configRegistry        ${c.launch.configRegistry}`);
    log(`  launch.feePolicy             ${c.launch.feePolicy}`);
    log(`  launch.graduationAdapter     ${c.launch.graduationAdapter}`);
    log(`  launch.firstBuyExecutor      ${c.launch.firstBuyExecutor}`);
    log(`  feeSharing.factory (DFS)     ${c.feeSharing.factory}`);
    log(`  tokenLock.factory            ${giwaSepoliaTokenLockDeployment.factory}`);
    log(`  tokenPolicyRegistry          ${c.policy.tokenPolicyRegistry}`);
    log(`  wrappedNative (WETH)         ${c.tokens.wrappedNative}`);
    log(`  atomic targets               ${json(giwaSepoliaAtomicLaunchTargets)}`);
    for (const a of [FACTORY, REGISTRY, FEE_POLICY, FEE_SHARING_FACTORY, giwaSepoliaTokenLockDeployment.factory]) {
      const code = await client.getCode({ address: a });
      log(`  bytecode ${a}: ${code && code !== "0x" ? `${(code.length - 2) / 2} bayt` : "YOK"}`);
    }
  });

  // 3 ------------------------------------------------------- launch kesfi
  let launches: LaunchRow[] = [];
  await step("3a. Data API (launch listesi)", async () => {
    log(`  url=${DATA_API}`);
    const res = await fetch(`${DATA_API}/v1/tokens?chainId=${DEP.chain.id}`, { signal: AbortSignal.timeout(25_000) });
    log(`  GET /v1/tokens?chainId=91342 -> HTTP ${res.status}`);
    if (!res.ok) throw new Error(`Data API HTTP ${res.status} (servis kapali/uyaniyor olabilir); zincirden okumaya dusulecek`);
    const api = new AmmoraDataApiClient(DATA_API);
    const page = await api.getLaunches({ chainId: BigInt(DEP.chain.id) });
    log(`  items=${page.items.length} nextCursor=${page.nextCursor}`);
    const first = page.items[0];
    if (first) {
      const { metadataUri, ...rest } = first;
      log(`  ornek alanlar: ${json({ ...rest, metadataUri: short(metadataUri, 60) })}`);
      const detail = await api.getLaunch(BigInt(DEP.chain.id), first.address);
      log(`  getLaunch alanlari: ${Object.keys(detail).join(", ")}`);
    }
  });

  await step("3b. Zincirden LaunchCreated olaylari (Data API yedegi)", async () => {
    const ev = ammoraLaunchFactoryV4Abi.find((x) => x.type === "event" && x.name === "LaunchCreated");
    if (!ev || ev.type !== "event") throw new Error("LaunchCreated ABI yok");
    const STEP = 10_000n; // RPC getLogs araligi siniri: 10k blok (12k reddedildi)
    const ranges: [bigint, bigint][] = [];
    const CHUNKS = 12n; // RPC hiz siniri (429 "over rate limit") nedeniyle kucuk tutuldu
    for (let i = 0n; i < CHUNKS; i++) ranges.push([head - (i + 1n) * STEP + 1n, head - i * STEP]);
    const parts: Awaited<ReturnType<typeof client.getLogs<typeof ev>>>[] = [];
    for (let i = 0; i < ranges.length; i += 3) {
      const batch = ranges.slice(i, i + 3);
      parts.push(
        ...(await Promise.all(batch.map(([f, t]) => client.getLogs({ address: FACTORY, event: ev, fromBlock: f, toBlock: t })))),
      );
    }
    launches = parts
      .flat()
      .map((l) => ({
        token: (l.args as { token: Address }).token,
        curve: (l.args as { curve: Address }).curve,
        creator: (l.args as { creator: Address }).creator,
        configId: (l.args as { configId: bigint }).configId,
        block: l.blockNumber,
      }))
      .sort((a, b) => (a.block > b.block ? -1 : 1));
    log(`  son ${CHUNKS * STEP} blokta ${launches.length} launch (fabrika ${FACTORY})`);
    for (const l of launches.slice(0, 3)) log(`  ${l.block} token=${l.token} curve=${l.curve} creator=${l.creator} config=${l.configId}`);
    if (launches.length === 0) throw new Error("pencerede launch yok");
  });

  // 4 ------------------------------------------------ launch durumu + teklif
  const core = { launchFactory: FACTORY, feePolicy: FEE_POLICY };
  let picked: LaunchRow | undefined;
  let pickedStatus = -1;
  await step("4a. Launch curve durumu (getStateAtBlock)", async () => {
    for (const l of launches.slice(0, 12)) {
      const c = new AmmoraV4LaunchCurveClient(client, l.curve, core);
      const st = await c.getStateAtBlock(head);
      if (!picked || (st.status === 1 && pickedStatus !== 1)) {
        picked = l;
        pickedStatus = st.status;
      }
      if (pickedStatus === 1) break;
    }
    if (!picked) {
      picked = { token: "0x036b035533B42D6f6459C04E2D902A452250f2c7", curve: "0x00CB332e63065c600574dE1F6B99BC2662Cec90A", creator: "0x13cD27a6E337097dB858C9C4FA472FbAd2F2c637", configId: 22n, block: 0n };
      log("  (yedek) VESTING.md'deki bilinen curve kullaniliyor");
    }
    const c = new AmmoraV4LaunchCurveClient(client, picked.curve, core);
    const st = await c.getStateAtBlock(head);
    pickedStatus = st.status;
    log(`  curve=${picked.curve} token=${st.baseToken}`);
    log(`  status=${st.status} (0 Uninit,1 Active,2 ReadyToMigrate,3 Migrated) configId=${st.configId}`);
    log(`  quoteToken=${st.quoteToken} creator=${st.creator} partnerRecipient=${st.partnerRecipient}`);
    log(`  feeVault=${st.feeVault} canonicalPool=${st.canonicalPool}`);
    log(`  reserves base=${st.baseReserve} quote=${st.quoteReserve} thresholdQuote=${st.migrationQuoteThreshold} feeBps=${st.currentFeeBps}`);
    const prog = await c.getMigrationProgressAtBlock(head);
    log(`  mezuniyet: ready=${prog.ready} migrated=${prog.migrated} ${prog.current}/${prog.target} (${prog.progressBps} bps)`);
  });

  await step("4b. Alim teklifi (quoteExactInputAtBlock) ve dolum siniflamasi", async () => {
    if (!picked) throw new Error("secili launch yok");
    const c = new AmmoraV4LaunchCurveClient(client, picked.curve, core);
    const amountIn = 10n ** 14n; // 0.0001 WETH
    for (const baseForQuote of [false] as const) {
      try {
        const q = await c.quoteExactInputAtBlock(amountIn, baseForQuote, head);
        const fill = classifyAmmoraV4ExactInputFill(q, baseForQuote);
        log(`  buy ${amountIn} raw WETH -> out=${q.amountOut} left=${q.amountLeft} fee=${q.fee} fill=${fill.kind}`);
      } catch (e) {
        log(`  buy teklifi alinamadi (status=${pickedStatus}; migrate olmus curve'de teklif beklenmez): ${errMsg(e)}`);
        if (pickedStatus === 1) throw e;
      }
    }
    if (pickedStatus === 3) log("  NOT: secilen curve zaten mezun (Migrated); aktif curve bulunamadi -> quote dogrulanamadi");
  });

  // 5 ------------------------------------------------------ Config okuma
  let cfg: { config: AmmoraV4Config; segments: readonly AmmoraV4Segment[]; id: bigint } | undefined;
  await step("5. Config okuma (getAmmoraV4ConfigAtBlock)", async () => {
    const id = picked ? (await new AmmoraV4LaunchCurveClient(client, picked.curve, core).getStateAtBlock(head)).configId : 6n;
    const snap = await getAmmoraV4ConfigAtBlock(client, REGISTRY, id, head);
    cfg = { config: snap.config, segments: snap.segments, id };
    const c = snap.config;
    log(`  configId=${id} enabled=${snap.enabled} owner=${snap.identity.owner} feeClaimer=${snap.identity.feeClaimer}`);
    log(`  partnerRecipient=${c.partnerRecipient} creatorShareOfNonProtocolBps=${c.creatorShareOfNonProtocolBps}`);
    log(`  collectFeeMode=${c.collectFeeMode} (0 QuoteToken,1 OutputToken) poolCreationFee=${c.poolCreationFee} tokenDecimals=${c.tokenDecimals}`);
    log(`  migrationMode=${c.migrationMode} liquidityDistribution.partner=${c.liquidityDistribution.partner}`);
    log(`  liquidityDistribution bps: partnerUnlocked=${c.liquidityDistribution.partnerUnlockedBps} partnerPermLocked=${c.liquidityDistribution.partnerPermanentLockedBps} creatorPermLocked=${c.liquidityDistribution.creatorPermanentLockedBps}`);
    log(`  activationDelay=${c.activationDelay} activationType=${c.activationType} segments=${snap.segments.length}`);
    const prev = previewAmmoraLaunchFeeDistribution(10_000n, c.creatorShareOfNonProtocolBps, false);
    log(`  ornek: 10000 birim ucret -> ${json(prev)}`);
  });

  // 6 ---------------------------------------------- calldata build (gonderilmez)
  let createLaunchData: { data: Hex; value: bigint } | undefined;
  await step("6. createLaunch calldata (build, gonderilmez)", async () => {
    if (!cfg) throw new Error("config okunamadi");
    const launch = {
      name: "Spike Token",
      symbol: "SPK",
      metadataURI: "ipfs://spike-placeholder",
      creatorMetadataURI: "",
      tokenDecimals: cfg.config.tokenDecimals,
    };
    createLaunchData = buildCreateAmmoraV4Launch(launch, cfg.id, cfg.config.poolCreationFee);
    log(`  buildCreateAmmoraV4Launch -> data uzunlugu ${(createLaunchData.data.length - 2) / 2} bayt, value=${createLaunchData.value} wei, selector=${createLaunchData.data.slice(0, 10)}`);
    const cfgCall = buildCreateAmmoraV4Config(cfg.config, cfg.segments, randomAddress());
    log(`  buildCreateAmmoraV4Config -> data uzunlugu ${(cfgCall.data.length - 2) / 2} bayt, selector=${cfgCall.data.slice(0, 10)}`);
    const withCb = buildCreateExistingConfigAmmoraV4LaunchAndCall(
      { ...launch, callback: randomAddress(), callbackData: "0x" },
      cfg.id,
      cfg.config.poolCreationFee,
    );
    log(`  buildCreateExistingConfigAmmoraV4LaunchAndCall -> ${(withCb.data.length - 2) / 2} bayt`);
  });

  // 7 --------------------------------------------- eth_call simulasyonlari
  const sender = randomAddress();
  await step("7a. eth_call createLaunch (rastgele from, bakiyesiz)", async () => {
    if (!createLaunchData) throw new Error("calldata yok");
    log(`  from=${sender} (rastgele, anahtarsiz)`);
    try {
      const r = await client.call({ account: sender, to: FACTORY, data: createLaunchData.data, value: createLaunchData.value, blockNumber: head });
      log(`  SONUC: basarili, donus=${short(r.data ?? "0x", 100)}`);
    } catch (e) {
      log(`  SONUC: revert/hata -> ${errMsg(e)}`);
    }
  });
  await step("7b. eth_call createLaunch (stateOverride ile sanal bakiye)", async () => {
    if (!createLaunchData) throw new Error("calldata yok");
    try {
      const r = await client.call({
        account: sender,
        to: FACTORY,
        data: createLaunchData.data,
        value: createLaunchData.value,
        blockNumber: head,
        stateOverride: [{ address: sender, balance: 10n ** 18n }],
      });
      log(`  SONUC: basarili (gercek islem degil, eth_call), donus=${short(r.data ?? "0x", 100)}`);
      const gas = await client
        .estimateGas({ account: sender, to: FACTORY, data: createLaunchData.data, value: createLaunchData.value, stateOverride: [{ address: sender, balance: 10n ** 18n }] })
        .catch((e) => `tahmin yok: ${errMsg(e)}`);
      log(`  gas tahmini: ${gas}`);
    } catch (e) {
      log(`  SONUC: revert/hata -> ${errMsg(e)}`);
    }
  });
  await step("7c. eth_call createLaunchAndCall (onaysiz rastgele callback)", async () => {
    if (!cfg) throw new Error("config yok");
    const cb = randomAddress();
    const approved = await client.readContract({ address: FACTORY, abi: ammoraLaunchFactoryV4Abi, functionName: "isLaunchCallbackApproved", args: [cb] });
    const fbe = getAddress(DEP.contracts.launch.firstBuyExecutor);
    const fbeApproved = await client.readContract({ address: FACTORY, abi: ammoraLaunchFactoryV4Abi, functionName: "isLaunchCallbackApproved", args: [fbe] });
    log(`  isLaunchCallbackApproved(rastgele)=${approved}  isLaunchCallbackApproved(firstBuyExecutor ${fbe})=${fbeApproved}`);
    const d = buildCreateExistingConfigAmmoraV4LaunchAndCall(
      { name: "X", symbol: "X", metadataURI: "ipfs://x", creatorMetadataURI: "", tokenDecimals: cfg.config.tokenDecimals, callback: cb, callbackData: "0x" },
      cfg.id,
      cfg.config.poolCreationFee,
    );
    try {
      await client.call({ account: sender, to: FACTORY, data: d.data, value: d.value, blockNumber: head, stateOverride: [{ address: sender, balance: 10n ** 18n }] });
      log("  SONUC: basarili (beklenmedik)");
    } catch (e) {
      log(`  SONUC: revert -> ${errMsg(e)}`);
    }
  });
  await step("7d. Config olusturma simulasyonu (planCreateAmmoraV4Config, partnerRecipient=DFS kasasi tahmini)", async () => {
    if (!cfg) throw new Error("config yok");
    // DFS kasa adresi once tahmin edilir (asagidaki adim 8 ile ayni parametreler)
    const dfs = new DFSFactoryClient(client, FEE_SHARING_FACTORY, DFS_OPTIONS);
    const pre = await dfs.getVaultCreationPreflight({
      owner: sender,
      token: WETH,
      base: WETH,
      recipients: demoRecipients(),
      userSalt: ("0x" + "11".repeat(32)) as Hex,
    });
    log(`  tahmini kasa=${pre.predictedVault}`);
    const edited: AmmoraV4Config = {
      ...cfg.config,
      partnerRecipient: pre.predictedVault,
      creatorShareOfNonProtocolBps: 0,
      leftoverReceiver: pre.predictedVault,
      liquidityDistribution: { ...cfg.config.liquidityDistribution, partner: pre.predictedVault },
    };
    try {
      const plan = await planCreateAmmoraV4Config(client, REGISTRY, edited, cfg.segments, sender, sender);
      log(`  SONUC: simulasyon basarili: expectedConfigId=${plan.expectedConfigId} simulatedConfigId=${plan.simulatedConfigId} hash=${plan.simulatedConfigHash}`);
      log(`  tx.to=${plan.transaction.to} data=${(plan.transaction.data.length - 2) / 2} bayt`);
    } catch (e) {
      log(`  SONUC: revert/hata -> ${errMsg(e)}`);
    }
  });

  await step("7e. Config varyantlari (eth_call): LP payi tamamen 'partner'a, creator payi 0", async () => {
    if (!cfg) throw new Error("config yok");
    const vault = randomAddress(); // yalnizca simulasyon icin sahte alici
    const base: AmmoraV4Config = {
      ...cfg.config,
      partnerRecipient: vault,
      creatorShareOfNonProtocolBps: 0,
      leftoverReceiver: vault,
    };
    const variants: Record<string, AmmoraV4Config> = {
      "A) mevcut LP dagilimi (partner 6250 / creator 3750 kalici kilit)": { ...base, liquidityDistribution: { ...cfg.config.liquidityDistribution, partner: vault } },
      "B) LP: partner 10000 kalici kilit, creator 0": {
        ...base,
        liquidityDistribution: { ...cfg.config.liquidityDistribution, partner: vault, partnerUnlockedBps: 0, partnerPermanentLockedBps: 10000, creatorPermanentLockedBps: 0 },
      },
      "C) creatorShareOfNonProtocolBps=10000 (tum ucret Creator'a)": { ...base, creatorShareOfNonProtocolBps: 10000, liquidityDistribution: { ...cfg.config.liquidityDistribution, partner: vault } },
      "D) NEGATIF KONTROL: LP bps toplami 10001 (reddedilmeli)": {
        ...base,
        liquidityDistribution: { ...cfg.config.liquidityDistribution, partner: vault, partnerPermanentLockedBps: 10000, creatorPermanentLockedBps: 1 },
      },
    };
    for (const [name, c] of Object.entries(variants)) {
      try {
        const plan = await planCreateAmmoraV4Config(client, REGISTRY, c, cfg.segments, sender, sender);
        log(`  ${name}: SIMULASYON BASARILI (configId=${plan.simulatedConfigId})`);
      } catch (e) {
        log(`  ${name}: RED -> ${errMsg(e)}`);
      }
    }
  });

  // 8 ------------------------------------------------------------ DFS
  await step("8. DFS (agirlikli kasa) onizleme", async () => {
    const dfs = new DFSFactoryClient(client, FEE_SHARING_FACTORY, DFS_OPTIONS);
    const commits = { alice: 120, bob: 60, carol: 15, dave: 5 };
    const bps = commitsToBps(commits);
    log(`  commit->bps: ${json(commits)} -> ${json(bps)} toplam=${Object.values(bps).reduce((a, b) => a + b, 0)}`);
    let hardFail: string | undefined;
    for (const n of [3, 5, 6]) {
      const recipients = demoRecipients(n);
      try {
        const pre = await dfs.getVaultCreationPreflight({ owner: sender, token: WETH, base: WETH, recipients, userSalt: ("0x" + "22".repeat(32)) as Hex });
        log(`  ${n} alici: ready=${pre.ready} issues=${json(pre.issues)} expectedSender=${pre.expectedSender} predictedVault=${pre.predictedVault}`);
        log(`           tokenPolicy(WETH)=${json(pre.tokenPolicy)} tx.to=${pre.transaction.to} data=${(pre.transaction.data.length - 2) / 2} bayt`);
      } catch (e) {
        log(`  ${n} alici: SDK hatasi -> ${errMsg(e)}`);
        if (n <= 5) hardFail = errMsg(e); // 6 alicinin reddedilmesi beklenen davranis olabilir
      }
    }
    if (hardFail) throw new Error(hardFail);
  });

  // 8b ------------------------------------------------------- TokenLock
  await step("8b. TokenLock dagitimi dogrulama ve halka acik test kilidi okuma", async () => {
    const tl = new AmmoraTokenLockClient(client, giwaSepoliaTokenLockDeployment);
    const snap = await tl.verifyAtBlock(head);
    log(`  verifyAtBlock(${head}) -> blok ${snap.blockNumber} zaman ${snap.timestamp}`);
    const lock = "0x852Dc7B07361C9bab17024f20F25804502728f07" as Address; // VESTING.md: tamamlanmis halka acik test kilidi
    const st = await tl.readAtBlock(lock, head);
    log(`  kilit ${lock}: token=${st.token} recipient=${st.recipient} total=${st.totalAmount} claimed=${st.totalClaimed} completed=${st.completed} claimable=${st.claimable}`);
  });

  // 9 -------------------------------------------------------- erken erisim
  await step("9. Erken erisim kisiti: curve ABI'sinde guard/allowlist var mi", async () => {
    const names = ammoraLaunchPoolV4Abi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name);
    const hit = names.filter((n) => /guard|allow|whitelist|eligib|restrict|permit|operator/i.test(n));
    log(`  V4 curve fonksiyonlari (${names.length}): ${names.join(", ")}`);
    log(`  guard/allowlist ile ilgili: ${hit.length ? hit.join(", ") : "YOK"}`);
    const fnames = ammoraLaunchFactoryV4Abi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name);
    log(`  fabrika fonksiyonlari: ${fnames.join(", ")}`);
    log(`  EligibilityGuard ABI fonksiyonlari: ${ammoraEligibilityGuardAbi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name).join(", ")} (adres SDK sabitlerinde YOK)`);
    // Data API restricted market kaydi (varsa)
    try {
      const res = await fetch(`${DATA_API}/v1/restricted-markets?chainId=${DEP.chain.id}`, { signal: AbortSignal.timeout(15_000) });
      log(`  Data API restricted markets -> HTTP ${res.status}`);
    } catch (e) {
      log(`  Data API restricted markets erisilemedi: ${errMsg(e)}`);
    }
  });

  finish();
}

function demoRecipients(n = 3): { recipient: Address; share: bigint }[] {
  const shares = [6000n, 3000n, 1000n, 500n, 250n, 100n];
  // sabit (deterministik) sahte adresler: kasa tahmini tekrarlanabilir olsun
  return Array.from({ length: n }, (_, i) => ({
    recipient: getAddress(("0x" + (i + 1).toString(16).padStart(40, "a")) as Hex),
    share: shares[i] ?? 1n,
  }));
}

function finish() {
  log("\n=== OZET");
  for (const r of results) log(`  ${r.ok ? "OK      " : "BASARISIZ"} ${r.name}${r.note ? " -> " + r.note : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  log(`\n${results.length - failed}/${results.length} adim basarili. Islem gonderilmedi, anahtar kullanilmadi.`);
}

main().catch((e) => {
  console.error("beklenmeyen hata:", errMsg(e));
  finish();
});
