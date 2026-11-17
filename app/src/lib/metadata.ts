/**
 * Tributary launch metadata, carried in the token's metadataURI as a `data:application/json` URI:
 *   { "app": "tributary", "repo": "owner/name", "katkiCommit": "<sha>", "vault": "0x..." }
 */
import { getAddress, isAddress } from "viem";

export type TributaryMeta = { app: "tributary"; repo: string; katkiCommit: string; vault: `0x${string}` };

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

export function encodeTributaryMetadata(meta: Omit<TributaryMeta, "app">): string {
  if (!REPO.test(meta.repo)) throw new Error(`Invalid repository name: ${meta.repo}`);
  if (!SHA.test(meta.katkiCommit)) throw new Error(`Invalid commit hash: ${meta.katkiCommit}`);
  if (!isAddress(meta.vault)) throw new Error(`Invalid vault address: ${meta.vault}`);
  const json = JSON.stringify({ app: "tributary", repo: meta.repo, katkiCommit: meta.katkiCommit, vault: getAddress(meta.vault) });
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
  if (typeof o.katkiCommit !== "string" || !SHA.test(o.katkiCommit)) return null;
  if (typeof o.vault !== "string" || !isAddress(o.vault)) return null;
  return { app: "tributary", repo: o.repo, katkiCommit: o.katkiCommit, vault: getAddress(o.vault) };
}
