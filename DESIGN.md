# Tributary design system

Tributary is the product name for the Contributor Launchpad: token launches for open-source repositories on the Ammora protocol (GIWA Sepolia testnet). Fees from every trade go to the wallets in the repo's `.katki.json`, split by commit share.

**Name.** A tributary is a stream that joins a river. It carries the "contribute" root, and it describes what the product does: many small contributions merge into one project, and one fee stream branches back out to the people who wrote the code. Trademark search (USPTO, EUIPO, WIPO) was not run: *doğrulanamadı*. Run it before public use.

**Direction in one sentence.** A ledger for open source: the calm, dense, exact look of a finance back office (Mercury, Stripe dashboard) wearing the vocabulary of git (branches, commits, hashes), with one signature visual, the fee router, where a single fee stream branches into contributor lines whose thickness is their commit share.

## Files

| Path | What |
|---|---|
| `prototype/assets/tokens.css` | The tokens below, verbatim. Only file with raw colour values (plus the SVG logo files and `<meta name="theme-color">`). |
| `prototype/assets/app.css` | Components and page layouts. Uses tokens only. |
| `prototype/assets/app.js` | Theme, wallet state, identicons, sample data, curve chart, row rendering. |
| `prototype/assets/{home,explore,launch,create}.js` | Page behaviour. |
| `prototype/{index,explore,launch,create}.html` | The four screens. |
| `prototype/screens/` | Review screenshots (1440 and 375, light and dark, every state). |
| `brand/` | `logo.svg`, `logo-dark.svg`, `logo-mark.svg`, `logo-mark-mono.svg` (currentColor), `favicon.svg`. |

## Tokens

Copied from `prototype/assets/tokens.css`. If they ever differ, the CSS file is wrong.

```css
/* Tributary design tokens. Source of truth: DESIGN.md (kept identical). */
:root {
  /* Colour, light */
  --bg: #f5f6f5;
  --surface: #ffffff;
  --surface-2: #eceeed;
  --line: #dadfdd;
  --line-strong: #bfc6c3;
  --ink: #121619;
  --ink-2: #485155;
  --ink-3: #5f686d;
  --accent: #0a6670;
  --accent-hover: #08545c;
  --accent-ink: #ffffff;
  --accent-wash: #e1eeee;
  --accent-line: #9cc6c8;
  --pos: #1c6e46;
  --neg: #a8281f;
  --warn: #7a5000;
  --warn-wash: #f6eedc;
  --neg-wash: #f8e7e5;
  --focus: #0a6670;
  --shadow-pop: 0 1px 2px rgba(18, 22, 25, 0.06), 0 8px 24px -8px rgba(18, 22, 25, 0.14);

  /* Type */
  --font-sans: "Hanken Grotesk", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Consolas, monospace;
  --fs-cap: 0.75rem;      /* 12 */
  --fs-sm: 0.8125rem;     /* 13 */
  --fs-ui: 0.875rem;      /* 14 */
  --fs-body: 1rem;        /* 16 */
  --fs-lead: 1.1875rem;   /* 19 */
  --fs-h3: 1.375rem;      /* 22 */
  --fs-h2: clamp(1.75rem, 1.2rem + 1.6vw, 2.375rem);
  --fs-h1: clamp(2.25rem, 1.3rem + 3.6vw, 4rem);
  --lh-tight: 1.08;
  --lh-head: 1.2;
  --lh-ui: 1.4;
  --lh-body: 1.55;
  --track-head: -0.022em;
  --track-h1: -0.032em;

  /* Space, 4px base */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;
  --s-9: 96px;
  --s-10: 128px;

  /* Radius, concentric: inner = outer - padding */
  --r-xs: 3px;
  --r-sm: 5px;
  --r-md: 7px;
  --r-lg: 11px;

  /* Layout */
  --wrap: 1200px;
  --gutter: clamp(16px, 4vw, 40px);
  --header-h: 60px;
  --control-h: 40px;
  --control-h-touch: 44px;

  /* Motion */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --dur-press: 120ms;
  --dur-ui: 180ms;
  --dur-reveal: 320ms;
  --dur-draw: 1100ms;

  color-scheme: light;
}

:root[data-theme="dark"] {
  --bg: #0f1214;
  --surface: #151a1d;
  --surface-2: #1c2226;
  --line: #262d31;
  --line-strong: #364046;
  --ink: #e7ebeb;
  --ink-2: #a7b0b3;
  --ink-3: #8a9498;
  --accent: #5bb8ba;
  --accent-hover: #79c9ca;
  --accent-ink: #0b1416;
  --accent-wash: #132a2c;
  --accent-line: #2c5a5d;
  --pos: #5cc493;
  --neg: #f08176;
  --warn: #d9a845;
  --warn-wash: #2a2416;
  --neg-wash: #2d1a18;
  --focus: #5bb8ba;
  --shadow-pop: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px -10px rgba(0, 0, 0, 0.6);

  color-scheme: dark;
}
```

