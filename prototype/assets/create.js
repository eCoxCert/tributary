/* Create flow: repo -> contributors -> token -> review, with empty / loading / missing / error states. */
(function () {
  "use strict";
  var T = window.TRIB, fmt = T.fmt;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return document.querySelectorAll(s); };
  var repo = $("[data-repo]"), err = $("[data-repo-err]");
  var steps = $$("[data-steps] li");

  function setStep(n) {
    steps.forEach(function (li, i) {
      li.classList.toggle("is-done", i < n);
      if (i === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      li.querySelector("i").textContent = i < n ? "✓" : String(i + 1);
    });
  }
  function stage(name) {
    var show = { empty: [], loading: ["loading"], error: [], missing: ["missing"], found: ["found"], review: ["found", "review"], done: ["found", "review", "done"] }[name];
    $$("[data-stage]").forEach(function (s) { s.hidden = show.indexOf(s.getAttribute("data-stage")) === -1; });
    err.hidden = name !== "error";
    var reads = $("[data-stage-empty]"); if (reads) reads.hidden = !(name === "empty" || name === "error");
    repo.setAttribute("aria-invalid", name === "error" ? "true" : "false");
    setStep({ empty: 0, loading: 0, error: 0, missing: 1, found: 2, review: 3, done: 4 }[name]);
    $$("[data-repo-name]").forEach(function (n) { n.textContent = repo.value || "tidewater/quill-rpc"; });
    if (name === "error") err.textContent = "github.com/" + (repo.value || "tidewater/quil-rpc") + " was not found, or it is private. Tributary can read public repositories only.";
  }

  /* Contributor preview: file weight vs commit share on main */
  var commitShare = { "ines-dev": 3.1, "mira-k": 30.8, "dvasquez": 18.9, "t-okafor": 12.4, "lenaschultz": 9.2, "haru-n": 7.6, "pbrennan": 6.1, "kowalczyk": 4.2, "ayo-b": 3.3, "j-lindqvist": 2.3, "samir-h": 1.3, "rrao": 0.8 };
  var tb = $("[data-preview]");
  tb.innerHTML = T.qrpc.contributors.map(function (c) {
    var cs = commitShare[c.gh], diff = Math.abs(cs - c.share) > 1;
    return "<tr>" +
      '<td class="full"><div class="who-cell"><span class="av" data-av="' + c.gh + '"></span><b>' + c.gh + "</b></div></td>" +
      '<td data-k="Wallet"><span class="mono">' + c.wallet + "</span></td>" +
      '<td data-k="Weight in file" class="r">' + fmt.pct(c.share) + "</td>" +
      '<td data-k="Commit share on main" class="r r-m">' + (diff ? '<span class="tag" style="color:var(--warn);background:var(--warn-wash)">' + fmt.pct(cs) + "</span>" : '<span class="num">' + fmt.pct(cs) + "</span>") + "</td></tr>";
  }).join("");
  T.paintAvatars(tb);

  /* Read repository */
  function read(value) {
    var v = value.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "");
    repo.value = v;
    if (!/^[\w.-]+\/[\w.-]+$/.test(v)) { stage("error"); err.textContent = "Enter the repository as owner/name, for example tidewater/quill-rpc."; repo.focus(); return; }
    stage("loading");
    setTimeout(function () {
      if (/plain-cli|no-katki/.test(v)) stage("missing");
      else if (/quill-rpc/.test(v)) stage("found");
      else stage("error");
    }, 1100);
  }
  $("[data-repo-form]").addEventListener("submit", function (e) { e.preventDefault(); read(repo.value); });
  $$("[data-try]").forEach(function (b) { b.addEventListener("click", function () { read(b.getAttribute("data-try")); }); });
  $("[data-recheck]").addEventListener("click", function () { read(repo.value); });

  /* Token fields */
  var tn = $("[data-tname]"), ts = $("[data-tsym]");
  function syncToken() {
    var sym = ts.value.toUpperCase();
    var ok = /^[A-Z0-9]{2,6}$/.test(sym);
    ts.setAttribute("aria-invalid", ok ? "false" : "true");
    $("[data-tsym-err]").hidden = ok; $("[data-tsym-hint]").hidden = !ok;
    $("[data-pv-name]").textContent = tn.value || "Untitled";
    $("[data-pv-sym]").textContent = sym;
    $("[data-rv-token]").textContent = (tn.value || "Untitled") + " (" + sym + ")";
    var l = $("[data-launch]"); if (l) l.textContent = "Launch " + (sym || "token");
    $("[data-to-review]").disabled = !ok || !tn.value.trim();
    return ok;
  }
  tn.addEventListener("input", syncToken); ts.addEventListener("input", syncToken);
  $("[data-to-review]").addEventListener("click", function () {
    if (!syncToken()) return;
    stage("review");
    $("[data-stage='review']").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  var launchBtn = $("[data-launch]");
  if (launchBtn) launchBtn.addEventListener("click", function () {
    launchBtn.disabled = true;
    launchBtn.innerHTML = '<span class="spin" aria-hidden="true"></span>Confirm in your wallet';
    setTimeout(function () { stage("done"); launchBtn.innerHTML = "Launched"; }, 1800);
  });

  /* Initial state from ?state= */
  var s = T.state === "ready" ? "empty" : T.state;
  if (s === "loading") { repo.value = "tidewater/quill-rpc"; }
  if (s === "missing") { repo.value = "oakline/plain-cli"; }
  if (s === "error") { repo.value = "tidewater/quil-rpc"; }
  if (s === "found" || s === "review" || s === "done") { repo.value = "tidewater/quill-rpc"; }
  stage(s);
  if (location.hash === "#katki" && s === "empty") { repo.value = "oakline/plain-cli"; stage("missing"); }
  syncToken();
})();
