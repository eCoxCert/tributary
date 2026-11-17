import { ammoraLaunchFactoryV4Abi, ammoraLaunchPoolV4Abi } from "@ammora-protocol/sdk";

type Item = { type: string; name?: string; inputs?: { type: string; name: string; indexed?: boolean }[]; outputs?: { type: string; name: string }[] };
const sig = (x: Item) =>
  `${x.type} ${x.name}(${(x.inputs ?? []).map((i) => i.type + (i.indexed ? " idx" : "") + " " + i.name).join(", ")})${x.outputs?.length ? " -> " + x.outputs.map((o) => o.type + " " + o.name).join(", ") : ""}`;
for (const x of ammoraLaunchFactoryV4Abi as unknown as Item[]) if (x.type === "function" || x.type === "event") console.log("F", sig(x));
for (const x of ammoraLaunchPoolV4Abi as unknown as Item[]) if (x.type === "function" || x.type === "event") console.log("C", sig(x));
