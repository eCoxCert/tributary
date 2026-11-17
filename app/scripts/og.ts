/** Renders public/og.png (1200x630, dark) and public/apple-touch-icon.png (180x180) from HTML templates. npx tsx scripts/og.ts */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tokens = readFileSync(resolve("src/styles/tokens.css"), "utf8");
const favicon = readFileSync(resolve("public/favicon.svg"), "utf8");
const rows = [["mira-k", 39.7], ["dvasquez", 23.4], ["t-okafor", 15.4], ["lenaschultz", 12.2], ["haru-n", 9.3]] as const;
const ROW = 62;
const H = rows.length * ROW;
const mid = H / 2;
const branches = rows
  .map(([, share], i) => {
    const y = i * ROW + ROW / 2;
    return `<path d="M40 ${mid}C90 ${mid} 150 ${y} 220 ${y}" fill="none" stroke="var(--accent)" stroke-width="${(1.6 + share * 0.2).toFixed(1)}" stroke-linecap="round" opacity="0.9"/>`;
  })
  .join("");
const labels = rows.map(([n, s]) => `<div class="row"><b>${n}</b><span>${s.toFixed(1)}%</span></div>`).join("");

const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Hanken+Grotesk:wght@400..800&display=swap" rel="stylesheet">
<style>${tokens}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:var(--bg);color:var(--ink);font-family:var(--font-sans);display:grid;grid-template-columns:600px 1fr;gap:40px;padding:64px;align-items:center}
.brand{display:flex;align-items:center;gap:12px;font-weight:650;font-size:28px;margin-bottom:36px}
.brand svg{width:36px;height:36px}
h1{font-size:62px;line-height:1.05;letter-spacing:-0.03em;font-weight:650}
p{margin-top:24px;color:var(--ink-2);font-size:24px;line-height:1.4}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.file{padding:18px 22px;border-bottom:1px solid var(--line);font-family:var(--font-mono);font-size:17px;line-height:1.55;color:var(--ink)}
.file i{font-style:normal;color:var(--accent)} .file u{text-decoration:none;color:var(--ink-3)}
.graph{position:relative;height:${H}px;margin:18px 22px;}
.graph svg{position:absolute;left:0;top:0}
.rows{position:absolute;left:230px;top:0;right:0}
.row{height:${ROW}px;display:flex;justify-content:space-between;align-items:center;font-size:18px;gap:12px}
.row span{color:var(--ink-2);font-variant-numeric:tabular-nums}
</style></head><body>
<div><div class="brand"><svg viewBox="0 0 24 24" fill="none"><path d="M2.5 5.25H8a4 4 0 0 1 4 4M21.5 5.25H16a4 4 0 0 0-4 4" stroke="currentColor" stroke-width="2.5"/><path d="M12 8.75V21" stroke="currentColor" stroke-width="3.5"/></svg>Tributary</div>
<h1>Token launches that pay a repo's contributors</h1><p>Every trade pays a fee, split by commit share. GIWA Sepolia testnet.</p></div>
<div class="card"><div class="file"><u>.katki.json</u><br>{ <i>"version"</i>: 1, <i>"contributors"</i>: [ ... ] }</div>
<div class="graph"><svg width="236" height="${H}"><circle cx="40" cy="${mid}" r="7" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><path d="M14 ${mid}H40" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>${branches}</svg><div class="rows">${labels}</div></div></div>
</body></html>`;

const icon = `<!doctype html><html><body style="margin:0;width:180px;height:180px;background:#0f1214">${favicon.replace("<svg ", '<svg width="180" height="180" ')}</body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: resolve("public/og.png") });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(icon);
await page.screenshot({ path: resolve("public/apple-touch-icon.png") });
await browser.close();
console.log("wrote public/og.png and public/apple-touch-icon.png");
