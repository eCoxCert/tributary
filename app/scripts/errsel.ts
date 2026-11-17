import * as sdk from "@ammora-protocol/sdk";
import { toFunctionSelector, type Abi } from "viem";

const abis = Object.entries(sdk).filter(([k, v]) => /Abi$/.test(k) && Array.isArray(v)) as [string, Abi][];
const want = ["0x48e8f5d8"];
const names = new Map<string, string[]>();
for (const [k, abi] of abis) {
  for (const x of abi) {
    if (x.type !== "error") continue;
    const sel = toFunctionSelector(`${x.name}(${x.inputs.map((i) => i.type).join(",")})`);
    const arr = names.get(sel) ?? [];
    arr.push(`${k}:${x.name}`);
    names.set(sel, arr);
  }
}
for (const w of want) console.log(w, names.get(w));
const ce = (sdk as unknown as Record<string, Abi>).ammoraContractErrorAbi;
console.log("ammoraContractErrorAbi errors:", ce.filter((x) => x.type === "error").map((x) => (x as { name: string }).name).join(", "));
const pool = (sdk as unknown as Record<string, Abi>).ammoraLaunchPoolV4Abi;
console.log("pool errors:", pool.filter((x) => x.type === "error").map((x) => (x as { name: string }).name).join(", "));
const fac = (sdk as unknown as Record<string, Abi>).ammoraLaunchFactoryV4Abi;
console.log("factory errors:", fac.filter((x) => x.type === "error").map((x) => (x as { name: string }).name).join(", "));
