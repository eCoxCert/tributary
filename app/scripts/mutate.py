"""Mutation check: break one critical line at a time, expect `vitest` to fail, then restore the file.
Run from app/ with a clean git tree:  python scripts/mutate.py
"""
import subprocess, sys

M = [
    ("src/lib/split.ts", "if ((commits[i] as number) > (commits[largest] as number)) largest = i;", "if ((commits[i] as number) < (commits[largest] as number)) largest = i;", "rounding diff to the smallest share"),
    ("src/lib/split.ts", "export const MAX_RECIPIENTS = 5;", "export const MAX_RECIPIENTS = 6;", "6 recipients allowed"),
    ("src/lib/split.ts", "Math.floor((c * TOTAL_BPS) / total)", "Math.round((c * TOTAL_BPS) / total)", "round instead of floor"),
    ("src/lib/split.ts", "b.commits - a.commits ||", "a.commits - b.commits ||", "ranking reversed"),
    ("src/lib/logs.ts", "end > to ? to : end", "end", "last chunk overshoots"),
    ("src/lib/logs.ts", "export const LOG_PARALLEL = 3;", "export const LOG_PARALLEL = 4;", "4 parallel requests"),
    ("src/lib/logs.ts", "await sleep(base * 2 ** attempt);", "await sleep(base);", "no backoff"),
    ("src/lib/contribFile.ts", "if (seenLogin.has(key)) {", "if (false) {", "duplicate user accepted"),
    ("src/lib/contribFile.ts", "if (!commits || commits <= 0) {", "if (false) {", "non-contributor accepted"),
    ("src/lib/contribFile.ts", "if (!isAddress(wallet, { strict: true })) {", "if (false) {", "bad address accepted"),
    ("src/lib/metadata.ts", 'if (o.app !== "tributary") return null;', "", "other apps accepted"),
    ("src/lib/metadata.ts", 'if (typeof v !== "string" || !isAddress(v)) return null;', "", "bad vault or recipient accepted"),
    ("src/lib/allocation.ts", "parts[largest] = (parts[largest] as bigint) + rest;", "", "allocation remainder lost"),
    ("src/lib/github.ts", 'if (remaining === "0" || res.status === 429) {', "if (false) {", "rate limit not detected"),
    ("src/lib/curveMath.ts", "return { base: L * (1 / a - 1 / b), quote: (L * (b - a)) / Q128 };", "return { base: L * (1 / a - 1 / b), quote: (L * (b - a)) / Q64 };", "wrong quote scale"),
    ("src/lib/create.ts", "partnerRecipient: feeRecipient,", "partnerRecipient: owner,", "fee recipient not the vault"),
    ("src/lib/create.ts", "creatorShareOfNonProtocolBps: 0,", "creatorShareOfNonProtocolBps: 3000,", "creator takes fee share"),
    ("src/lib/create.ts", 'const meta = "vault" in target ? { vault: target.vault } : { recipient: target.recipient };', "const meta = { recipient: input.owner };", "metadata target differs from Config"),
    ("src/lib/verify.ts", "if (i.creatorShareOfNonProtocolBps !== 0) problems", "if (false) problems", "fake launch: creator share unchecked (2)"),
    ("src/lib/verify.ts", "if (i.creatorShareOfNonProtocolBps !== 0)", "if (false)", "fake launch: creator share not checked"),
    ("src/lib/verify.ts", "if (!eq(i.vault.owner, i.creator))", "if (false)", "fake launch: vault owner not checked"),
    ("src/lib/allocation.ts", "if (rem <= 0n) {", "if (false) {", "double send after partial failure"),
    ("src/lib/verify.ts", "if (i.vault.fromFactory === false)", "if (false)", "fake vault: factory record ignored"),
    ("src/lib/verify.ts", "if (!eq(i.vault.token, i.expectedToken) || !eq(i.vault.base, i.expectedToken))", "if (false)", "fake vault: token/base not checked"),
    ("src/lib/verify.ts", 'if (i.contribFile.state === "missing")', "if (false)", ".tributary.json 404 not a mismatch"),
    ("src/lib/verify.ts", 'if (reasons.length) return { status: "unverifiable", reasons: [...new Set(reasons)] };', "", "unchecked shown as verified"),
    ("src/lib/verify.ts", "if (i.vault.fromFactory === null)", "if (false)", "unreadable factory record shown as verified"),
    ("src/lib/verify.ts", "if (stray.length)", "if (false)", "recipients not in .tributary.json accepted"),
    ("src/lib/contribFileCheck.ts", 'if (!p.ok) return { state: { state: "invalid" }, file: null, provenance: skipped, handles: skipped };', "", "invalid .tributary.json treated as ok"),
    ("src/lib/contribFileCheck.ts", 'if (text === null) return { state: { state: "missing" }, file: null, provenance: skipped, handles: skipped };', "", "404 not detected"),
    ("src/lib/cardVerify.ts", "token: p.vault.token,", "token: p.quoteToken,", "card ignores vault token"),
    ("src/lib/contribFile.ts", "if (isPlaceholderWallet(wallet)) {", "if (false) {", "placeholder wallet accepted"),
    ("src/lib/github.ts", 'j.status === "ahead" || j.status === "identical" ? "ancestor" : "not-ancestor"', '"ancestor"', "compare: diverged/behind accepted"),
    ("src/lib/github.ts", 'if (e instanceof GitHubError && e.kind === "not-found") return "not-ancestor" as AncestorCheck;', "", "compare: 404 not a mismatch"),
    ("src/lib/github.ts", 'if (remaining === "0" || res.status === 429) {', "if (false) {", "rate limit not detected"),
    ("src/lib/contribFileCheck.ts", 'if (c.ok) return { state: "ok" };', 'if (true) return { state: "ok" };', "handles not checked"),
    ("src/lib/contribFileCheck.ts", "return r === \"ancestor\" ?", "return true ?", "provenance not checked"),
    ("src/lib/verify.ts", 'if (c.state === "mismatch") problems.push(c.detail);', "", "repo checks ignored"),
    ("src/lib/visibility.ts", 'if (p.visible === 0) return p.error ? "list" : "empty";', 'if (p.visible === 0) return "no-match";', "empty list shown as 'no match'"),
    ("src/lib/visibility.ts", 'return v.status === "verified" || v.status === "unverifiable";', 'return v.status === "verified";', "unverifiable launches hidden"),
    ("src/lib/visibility.ts", "if (!hasMeta || !v) return false;", "if (!v) return false;", "non-Tributary token listed"),
    ("src/lib/visibility.ts", "n === 1 ? word", "n === 0 ? word", "singular/plural wrong"),
    ("src/lib/visibility.ts", "if (p.anyPending && p.visible === 0) return \"loading\";", "", "empty flashes while cards load"),
    ("src/lib/visibility.ts", "if (verifiedRepo) return verifiedRepo;", "return verifiedRepo ?? symbol;", "token symbol or name shown as a repo title"),
    ("src/lib/github.ts", 'if (lim !== null) throw new GitHubError("rate-limit", rateLimitMessage(lim, deps.now()), new Date(lim)); // no request while limited', "", "requests sent while rate limited"),
    ("src/lib/github.ts", "export const TTL_LONG_MS = 6 * 60 * 60 * 1000;", "export const TTL_LONG_MS = 10 * 60 * 1000;", "positive cache shorter than 6 h"),
    ("src/lib/github.ts", "if (res.status === 404) return null;", 'if (res.status === 404) { writeCache(deps, key, { text: "" }); return null; }', "negative answer cached"),
    ("src/lib/github.ts", "@${sha}->${branch}", "@${sha}", "ancestor cache key without branch"),
    ("src/lib/github.ts", "if (page === 5) truncated = true;", "", "cut-off contributor list not noticed"),
    ("src/lib/github.ts", "return j.length > 0;\n  });", "return true;\n  });", "exact author check always yes"),
    ("src/lib/contribFileCheck.ts", 'if (!truncated) return { state: "mismatch"', 'if (false) return { state: "mismatch"', "complete list also triggers exact checks"),
    ("src/lib/github.ts", "if (hit) return hit as Promise<T>;", "", "no sharing of calls per repo"),
    ("src/lib/contribFileCheck.ts", "if (missing.length > MAX_EXACT_CHECKS)", "if (false)", "unbounded exact checks"),
    ("src/lib/split.ts", "if (ranked.length === 1) {", "if (false) {", "single contributor not paid directly"),
    ("src/lib/split.ts", "included: [{ ...only, bps: TOTAL_BPS }]", "included: [{ ...only, bps: 5000 }]", "direct share not 100%"),
    ("src/lib/create.ts", "(recipients.length === 1 ? \"direct\" : \"vault\")", "\"vault\"", "single contributor still gets a vault"),
    ("src/lib/create.ts", "...(mode === \"vault\" ? [\"vault\", \"source\"] : [])", "...[\"vault\", \"source\"]", "vault steps in the direct flow"),
    ("src/lib/create.ts", "const feeRecipient = \"vault\" in target ? target.vault : target.recipient;", "const feeRecipient = input.owner;", "direct: Config recipient not the contributor"),
    ("src/lib/verify.ts", "else if (!eq(i.partnerRecipient, target as string)) {", "else if (false) {", "partner recipient not compared to the metadata target"),
    ("src/lib/verify.ts", "if (w.length !== 1 || w[0] !== (i.metaRecipient as string).toLowerCase())", "if (false)", "direct: file wallet not checked"),
    ("src/lib/verify.ts", "if (!direct && !vaulted) {", "if (false) {", "vault+recipient or neither accepted"),
    ("src/lib/metadata.ts", 'const key = meta.vault !== undefined ? "vault" : "recipient";', 'const key = "vault";', "recipient written as vault"),
    ("src/lib/github.ts", "const hit = fresh ? undefined : readCache<string>(deps, key, false);", "const hit = readCache<string>(deps, key, false);", "Check again reuses a stale head sha"),
    ("src/lib/readRepo.ts", "getHeadSha(ref, info.defaultBranch, deps, true)", "getHeadSha(ref, info.defaultBranch, deps)", "Create form does not ask for a fresh head"),
    ("src/lib/contribFile.ts", "mine && mine.github.toLowerCase() === h.login.toLowerCase() ? mine.wallet : WALLET_PLACEHOLDER", "WALLET_PLACEHOLDER", "connected wallet not filled in"),
    ("src/lib/contribFile.ts", "?filename=.tributary.json&value=${encodeURIComponent(json)}", "?filename=.tributary.json&value=${json}", "new-file link content not encoded"),
]
bad = 0
for path, old, new, what in M:
    src = open(path, encoding="utf-8").read()
    if old not in src:
        print("SKIP (pattern not found)", path, what); bad += 1; continue
    open(path, "w", encoding="utf-8").write(src.replace(old, new, 1))
    try:
        r = subprocess.run("npx vitest run", shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    finally:
        open(path, "w", encoding="utf-8").write(src)
    killed = r.returncode != 0
    print(("KILLED  " if killed else "SURVIVED"), path, "|", what)
    bad += 0 if killed else 1
r = subprocess.run("npx vitest run", shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
print("restored suite exit:", r.returncode)
sys.exit(1 if bad or r.returncode else 0)
