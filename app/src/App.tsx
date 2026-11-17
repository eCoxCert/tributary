import { useEffect } from "react";
import { Route, Routes, useLocation, Link } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Explore } from "./pages/Explore";
import { Launch } from "./pages/Launch";
import { Create } from "./pages/Create";
import { Katki } from "./pages/Katki";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!window.location.hash.includes("#katki")) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <main className="page">
      <div className="wrap">
        <div className="panel">
          <div className="notice notice-c">
            <h3>Page not found</h3>
            <p>There is nothing at this address. Try the launches list or the home page.</p>
            <Link className="btn btn-sm" to="/launches">See launches</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export function App() {
  return (
    <Layout>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/launches" element={<Explore />} />
        <Route path="/launch/:token" element={<Launch />} />
        <Route path="/create" element={<Create />} />
        <Route path="/katki" element={<Katki />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
