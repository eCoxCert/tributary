/**
 * Tributary launch metadata, carried in the token's metadataURI as a `data:application/json` URI:
 *   { "app": "tributary", "repo": "owner/name", "fileCommit": "<sha>", "vault": "0x..." }       (2 to 5 recipients)
 *   { "app": "tributary", "repo": "owner/name", "fileCommit": "<sha>", "recipient": "0x..." }   (one contributor, no vault)
 * Exactly one of vault / recipient is valid. A record with both or neither still decodes (so it can be called out as a
 * mismatch by the verifier) but is never trusted.
 */
import { getAddress, isAddress } from "viem";

export type TributaryMeta = { app: "tributary"; repo: string; fileCommit: string; vault?: `0x${string}`; recipient?: `0x${string}` };

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{7,64}$/i;
export const DATA_JSON_PREFIX = "data:application/json";

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export type MetaTarget = { vault: `0x${string}`; recipient?: never } | { recipient: `0x${string}`; vault?: never };

export function encodeTributaryMetadata(meta: { repo: string; fileCommit: string } & MetaTarget): string {
  if (!REPO.test(meta.repo)) throw new Error(`Invalid repository name: ${meta.repo}`);
  if (!SHA.test(meta.fileCommit)) throw new Error(`Invalid commit hash: ${meta.fileCommit}`);
  const target = meta.vault !== undefined ? { vault: meta.vault } : { recipient: meta.recipient };
  const addr = (target as { vault?: string; recipient?: string }).vault ?? (target as { recipient?: string }).recipient;
  if (!addr || !isAddress(addr)) throw new Error(`Invalid fee recipient address: ${addr}`);
  const key = meta.vault !== undefined ? "vault" : "recipient";
  const json = JSON.stringify({ app: "tributary", repo: meta.repo, fileCommit: meta.fileCommit, [key]: getAddress(addr) });
  return `${DATA_JSON_PREFIX};base64,${toBase64(json)}`;
}

/** Returns the Tributary metadata, or null for anything else (other apps, images, ipfs links, broken data). */
export function decodeTributaryMetadata(uri: string | null | undefined): TributaryMeta | null {
  if (!uri || !uri.startsWith(DATA_JSON_PREFIX)) return null;
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const head = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  let text: string;
  try {
    if (/;base64$/i.test(head)) text = fromBase64(body);
    else {
      try {
        text = decodeURIComponent(body);
      } catch {
        text = body;
      }
    }
  } catch {
    return null;
  }
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (o.app !== "tributary") return null;
  if (typeof o.repo !== "string" || !REPO.test(o.repo)) return null;
  if (typeof o.fileCommit !== "string" || !SHA.test(o.fileCommit)) return null;
  const out: TributaryMeta = { app: "tributary", repo: o.repo, fileCommit: o.fileCommit };
  for (const k of ["vault", "recipient"] as const) {
    if (o[k] === undefined) continue;
    const v = o[k];
    if (typeof v !== "string" || !isAddress(v)) return null; // present but not an address: garbage
    out[k] = getAddress(v);
  }
  return out;
}
