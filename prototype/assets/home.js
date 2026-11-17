/* Landing page: live rows, phase curve, fee router. */
(function () {
  "use strict";
  var T = window.TRIB, fmt = T.fmt, P = T.P;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Live launches preview */
  var body = document.querySelector("[data-live-rows]");
  if (T.state === "loading") body.innerHTML = T.skeletonRows(5, 7);
  else {
    body.innerHTML = T.launches.filter(function (l) { return l.status !== "grad"; }).slice(0, 5).map(T.launchRow).join("");
    T.paintAvatars(body); T.bindRowLinks(body);
  }

  /* Phase curve: a flat lead-in for step 1, hatched window for step 2, the rest for step 3 */
  var phaseHost = document.querySelector("[data-phase-curve]");
  function drawPhases() {
    var w = phaseHost.clientWidth;
    var wide = window.innerWidth >= 900;
    var lead = wide ? Math.round(w * 0.35) : Math.round(w * 0.18);
    // wide: columns are 35 / 30 / 35, so the window ends at 65% of the width
    var win = wide ? (0.65 * w - lead) / (w - lead) : 0.3;
    var c = T.drawCurve(phaseHost, {
      height: wide ? 170 : 150, lead: lead, now: win, window: win, pad: { l: 0, r: 0, t: 26, b: 22 },
      gradLabel: wide ? "Graduates to a pool" : "Pool",
      label: "Bonding curve with the contributor window shaded"
    });
    // phase markers under the line
    var svg = phaseHost.querySelector("svg");
    function txt(x, s, anchor) {
      var t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", x); t.setAttribute("y", c.y0 + 16); t.setAttribute("class", "lbl"); t.setAttribute("text-anchor", anchor || "start");
      t.textContent = s; svg.appendChild(t);
    }
    if (!wide) { txt(2, "1"); txt(lead + 4, "2"); txt(c.X(win) + 4, "3"); }
  }
  drawPhases();
  T.onResize(drawPhases);

  /* Fee router: one fee pool splits into branches weighted by commit share */
  var host = document.querySelector("[data-router]");
  var top = T.qrpc.contributors.slice(0, 5);
  var rest = T.qrpc.contributors.slice(5).reduce(function (a, c) { return a + c.share; }, 0);
  var rows = top.map(function (c) { return { name: c.gh, share: c.share, av: c.gh }; });
  rows.push({ name: "7 more", share: rest, av: null });
  var total = 0.0611;
  rows.forEach(function (r) { r.amt = (total * r.share) / 100; });
  var ROW = 44, GX = window.innerWidth < 480 ? 64 : 92, TRUNK = window.innerWidth < 480 ? 20 : 30;
  var Hh = rows.length * ROW, mid = Hh / 2;
  var NS = "http://www.w3.org/2000/svg";
  var wrapEl = document.createElement("div");
  wrapEl.style.cssText = "position:relative;padding-left:" + (GX + 8) + "px";
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + GX + " " + Hh); svg.setAttribute("width", GX); svg.setAttribute("height", Hh);
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;left:0;top:0;width:" + GX + "px;height:" + Hh + "px";
  var paths = [];
  var trunk = document.createElementNS(NS, "path");
  trunk.setAttribute("d", "M6 " + mid + "H" + TRUNK); trunk.setAttribute("class", "trunk"); trunk.setAttribute("stroke-width", "5");
  svg.appendChild(trunk);
  rows.forEach(function (r, i) {
    var y = i * ROW + ROW / 2;
    var p = document.createElementNS(NS, "path");
    var d = "M" + TRUNK + " " + mid + "C" + (TRUNK + 34) + " " + mid + " " + (GX - 38) + " " + y + " " + GX + " " + y;
    p.setAttribute("d", d); p.setAttribute("class", "branch");
    p.setAttribute("stroke-width", (0.9 + r.share * 0.13).toFixed(2));
    svg.appendChild(p);
    var full = document.createElementNS(NS, "path");
    full.setAttribute("d", "M6 " + mid + "H" + TRUNK + d.slice(d.indexOf("C"))); // trunk + branch, the pulse's route
    full.setAttribute("fill", "none"); full.setAttribute("stroke", "none");
    svg.appendChild(full);
    paths.push({ el: full, row: i });
    if (!reduced) {
      p.style.setProperty("--len", 200); p.classList.add("draw");
      p.style.animationDelay = 120 + i * 60 + "ms";
    }
  });
  var node = document.createElementNS(NS, "circle");
  node.setAttribute("cx", 6); node.setAttribute("cy", mid); node.setAttribute("r", 5); node.setAttribute("class", "node");
  svg.appendChild(node);
  var pulse = document.createElementNS(NS, "circle");
  pulse.setAttribute("r", 3); pulse.setAttribute("class", "pulse"); pulse.setAttribute("opacity", 0);
  svg.appendChild(pulse);
  wrapEl.appendChild(svg);

  var list = document.createElement("ul");
  list.innerHTML = rows.map(function (r) {
    return '<li style="height:' + ROW + 'px;display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:14px">' +
      (r.av ? '<span class="av av-sm" data-av="' + r.av + '"></span>' : '<span class="av av-sm" aria-hidden="true"></span>') +
      '<span style="min-width:0;line-height:1.25"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550' + (r.av ? "" : ";color:var(--ink-2)") + '">' + r.name + '</span><span class="faint num" style="font-size:12px">' + fmt.pct(r.share) + " of fees</span></span>" +
      '<span class="num" style="font-weight:600" data-amt>' + fmt.eth(r.amt) + "</span></li>";
  }).join("");
  wrapEl.appendChild(list);
  host.appendChild(wrapEl);
  T.paintAvatars(list);

  // One trade every few seconds: a pulse travels the branch, that row's amount grows.
  var paused = reduced, timer = null;
  var amtEls = list.querySelectorAll("[data-amt]");
  var totalEl = document.querySelector("[data-router-total]");
  var pauseBtn = document.querySelector("[data-router-pause]");
  if (reduced && pauseBtn) pauseBtn.hidden = true;
  function trade() {
    if (paused) return;
    var fee = 0.0004 + Math.random() * 0.0011;
    total += fee;
    var target = Math.random() * 100, acc = 0, pick = 0;
    for (var i = 0; i < rows.length; i++) { acc += rows[i].share; if (target <= acc) { pick = i; break; } }
    var p = paths[pick].el;
    var len = p.getTotalLength(), t0 = performance.now(), dur = 900;
    pulse.setAttribute("opacity", 1);
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      var pt = p.getPointAtLength(len * e);
      pulse.setAttribute("cx", pt.x); pulse.setAttribute("cy", pt.y);
      if (k < 1) requestAnimationFrame(step);
      else {
        pulse.setAttribute("opacity", 0);
        rows.forEach(function (r, j) { r.amt = (total * r.share) / 100; amtEls[j].textContent = fmt.eth(r.amt); });
        totalEl.textContent = fmt.eth(total) + " ETH";
      }
    })(t0);
  }
  if (!reduced) timer = setInterval(trade, 3600);
  if (pauseBtn) pauseBtn.addEventListener("click", function () {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
  });
})();
