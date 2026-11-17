import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Av, Banner } from "./ui";
import { useTheme } from "../hooks/useTheme";
import { useWallet } from "../hooks/useWallet";
import { fmt } from "../lib/format";

const Mark = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2.5 5.25H8a4 4 0 0 1 4 4M21.5 5.25H16a4 4 0 0 0-4 4" stroke="currentColor" strokeWidth="2.5" />
    <path className="stem" d="M12 8.75V21" stroke="currentColor" strokeWidth="3.5" />
  </svg>
);

const links: [string, string][] = [
  ["/launches", "Launches"],
  ["/create", "Launch a repo"],
  ["/format", ".tributary.json"],
];

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const wrong = w.status === "wrong";

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="testnet">
        <div className="wrap">
          <span>
            <b>Testnet.</b> Tributary runs on GIWA Sepolia. Testnet tokens have no market value. Figures come from the chain.
          </span>
        </div>
      </div>

      <header className="hdr">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Tributary home">
            <Mark />
            Tributary
          </Link>
          <nav className="nav" aria-label="Main">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} aria-current={loc.pathname.startsWith(to) ? "page" : undefined}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="hdr-end">
            <span className={`netpill${wrong ? " is-wrong" : ""}`}>
              <i />
              <span>{wrong ? "Wrong network" : "GIWA Sepolia"}</span>
            </span>
            <button className="iconbtn" type="button" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              <svg className="theme-light-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" />
              </svg>
              <svg className="theme-dark-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="10" cy="10" r="3.5" />
                <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4" />
              </svg>
            </button>
            <WalletSlot />
            <button className="iconbtn menu-btn" type="button" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M3 6h14M3 10h14M3 14h14" />
              </svg>
            </button>
          </div>
        </div>
        <nav className={`mnav${open ? " is-open" : ""}`} aria-label="Mobile">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} aria-current={loc.pathname.startsWith(to) ? "page" : undefined}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {wrong && (
        <div className="wrap" style={{ paddingTop: 16 }}>
          <Banner
            kind="warn"
            action={
              <button className="btn btn-sm" type="button" onClick={w.switchNetwork} disabled={w.switching}>
                Switch network
              </button>
            }
          >
            Your wallet is on another network. Tributary runs on GIWA Sepolia (chain 91342). Nothing is sent until you switch.
          </Banner>
        </div>
      )}
      {w.error && (
        <div className="wrap" style={{ paddingTop: 16 }}>
          <Banner kind="err" action={<button className="btn btn-sm" type="button" onClick={w.clearError}>Dismiss</button>}>
            {w.error}
          </Banner>
        </div>
      )}

      <div id="main" tabIndex={-1}>
        {children}
      </div>

      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-grid">
            <div>
              <Link className="brand" to="/" aria-label="Tributary home">
                <Mark />
                Tributary
              </Link>
              <p style={{ marginTop: 8, maxWidth: "34ch" }}>Token launches that pay open-source contributors. Built on the Ammora protocol.</p>
            </div>
            <div>
              <h2>Product</h2>
              <ul>
                <li><Link to="/launches">Launches</Link></li>
                <li><Link to="/create">Launch a repo</Link></li>
                <li><Link to="/format">.tributary.json format</Link></li>
              </ul>
            </div>
            <div>
              <h2>Protocol</h2>
              <ul>
                <li><a href="https://www.npmjs.com/package/@ammora-protocol/sdk" target="_blank" rel="noreferrer">Ammora SDK on npm</a></li>
                <li><a href="https://sepolia-explorer.giwa.io" target="_blank" rel="noreferrer">GIWA Sepolia explorer</a></li>
              </ul>
            </div>
          </div>
          <div className="ftr-base">
            <span>Testnet software. Tokens on GIWA Sepolia have no market value.</span>
          </div>
        </div>
      </footer>
    </>
  );
}

function WalletSlot() {
  const w = useWallet();
  if (w.status === "disconnected") {
    return (
      <button className="btn btn-sm btn-ink" type="button" onClick={w.connect} disabled={w.connecting}>
        Connect wallet
      </button>
    );
  }
  if (w.status === "wrong") {
    return (
      <button className="btn btn-sm btn-warn" type="button" onClick={w.switchNetwork} disabled={w.switching}>
        Switch network
      </button>
    );
  }
  const a = w.address as string;
  return (
    <button className="btn btn-sm wallet-addr" type="button" title="Click to disconnect" aria-label={`Wallet ${a}. Click to disconnect.`} onClick={() => w.disconnect()}>
      <Av seed={a} small />
      <span className="num">{fmt.short(a)}</span>
    </button>
  );
}