### Colour rules

- One accent: `--accent`, an estuary teal. It comes from the subject (water, a river mouth) and is not the generic SaaS blue, not violet, not neon green.
- Accent is used for: the primary button, the "now" point and filled area on curves, branch lines in the fee router, contributor-window tags, links, focus rings. Nothing else.
- Green and red (`--pos`, `--neg`) are semantic only: price change, errors. Never as decoration and never as candle charts.
- `--warn` means the user has to act (wrong network, a weight that disagrees with history).
- Text pairs, measured WCAG ratio (light / dark): ink on bg 16.8 / 15.7, ink-2 on bg 7.5 / 8.5, ink-3 on surface-2 4.9 / 5.2 (the weakest pair), accent on bg 6.2 / 8.1, accent-ink on accent 6.7 / 8.0, warn on warn-wash 6.1 / 7.1, neg on neg-wash 5.9 / 6.4. All pass AA for normal text.
- Dark theme is a separate palette, not an inversion: surfaces get lighter as they come forward (bg, surface, surface-2), the accent is lifted to keep 7:1+.

### Type rules

- Two families. **Hanken Grotesk** (variable 400 to 800) for everything readable. **IBM Plex Mono** only for things a developer would type or paste: file names (`.katki.json`), addresses, commit hashes, JSON. Never for labels or numbers.
- Schibsted Grotesk was the first choice and was dropped: its tabular figures also widen the full stop, which made every price look monospaced. Hanken keeps a narrow point with `tabular-nums`.
- Every changing number (prices, ETH, %, counts, the countdown) uses `font-variant-numeric: tabular-nums` via `.num` or the table rules.
- Scale: `--fs-cap` 12 is the floor. Body 16. Headings use negative tracking (`--track-head`, `--track-h1`) and `text-wrap: balance`; paragraphs `text-wrap: pretty` and a 62ch measure.
- Sentence case everywhere. No all-caps labels, no eyebrows above headings.
- Inputs are 16px so iOS does not zoom.

### Space, radius, layout

- 4px base (`--s-1` to `--s-10`). Sections on the landing page are `--s-9` apart and separated by a 1px rule, not by background bands.
- Radius is concentric and small, because this is a developer and finance tool: tags `--r-xs`, chips and small buttons `--r-sm`, buttons and inputs `--r-md`, panels `--r-lg`. No pills except the 6px status dots.
- Content width `--wrap` 1200px with a fluid `--gutter`. All blocks share the same left and right edges.
- Breakpoints: 640 (form rows), 760 (tables switch from stacked rows to columns), 900 (desktop nav), 1000 (two-column layouts).

## Components

