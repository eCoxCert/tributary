/* Tributary prototype: shared behaviour. Sample data only (GIWA Sepolia testnet). */
(function () {
  "use strict";

  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Protocol parameters (ASSUMED placeholders, not from the spec) ---------- */
  var P = {
    feePct: 1.0,            // trading fee, % of each trade  [assumed]
    windowHours: 24,        // contributor-first window length [assumed]
    target: 4.2,            // ETH raised on the curve at graduation [assumed]
    curveSupply: 800e6,     // tokens sold on the curve [assumed]
    totalSupply: 1e9,       // [assumed]
    founderPct: 5,          // founder share, locked [assumed]
    lockDays: 180,          // founder lock [assumed]
    growth: Math.log(8)     // end price is 8x start price [assumed]
  };
  P.a = (P.target * P.growth) / ((Math.exp(P.growth) - 1) * P.curveSupply); // ETH per token at x=0
  window.TRIB = { P: P };

  function priceAt(x) { return P.a * Math.exp(P.growth * x); }                 // ETH per token
  function raisedAt(x) { return (P.curveSupply * P.a * (Math.exp(P.growth * x) - 1)) / P.growth; }
  function xForRaised(f) { return Math.log(1 + f * (Math.exp(P.growth) - 1)) / P.growth; } // f = share of target
  window.TRIB.priceAt = priceAt; window.TRIB.raisedAt = raisedAt; window.TRIB.xForRaised = xForRaised;

  var fmt = {
    eth: function (v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d == null ? 4 : d, maximumFractionDigits: d == null ? 4 : d }); },
    gwei: function (ethPerToken) { return (ethPerToken * 1e9).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    pct: function (v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) + "%"; },
    int: function (v) { return Math.round(v).toLocaleString("en-US"); },
    compact: function (v) { return v >= 1e6 ? (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "M" : v >= 1e3 ? (v / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k" : String(v); }
  };
  window.TRIB.fmt = fmt;

  /* ---------- Sample data ---------- */
  var launches = [
    { repo: "tidewater/quill-rpc", sym: "QRPC", name: "Quill", lang: "TypeScript", stars: 2140, raised: 0.18, contributors: 12, fees24: 0.0611, status: "window", age: "9 h" },
    { repo: "ferrous-labs/sparse-merkle", sym: "SMT", name: "Sparse Merkle", lang: "Rust", stars: 1380, raised: 0.64, contributors: 9, fees24: 0.1342, status: "public", age: "3 d" },
    { repo: "pinecrest/gas-oracle-rs", sym: "GASR", name: "Gas Oracle", lang: "Rust", stars: 3020, raised: 0.87, contributors: 17, fees24: 0.2208, status: "public", age: "6 d" },
    { repo: "halyard-dev/abi-lens", sym: "LENS", name: "ABI Lens", lang: "TypeScript", stars: 912, raised: 0.41, contributors: 6, fees24: 0.0487, status: "public", age: "2 d" },
    { repo: "oakline/nonce-guard", sym: "NGRD", name: "Nonce Guard", lang: "Go", stars: 455, raised: 0.07, contributors: 4, fees24: 0.0094, status: "window", age: "3 h" },
    { repo: "lumen-rs/evm-trace", sym: "TRCE", name: "EVM Trace", lang: "Rust", stars: 4710, raised: 1, contributors: 23, fees24: 0.3125, status: "grad", age: "12 d" },
    { repo: "marlow-io/eip712-forms", sym: "SIGN", name: "EIP-712 Forms", lang: "TypeScript", stars: 688, raised: 0.55, contributors: 8, fees24: 0.0733, status: "public", age: "4 d" },
    { repo: "ashgrove/tx-replay", sym: "RPLY", name: "Tx Replay", lang: "Go", stars: 1205, raised: 0.72, contributors: 11, fees24: 0.1019, status: "public", age: "5 d" },
    { repo: "corvid-sh/keystore-cli", sym: "KEYS", name: "Keystore CLI", lang: "Rust", stars: 530, raised: 0.23, contributors: 5, fees24: 0.0216, status: "public", age: "1 d" },
    { repo: "wrenfield/blob-indexer", sym: "BLOB", name: "Blob Indexer", lang: "Go", stars: 341, raised: 0.03, contributors: 7, fees24: 0.0031, status: "window", age: "52 min" },
    { repo: "stonebridge/solc-fmt", sym: "SFMT", name: "solc-fmt", lang: "Solidity", stars: 1960, raised: 1, contributors: 14, fees24: 0.1874, status: "grad", age: "19 d" },
    { repo: "quarry-labs/rlp-stream", sym: "RLPS", name: "RLP Stream", lang: "Rust", stars: 274, raised: 0.12, contributors: 3, fees24: 0.0122, status: "public", age: "20 h" }
  ];
  var qrpcContributors = [
    { gh: "mira-k", wallet: "0x8c1F…4a2E", share: 31.2, claimed: 0.0820 },
    { gh: "dvasquez", wallet: "0x2b7D…e019", share: 18.4, claimed: 0.0410 },
    { gh: "t-okafor", wallet: "0xa45C…77b3", share: 12.1, claimed: 0.0300 },
    { gh: "lenaschultz", wallet: "0x19eA…c6d0", share: 9.6, claimed: 0 },
    { gh: "haru-n", wallet: "0x3bE2…9f21", share: 7.3, claimed: 0.0120 },
    { gh: "pbrennan", wallet: "0x6f03…1b8c", share: 5.8, claimed: 0.0150 },
    { gh: "ines-dev", wallet: "0xd2A9…0e5f", share: 4.4, claimed: 0 },
    { gh: "kowalczyk", wallet: "0x07bB…a3d4", share: 3.9, claimed: 0.0100 },
    { gh: "ayo-b", wallet: "0xe88f…52c1", share: 2.9, claimed: 0 },
    { gh: "j-lindqvist", wallet: "0x5c4e…d97a", share: 2.1, claimed: 0.0040 },
    { gh: "samir-h", wallet: "0xb10D…3e66", share: 1.4, claimed: 0 },
    { gh: "rrao", wallet: "0x4a6c…f0b2", share: 0.9, claimed: 0 }
  ];
  var QRPC_TOTAL_COMMITS = 1284;
  var QRPC_FEES_TOTAL = 0.3840;
  window.TRIB.launches = launches;
  window.TRIB.qrpc = { contributors: qrpcContributors, commits: QRPC_TOTAL_COMMITS, fees: QRPC_FEES_TOTAL };

  /* ---------- Theme ---------- */
  var stored = null;
  try { stored = localStorage.getItem("trib-theme"); } catch (e) {}
  var qTheme = params.get("theme");
  var theme = qTheme || stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  root.setAttribute("data-theme", theme);
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("trib-theme", t); } catch (e) {}
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
    document.dispatchEvent(new CustomEvent("trib:theme"));
  }

  /* ---------- Identicons (GitHub-style 5x5, mirrored) ---------- */
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function identicon(seed, tone) {
    var h = hash(seed), cells = "";
    for (var y = 0; y < 5; y++) for (var x = 0; x < 3; x++) {
      var bit = (h >> (y * 3 + x)) & 1;
      if (bit) {
        cells += '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="1" height="1"/>';
        if (x < 2) cells += '<rect x="' + (5 - x) + '" y="' + (y + 1) + '" width="1" height="1"/>';
      }
    }
    var op = 0.62 + ((h >>> 20) % 38) / 100;
    var fill = tone === "ink" ? "var(--ink-2)" : "var(--accent)";
    return '<svg viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges"><g fill="' + fill + '" fill-opacity="' + op.toFixed(2) + '">' + cells + "</g></svg>";
  }
  window.TRIB.identicon = identicon;
  function paintAvatars(scope) {
    (scope || document).querySelectorAll("[data-av]").forEach(function (el) {
      if (!el.firstChild) el.innerHTML = identicon(el.getAttribute("data-av"), el.getAttribute("data-tone"));
    });
  }
  window.TRIB.paintAvatars = paintAvatars;

  /* ---------- Page state (prototype review aid) ---------- */
  var state = params.get("state") || document.body.getAttribute("data-default-state") || "ready";
  var wallet = params.get("wallet") || document.body.getAttribute("data-default-wallet") || "disconnected";
  document.body.setAttribute("data-state", state);
  document.body.setAttribute("data-wallet", wallet);
  window.TRIB.state = state; window.TRIB.wallet = wallet;
  function showFor(attr, value) {
    document.querySelectorAll("[data-show-" + attr + "]").forEach(function (el) {
      var list = el.getAttribute("data-show-" + attr).split(" ");
      el.hidden = list.indexOf(value) === -1;
    });
  }
  showFor("state", state);
  showFor("wallet", wallet);

  /* ---------- Header wallet ---------- */
  function renderWallet() {
    var slot = document.querySelector("[data-wallet-slot]");
    var pill = document.querySelector(".netpill");
    if (!slot) return;
    if (wallet === "wrong") {
      slot.innerHTML = '<button class="btn btn-sm btn-warn" type="button">Switch network</button>';
      if (pill) { pill.classList.add("is-wrong"); pill.lastChild.textContent = "Wrong network"; }
    } else if (wallet === "disconnected") {
      slot.innerHTML = '<a class="btn btn-sm btn-ink" href="?wallet=connected">Connect wallet</a>';
    } else {
      var who = wallet === "outsider" ? "0x91aC…07d5" : "0x3bE2…9f21";
      slot.innerHTML = '<button class="btn btn-sm wallet-addr" type="button" aria-label="Wallet ' + who + '"><span class="av av-sm" data-av="' + who + '"></span><span class="num">' + who + "</span></button>";
      paintAvatars(slot);
    }
  }

  /* ---------- Curve chart (shared by landing and launch page) ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function drawCurve(host, opt) {
    var W = Math.max(280, Math.round(host.clientWidth));
    var H = opt.height || (W < 560 ? 220 : 300);
    var pad = opt.pad || { l: 8, r: 8, t: 24, b: 28 };
    var x0 = pad.l + (opt.lead || 0), x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    var pmax = priceAt(1) * 1.08;
    function X(x) { return x0 + x * (x1 - x0); }
    function Y(p) { return y0 - (p / pmax) * (y0 - y1); }
    host.innerHTML = "";
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": opt.label || "Bonding curve" }, host);
    var defs = el("defs", {}, svg);
    var pat = el("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: "var(--accent-wash)" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, "class": "hatch-line" }, pat);

    if (opt.grid) {
      var g = el("g", { "class": "grid" }, svg);
      for (var i = 0; i <= 4; i++) { var yy = Math.round(y1 + (i * (y0 - y1)) / 4) + 0.5; el("line", { x1: x0, x2: x1, y1: yy, y2: yy }, g); }
      var ax = el("g", { "class": "axis" }, svg);
      for (var j = 0; j <= 4; j++) {
        var p = (pmax * (4 - j)) / 4;
        var t = el("text", { x: x0 + 4, y: Math.round(y1 + (j * (y0 - y1)) / 4) - 5 }, ax);
        t.textContent = j === 4 ? "" : fmt.gwei(p) + " gwei";
      }
      ["0", "200M", "400M", "600M", "800M"].forEach(function (s, k) {
        var tx = el("text", { x: X(k / 4), y: H - 8, "text-anchor": k === 0 ? "start" : k === 4 ? "end" : "middle" }, ax);
        tx.textContent = s;
      });
    }

    function pathFor(a, b, close) {
      var d = "", n = 64;
      for (var s = 0; s <= n; s++) { var x = a + ((b - a) * s) / n; d += (s ? "L" : "M") + X(x).toFixed(1) + " " + Y(priceAt(x)).toFixed(1); }
      if (close) d += "L" + X(b).toFixed(1) + " " + y0 + "L" + X(a).toFixed(1) + " " + y0 + "Z";
      return d;
    }
    var now = opt.now; // x in 0..1
    var win = opt.window == null ? 0 : opt.window;
    if (now > 0) el("path", { d: pathFor(0, now, true), "class": "area" }, svg);
    if (win > 0) el("path", { d: pathFor(0, Math.min(win, now || win), true), "class": "area-window" }, svg);
    if (opt.lead) el("line", { x1: pad.l, x2: x0, y1: y0 - 0.5, y2: y0 - 0.5, "class": "curve" }, svg);
    var ahead = el("path", { d: pathFor(now || 0, 1), "class": "curve-ahead" }, svg);
    var done = el("path", { d: pathFor(0, now || 1), "class": "curve" }, svg);
    if (opt.animate && !reduced) {
      var len = done.getTotalLength();
      done.style.setProperty("--len", len); done.classList.add("draw");
    }
    // graduation marker
    var gx = Math.round(X(1)) - 0.5;
    el("line", { x1: gx, x2: gx, y1: y1 - 12, y2: y0, "class": "grad-line" }, svg);
    var gl = el("text", { x: gx - 6, y: y1 - 2, "text-anchor": "end", "class": "lbl" }, svg);
    gl.textContent = opt.gradLabel || "Graduates at " + P.target.toFixed(2) + " ETH";
    if (now > 0 && now < 1) {
      var nx = X(now), ny = Y(priceAt(now));
      el("circle", { cx: nx, cy: ny, r: 9, "class": "now-ring" }, svg);
      el("circle", { cx: nx, cy: ny, r: 4, "class": "now" }, svg);
      if (opt.nowLabel) {
        var nt = el("text", { x: nx + 12, y: ny + 4, "class": "lbl-strong" }, svg);
        nt.textContent = opt.nowLabel;
      }
    }
    (opt.marks || []).forEach(function (m) {
      var mx = Math.round(X(m.x)) + 0.5;
      el("line", { x1: mx, x2: mx, y1: y0 - 6, y2: y0 + 4, "class": "grad-line" }, svg);
      var mt = el("text", { x: mx + (m.anchor === "end" ? -6 : 6), y: y0 + 16, "class": "lbl", "text-anchor": m.anchor || "start" }, svg);
      mt.textContent = m.text;
    });
    (opt.tags || []).forEach(function (m) {
      var tt = el("text", { x: m.x, y: m.y, "class": m.strong ? "lbl-strong" : "lbl", "text-anchor": m.anchor || "start" }, svg);
      tt.textContent = m.text;
    });
    if (opt.hover) {
      var tip = document.createElement("div"); tip.className = "chart-tip"; host.appendChild(tip);
      var xl = el("line", { y1: y1, y2: y0, "class": "xhair", opacity: 0 }, svg);
      var xd = el("circle", { r: 4, "class": "xdot", opacity: 0 }, svg);
      svg.addEventListener("pointermove", function (e) {
        var r = svg.getBoundingClientRect();
        var px = ((e.clientX - r.left) / r.width) * W;
        var x = Math.min(1, Math.max(0, (px - x0) / (x1 - x0)));
        var cx = X(x), cy = Y(priceAt(x));
        xl.setAttribute("x1", cx); xl.setAttribute("x2", cx); xl.setAttribute("opacity", 1);
        xd.setAttribute("cx", cx); xd.setAttribute("cy", cy); xd.setAttribute("opacity", 1);
        tip.innerHTML = fmt.int(x * 800) + "M sold &middot; " + fmt.gwei(priceAt(x)) + " gwei &middot; " + fmt.eth(raisedAt(x), 2) + " ETH raised";
        tip.style.left = (cx / W) * r.width + "px"; tip.style.top = (cy / H) * r.height + "px";
        tip.classList.add("is-on");
      });
      svg.addEventListener("pointerleave", function () { xl.setAttribute("opacity", 0); xd.setAttribute("opacity", 0); tip.classList.remove("is-on"); });
    }
    return { X: X, Y: Y, W: W, H: H, y0: y0, y1: y1, x0: x0 };
  }
  window.TRIB.drawCurve = drawCurve;
  window.TRIB.onResize = function (fn) {
    var last = 0, t;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { if (window.innerWidth !== last) { last = window.innerWidth; fn(); } }, 120);
    });
    document.addEventListener("trib:theme", fn);
  };

  /* ---------- Launch rows (landing preview + explore) ---------- */
  function tag(status) {
    if (status === "window") return '<span class="tag tag-window">Contributor window</span>';
    if (status === "grad") return '<span class="tag tag-grad">Graduated</span>';
    return '<span class="tag tag-public">Public</span>';
  }
  window.TRIB.tag = tag;
  function launchRow(l) {
    var parts = l.repo.split("/");
    var left = l.status === "grad" ? "In pool" : fmt.eth(P.target * (1 - l.raised), 2) + " ETH";
    return '<tr class="is-link" data-href="launch.html">' +
      '<td class="c-repo"><div class="repo"><span class="av" data-av="' + l.repo + '" data-tone="ink"></span><div style="min-width:0">' +
      '<a class="repo-name" href="launch.html"><span>' + parts[0] + "/</span>" + parts[1] + "</a>" +
      '<div class="repo-sub">' + l.lang + " &middot; " + fmt.compact(l.stars) + " stars &middot; " + l.age + "</div></div></div></td>" +
      '<td data-k="Token" class="c-tok"><span class="sym">' + l.sym + '</span> <span class="faint hide-s">' + l.name + "</span></td>" +
      '<td data-k="Curve" class="c-curve"><div class="prog-cell"><div class="meter' + (l.status === "grad" ? " is-grad" : "") + '"><i style="width:' + Math.round(l.raised * 100) + '%"></i></div><span class="num">' + (l.status === "grad" ? "100%" : Math.round(l.raised * 100) + "%") + "</span></div></td>" +
      '<td data-k="To graduation" class="r c-left">' + left + "</td>" +
      '<td data-k="Contributors" class="r c-contrib">' + l.contributors + "</td>" +
      '<td data-k="Fees, 24 h" class="r c-fees">' + fmt.eth(l.fees24) + " ETH</td>" +
      '<td class="c-status">' + tag(l.status) + "</td></tr>";
  }
  window.TRIB.launchRow = launchRow;
  function skeletonRows(n, cols) {
    var out = "";
    for (var i = 0; i < n; i++) {
      out += "<tr>";
      for (var c = 0; c < cols; c++) out += '<td' + (c === 0 ? ' class="full"' : "") + '><span class="sk" style="width:' + (c === 0 ? 70 + ((i * 13) % 25) : 50 + ((i * 7 + c * 11) % 40)) + '%"></span></td>';
      out += "</tr>";
    }
    return out;
  }
  window.TRIB.skeletonRows = skeletonRows;
  function bindRowLinks(scope) {
    scope.querySelectorAll("tr[data-href]").forEach(function (tr) {
      tr.addEventListener("click", function (e) { if (e.target.closest("a,button")) return; location.href = tr.getAttribute("data-href"); });
    });
  }
  window.TRIB.bindRowLinks = bindRowLinks;

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
      b.addEventListener("click", function () { setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"); });
    });
    var mb = document.querySelector(".menu-btn"), mn = document.querySelector(".mnav");
    if (mb && mn) mb.addEventListener("click", function () {
      var open = mn.classList.toggle("is-open");
      mb.setAttribute("aria-expanded", open ? "true" : "false");
      mb.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    renderWallet();
    paintAvatars();
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var txt = b.getAttribute("data-copy");
        if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
        var lbl = b.getAttribute("aria-label"); b.setAttribute("aria-label", "Copied");
        setTimeout(function () { b.setAttribute("aria-label", lbl); }, 1400);
      });
    });
  });
})();
