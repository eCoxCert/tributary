# Contributor Launchpad - Ammora SDK teknik keşif

Kapsam: `@ammora-protocol/sdk@0.3.10` + viem, GIWA Sepolia (chain id 91342, testnet). Salt-okuma; işlem gönderilmedi, anahtar kullanılmadı.
Doğrulama scripti: `spike/read.ts` (`cd spike && npm i && npx tsx read.ts`).

Kaynak kısaltmaları:
- `d.ts:N` = `spike/node_modules/@ammora-protocol/sdk/dist/index.d.ts` satır N
- `js:N` = aynı klasörde `index.js` satır N
- `LP.md:N` = ammora-examples `LAUNCHPAD.md`, `FS.md` = `FEE-SHARING.md`, `VE.md` = `VESTING.md`, `AG.md` = `AGENT-LAUNCHPAD.md`, `CF.md` = `docs/CONTRACT-FEATURES.md`
- "script" = `spike/read.ts` çıktısı (17 Kas 2026, blok ~41.56M)

Durum işaretleri: **[ONAYLI]** canlı zincirde (eth_call / okuma) ya da script çıktısında görüldü; **[KOD]** SDK kaynağından okundu, canlı denenmedi; **[doğrulanamadı]** kanıt yok.

## 0. Sürüm ve ortam notları

- npm `latest` etiketi 0.3.9; en yeni yayın 0.3.10 (etiket `release-0-3-10`). Spike 0.3.10 ile yazıldı. SDK içindeki `docs/release-0.3.10.md` "yayınlanmadı (candidate)" diyor ama sürüm npm'de var; ammora-examples rehberleri 0.3.9'a sabit. 0.3.9 ile script denenmedi [doğrulanamadı].
- Node 24, viem ^2.33, tsx. `npm i` temiz kurulumda hatasız.
- GIWA RPC (`https://sepolia-rpc.giwa.io`): `eth_getLogs` en fazla 10.000 blokluk aralık kabul ediyor (12.000 "Invalid parameters" ile reddedildi); art arda çok paralel istekte `over rate limit` dönüyor. Script bu yüzden 3'lü paralel + retry kullanıyor.
- Data API (`https://ammora-giwa-sepolia-data.fly.dev`) bu oturumda HTTP 503 / zaman aşımı verdi (curl ve script). Yanıt gövdeleri bu yüzden **görülemedi**; alan listeleri SDK tiplerinden. Ayrıca SDK istemcisi boş 503 gövdesinde `Body is unusable: Body has already been read` hatası veriyor (hata kodu maskeleniyor): üretimde kendi `fetch` sarmalayıcını ver ya da önce düz `fetch` ile durum kodunu kontrol et.

## 1. Kontrat adresleri ve RPC: SDK içinde nerede

Paket içinde ayrı bir JSON "deployments" dosyası yok. Adresler derlenmiş sabit olarak `dist/index.js` içinde, tipleriyle `dist/index.d.ts` içinde. `dist/build-manifest.json` yalnızca paket bütünlük özetidir (adres içermez). `createAmmoraDeploymentSourceFromReleaseManifests(...)` ile kendi yüklediğin "reviewed manifest" kullanılabilir (README.md:134-150) ama SDK manifest dosyası göndermiyor.

Kullanılacak sabit: **`giwaSepoliaAutoRouteDeployment`** (js:20748, d.ts:52192; "auto-route" nesil, rehberlerin varsayılanı, LP.md:11, LP.md:96). Eski nesil: `giwaSepoliaPermissionless` (js:3105; factory `0x1a30507113c5f3bc1b0d740b69548b499ebf83cf`, registry `0xd7e454ff6232158162b9a2fc498dda2c8d76abf9`). Nesilleri karıştırma (LP.md:120).

