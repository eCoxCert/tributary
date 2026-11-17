import { publicClient as client, ADDR } from "../src/lib/chain";
import { ammoraLaunchFactoryV4Abi, feeVaultAbi } from "@ammora-protocol/sdk";

const head = await client.getBlockNumber();
const b1 = await client.getBlock({ blockNumber: head });
const b0 = await client.getBlock({ blockNumber: head - 100000n });
console.log("head", head, "blocktime s/blk", Number(b1.timestamp - b0.timestamp) / 100000);
const mc = await client.getCode({ address: "0xcA11bde05977b3631167028862bE2a173976CA11" });
console.log("multicall3 code bytes", mc ? (mc.length - 2) / 2 : 0);
console.log("feeVaultAbi fns", (feeVaultAbi as readonly { type: string; name?: string }[]).filter((x) => x.type === "function").map((x) => x.name).join(", "));
const fv = await client.readContract({ address: ADDR.factory, abi: ammoraLaunchFactoryV4Abi, functionName: "feeVault" });
console.log("feeVault", fv);
