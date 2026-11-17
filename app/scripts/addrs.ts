import { getAddress, keccak256, toHex } from "viem";
for (const n of ["mira-k", "dvasquez", "t-okafor", "lenaschultz", "haru-n"]) console.log(n, getAddress("0x" + keccak256(toHex("tributary-example-" + n)).slice(26)));