- **Panel** is the only container: surface, 1px line, `--r-lg`. One level deep; never a panel inside a panel. A panel header (`.panel-hd`) is 48px with a 14px semibold title.
- **Ledger table** is the default way to show a list. Right-aligned tabular numbers, hairline rows, hover tint on linked rows. Under 760px each row becomes a small grid with its own layout per table (launch rows: repo + status, curve, token / to graduation / fees; contributor rows: who / share / earned, with the claim button only on your own row).
- **Buttons**: primary (accent fill), default (outlined), ink (wallet connect), quiet, warn. Verb plus object ("Launch your repo", "Read repository", "Claim 0.0160 ETH"). Never "Learn more" or "Submit". At most one primary per view.
- **Tags** carry launch status: `Contributor window` (accent wash), `Public` (neutral), `Graduated` (outline, square dot). Same three words everywhere.
- **Meter** shows curve progress (6px). On the curve chart the contributor-window part is a 45 degree hatch, the same hatch is in the legend.
- **Identicons**: GitHub-style 5x5 mirrored pixel avatars, generated from the handle, in accent (people) or ink (repos). No stock photos and no fake faces.
- **Banners** for states that need attention: warn (wrong network), error (RPC failed), accent (success). Each says what happened, what it means for the user's funds if relevant, and has one action.
- **Code block** for `.katki.json`: mono 12 to 13px, keys in ink, strings in accent, comments in ink-3.
- **Curve chart** (`drawCurve` in app.js): drawn in SVG at the real pixel width, redrawn on resize and theme change. Ink line for the sold part, dashed line for the rest, filled wash under the sold part, hatch for window buys, dotted vertical at graduation, crosshair tooltip with tokens sold, price and ETH raised.

### States (every screen)

| State | How to see it | Treatment |
|---|---|---|
| Empty | `create.html`, `explore.html?state=empty` | Says what to do next, one button. |
| Loading | `?state=loading` on any page | Skeleton blocks the same size as the content; shimmer stops under reduced motion. |
| Error | `explore.html?state=error`, `launch.html?state=error`, `create.html?state=error` | Red banner or inline field error with cause and a retry. |
| Wallet not connected | `?wallet=disconnected` | Header shows "Connect wallet"; trade and launch actions become "Connect wallet". |
| Wrong network | `?wallet=wrong` | Header pill turns amber, page banner, actions become "Switch to GIWA Sepolia". |
| Not a contributor | `launch.html?wallet=outsider` | Buy button disabled with a live countdown and the reason. |
| `.katki.json` missing | `create.html?state=missing` | Three-step guide with a pre-filled template. |

Theme: `?theme=dark` or `?theme=light`, or the toggle in the header (saved in localStorage). Default follows the OS.

## Motion

- Easing `--ease-out` for anything that enters or responds; `--ease-in-out` only for the skeleton sweep. No `ease-in`.
- Durations: press 120ms (`scale(0.97)` on buttons), hover and colour 180ms, reveals 320ms, the one-time curve draw 1100ms.
- Exactly one ambient loop on the site: the fee router on the landing page sends a pulse down one branch every 3.6s and the amounts grow. It has a Pause button and is off under `prefers-reduced-motion`.
- No scroll-triggered fades, no parallax, no hover lift on cards, no animated gradients.
- Keyboard actions are never animated. Tabs and filters switch instantly.

## Voice and copy

- English, plain, for developers. Say the number, the file, the chain. "1% of every buy and sell", not "earn passive rewards".
- Headings name a thing ("Bonding curve", "Founder allocation", "Where the trading fee goes").
- Errors say what failed and what it means: "The GIWA Sepolia RPC timed out after 10 seconds. Your funds are not affected; nothing was sent."
- The testnet strip and footer state that all figures are sample data and testnet tokens have no market value. No price predictions, no "to the moon", no APY.
- Banned: unlock (except as a literal lock term, and even then prefer "lock ends"), elevate, seamless, supercharge, revolutionize, next-gen, empower, "join the future of".

