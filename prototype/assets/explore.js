/* Explore: filter, search, sort, and the loading / empty / error states. */
(function () {
  "use strict";
  var T = window.TRIB;
  var body = document.querySelector("[data-rows]");
  var empty = document.querySelector("[data-empty]");
  var count = document.querySelector("[data-count]");
  var q = document.querySelector("[data-q]");
  var sort = document.querySelector("[data-sort]");
  var filter = "all";
  var order = T.launches.slice(); // data is listed newest-first by age already curated below
  var ageMin = function (a) { var n = parseFloat(a); return /min/.test(a) ? n : /h/.test(a) ? n * 60 : n * 1440; };

  function render() {
    var term = (q.value || "").trim().toLowerCase();
    var rows = order.filter(function (l) {
      return (filter === "all" || l.status === filter) && (!term || l.repo.toLowerCase().indexOf(term) > -1 || l.sym.toLowerCase().indexOf(term) > -1);
    });
    var s = sort.value;
    rows.sort(function (a, b) {
      if (s === "close") return (a.status === "grad") - (b.status === "grad") || b.raised - a.raised;
      if (s === "fees") return b.fees24 - a.fees24;
      if (s === "contrib") return b.contributors - a.contributors;
      return ageMin(a.age) - ageMin(b.age);
    });
    body.innerHTML = rows.map(T.launchRow).join("");
    T.paintAvatars(body); T.bindRowLinks(body);
    empty.hidden = rows.length > 0;
    if (!rows.length) empty.querySelector("[data-empty-q]").textContent = term ? "“" + q.value.trim() + "”" : "this filter";
    count.textContent = "Showing " + rows.length + " of " + T.launches.length + " launches";
  }

  if (T.state === "loading") {
    body.innerHTML = T.skeletonRows(8, 7);
    count.textContent = "Reading launches from GIWA Sepolia…";
    return;
  }
  if (T.state === "error") {
    body.innerHTML = ""; count.hidden = true;
    document.querySelector("table.ledger").hidden = true;
    return;
  }
  if (T.state === "empty") q.value = "merkle-rs";
  render();

  document.querySelectorAll("[data-filter] button").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-f");
      document.querySelectorAll("[data-filter] button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      render();
    });
  });
  q.addEventListener("input", render);
  sort.addEventListener("change", render);
  document.querySelector("[data-clear]").addEventListener("click", function () { q.value = ""; filter = "all"; document.querySelectorAll("[data-filter] button").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-f") === "all" ? "true" : "false"); }); render(); q.focus(); });
})();