**GIWA Sepolia, auto-route (d.ts:52198-52255) [ONAYLI: script adım 2 bytecode'u gördü]**

| Alan | Adres |
|---|---|
| chain id / ad | 91342 / "GIWA Sepolia" |
| RPC (`chain.rpcUrls[0]`) | `https://sepolia-rpc.giwa.io` (d.ts:52254) |
| Explorer | `https://sepolia-explorer.giwa.io` |
| launch.factory (LaunchFactory V4) | `0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA` |
| launch.configRegistry | `0x6d043014972b87406C4757a5f2d655A24e0b0aF9` |
| launch.feePolicy | `0x17B44C14F640fD429740FA3220f47a567c62725C` |
| launch.graduationAdapter | `0xF1A0f23036Aae88EEcecd1D9205Dd78c388fe263` |
| launch.firstBuyExecutor | `0x1a19a3b0e69b33db3a2f9b2487866b4be04dd451` (factory'de callback onaylı) |
| launch.mathModule | `0xbF5f52525E7415896bCa7f7cBADcEB294dF173ef` |
| launch.concentratedFactory | `0x9eBD78f3839996014238728b4c9C2f2A4e6759Cb` |
| launch.concentratedPositionManager | `0x089163706d9956d7baeCeDF4eAb4aD6CcE7Ca2D6` |
| launch.concentratedFeeController | `0x71Fea1fb18647986C4e02D0D06BFb6dD2491F6fE` |
| launch.compoundingFactory | `0x303EaA3BcF86283CBfe3f0E01290C11452bF91cf` |
| launch.compoundingFeeController | `0x00eaab75E3EA5cc68d39Ba8b7E531a0F822e4A8b` |
| feeSharing.factory (DFS/AFS) | `0xb6131d1f86321c3de61f0e92fe136fa82e078927` |
| policy.tokenPolicyRegistry | `0xADD644Af3a868Ef4165e04CA5eac280ab5819bE3` |
| tokens.wrappedNative (WETH, quote) | `0x4200000000000000000000000000000000000006` |
| routers.native | `0xade9E6dEF440E05640ed07c4a701C238B9FB66a8` |
| routers.executionRegistry | `0x3CDD7cC246Cc49aEa779E5E589Bd175251617626` |
| routers.zap / permit / permit2 | `0x81f18aD1654A6dFc89388C8FFFFc7BB616a9f6d0` / `0xd0396d6c5ff4d1238c937b084cd9a3632374cc64` / `0x000000000022d473030f116ddee9f6b43ac78ba3` |
| vaults.genesisFactory / yieldFactory | `0xb268bf745d803800a3a31b331cad0547157c1e40` / `0x9f37ab9afba33ca28ea28327f0946343ee301c7f` |
| ALMM (liquidityMarketMaker) | deployer `0x8274c961bd026c35c83b6f88a545729a4d4b13e9`, factory `0x63c9f1cab865d708a49df5304b59e91474860bde`, positionManager `0xcde333bfa48ba90e6a6db75775488ac34d03e2c8`, binLens `0x2e6db44c2743666c858e87f15649354f394cc082`, limitOrderManager `0xd2958beac2db8e384a35e79aa96c446c6e811829`, zapRouter `0x76f82067d9c4b0a5a56a53f821e4b3bccf67a9bc`, rewardManager `0x94b3c9aa27c076607bc36211083d943173725ae6`, oracle `0x65933a1b181840bb2d4b1a64624cedce2e7ebb83`, marketSyncController `0xdf040d925dc2abaf02dc3ed3d669e75f9ca0a3dc` |
| `giwaSepoliaAutoRouteAddresses` (d.ts:52094) ek | router `0x176d8c2b26C6373Ba7c9dd5ed8E1a626caf2f206`, adapter `0x074e4e25D1575fa2e66C7638F78c4AF5283eb37C`, registry `0xCCa3e38eAa4F00e43599646a75CcA164B97cC4eB`, curveImplementation `0x014133029714f185D976549Dd4Ea2d6Aca9EC031`, concentratedImplementation `0x16aC2947598408d51999346c4BCFAB5f9c5c0c65`, compoundingImplementation `0xa31Aab5A152DecD122040A0EAbF97122974D4Fcc` |
| `giwaSepoliaAtomicLaunchDeployment` (d.ts:54717) | tokenImplementation `0xdc578698C39E874eE5df1e12FD68F9ad38A4b4CA` + yukarıdakiler |
| **TokenLock** `giwaSepoliaTokenLockDeployment` (d.ts:63583, js:25345) | factory `0x191E814b1f4a6A66377775477671E7890c9Da799`, implementation `0x1c7Ae6E6d6d619C3ebB431c6C2e1c79432361927`, tokenPolicyRegistry `0xADD644Af3a868Ef4165e04CA5eac280ab5819bE3` |
| **FeeVault** (launch fee kasası) | adres sabit değil, okunur: `curve.getState().feeVault` = `0x414Be4a093fDFd7292dCa95C4D6fdD3905Ee6800` [ONAYLI: script adım 4a]; `factory.feeVault()` |
| Data API tabanı | `https://ammora-giwa-sepolia-data.fly.dev` (yalnızca SDK README.md:118; bir sabit değil, istemciye elle verilir) |
| Uniswap V4 venue (ilgisiz) | d.ts:52120 |

Tuzak: `DFSFactoryClient`'ı `deploymentSource` vermeden kurunca SDK varsayılan katalogdaki eski fabrikayı bekler: `fee sharing factory 0xB613... is not the reviewed 0x2b4b0f2a...` [ONAYLI, script ilk çalıştırma]. Çözüm: `createAmmoraDeploymentSource([giwaSepoliaAutoRouteDeployment])` (FS.md:173, ammora-examples `src/shared/env.ts:56`). DFS fabrikasının raporladığı token policy registry (`0xC9ca24791B0fE146c02299261A55220e4213645f`) auto-route sabitindeki (`0xADD6...`) ile farklı: DFS kasası kendi `tokenPolicyRegistry()` değerini kullanır (js:12219-12242, `isFeeSharingTokenSupported`); iki registry'nin ilişkisi doğrulanamadı. WETH her ikisinde de desteklenen token olarak göründü (DFS tarafı [ONAYLI]).

## 2. Launch oluşturma

**Mimari (kaynak: LP.md:14-25, 208-230; AG.md:133-203):** `Config` (yeniden kullanılabilir, değişmez) → `createLaunch` (yeni token + ALC curve). Config oluşturmak için Ammora onayı gerekmez (LP.md:29); çağıran = Config owner olmalı (LP.md:69). Launch'ı çağıran **Creator** olur (`msg.sender`; LP.md:228). Başka kişiyi Creator yapan alan yok; sonradan `curve.transferCreator(newCreator)` var (ABI).

**Önerilen builder'lar (hepsi gönderilmez, calldata döner) [ONAYLI: script adım 6, 7]:**

| Amaç | Fonksiyon | Not |
|---|---|---|
| Config kaydı | `buildCreateAmmoraV4Config(config, segments, configOwner)` (d.ts:52676) / planlayıcı `planCreateAmmoraV4Config(client, registry, config, segments, configOwner, caller)` (d.ts:52787) | Çıktı 2212 bayt, selector `0x99da4ed4`; simülasyon gaz ~490.520. Kayıt yeri: `launch.configRegistry` |
| Mevcut Config ile launch | `buildCreateAmmoraV4Launch(launch, configId, poolCreationFee)` (d.ts:52680) | 420 bayt, selector `0x697511bc`, `value = poolCreationFee` (Config #30'da 0). Gaz tahmini 1.308.863 |
| Config + launch tek tx | `buildRegisterConfigAndCreateAmmoraV4Launch(config, segments, launch)` (d.ts:52689) -> `factory.registerConfigAndLaunch` | |
| Callback'li launch | `buildCreateExistingConfigAmmoraV4LaunchAndCall(launch, configId, poolCreationFee)` (d.ts:52685) -> `createLaunchAndCall` | callback factory'de onaylı olmalı (Soru 4) |
| Config + launch + ilk alım (atomik) | `createConfigAndPoolWithFirstBuy(client, params)` (d.ts:54790) / `AmmoraPortableLifecyclePlanner.planAtomicFirstBuy` (d.ts:53367) / mevcut Config için `planExistingConfigAtomicFirstBuy` (d.ts:53420) | 1-2 ilk alım girişi (js:22409). Önce `APPROVAL_REQUIRED` (WETH approve), sonra `READY` |
| Receipt çözümü | `parseAmmoraV4ConfigCreatedReceipt`, `parseAmmoraV4LaunchCreatedReceipt` (d.ts:52737-52738) | gerçek configId/token/curve receipt'ten alınır; tahmin (`getAmmoraV4PredictedLaunchAtBlock`, d.ts:52810) kesin değildir |

**Ürün için en uygun yol:** repo başına ayrı Config (ücret alıcısı sabit olduğu için, bkz. Soru 3) + `buildCreateAmmoraV4Launch`. Atomik ilk alım gerekmedikçe `createLaunchWithTokenConfig` seviyesi yeterli. Fabrikada `createLaunch(name,symbol,metadataURI,configId)` (selector `0xc0c10d20`, 4 argüman) da var; ama `buildCreateAmmoraV4Launch` çıktısının selector'ı `0x697511bc` = `createLaunchWithTokenConfig(string,string,string,string,uint256,uint8)` (viem `toFunctionSelector` ile doğrulandı; `creatorMetadataURI` + `tokenDecimals` alır). Zincirde simüle edilen de bu çağrıdır. `tokenDecimals` Config'teki ile aynı olmak zorunda (LP.md:216; Config #30 = 9).

**`AmmoraV4Config` alanları** (d.ts:52617-52664; ürünle ilgili olanlar):
`quoteToken` (WETH), `partnerRecipient` (Partner ücret alıcısı), `creatorShareOfNonProtocolBps` (0-10000), `poolCreationFee` (native ETH, Creator öder), `totalSupply`, `tokenDecimals` (Config #30 = 9), `startSqrtPrice`, `cliffFeeBps` + ücret takvimi alanları, `collectFeeMode` (0 QuoteToken, 1 OutputToken), `migrationQuoteThreshold` / `migrationBaseThreshold` (mezuniyet eşiği), `leftoverReceiver`, `migrationMode` (0 Concentrated, 1 Compounding), `postMigrationFeeBps`, `postMigrationCollectFeeMode` (0 BothTokens, 1 QuoteTokenOnly), `liquidityDistribution` {`partner`, `partnerUnlockedBps`, `partnerPermanentLockedBps`, `creatorPermanentLockedBps`, `partnerVesting`, `creatorVesting`}, `lockedBaseVesting` (TokenLock'a giden kurucu payı, Soru 7), `activationDelay` + `activationType` (0 timestamp, 1 block).
Segmentler: `AmmoraV4Segment {lowerSqrtPrice, upperSqrtPrice, liquidity}` (d.ts:52590). Elle yazmak yerine **mevcut bir Config'i okuyup kopyala**: `getAmmoraV4ConfigAtBlock` (d.ts:52772). Script Config #30'u (platform sahibi `0xD57a...`) okuyup `partnerRecipient` / `creatorShare` / LP dağılımını değiştirdi ve zincirde simüle etti (adım 7d, 7e).

**Fee recipient ayarlanabiliyor mu? Evet, ama Config seviyesinde, launch başına değil.** Fee alıcıları:
- **Partner** = `Config.partnerRecipient` (Config değişmez; launch başına değiştirilemez; herhangi bir adres, kontrat dahil) [ONAYLI: `partnerRecipient` olarak henüz var olmayan kasa adresi + `creatorShareOfNonProtocolBps=0` ile `planCreateAmmoraV4Config` simülasyonu başarılı, adım 7d].
- **Creator** = launch'ı çağıran cüzdan (`curve.creator()`), payı `creatorShareOfNonProtocolBps`. Protokol payı sabit: %20 (`AMMORA_PROTOCOL_TRADING_FEE_SHARE_BPS = 2000`, d.ts:52521); kalan %80 Creator/Partner arasında bölünür. Örnek (script, Config #30, creatorShare 3000, 10000 birim ücret): protokol 2000, Creator 2400, Partner 5600.
- Mezuniyet sonrası ücretler LP NFT'lerine gider; sahipler `liquidityDistribution.partner` ve Creator (LP.md:64-66, FS.md:19-21, d.ts:52553 `creatorDirectFee: 0n`).
- Config varyantları zincirde simüle edildi [ONAYLI, adım 7e]: (A) mevcut LP dağılımı, (B) LP'nin tamamı partner'a kalıcı kilitli (partner 10000 / creator 0), (C) creatorShare 10000: üçü de kabul. Negatif kontrol (LP toplamı 10001) reddedildi: "liquidity distribution must keep at least 10% locked after one day and allocate at most 100%".

**createLaunch simülasyonu (eth_call, rastgele `from`, bakiyesiz) [ONAYLI, adım 7a/7b]:** `createLaunch` (Config #30, poolCreationFee 0) rastgele adresten **başarılı** döndü (dönen token/curve adresleri tahmini). Yani launch oluşturmak izinsiz; Config owner'ı olmak gerekmiyor. `value > 0` olan Config'lerde `stateOverride` ile sanal bakiye gerekir.

## 3. Ücretleri N alıcıya bölme (DFS / AFS)

**Kasa kurma (kaynak: d.ts:36896 `DFSFactoryClient`, d.ts:36951 `DFSClient`, builder `buildCreateAFSVault` d.ts:~65171, FS.md:166-199):**
1. Ağırlık: commit sayısı -> BPS (`commitsToBps` in `spike/read.ts`, en büyük kalan yöntemi, toplam 10000). DFS "share" bağıl tamsayı ağırlıktır, BPS olmak zorunda değil; toplam <= uint32 (FS.md:168). BPS doğrudan share olarak kullanılabilir.
2. `new DFSFactoryClient(client, factory, { deploymentSource })`, `planCreateVault({ owner, token, base, recipients: [{recipient, share}], userSalt })`. Dönen `{ ready, issues, expectedSender, predictedVault, transaction }`. `expectedSender` = `owner` olmalı (kasa sahibi = platform cüzdanı).
3. Kasa **tek token** dağıtır (`token`); `base` mantıksal kaynak token. Alıcılar ve ağırlıklar değişmez; farklı dağılım = yeni kasa.

**Canlı doğrulanan [ONAYLI, adım 8]:**
- 3 ve 5 alıcıyla `getVaultCreationPreflight`: `ready=true, issues=[]`; WETH token policy: `supported=true, kind=2, poolAllowed/routerAllowed/rewardAllowed=true`.
- **6 alıcı: SDK reddediyor** ("invalid dynamic fee-sharing vault configuration"). Kasa başına **en fazla 5 alıcı** (builder yorumu "2-5 recipient", d.ts:~65170; örnek doğrulayıcı `src/dfs/sharing-policy.ts`). **2'den az da olamaz.**
- `predictedVault` yalnızca `owner + base + token + userSalt`'a bağlı (3 ve 5 alıcıda aynı adres çıktı). Yani kasa adresi Config'ten önce hesaplanabilir; ama Config adresi bağlar, alıcı listesini bağlamaz: kasayı yalnız `owner` oluşturabildiği için risk platform cüzdanında.

**Launch'ın fee alıcısı bu kasa yapılabilir mi? Evet (Partner olarak).** `partnerRecipient = kasa adresi`, `creatorShareOfNonProtocolBps = 0` -> protokol payı dışındaki %80'in tamamı kasaya akar. Config simülasyonu zincirde geçti [ONAYLI, adım 7d/7e]. Kısıt ve sonuçları:
- FS.md:216 / LP.md:520: "kasayı `partnerRecipient` yapmak otomatik claim/fund etmez."
- Pre-graduation ücretler FeeVault'a (`0x414Be4...`) kredi olur; claim için lehdar (beneficiary) çağırmalı. Kasa bir kontrat olduğu için bunu **kasanın kendi fonksiyonu** yapar: `fundFromClaimSource(feeVault)` (SDK: `DFSClient.planAtomicFunding({ kind: "feeVault", source })`, js:12127-12134; ön kontrol `planAtomicFundingWithPreflight` js:12174-12194 `claimable(token, kasa)` okur). Gereken: kasa sahibi `planSetClaimSource({ source: feeVault, allowed: true, caller: owner })` (js:11769) ve `fundFromClaimSource`'ı bir **alıcının** çağırması (`getFundingContext` `callerIsRecipient` bakar) [KOD; canlı doğrulanamadı: gerçek bir AFS kasası + gerçek ücret birikimi + işlem gerekir].
- Alternatif (kasayı lehdar yapmadan): Partner = platform cüzdanı, `feeVault.claimFor(token, beneficiary, recipient)` + sonra `planCappedDirectFundingWithApproval(max)` (`fundUpTo`; ERC-20 approve gerekir) (LP.md:511-520).
- **Tek token**: `collectFeeMode = 0 (QuoteToken)` kullan (Config #30 böyle); `1 (OutputToken)` olursa launch tokeni cinsinden ücret de birikir ve WETH kasası onu dağıtamaz (LP.md:422).
- **Config başına tek `partnerRecipient`** => ağırlıklar repoya göre değiştiği için **her repo = ayrı kasa + ayrı Config** (Config gaz ~490k; `nextConfigId` şu an 49). Aynı repoda yeniden launch: aynı Config yeniden kullanılır.
- Mezuniyet sonrası ücretler LP NFT'sinde: kasa `liquidityDistribution.partner` olursa NFT'yi kasa taşır, ama izin/claim çağrısını kasa kendi başına yapamaz (SDK `concentratedFee` kaynağı NFT sahibinin vault'a izin vermesini ister, js:11830+). **Öneri: `liquidityDistribution.partner` = platform cüzdanı/multisig**, claim + `fundUpTo`. NFT'nin kontrata mint edilip edilemeyeceği [doğrulanamadı].
- Mezuniyet sonrası ücret varlığı: `postMigrationCollectFeeMode` 0 (BothTokens) ise iki token birikir; tek-token kasa için 1 (QuoteTokenOnly) seç.

**Claim akışı (özet):** (a) Alıcı i: `DFSClient.getClaimPreview(i)` (gross) -> `planClaim(i, receiver?)`; (b) kasaya para girmeden `claimable` 0'dır; (c) `getState()` alıcı/paylaşım/`claimable` döner; doğrulama için `fees:verify-claim` (FS.md:208). Yuvarlama ve transfer ücreti net tutarı etkiler (FS.md:199).

**Ürün akışını bozan sonuç (özet):** >5 katkıcı tek kasaya sığmaz. Seçenekler (karar şefte): ilk 4 + "diğerleri" kovası (platform cüzdanı manuel dağıtır), iç içe kasa (bir alıcı başka kasa olursa kasa kasayı claim edebilir mi doğrulanamadı), ya da repo başına birden fazla vault + Config (Config tek partner alıcı kabul ettiği için çalışmaz).

## 4. Erken erişim kısıtı (ilk N blok/saniye yalnız allowlist)

**Cevap: launch curve'e eligibility guard bağlanamıyor.** Kanıtlar:
- V4 curve ABI'sinde (25 fonksiyon) guard/allowlist/operator ile ilgili tek fonksiyon yok; `swapExactInput(includedAmountIn, minimumAmountOut, baseForQuote, allowPartialFill, recipient, deadline)` herkese açık [ONAYLI, script adım 9]. Fabrikada yalnızca `isLaunchCallbackApproved(callback)`, `createLaunchAndCall` vardır.
- `EligibilityGuard` (`ammoraEligibilityGuardAbi`, d.ts:73; `setPolicy(pool, adapter, maximumResponseAge)`) yalnız **Restricted Market** havuzlarına (ayrı AMM: `ammoraRestrictedMarketFactoryAbi` d.ts:270 -> pool/router/positionManager, eylemler Swap / AddLiquidity / PositionTransfer / RemoveLiquidity; js:23534) bağlanır; pool oluşturma `createMarket(marketId, policyVersion, baseToken, restrictedAsset, guard, feeBps, ...)` "target-owner" yetkisiyle (js:12744-12783). Launch curve'ü değil.
- Zincirde guard/adapter/restricted factory adresi **SDK sabitlerinde yok** ve Data API (`getRestrictedMarkets`) erişilemedi: canlı dağıtım [doğrulanamadı].
- `activationDelay` / `activationType` (Config) herkes için ticareti geciktirir; seçici değil.
- `createLaunchAndCall` + özel callback: callback factory'de onaylı olmalı (LP.md:31 "custom callback needs shared code admission"). Zincir testi [ONAYLI, adım 7c]: onaysız rastgele callback `isLaunchCallbackApproved=false` ve `createLaunchAndCall` **revert** (neden verisi boş); yalnız `firstBuyExecutor` onaylı. Ayrıca callback yalnız launch anında bir kez çalışır, sonraki alımları kısıtlayamaz.

**En yakın alternatifler (güçlüden zayıfa):**
1. **Atomik ilk alım (1-2 giriş):** `planExistingConfigAtomicFirstBuy` / `createConfigAndPoolWithFirstBuy`; `firstBuys[].recipient` herhangi bir adres (d.ts:53284, js:22409: "one or two entries"). Launch ile aynı tx'te en fazla 2 alıcıya token dağıtır; N katkıcıya yetmez.
2. **Frontend düzeyi kısıt:** yalnız arayüz; zincirde zorunlu değil, herkes curve'ü doğrudan çağırabilir (`swapExactInput`). "Kısıt" demek yanıltıcı olur.
3. **Restricted market:** zincirde zorunlu, ama ayrı bir havuz (launch curve yerine), eligibility adapter kontratı yazma/onaylama ve fabrika sahibi yetkisi gerektirir; dağıtım yok/doğrulanamadı.
4. **Presale + merkle allowlist:** `buildCreateAmmoraPresale`, `buildCreateMerkleAmmoraPresaleEscrow(registryIndex, depositMaximumCap, proof)`, `buildCreateAmmoraPresaleMerkleRootConfig(version, root)` (d.ts:65218-65240) allowlist'li ön satış sağlar; **fabrika adresi SDK'da yok**, dağıtım doğrulanamadı.

Sonuç: ürün gereksinimi "ilk N saniye yalnız katkıcılar alabilir" launch curve ile **zincirde sağlanamıyor**; şef kararı gerekli (kısıtı kaldırmak, atomik 1-2 ilk alım, ya da Ammora ekibinden restricted-market/presale dağıtımı).

## 5. Al/sat, teklif, mezuniyet

V4 curve yalnız **exact-input** (d.ts:52887). `buyExactIn` / `sellExactIn` / `buildBuyExactIn` / `buildSellExactIn` (d.ts:64935-64938) eski nesil launch ABI'sine aittir; V4 curve'de karşılığı `swapExactInput` / `swapExactInputWithReferral`. Frontend'in kullanacağı: `AmmoraV4LaunchCurveClient` (d.ts:52890):

- Durum: `getStateAtBlock(block)` -> `status` (0 Uninitialized, 1 Active, 2 ReadyToMigrate, 3 Migrated), `baseToken`, `quoteToken`, `creator`, `partnerRecipient`, `feeVault`, rezervler, eşikler, `canonicalPool` (d.ts:52824) [ONAYLI]. Yardımcı: `getMigrationProgressAtBlock(block)` -> `{ready, migrated, current, target, progressBps, canonicalPool}`.
- Teklif: `quoteExactInputAtBlock(includedAmountIn, baseForQuote, block)` (d.ts:52905) -> `{amountIn, amountOut, amountLeft, nextSqrtPrice, fee, asOfBlock}`. `baseForQuote=false` = alım (WETH girer). Örnek [ONAYLI, adım 4b]: 0,0001 WETH (1e14 raw) alım -> 4.927.805.093.620.512 raw token çıktı (decimals 9), ücret 1e12 (%1), `fill=full`. `classifyAmmoraV4ExactInputFill(quote, baseForQuote)` (d.ts:52883) `full | graduation-boundary | terminal-dust | partial` döner.
- İşlem: `planSwapExactInput({ includedAmountIn, baseForQuote, allowPartialFill, slippageBps, recipient, deadline, referrer? })` -> `{ quote(+minimumAmountOut), transaction, approvalRequirement(s) }`. Alımda WETH `approve(curve, amount)` gerekir (ERC-20); gaz için yerel ETH ayrı bakiye (LP.md:293).  `allowPartialFill` yalnızca `graduation-boundary` iken true (README "Final fill and Graduation").
- Mezuniyet: son alım curve'ü `ReadyToMigrate (2)` yapar; **ayrı tx** `planMigrateAtBlock(blockNumber)` (d.ts:52957; izinsiz `migrate()`), çıktı `{ transaction, asOfBlock }`. Sonra `parseAmmoraV4MigratedReceipt` ve `resolveAmmoraV4ConcentratedMigrationPositionsReceipt` (canonicalPool + LP NFT'leri). Son alımda kullanılmayan girdi cüzdanda kalır, iade değil (LP.md:346).
- Mezuniyet sonrası: havuz işlemi `AmmoraSwapClient.create(client, { deploymentSource, factoryProfiles: giwaSepoliaAutoRoutePoolProfiles }).prepareExactIn({ model: "concentrated", pool, tokenIn, amountIn, payer, slippageBps })` (d.ts:45160, d.ts:44976). `PreparedExactInputSwap.execute(wallet)` onay + swap + alındı bakiyesi doğrulamasını yapar; frontend için `startAutoRefresh`.
- Receipt: `parseAmmoraV4SwapReceipt(receipt, curve, expectation?)` (d.ts:52746).

## 6. Keşif: AmmoraDataApiClient

`new AmmoraDataApiClient(baseUrl, fetcher?)` (d.ts:48481). **Bu oturumda sunucu 503 verdi**; gerçek yanıt gövdesi görülmedi [doğrulanamadı]. SDK koduna göre (js:13900-13939):

| Metot | HTTP | Dönüş |
|---|---|---|
| `getLaunches({chainId?, creator?, status?, cursor?, includeBlacklisted?, query?})` | `GET /v1/tokens?chainId=&creator=&status=&cursor=&includeBlacklisted=&q=` | `{ items: AmmoraLaunchSummary[], nextCursor }` |
| `getLaunch(chainId, tokenOrCurve)` | `GET /v1/tokens/{chainId}/{address}` | `AmmoraLaunch` |
| `getLaunchCards(chainId)` | `GET /v1/launches/cards?chainId=` (Data API 2026-11-04 sürümünden itibaren; öncesi 404) | `AmmoraLaunchCards` |
| `getLaunchFeed({chainId?, sourceId?, cursor?})` | `GET /v1/launch-feed` | `AmmoraLaunchFeedPage` (sourceId "ammora"; docs/launch-feed.md) |
| `getLaunchDiscovery`, `getLaunchPartnerProfile` | `/v1/tokens/{c}/{a}/discovery`, partner profili | |
| `getRevenueAccruals({chainId, recipient, cursor?})` | | ücret tahakkukları |
| `getRestrictedMarkets / getRestrictedMarket` | | restricted market listesi (Soru 4) |

`AmmoraLaunchSummary` (d.ts:48431): `id, chainId, address (token), curveAddress, creatorAddress, partnerAddress | null, configId, configHash, protocolVersion, metadataUri, creatorMetadataUri | null, partnerMetadataUri | null, discoveryTagBits, blacklisted, blacklistReasonHash, status ("PENDING"|"ACTIVE"|"MIGRATION_READY"|"MIGRATED"|"FLAGGED"), createdBlock, createdTxHash, canonicalPool | null, activationPoint, activationType`. `AmmoraLaunch` (d.ts:48456) ek: `discovery`, `initialBuys[]`, `recentTrades[]` (`isBuy, baseAmount, quoteAmount, feeAmount, walletAddress?`), `protocolFeeRoute`, `recentFeeAccruals[]`. Sayısal alanlar string. Cursor opak değil sayısal (feed cursor'ı opak).

**Yedek (Data API'siz) keşif [ONAYLI, adım 3b]:** `LaunchFactory.LaunchCreated(token idx, curve idx, creator idx, configId, configHash, protocolVersion, metadataURI)` olayını `getLogs` ile 10.000'lik parçalarla tara. Son 120.000 blokta 58 launch bulundu; ardından her curve için `getStateAtBlock`. `metadataURI` bazı launch'larda binlerce karakterlik `data:` URI (görsel gömülü); loglarken kısalt. `factory.curveForToken(token)` / `tokenForCurve(curve)` eşlemeyi verir.

## 7. TokenLock (kurucu payı kilidi)

Kontrat: `giwaSepoliaTokenLockDeployment` (Soru 1). İki yol:
1. **Launch'a gömülü vesting (önerilen):** `planAmmoraLaunchVesting({ totalAmountRaw, cliffUnlockAmountRaw?, numberOfPeriods, frequencySeconds, cliffDurationSeconds, rounding? })` (d.ts:63441) -> `lockedBaseVesting`. Config'e koyulur (tam yazılmış Config gerekir, `buildPortableAmmoraV4Config` `lockedBaseRaw`; VE.md:44-56); mezuniyet işleminde kilit oluşur ve alıcı **launch Creator**'dır; **vesting mezuniyet zamanında başlar** (VE.md:56), en uzun süre 730 gün. Kilidi bulma: `parseAmmoraLaunchVestingCreatedReceipt` / `launch:vesting-from-graduation`. Mevcut Config'e eklenemez (yeni Config şart; arz bütçesinden ayrılmalı, VE.md:44).
2. **Bağımsız kilit:** `new AmmoraTokenLockClient(client, giwaSepoliaTokenLockDeployment)`; `verifyAtBlock(block)`; `planCreateAtBlock({ token, recipient, caller, parameters, userSalt, blockNumber, allowancePolicy? })` (d.ts:63525) -> `{ status: "APPROVAL_REQUIRED" | "READY", lock (tahmini adres), transaction }`; önce tek ERC-20 approve, sonra yeniden planla (VE.md:130). `parameters: AmmoraTokenLockParameters` (d.ts:66304: `vestingStartTime, cliffTime, frequency, cliffUnlockAmount, amountPerPeriod, numberOfPeriods, updateRecipientMode, cancelMode (AmmoraTokenLockActorMode: 0 None, 1 CreatorOnly, 2 RecipientOnly, 3 CreatorOrRecipient), metadataHash`). Doküman: iptal edilemez, alıcı değişmez kilit (`None` modları; VE.md:130); fon yolu creator -> factory -> lock. Talep: token GIWA Token Policy'de desteklenmeli (VE.md:82); fabrikanın yarattığı launch tokenleri policy'ye kayıtlı (LP.md:83) ama yeni bir launch tokeni için kilit oluşturma canlı denenmedi [doğrulanamadı].
   - Talep: `readAtBlock(lock, block)` -> `AmmoraTokenLockState`; `planClaimAtBlock({ lock, caller, blockNumber, maximumAmount? })` -> `{ transaction, amount }`. Receipt: `parseAmmoraTokenLockCreatedReceipt`, `parseAmmoraTokenLockClaimReceipt`.
   - [ONAYLI, adım 8b]: `verifyAtBlock` başarılı; halka açık tamamlanmış test kilidi `0x852Dc7B07361C9bab17024f20F25804502728f07` okundu: token `0x036b...f2c7`, toplam 8 / talep edilen 8, `completed=true`, `claimable=0`.

## 8. Frontend için tam TypeScript imzaları

Hepsi `import { ... } from "@ammora-protocol/sdk"` (viem `Address`, `Hex`, `PublicClient`). İmzalar `dist/index.d.ts`'ten birebir.

```ts
// Sabitler
declare const giwaSepoliaAutoRouteDeployment: AmmoraDeployment;             // d.ts:52192
declare const giwaSepoliaAutoRoutePoolProfiles: readonly DammV2FactoryProfile[]; // d.ts:52262
declare const giwaSepoliaTokenLockDeployment: AmmoraTokenLockDeployment;     // d.ts:63583
declare function createAmmoraDeploymentSource(deployments: readonly AmmoraDeployment[]): AmmoraDeploymentSource;

// Config / launch (d.ts:52676-52810)
type AmmoraTransaction = { to: Address; data: Hex; value?: bigint };         // d.ts:34222
declare const buildCreateAmmoraV4Config: (config: AmmoraV4Config, segments: readonly AmmoraV4Segment[], configOwner: Address) => { readonly data: Hex };
declare const buildCreateAmmoraV4Launch: (launch: Omit<AmmoraV4RegisteredLaunch, "callback" | "callbackData">, configId: bigint, poolCreationFee: bigint) => { readonly data: Hex; readonly value: bigint };
declare const buildRegisterConfigAndCreateAmmoraV4Launch: (config: AmmoraV4Config, segments: readonly AmmoraV4Segment[], launch: AmmoraV4RegisteredLaunch) => { readonly data: Hex; readonly value: bigint };
declare const buildCreateExistingConfigAmmoraV4LaunchAndCall: (launch: AmmoraV4RegisteredLaunch, configId: bigint, poolCreationFee: bigint) => { readonly data: Hex; readonly value: bigint };
declare const getAmmoraV4ConfigAtBlock: (client: PublicClient, registryAddress: Address, configId: bigint, blockNumber: bigint) => Promise<AmmoraV4ConfigSnapshot>;
declare const getAmmoraV4NextConfigId: (client: PublicClient, registryAddress: Address, blockNumber: bigint) => Promise<bigint>;
declare const planCreateAmmoraV4Config: (client: PublicClient, registryAddress: Address, config: AmmoraV4Config, segments: readonly AmmoraV4Segment[], configOwner: Address, caller: Address) => Promise<AmmoraV4CreateConfigPlan>;
declare const parseAmmoraV4ConfigCreatedReceipt: (receipt: TransactionReceipt, registryAddress: Address) => AmmoraV4ConfigReceipt;
declare const parseAmmoraV4LaunchCreatedReceipt: (receipt: TransactionReceipt, factoryAddress: Address) => AmmoraV4LaunchReceipt;
declare const getAmmoraV4PredictedLaunchAtBlock: (client: PublicClient, factoryAddress: Address, creator: Address, configId: bigint, metadataURI: string, blockNumber: bigint) => Promise<AmmoraV4PredictedLaunch>;
declare function createConfigAndPoolWithFirstBuy(client: PublicClient, parameters: CreateConfigAndPoolWithFirstBuyParameters): Promise<CreateConfigAndPoolWithFirstBuyPlan>; // d.ts:54790
// planExistingConfigAtomicFirstBuy (AmmoraPortableLifecyclePlanner, d.ts:53420):
//   ({ account, configId, expectedConfigHash, launch, firstBuys: AmmoraPortableFirstBuy[1..2], deadline, gas: {maxFeePerGasNativeRaw, safetyMarginBps}, allowancePolicy? })

// Curve (d.ts:52890)
declare class AmmoraV4LaunchCurveClient {
  constructor(client: PublicClient, curve: Address, core: Pick<AmmoraV4CoreAddresses, "launchFactory" | "feePolicy">);
  getStateAtBlock(blockNumber: bigint): Promise<AmmoraV4LaunchCurveState>;
  getState(): Promise<AmmoraV4LaunchCurveState>;
  quoteExactInputAtBlock(includedAmountIn: bigint, baseForQuote: boolean, blockNumber: bigint): Promise<AmmoraV4ExactInputQuote>;
  quoteExactInput(includedAmountIn: bigint, baseForQuote: boolean): Promise<AmmoraV4ExactInputQuote>;
  planSwapExactInput(p: { includedAmountIn: bigint; baseForQuote: boolean; allowPartialFill: boolean; slippageBps: number; recipient: Address; deadline: bigint; referrer?: Address }):
    Promise<{ quote: AmmoraV4ExactInputQuote & { minimumAmountOut: bigint }; transaction: AmmoraTransaction; approvalRequirement: ERC20ApprovalRequirement; approvalRequirements: readonly [ERC20ApprovalRequirement] }>;
  getMigrationProgressAtBlock(blockNumber: bigint): Promise<{ ready: boolean; migrated: boolean; current: bigint; target: bigint; progressBps: number; canonicalPool: Address; asOfBlock: bigint }>;
  planMigrateAtBlock(blockNumber: bigint): Promise<{ readonly transaction: AmmoraTransaction; readonly asOfBlock: bigint }>;
  planTransferCreator(sender: Address, newCreator: Address): Promise<{ transaction: AmmoraTransaction; asOfBlock: bigint }>;
  planClaimSurplus(sender: Address): Promise<{ transaction: AmmoraTransaction; asOfBlock: bigint }>;
  planWithdrawLeftover(sender: Address): Promise<{ transaction: AmmoraTransaction; asOfBlock: bigint }>;
}
declare const classifyAmmoraV4ExactInputFill: (quote: Pick<AmmoraV4ExactInputQuote, "amountIn" | "amountOut" | "amountLeft">, baseForQuote: boolean) => AmmoraV4ExactInputFill;
declare const parseAmmoraV4SwapReceipt: (receipt: TransactionReceipt, curveAddress: Address, expectation?: { trader?: Address; recipient?: Address; baseForQuote?: boolean; requestedAmountIn?: bigint; minimumAmountOut?: bigint }) => AmmoraV4SwapReceipt;
declare const parseAmmoraV4MigratedReceipt: (receipt: TransactionReceipt, curveAddress: Address) => AmmoraV4MigrationReceipt;
declare const previewAmmoraLaunchFeeDistribution: (totalFee: bigint, creatorShareOfNonProtocolBps: number, hasReferral: boolean) => AmmoraLaunchFeeBreakdown;

// Mezuniyet sonrasi havuz (d.ts:45160)
declare class AmmoraSwapClient {
  static create(client: PublicClient, options?: AmmoraSwapClientOptions): Promise<AmmoraSwapClient>;
  prepareExactIn(parameters: PrepareExactInputParameters): Promise<PreparedExactInputSwap>;
}
// PrepareExactInputParameters: { model: "almm"|"concentrated"|"compounding"|"dbc"; pool; tokenIn; amountIn: bigint; payer; recipient?; slippageBps?; allowPartialFill?; referral?; ... }  (d.ts:44976)

// DFS (d.ts:36885-37136)
type DFSRecipientShare = { recipient: Address; share: bigint };
type DFSVaultCreationParameters = { owner: Address; token: Address; base: Address; recipients: readonly DFSRecipientShare[]; userSalt: Hex };
declare class DFSFactoryClient {
  constructor(client: PublicClient, factory: Address, options?: AmmoraClientDeploymentOptions);
  getVaultCreationPreflight(p: DFSVaultCreationParameters): Promise<{ ready: boolean; issues: string[]; expectedSender: Address; tokenPolicy: {...}; vaultSalt: Hex; predictedVault: Address; existingVault: Address; transaction: { to: Address; data: Hex } }>;
  planCreateVault(p: DFSVaultCreationParameters): Promise<(same shape)>;
}
declare class DFSClient {
  constructor(client: PublicClient, vault: Address, options?: DFSClientOptions);
  getState(): Promise<{ owner: Address; base: Address; token: Address; totalShare: bigint; totalFunded: bigint; totalClaimed: bigint; liveLiability: bigint; recipients: { index: number; recipient: Address; share: bigint; feeClaimed: bigint; feePerShareCheckpointX128: bigint; claimable: bigint }[] }>;
  isClaimSource(source: Address): Promise<boolean>;
  planSetClaimSource(p: { source: Address; allowed: boolean; caller: Address }): Promise<AmmoraTransaction>;
  planAtomicFundingWithPreflight(p: { kind: "feeVault"; source: Address; caller: Address } | { kind: "delegatedFeeVault"; source: Address; beneficiary: Address; caller: Address } | { kind: "concentratedFee"; source: Address; sourceKind: "rawPool" | "positionManager"; tokenId: bigint; tokenIsBase: boolean; caller: Address } | /* compoundingFee, positionReward */ ...):
    Promise<{ transaction: AmmoraTransaction | null; ready: boolean; issues: string[]; setupTransactions: readonly AmmoraTransaction[] }>;
  planCappedDirectFundingWithApproval(maximumAmount: bigint): Promise<TransactionPlan>;
  getClaimPreview(index: number): Promise<{ grossAmount: bigint; netAmount: undefined }>;
  planClaim(index: number, receiver?: Address): AmmoraTransaction;
}

// FeeVault (dogrudan Creator/Partner claim): feeVaultAbi.claimable(token, beneficiary); buildClaimFeeVaultFor(token: Address, beneficiary: Address, recipient: Address): { data: Hex }

// Data API (d.ts:48481, 49230-49253)
declare class AmmoraDataApiClient {
  constructor(baseUrl: string, fetcher?: AmmoraDataApiFetch);
  getLaunch(chainId: bigint | string, tokenOrCurveAddress: Address, signal?: AbortSignal): Promise<AmmoraLaunch>;
  getLaunches(input?: { chainId?: bigint | string; creator?: Address; status?: AmmoraLaunchSummary["status"]; cursor?: bigint | string; includeBlacklisted?: boolean; query?: string; signal?: AbortSignal }): Promise<{ items: AmmoraLaunchSummary[]; nextCursor: string | null }>;
  getLaunchCards(chainId: bigint | string, signal?: AbortSignal): Promise<AmmoraLaunchCards>;
  getLaunchFeed(input?: { chainId?: bigint | string; sourceId?: string; cursor?: string; signal?: AbortSignal }): Promise<AmmoraLaunchFeedPage>;
}

// TokenLock (d.ts:63441-63536)
declare function planAmmoraLaunchVesting(input: { totalAmountRaw: bigint; cliffUnlockAmountRaw?: bigint; numberOfPeriods: number; frequencySeconds: bigint; cliffDurationSeconds: bigint; rounding?: "reject" | "cliff" }): Readonly<{ config: AmmoraLaunchVestingConfig; totalAmountRaw: bigint; roundingRemainderRaw: bigint; durationSeconds: bigint }>;
declare class AmmoraTokenLockClient {
  constructor(client: AmmoraTokenVestingReadClient, deployment: AmmoraTokenLockDeployment);
  verifyAtBlock(blockNumber: bigint): Promise<AmmoraTokenVestingSnapshot>;
  readAtBlock(lock: Address, blockNumber: bigint): Promise<AmmoraTokenLockState>;
  planCreateAtBlock(input: { token: Address; recipient: Address; caller: Address; parameters: AmmoraTokenLockParameters; userSalt: Hex; blockNumber: bigint; allowancePolicy?: "prepare-approval" | "require-exact" }): Promise<AmmoraTokenLockCreatePlan>;
  planClaimAtBlock(input: { lock: Address; caller: Address; blockNumber: bigint; maximumAmount?: bigint }): Promise<AmmoraTokenLockClaimPlan>;
}
declare function parseAmmoraTokenLockCreatedReceipt(receipt: AmmoraTokenVestingReceipt, plan: AmmoraTokenLockCreatePlan): Readonly<{ lock: Address; recipient: Address; token: Address; totalAmount: bigint; blockNumber: bigint }>;

// Yardimci (spike/read.ts, SDK degil): commit sayilari -> bps (toplam 10000)
declare function commitsToBps(commits: Record<string, number>): Record<string, number>;
```

Ürünün `.katki.json` -> vault: `contributors` anahtarları GitHub kullanıcı adı, değerleri adres; ağırlık = GitHub commit sayısı oranı -> `commitsToBps` -> `recipients[i] = { recipient: addr, share: BigInt(bps) }` (2-5 kişi sınırı!).

## 9. Script çıktısı özeti (17 Kas 2026)

- Zincir: chainId 91342, head ~41.56M [ONAYLI].
- Adresler: 5 çekirdek kontratın bytecode'u var (factory 16.988 bayt, registry 17.220 bayt, feePolicy, DFS fabrikası, TokenLock fabrikası).
- Data API: 503 / zaman aşımı (**başarısız adım**); zincirden LaunchCreated yedeğiyle son 120.000 blokta 58 launch bulundu.
- Seçilen aktif curve `0x2F520e4e7E201E4391E1265625Dec76751dBCd8C`: status=1, configId=30, quote WETH, feeBps=100, eşik 0,1 WETH, mezuniyet 0/0,1 WETH.
- Teklif: 1e14 raw WETH alım -> 4.927.805.093.620.512 raw token, fee 1e12, `full`.
- Config #30: partner `0xD57a...` (Config sahibi), creatorShare 3000, collectFeeMode 0, postMigrationCollectFeeMode 0, LP: partner 6250 / creator 3750 kalıcı kilit, tokenDecimals 9.
- createLaunch calldata 420 bayt; createConfig 2212 bayt; eth_call `createLaunch` rastgele adresten başarılı (gaz ~1,31M); `createLaunchAndCall` onaysız callback ile revert; Config simülasyonu (partner = tahmini DFS kasası, creatorShare 0) başarılı (gaz ~490k); LP varyantı B başarılı, negatif kontrol reddedildi.
- DFS: 3 ve 5 alıcıda `ready=true`, 6 alıcıda SDK hatası.
- TokenLock: `verifyAtBlock` başarılı, tamamlanmış halka açık kilit okundu.
- Sonuç: 15/16 adım başarılı (başarısız: Data API).

## 10. Açık sorunlar ve engeller

1. **Erken erişim (Soru 4):** curve'e bağlanabilen bir allowlist/guard yok. En fazla 1-2 kişiye atomik ilk alım var. Ürün kararı gerekli.
2. **Alıcı sayısı (Soru 3):** DFS 2-5 alıcı. Tüm katkıcılar sığmaz; birleştirme kuralı (ilk 4 + diğerleri) şef kararı.
3. **Ücret otomasyonu (Soru 3):** kasa Partner yapılabiliyor (simülasyon başarılı) ve `fundFromClaimSource` yolu SDK'da var, ama gerçek kasada uçtan uca canlı doğrulama yapılmadı (işlem + ücret birikimi gerekir). Mezuniyet sonrası LP ücretleri için kasayı NFT sahibi yapmak riskli; LP partner = platform cüzdanı önerilir.
4. **Repo başına Config + kasa:** ücret alıcısı Config içinde sabit; her repo yeni Config (~490k gaz) + yeni kasa demek. Config kaydı `nextConfigId` ile herkese açık ve geri alınamaz.
5. **Data API kapalı:** liste/detay için yanıt şekli doğrulanamadı; üretimde zincir yedeği (LaunchCreated + getStateAtBlock) gerekir. SDK istemcisi 503'te yanıltıcı hata veriyor.
6. **Sürüm:** 0.3.10 npm'de ama `latest` değil ve kendi notu "yayınlanmadı" diyor; ürün hangi sürüme sabitlenecek şef kararı.
7. **Creator rolü:** Creator = launch'ı çağıran cüzdan; kullanıcı cüzdanından mı platform cüzdanından mı açılacağı (ücret payı, `transferCreator` sonrası ücret hakları [doğrulanamadı]) tasarım kararı.
8. **TokenLock:** yeni bir launch tokeni için bağımsız kilit canlı denenmedi; gömülü vesting yeni Config gerektirir.


## 11. Tributary uygulaması: kararlar ve doğrulama (app/)

- **Kurucu payı kilidi:** Config'in gömülü vesting'i (`lockedBaseVesting`, mezuniyette başlar, alıcı = launch creator) seçildi; TokenLock bağımsız yolu kullanılmadı. Gerekçe: ek işlem ve approve gerektirmez, kilit launch'ın parçasıdır. **Uygulamada kurucu payı henüz sunulmuyor:** Config #30 şablonunun segmentleri arzın tamamını kullanıyor, kilit için arzdan pay ayırmak `buildPortableAmmoraV4Config` ile yeni eğri hesabı ister (denenmedi). Config'te `lockedBaseVesting` varsa launch sayfası gösterir; yoksa panel çıkmaz.
- **Config:** şablon = Config #30 (çalışma anında registry'den okunur), değiştirilen alanlar: `partnerRecipient` = DFS kasası, `creatorShareOfNonProtocolBps` 0, `leftoverReceiver` = launch sahibi, `postMigrationCollectFeeMode` 1 (yalnız quote), LP dağılımı partner = launch sahibi (10000 kalıcı kilit), creator 0. Mezuniyet sonrası LP ücretleri launch sahibinin cüzdanına gider ve kasaya sahibi ekler; otomatik değil (kasanın NFT ücretini kendi başına talep edememesi nedeniyle, bkz. Bölüm 3).
- **Kasa:** sahip = launch'ı açan cüzdan, token/base = WETH, salt = hash(repo, commit, sahip, alıcı+bps) (aynı girdi aynı kasa: işlem yarıda kalırsa devam eder). Kasa sonrası sahip `setClaimSource(feeVault)` çağırır; böylece alıcılar `fundFromClaimSource` ile bekleyen ücreti kasaya çekip `claim` eder.
- **Metadata:** `{app, repo, katkiCommit, vault}` base64 `data:application/json` olarak hem `metadataURI` (olay, keşif) hem `creatorMetadataURI` (görünüm, launch sayfası tek `eth_call` ile okur) alanına yazılır.
- **Atomik ilk alım:** `createConfigAndPoolWithFirstBuy` (config + launch + alım tek işlem, alıcı = sahip). WETH sarma ve approve ayrı adımlar. Bakiyesiz rastgele hesapla simüle edilemez ("Quote balance is below the atomic first-buy amount"): bu yol canlı **doğrulanamadı**.
- **Cüzdansız simülasyon** (`app/scripts/simulate-create.ts`, rastgele `from`): kasa oluşturma OK (~686k gaz), config kaydı OK (~490k, id 49), `registerConfigAndLaunch` OK (~2,10M gaz). 6 katkıcıdan ilk 5'i kasaya girdi.
- **Eğri geometrisi:** sqrt fiyatlar Q64.64; taban = L(1/Sa - 1/Sb), quote = L(Sb - Sa)/2^128, fiyat = (S/2^64)^2. Config #30'da quote 0,1 ETH (eşikle eşit), taban ~%90 arz; canlı teklifle (1e14 wei -> 4,9278e15) uyumlu.
- **Satış teklifi:** hiç satılmamış eğride satış `PriceOutsideCurve` (0x48e8f5d8) ile revert olur; arayüz bunu insan diliyle gösterir.
- **Data API** bu oturumda erişilemedi (bağlantı yok); uygulama 4 sn denedikten sonra zincir taramasına düşer. Yanıt şekli SDK tiplerinden, canlı doğrulanamadı.
- **Blok süresi** 1 sn (ölçüldü): 200.000 blok ~2,3 gün; Keşfet varsayılan olarak bu pencereyi tarar, sonuçları localStorage'a yazar, "Scan further back" ile genişler.
