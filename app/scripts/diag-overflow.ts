import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:4173/#/launches?all=1";
const w = Number(process.argv[3] ?? 800);
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: w, height: 900 } });
await p.goto(url);
await p.waitForSelector(".ledger tbody tr", { timeout: 40000 });
await p.waitForTimeout(20000);
console.log(await p.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const out = [`scrollWidth=${document.documentElement.scrollWidth} clientWidth=${cw}`];
  const list = [...document.querySelectorAll("body *")].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.right > cw - 20 && x.r.width > 0).sort((a, b) => b.r.right - a.r.right).slice(0, 8);
  for (const x of list) out.push(`${x.e.tagName}.${(x.e as HTMLElement).className} right=${Math.round(x.r.right)} w=${Math.round(x.r.width)}`);
  return out.join("\n");
}));
await b.close();
