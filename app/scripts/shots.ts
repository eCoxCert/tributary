/**
 * Headless Chrome check against a running `vite preview` (http://localhost:4173).
 * For every route: 1440 and 375 wide, dark and light. Saves screenshots to app/screens/, logs console errors,
 * and measures horizontal overflow at 375 (scrollWidth > clientWidth is a failure).
 *   npm run build && npm run preview &   then   npm run shots
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = resolve(process.cwd(), "screens");
// Real launch used for the check (Config #30 curve on GIWA Sepolia, found in docs/TECH.md).
const TOKEN = process.env.TOKEN ?? "0xBFc72c693dF1D0DDdE4bfCFa1bB09A162Fe9f032";

type Route = { name: string; hash: string; ready: string; extra?: (p: Page) => Promise<void> };
const routes: Route[] = [
  { name: "home", hash: "#/", ready: "h1" },
  { name: "launches", hash: "#/launches", ready: ".statline" },
  { name: "launches-all", hash: "#/launches?all=1", ready: ".ledger tbody tr" },
  { name: "launch-real", hash: `#/launch/${TOKEN}?all=1`, ready: ".curve-stats" },
  { name: "create", hash: "#/create", ready: "#repo" },
  { name: "katki", hash: "#/katki", ready: "h1" },
];

mkdirSync(OUT, { recursive: true });
const report: Record<string, unknown>[] = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const theme of ["dark", "light"] as const) {
  const WIDTHS: [number, number][] = process.env.WIDTHS ? process.env.WIDTHS.split(",").map((w) => [Number(w), 900] as [number, number]) : [[1440, 900], [1280, 800], [1100, 800], [1024, 768], [800, 900], [768, 1024], [375, 812]];
for (const [width, height] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("trib-theme", t); } catch { /* ignore */ } }, theme);
    for (const r of routes) {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (rq) => errors.push(`requestfailed: ${rq.url().slice(0, 90)} ${rq.failure()?.errorText ?? ""}`));
      await page.goto(BASE + r.hash, { waitUntil: "load" });
      try {
        await page.waitForSelector(r.ready, { timeout: 30_000 });
        // let chain data settle: skeletons gone, no spinner, a few seconds of quiet
        await page.waitForFunction(() => !document.querySelector(".sk") , { timeout: 45_000 }).catch(() => {});
        await page.waitForTimeout(1800);
      } catch (e) {
        errors.push(`not ready: ${(e as Error).message.split("\n")[0]}`);
      }
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        theme: document.documentElement.getAttribute("data-theme"),
        rows: document.querySelectorAll(".ledger tbody tr").length,
        title: document.querySelector("h1")?.textContent?.slice(0, 60) ?? "",
        overlaps: (() => {
          const els = [...document.querySelectorAll("main *, header *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()) && (e as HTMLElement).offsetParent !== null || e.tagName === "text");
          const rs = els.map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.width > 1 && x.r.height > 1);
          let n = 0;
          const hit: string[] = [];
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i]!, b = rs[j]!;
            if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
            const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (w > 2 && h > 3) { n++; if (hit.length < 3) hit.push(`${a.e.textContent?.trim().slice(0, 18)} x ${b.e.textContent?.trim().slice(0, 18)}`); }
          }
          return { n, hit };
        })(),
        cutCode: [...document.querySelectorAll("pre.code")].filter((p) => p.scrollWidth > p.clientWidth + 1).length,
      }));
      const file = `${r.name}-${theme}-${width}.png`;
      await page.screenshot({ path: resolve(OUT, file), fullPage: true });
      report.push({ route: r.name, theme, width, overflow: m.sw > m.cw, cutCode: m.cutCode, overlaps: m.overlaps.n, scrollWidth: m.sw, clientWidth: m.cw, rows: m.rows, h1: m.title, appliedTheme: m.theme, errors, file });
      console.log(`${file.padEnd(34)} overflow=${m.sw > m.cw ? "YES" : "no"} (${m.sw}/${m.cw}) cutCode=${m.cutCode} overlaps=${m.overlaps.n} rows=${m.rows} errors=${errors.length}`);
      for (const e of errors) console.log("   ! " + e);
      if (m.overlaps.n) console.log("   overlap: " + m.overlaps.hit.join(" | "));
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
const bad = report.filter((x) => x.overflow || (x.cutCode as number) > 0 || (x.overlaps as number) > 0 || (x.errors as string[]).length);
console.log(`\n${report.length} captures, ${bad.length} with overflow or errors.`);
