import { describe, expect, it } from "vitest";
import { decodeTributaryMetadata, encodeTributaryMetadata } from "./metadata";

const vault = "0x2b7d00000000000000000000000000000000e019";
const meta = { repo: "tidewater/quill-rpc", fileCommit: "3f9a2c1d4e5b6a7988776655443322110ffeeddc", vault: vault as `0x${string}` };

describe("tributary metadata", () => {
  it("round-trips", () => {
    const uri = encodeTributaryMetadata(meta);
    expect(uri.startsWith("data:application/json")).toBe(true);
    const back = decodeTributaryMetadata(uri);
    expect(back?.app).toBe("tributary");
    expect(back?.repo).toBe(meta.repo);
    expect(back?.fileCommit).toBe(meta.fileCommit);
    expect(back?.vault?.toLowerCase()).toBe(vault.toLowerCase());
  });
  it("reads percent-encoded and raw JSON data URIs too", () => {
    const json = JSON.stringify({ app: "tributary", repo: "a/b", fileCommit: "abcdef1", vault });
    expect(decodeTributaryMetadata("data:application/json;utf8," + encodeURIComponent(json))?.repo).toBe("a/b");
    expect(decodeTributaryMetadata("data:application/json," + json)?.repo).toBe("a/b");
  });
  it("returns null for other apps, images, links and junk", () => {
    const other = "data:application/json;base64," + btoa(JSON.stringify({ app: "other", repo: "a/b", fileCommit: "abcdef1", vault }));
    expect(decodeTributaryMetadata(other)).toBeNull();
    expect(decodeTributaryMetadata("data:image/png;base64,AAAA")).toBeNull();
    expect(decodeTributaryMetadata("ipfs://bafy...")).toBeNull();
    expect(decodeTributaryMetadata("data:application/json;base64,@@@")).toBeNull();
    expect(decodeTributaryMetadata("")).toBeNull();
    expect(decodeTributaryMetadata(undefined)).toBeNull();
  });
  it("returns null when a field is missing or malformed", () => {
    const mk = (o: object) => "data:application/json," + JSON.stringify(o);
    // neither vault nor recipient still decodes (the verifier calls it a mismatch); a present but non-address field is garbage
    expect(decodeTributaryMetadata(mk({ app: "tributary", repo: "a/b", fileCommit: "abcdef1" }))).toMatchObject({ repo: "a/b" });
    expect(decodeTributaryMetadata(mk({ app: "tributary", repo: "a/b", fileCommit: "abcdef1", recipient: "0x12" }))).toBeNull();
    expect(decodeTributaryMetadata(mk({ app: "tributary", repo: "nope", fileCommit: "abcdef1", vault }))).toBeNull();
    expect(decodeTributaryMetadata(mk({ app: "tributary", repo: "a/b", fileCommit: "xyz", vault }))).toBeNull();
    expect(decodeTributaryMetadata(mk({ app: "tributary", repo: "a/b", fileCommit: "abcdef1", vault: "0x12" }))).toBeNull();
  });
  it("round-trips a single-recipient launch (recipient instead of vault)", () => {
    const uri = encodeTributaryMetadata({ repo: "a/b", fileCommit: "abcdef1", recipient: vault as `0x${string}` });
    const back = decodeTributaryMetadata(uri);
    expect(back?.recipient?.toLowerCase()).toBe(vault.toLowerCase());
    expect(back?.vault).toBeUndefined();
    expect(JSON.parse(atob(uri.split(",")[1] as string))).not.toHaveProperty("vault");
  });
  it("keeps a record with both vault and recipient so it can be flagged", () => {
    const both = "data:application/json," + JSON.stringify({ app: "tributary", repo: "a/b", fileCommit: "abcdef1", vault, recipient: vault });
    const back = decodeTributaryMetadata(both);
    expect(back?.vault).toBeDefined();
    expect(back?.recipient).toBeDefined();
  });
  it("refuses to encode bad input", () => {
    expect(() => encodeTributaryMetadata({ ...meta, repo: "nope" })).toThrow();
    expect(() => encodeTributaryMetadata({ ...meta, fileCommit: "zz" })).toThrow();
    expect(() => encodeTributaryMetadata({ ...meta, vault: "0x1" as `0x${string}` })).toThrow();
  });
});
