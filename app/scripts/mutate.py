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
    ("src/lib/katki.ts", "if (seenLogin.has(key)) {", "if (false) {", "duplicate user accepted"),
    ("src/lib/katki.ts", "if (!commits || commits <= 0) {", "if (false) {", "non-contributor accepted"),
    ("src/lib/katki.ts", "if (!isAddress(wallet, { strict: true })) {", "if (false) {", "bad address accepted"),
    ("src/lib/metadata.ts", 'if (o.app !== "tributary") return null;', "", "other apps accepted"),
    ("src/lib/metadata.ts", "if (typeof o.vault !== \"string\" || !isAddress(o.vault)) return null;", "", "bad vault accepted"),
    ("src/lib/allocation.ts", "parts[largest] = (parts[largest] as bigint) + rest;", "", "allocation remainder lost"),
    ("src/lib/github.ts", 'if (remaining === "0" || res.status === 429) {', "if (false) {", "rate limit not detected"),
    ("src/lib/curveMath.ts", "return { base: L * (1 / a - 1 / b), quote: (L * (b - a)) / Q128 };", "return { base: L * (1 / a - 1 / b), quote: (L * (b - a)) / Q64 };", "wrong quote scale"),
]
bad = 0
for path, old, new, what in M:
    src = open(path, encoding="utf-8").read()
    if old not in src:
        print("SKIP (pattern not found)", path, what); bad += 1; continue
    open(path, "w", encoding="utf-8").write(src.replace(old, new, 1))
    try:
        r = subprocess.run("npx vitest run", shell=True, capture_output=True, text=True)
    finally:
        open(path, "w", encoding="utf-8").write(src)
    killed = r.returncode != 0
    print(("KILLED  " if killed else "SURVIVED"), path, "|", what)
    bad += 0 if killed else 1
r = subprocess.run("npx vitest run", shell=True, capture_output=True, text=True)
print("restored suite exit:", r.returncode)
sys.exit(1 if bad or r.returncode else 0)