## Placeholders (not from the brief or the spec)

These values are invented for the prototype and marked `data-assumed` in the HTML. Replace them with the protocol's real parameters:

- Trading fee 1% of each trade.
- Contributor window 24 hours.
- Graduation at 4.20 ETH raised; supply 1,000,000,000 with 800,000,000 on the curve; exponential curve with an 8x end price.
- Founder allocation 5%, locked 180 days, released all at once.
- `.katki.json` schema (`version`, `contributors[].github`, `.wallet`, `.weight` summing to 1). The real format was not available: *doğrulanamadı*.
- All repos, handles, wallets, prices and fee amounts are fictional sample data.

## Do not

- Neon, glow, glassmorphism, blurred blobs, purple or blue-to-purple gradients, gradient text.
- Rockets, moons, flames, sparkles, emoji in UI.
- Green candlestick charts or "pump" colouring.
- Big hero stat + tiny label as the opening; three identical icon cards.
- Cards inside cards; borders on everything; one radius for all sizes.
- Monospace for labels or numbers; all-caps eyebrows.
- Stock photos, fake testimonials, real third-party logos (GitHub's mark is used only as a link icon to the repo).
- Hover scale on cards, fade-up on scroll.

## Anti-slop gate (god-anti-slop, run before delivery)

1. [x] **Could this belong to a different company if the logo were swapped?** No. The hero is a `.katki.json` file feeding a fee-split diagram, the how-it-works section is the bonding curve itself, the lists are on-chain ledgers. None of it transfers to another product.
2. [x] **Direction nameable in one sentence and visible everywhere?** "A ledger for open source." Ledger tables, hairline rules, tabular numbers and git vocabulary appear on all four screens.
3. [x] **Fonts deliberate and at most two?** Hanken Grotesk and IBM Plex Mono, mono limited to code-like strings. The first pick was replaced after a measured problem (see Type rules).
4. [x] **Exactly one accent, from the subject?** Estuary teal, from the river metaphor in the name. Green, red and amber are semantic only.
5. [x] **Section layouts vary?** Landing: split hero with product artifact; full-width curve with three aligned columns; dense table; text-and-ledger split; short close with checklist. App screens use sidebar-sticky, table and stepper layouts.
6. [x] **Icons and images specific?** Hand-drawn line icons only where they carry meaning (check, lock, arrow, warning). Identicons instead of faces. No rockets, sparkles or stock.
7. [x] **Copy concrete, no clichés?** Every claim names a file, a chain or a number. `copy-lint` (design-taste-frontend) gives 0 FAIL on all four pages. Three WARN `copy-stat-strip` remain on purpose: the explore summary row, the countdown clock and the stepper numbers are product UI, not marketing stat strips.
8. [x] **WCAG AA contrast and focus states?** All text pairs measured at 4.89:1 or higher in both themes. `:focus-visible` ring on every control; inputs show an accent ring.
9. [x] **Empty, loading, error, long content?** Yes, see the States table. Long repo names truncate with ellipsis; the contributor table holds 12 rows on mobile without breaking.
10. [x] **Would a senior art director see intent in spacing and type scale?** Intended yes: a 4px scale, concentric radii, a fixed type scale. This is a self-assessment, not an outside review.

Not passed or not checked:

- The brief's two-line hero heading and the landing sections are taller than one screen at 1440x900 in places; the design-taste-frontend "one section per screen" rule and its `gate.mjs` were **not** run, because that kit is built for marketing sites, and three of these four screens are application UI.
- The wordmark in `brand/logo.svg` is live text, not outlined paths. Opened outside the site (where Hanken Grotesk is not loaded) it falls back to the system font. Outline it in a vector editor before use.
- No PNG favicon set (only `favicon.svg`).
- Trademark search for "Tributary": *doğrulanamadı*.
- Real browser testing was headless Chrome only (1440 and 375 wide). Safari and Firefox were not checked.
