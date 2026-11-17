import { createPublicClient, http, defineChain, type Address } from "viem";
import {
  AmmoraV4LaunchCurveClient,
  getAmmoraV4ConfigAtBlock,
  giwaSepoliaAutoRouteDeployment as DEP,
} from "@ammora-protocol/sdk";

const RPC = DEP.chain.rpcUrls[0];
const chain = defineChain({ id: DEP.chain.id, name: DEP.chain.name, nativeCurrency: DEP.chain.nativeCurrency, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 6, retryDelay: 500 }) });
const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 1);
const curve = "0x2F520e4e7E201E4391E1265625Dec76751dBCd8C" as Address;
const core = { launchFactory: DEP.contracts.launch.factory as Address, feePolicy: DEP.contracts.launch.feePolicy as Address };
const head = await client.getBlockNumber();
const c = new AmmoraV4LaunchCurveClient(client, curve, core);
const st = await c.getStateAtBlock(head);
console.log("state", j(st));
const snap = await getAmmoraV4ConfigAtBlock(client, DEP.contracts.launch.configRegistry as Address, st.configId, head);
console.log("config", j({ ...snap.config }));
console.log("segments", j(snap.segments));
console.log("progress", j(await c.getMigrationProgressAtBlock(head)));
console.log("quote", j(await c.quoteExactInputAtBlock(10n ** 14n, false, head)));
console.log("quote sell", j(await c.quoteExactInputAtBlock(10n ** 15n, true, head)).slice(0, 300));
