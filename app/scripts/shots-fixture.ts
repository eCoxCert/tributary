/** Launch-page states with fixture data. Needs the DEV server: npx vite --port 5174  (fixtures are not in the production build). */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5174/";
const TOKEN = "0xBFc72c693dF1D0DDdE4bfCFa1bB09A162Fe9f032";
const OUT = resolve(process.cwd(), "screens");
mkdirSync(OUT, { recursive: true });
const states: { name: string; q: string; ready: string }[] = [
  { name: "ok", q: "fixture=ok", ready: ".a-alloc" },
  { name: "direct", q: "fixture=direct", ready: ".a-alloc" },
  { name: "direct-claim", q: "fixture=direct&fw=contrib", ready: ".is-you .btn-primary" },
  { name: "direct-owner", q: "fixture=direct&fw=owner", ready: ".a-alloc .btn-primary" },
  { name: "claim", q: "fixture=ok&fw=me", ready: ".is-you" },
  { name: "owner-send", q: "fixture=ok&fw=owner", ready: ".a-alloc .btn-primary" },
  { name: "mismatch", q: "fixture=mismatch", ready: ".banner-warn" },
  { name: "unverifiable", q: "fixture=unverifiable", ready: ".banner-warn" },
  { name: "loading", q: "fixture=loading", ready: ".sk" },
  { name: "error", q: "fixture=error", ready: ".banner-err" },
  { name: "checking", q: "fixture=checking", ready: ".hint .spin" },
  { name: "wrong-network", q: "fixture=ok&fw=wrong", ready: ".banner-warn" },
];
const lists: { name: string; hash: string; ready: string }[] = [
  { name: "list-explore", hash: "#/launches?fixture=list", ready: ".ledger tbody tr .tag" },
  { name: "list-explore-loading", hash: "#/launches?fixture=list-loading", ready: ".sk" },
  { name: "list-home", hash: "#/?fixture=list", ready: "#live .ledger tbody tr .tag" },
  { name: "list-home-loading", hash: "#/?fixture=list-loading", ready: "#live .sk" },
];
if (process.env.ONLY_MISSING) { states.length = 0; lists.length = 0; } // quick re-shot of the create guide only
const report: unknown[] = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [width, height] of (process.env.ONLY_MISSING ? [] : [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [375, 812]]) as readonly (readonly [number, number])[]) {
  for (const theme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
    await ctx.addInitScript((t) => localStorage.setItem("trib-theme", t), theme);
    for (const s of states) {
      if (theme === "dark" && !["ok", "direct", "mismatch", "unverifiable"].includes(s.name)) continue;
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      await page.goto(`${BASE}#/launch/${TOKEN}?${s.q}`);
      try { await page.waitForSelector(s.ready, { timeout: 40_000 }); } catch { errors.push("not ready: " + s.ready); }
      await page.waitForTimeout(s.name === "loading" ? 300 : 2500);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, cut: [...document.querySelectorAll("pre.code")].filter((p) => p.scrollWidth > p.clientWidth + 1).length }));
      const file = `fixture-${s.name}-${theme}-${width}.png`;
      await page.screenshot({ path: resolve(OUT, file), fullPage: true });
      console.log(file.padEnd(40), m.sw > m.cw ? `OVERFLOW ${m.sw}/${m.cw}` : "no overflow", `errors=${errors.length}`);
      errors.forEach((e) => console.log("   ! " + e));
      report.push({ file, overflow: m.sw > m.cw, errors });
      await page.close();
    }
    await ctx.close();
  }
}
for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [375, 812]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "light" });
  await ctx.addInitScript(() => localStorage.setItem("trib-theme", "light"));
  for (const l of lists) {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(BASE + l.hash);
    try { await page.waitForSelector(l.ready, { timeout: 60_000 }); } catch { errors.push("not ready: " + l.ready); }
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, rows: document.querySelectorAll(".ledger tbody tr").length, txt: document.querySelector("#count")?.textContent ?? "" }));
    const file = `fixture-${l.name}-light-${width}.png`;
    await page.screenshot({ path: resolve(OUT, file), fullPage: true });
    console.log(file.padEnd(40), m.sw > m.cw ? `OVERFLOW ${m.sw}/${m.cw}` : "no overflow", `rows=${m.rows} errors=${errors.length}`, m.txt.slice(0, 60));
    errors.forEach((e) => console.log("   ! " + e));
    report.push({ file, overflow: m.sw > m.cw, errors });
    await page.close();
  }
  await ctx.close();
}
for (const [width, height] of [[1440, 900], [375, 812]] as const) {
  for (const [label, q] of [["", ""], ["-wallet", "?fw=contrib"]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "light" });
    await ctx.addInitScript(() => localStorage.setItem("trib-theme", "light"));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(`${BASE}#/create${q}`);
    await page.fill("#repo", "octocat/Hello-World");
    await page.click("text=Read repository");
    try { await page.waitForSelector("#katki .btn-primary", { timeout: 45_000 }); } catch { errors.push("not ready: missing guide (GitHub unreachable or rate limited?)"); }
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, href: (document.querySelector("#katki a.btn-primary") as HTMLAnchorElement | null)?.href ?? "", rel: (document.querySelector("#katki a.btn-primary") as HTMLAnchorElement | null)?.rel ?? "" }));
    const file = `fixture-create-missing${label}-light-${width}.png`;
    await page.screenshot({ path: resolve(OUT, file), fullPage: true });
    console.log(file.padEnd(46), m.sw > m.cw ? "OVERFLOW" : "no overflow", `errors=${errors.length}`, m.rel, m.href.slice(0, 80));
    errors.forEach((e) => console.log("   ! " + e));
    report.push({ file, overflow: m.sw > m.cw, errors });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(resolve(OUT, "fixture-report.json"), JSON.stringify(report, null, 2));
