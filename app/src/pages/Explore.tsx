import { useTitle } from "../hooks/useTitle";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Banner, SkeletonRows } from "../components/ui";
import { LaunchRow, LaunchesHead, isListed, statusOf } from "../components/LaunchRows";
import { useCards, useDiscovery, type Card } from "../hooks/useChainData";
import { fmt } from "../lib/format";
import { listState, plural } from "../lib/visibility";

type Filter = "all" | "public" | "grad";
type Sort = "new" | "close" | "fees" | "contrib";
const PAGE = 25;

export function Explore() {
  const [sp] = useSearchParams();
  const debug = sp.get("all") === "1";
  useTitle("Launches");
  const d = useDiscovery(debug);
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [limit, setLimit] = useState(PAGE);

  const recs = d.launches.slice(0, limit);
  const queries = useCards(recs);
  const cards: (Card | undefined)[] = queries.map((q) => q.data);
  const settled = cards.filter(Boolean).length;
  const visibleCards = (cards.filter(Boolean) as Card[]).filter((c) => isListed(c, debug));
  const loaded = visibleCards.filter((c) => c.verified?.status !== "unverifiable"); // unchecked launches add no contributor or fee figures

  const view = useMemo(() => {
    const t = term.trim().toLowerCase();
    const items = recs.map((rec, i) => ({ rec, q: queries[i]!, card: cards[i] }));
    const filtered = items.filter((it) => {
      if (it.card && !isListed(it.card, debug)) return false; // only verified Tributary launches are listed
      if (filter !== "all" && it.card) {
        const s = statusOf(it.card);
        if (filter === "grad" ? s !== "grad" : s === "grad") return false;
      }
      if (filter !== "all" && !it.card) return false;
      if (!t) return true;
      const name = (it.rec.meta?.repo ?? "").toLowerCase();
      const sym = it.card?.snap.symbol.toLowerCase() ?? "";
      const nm = it.card?.snap.name.toLowerCase() ?? "";
      return name.includes(t) || sym.includes(t) || nm.includes(t) || it.rec.token.toLowerCase().includes(t);
    });
    filtered.sort((a, b) => {
      if (sort === "new") return a.rec.block > b.rec.block ? -1 : a.rec.block < b.rec.block ? 1 : 0;
      if (!a.card || !b.card) return a.card ? -1 : b.card ? 1 : 0;
      if (sort === "close") return (statusOf(a.card) === "grad" ? 1 : 0) - (statusOf(b.card) === "grad" ? 1 : 0) || b.card.snap.progress.progressBps - a.card.snap.progress.progressBps;
      if (sort === "fees") return Number((b.card.vault?.totalFunded ?? 0n) + (b.card.vault?.pendingInFeeVault ?? 0n) - ((a.card.vault?.totalFunded ?? 0n) + (a.card.vault?.pendingInFeeVault ?? 0n)));
      return (b.card.vault?.recipients.length ?? 0) - (a.card.vault?.recipients.length ?? 0);
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs.map((r) => r.curve).join(), queries.map((q) => q.dataUpdatedAt).join(), filter, term, sort]);

  const allRead = !d.scanning && settled === recs.length;
  const live = loaded.filter((c) => statusOf(c) !== "grad").length;
  const grad = loaded.filter((c) => statusOf(c) === "grad").length;
  const people = loaded.reduce((a, c) => a + (c.vault?.recipients.length ?? 0), 0);
  const fees = loaded.reduce((a, c) => a + (c.vault ? c.vault.totalFunded + c.vault.pendingInFeeVault : 0n), 0n);

  const visibleItems = recs.map((rec, i) => ({ rec, card: cards[i] })).filter((x) => !x.card || isListed(x.card, debug));
  const state = listState({ scanning: d.scanning, error: !!d.error, anyPending: queries.some((q) => q.isPending), visible: visibleCards.length, shown: view.length, rawCount: d.launches.length });
  const filtering = term.trim() !== "" || filter !== "all";
  const stat = (v: string | number) => (allRead ? v : "–");
  const scannedDays = d.head !== null && d.scannedFrom !== null ? Math.max(0, Number(d.head - d.scannedFrom) / 86400) : null;

  return (
    <main id="main-content" className="page">
      <div className="wrap">
        <div className="page-hd">
          <div>
            <h1>Launches</h1>
            <p>Repository tokens on GIWA Sepolia, newest first.{debug ? " Debug view: launches that were not made with Tributary are included." : ""}</p>
          </div>
          <Link className="btn btn-primary" to="/create">Launch your repo</Link>
        </div>

        <dl className="statline">
          <div><dt>Live launches</dt><dd><b>{stat(live)}</b></dd></div>
          <div><dt>Graduated</dt><dd><b>{stat(grad)}</b></dd></div>
          <div><dt>Contributors with a share</dt><dd><b>{stat(people)}</b></dd></div>
          <div><dt>Fees earned</dt><dd><b>{allRead ? `${fmt.eth(fees)} ETH` : "–"}</b></dd></div>
        </dl>

        <div className="toolbar" role="search">
          <div className="seg" role="group" aria-label="Filter by status">
            {([["all", "All"], ["public", "Public"], ["grad", "Graduated"]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor="q">Search repositories and tokens</label>
          <input className="input search" id="q" type="search" placeholder="Search repo or symbol" autoComplete="off" value={term} onChange={(e) => setTerm(e.target.value)} />
          <label className="visually-hidden" htmlFor="sort">Sort launches</label>
          <select className="input sort" id="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">Newest</option>
            <option value="close">Closest to graduation</option>
            <option value="fees">Fees earned</option>
            <option value="contrib">Most contributors</option>
          </select>
        </div>

        {d.error && (
          <div style={{ marginBottom: 16 }}>
            <Banner kind="err" action={<button className="btn btn-sm" type="button" onClick={d.retry}>Try again</button>}>
              <b>Launches did not load.</b> {d.error} Nothing was sent; your funds are not affected.
              {d.launches.length ? ` Showing the ${d.launches.length} found before the error.` : ""}
            </Banner>
          </div>
        )}

        <div className="panel">
          <table className="ledger stack launches" aria-describedby="count">
            <LaunchesHead />
            <tbody>
              {state === "loading" ? (
                <SkeletonRows rows={6} cols={7} />
              ) : state === "empty" ? (
                <tr>
                  <td className="full" colSpan={7}>
                    <div className="notice notice-c">
                      <h3>{debug ? "No launches found in the scanned blocks" : "No Tributary launches yet"}</h3>
                      <p>
                        {debug
                          ? "The factory emitted no LaunchCreated events in the scanned range. Look further back below."
                          : "A launch appears here once someone creates one from a repository with a .katki.json. Be the first."}
                      </p>
                      {!debug && <Link className="btn btn-sm" to="/create">Launch your repo</Link>}
                    </div>
                  </td>
                </tr>
              ) : state === "no-match" ? (
                <tr>
                  <td className="full" colSpan={7}>
                    <div className="notice notice-c">
                      <h3>No launches match {term.trim() ? `“${term.trim()}”` : "this filter"}</h3>
                      <p>Search looks at the repository name, the token name and symbol, and the token address. Check the spelling{filtering ? ", or clear the search to see all " + plural(visibleCards.length, "launch") : ""}.</p>
                      {filtering && <button className="btn btn-sm" type="button" onClick={() => { setTerm(""); setFilter("all"); }}>Clear search</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                view.map((it) => <LaunchRow key={it.rec.curve} rec={it.rec} q={it.q} debug={debug} />)
              )}
            </tbody>
          </table>
        </div>

        <p className="hint" id="count" style={{ marginTop: 12 }} title={d.scannedFrom !== null ? `Blocks ${d.scannedFrom} to ${d.head}` : undefined}>
          {d.scanning && recs.length === 0
            ? "Reading launches from GIWA Sepolia…"
            : `Showing ${view.length} of ${plural(visibleItems.length, "launch")}${d.source === "chain" && scannedDays !== null ? ` from the last ${scannedDays.toFixed(1)} days` : ""}.`}
          {d.source === "data-api" ? " Source: Ammora Data API." : ""}
          {d.scanning && recs.length > 0 ? " Still scanning…" : ""}
        </p>
        <div className="scan-actions">
          {visibleItems.length >= limit && d.launches.length > limit && <button className="btn btn-sm" type="button" onClick={() => setLimit((l) => l + PAGE)}>Show more launches</button>}
          {d.source === "chain" && !d.scanning && <button className="btn btn-sm" type="button" onClick={d.extend}>Look further back</button>}
        </div>
      </div>
    </main>
  );
}

