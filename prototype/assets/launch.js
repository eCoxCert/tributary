/* Launch page: curve, countdown, trade estimate, contributor ledger, lock dates. */
(function () {
  "use strict";
  var T = window.TRIB, fmt = T.fmt, P = T.P;
  var $ = function (s) { return document.querySelector(s); };
  var RAISED = 0.18;                       // share of the graduation target raised so far (sample)
  var x = T.xForRaised(RAISED);
  var price = T.priceAt(x);
  var startPrice = T.priceAt(0);

  /* Dates: the window closes 14 h 22 m 05 s after the page opens (sample) */
  var opens = new Date(Date.now() + ((14 * 60 + 22) * 60 + 5) * 1000);
  var launched = new Date(opens.getTime() - P.windowHours * 3600e3);
  var unlock = new Date(launched.getTime() + P.lockDays * 86400e3);
  var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function d(dt) { return dt.getUTCDate() + " " + M[dt.getUTCMonth()] + " " + dt.getUTCFullYear(); }
  function dt(t) { return d(t) + ", " + String(t.getUTCHours()).padStart(2, "0") + ":" + String(t.getUTCMinutes()).padStart(2, "0") + " UTC"; }
  $("[data-launched]").textContent = dt(launched);
  $("[data-opens]").textContent = dt(opens);
  $("[data-lock-start]").textContent = d(launched);
  $("[data-lock-end]").textContent = d(unlock);
  $("[data-unlock]").textContent = "All at once, " + d(unlock);
  var daysLeft = Math.ceil((unlock - Date.now()) / 86400e3);
  $("[data-lock-left]").textContent = daysLeft + " days left";

  /* Price block */
  $("[data-price]").textContent = fmt.gwei(price) + " gwei";
  $("[data-change]").textContent = "+" + fmt.pct((price / startPrice - 1) * 100) + " since launch";
  $("[data-mcap]").textContent = "Market cap " + fmt.eth(price * P.totalSupply, 2) + " ETH";
  $("[data-raised]").textContent = fmt.eth(RAISED * P.target) + " of " + P.target.toFixed(2) + " ETH";
  $("[data-sold]").textContent = (x * 800).toFixed(1) + "M of 800M";
  $("[data-left]").textContent = fmt.eth((1 - RAISED) * P.target) + " ETH";

  /* Curve */
  var host = $("[data-curve]");
  function draw(animate) {
    T.drawCurve(host, { now: x, window: x, grid: true, hover: true, animate: animate, pad: { l: 0, r: 4, t: 26, b: 26 },
      nowLabel: fmt.gwei(price) + " gwei", label: "QRPC bonding curve. " + Math.round(x * 100) + "% of curve supply sold." });
  }
  if (T.state !== "loading") { draw(true); T.onResize(function () { draw(false); }); }

  /* Countdown */
  var hEl = $("[data-h]"), mEl = $("[data-m]"), sEl = $("[data-s]"), inline = $("[data-clock-inline]");
  function tick() {
    var left = Math.max(0, Math.floor((opens - Date.now()) / 1000));
    var h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
    hEl.textContent = String(h).padStart(2, "0"); mEl.textContent = String(m).padStart(2, "0"); sEl.textContent = String(s).padStart(2, "0");
    if (inline) inline.textContent = hEl.textContent + ":" + mEl.textContent + ":" + sEl.textContent;
  }
  tick(); setInterval(tick, 1000);

  /* Trade estimate */
  var side = "buy";
  var amt = $("[data-amt]"), recv = $("[data-recv]"), after = $("[data-after]"), fee = $("[data-fee]");
  var BAL_ETH = 0.412, BAL_TOK = 18.42e6;
  function tokensFor(eth) {             // ETH in (after fee) -> tokens out along the curve
    var R0 = T.raisedAt(x), R1 = R0 + eth;
    var x1 = Math.log(1 + (R1 * P.growth) / (P.curveSupply * P.a)) / P.growth;
    return { tokens: (x1 - x) * P.curveSupply, x1: x1 };
  }
  function ethFor(tokens) {
    var x1 = Math.max(0, x - tokens / P.curveSupply);
    return { eth: T.raisedAt(x) - T.raisedAt(x1), x1: x1 };
  }
  function calc() {
    var v = parseFloat(String(amt.value).replace(/,/g, "")) || 0;
    var ok = v > 0;
    if (side === "buy") {
      var f = (v * P.feePct) / 100, r = tokensFor(v - f);
      recv.textContent = ok ? fmt.eth(r.tokens / 1e6, 2) + "M QRPC" : "0 QRPC";
      after.textContent = fmt.gwei(T.priceAt(ok ? r.x1 : x)) + " gwei";
      fee.textContent = fmt.eth(f) + " ETH";
    } else {
      var s = ethFor(v * 1e6), f2 = (s.eth * P.feePct) / 100;
      recv.textContent = ok ? fmt.eth(s.eth - f2) + " ETH" : "0 ETH";
      after.textContent = fmt.gwei(T.priceAt(ok ? s.x1 : x)) + " gwei";
      fee.textContent = fmt.eth(f2) + " ETH";
    }
  }
  amt.addEventListener("input", calc);
  document.querySelectorAll("[data-chips] .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      var v = c.getAttribute("data-v");
      amt.value = v === "max" ? (side === "buy" ? (BAL_ETH - 0.002).toFixed(4) : (BAL_TOK / 1e6).toFixed(2)) : v;
      calc();
    });
  });
  document.querySelectorAll("[data-side]").forEach(function (b) {
    b.addEventListener("click", function () {
      side = b.getAttribute("data-side");
      document.querySelectorAll("[data-side]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      $("[data-amt-label]").textContent = side === "buy" ? "You pay" : "You sell";
      $("[data-unit]").textContent = side === "buy" ? "ETH" : "M QRPC";
      $("[data-bal]").textContent = side === "buy" ? "Balance 0.4120 ETH" : "Balance 18.42M QRPC";
      $("[data-recv-label]").textContent = side === "buy" ? "You receive about" : "You get about";
      var chips = document.querySelectorAll("[data-chips] .chip");
      var vals = side === "buy" ? ["0.01", "0.05", "0.1"] : ["1", "5", "10"];
      vals.forEach(function (v, i) { chips[i].setAttribute("data-v", v); chips[i].textContent = side === "buy" ? v : v + "M"; });
      amt.value = side === "buy" ? "0.05" : "5";
      var cta = $("[data-cta]"); if (cta) cta.textContent = side === "buy" ? "Buy QRPC" : "Sell QRPC";
      calc();
    });
  });
  calc();

  /* Contributor ledger */
  var tb = $("[data-contrib]");
  if (T.state === "loading") { tb.innerHTML = T.skeletonRows(6, 6); return; }
  var me = T.wallet === "connected" ? "haru-n" : null;
  var Q = T.qrpc, sumEarn = 0, sumUn = 0;
  var rows = Q.contributors.map(function (c) {
    var earned = (Q.fees * c.share) / 100, un = Math.max(0, earned - c.claimed);
    sumEarn += earned; sumUn += un;
    var mine = c.gh === me;
    return '<tr' + (mine ? ' class="is-you"' : "") + '>' +
      '<td class="c-who"><div class="who-cell"><span class="av" data-av="' + c.gh + '"></span><div style="min-width:0"><b>' + c.gh + (mine ? '<span class="you">You</span>' : "") + '</b><span class="mono">' + c.wallet + "</span></div></div></td>" +
      '<td data-k="Share" class="c-share"><div class="share"><span class="num">' + fmt.pct(c.share) + '</span><div class="meter"><i style="width:' + (c.share / 31.2) * 100 + '%"></i></div></div></td>' +
      '<td data-k="Commits" class="r c-commits">' + fmt.int((Q.commits * c.share) / 100) + "</td>" +
      '<td data-k="Earned" class="r c-earned">' + fmt.eth(earned) + "</td>" +
      '<td data-k="Unclaimed" class="r c-un' + (mine ? " is-mine" : "") + '">' + fmt.eth(un) + "</td>" +
      '<td class="r c-act' + (mine ? " is-mine" : "") + '">' + (mine ? '<button class="btn btn-sm btn-primary" type="button" data-claim>Claim ' + fmt.eth(un) + " ETH</button>" : "") + "</td></tr>";
  });
  rows.push('<tr class="is-total"><td class="c-who"><b>12 contributors</b></td><td data-k="Share" class="c-share num">100.0%</td><td data-k="Commits" class="r c-commits">' + fmt.int(Q.commits) + '</td><td data-k="Earned" class="r c-earned"><b>' + fmt.eth(sumEarn) + '</b></td><td data-k="Unclaimed" class="r c-un"><b>' + fmt.eth(sumUn) + '</b></td><td class="c-act"></td></tr>');
  tb.innerHTML = rows.join("");
  T.paintAvatars(tb);
  var claim = $("[data-claim]");
  if (claim) claim.addEventListener("click", function () {
    claim.disabled = true; claim.innerHTML = '<span class="spin" aria-hidden="true"></span>Confirm in wallet';
    setTimeout(function () { claim.innerHTML = "Claimed"; claim.closest("tr").querySelector(".c-un").textContent = fmt.eth(0); }, 1600);
  });
})();
