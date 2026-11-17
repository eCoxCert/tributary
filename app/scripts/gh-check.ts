import { readRepository } from "../src/lib/readRepo";
for (const r of ["octocat/Hello-World", "this-owner-xx/does-not-exist-yy"]) {
  const x = await readRepository(r, { fetch: (...a) => fetch(...a), storage: null, now: () => Date.now() });
  console.log(r, "->", x.stage, x.stage === "error" ? x.message : x.stage === "missing" ? `authors=${x.authors}` : "");
}
