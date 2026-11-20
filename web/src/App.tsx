import { BarChart3, ClipboardCheck, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Callout, Eyebrow, Segmented, Skeleton } from "./components/ui";
import { api, type Collection, type CollectionsResponse } from "./lib/api";
import { compact } from "./lib/format";
import { EvaluationPage } from "./pages/EvaluationPage";
import { JudgePage } from "./pages/JudgePage";
import { SearchPage } from "./pages/SearchPage";

export type Page = "search" | "evaluation" | "judge";
const PATHS: Record<Page, string> = { search: "/", evaluation: "/evaluation", judge: "/judge" };
const SUBTITLE: Record<Page, string> = {
  search: "Spends retrieval effort only where a query needs it - and shows every decision.",
  evaluation: "How the controller compares with every fixed method, on queries it never saw while tuning.",
  judge: "Grade pooled passages 0 / 1 / 2 to build the relevance labels for the CS benchmark.",
};

const pageFromPath = (p: string): Page => (p.startsWith("/evaluation") ? "evaluation" : p.startsWith("/judge") ? "judge" : "search");

export default function App() {
  const [meta, setMeta] = useState<CollectionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [cid, setCid] = useState<string | null>(() => new URLSearchParams(window.location.search).get("c"));

  useEffect(() => {
    api.collections().then(
      (d) => {
        setMeta(d);
        setCid((c) => (c && d.collections.some((x) => x.id === c && x.ready) ? c : d.default));
      },
      (e) => setError(e.message),
    );
    const onPop = () => {
      setPage(pageFromPath(window.location.pathname));
      const c = new URLSearchParams(window.location.search).get("c");
      if (c) setCid(c);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (p: Page, c = cid) => {
    const url = new URL(window.location.href);
    url.pathname = PATHS[p];
    const keep = p === "search" && p === page ? url.searchParams : new URLSearchParams();
    if (c) keep.set("c", c);
    url.search = keep.toString();
    window.history.pushState(null, "", url);
    setPage(p);
    setCid(c);
  };

  const collection: Collection | undefined = meta?.collections.find((c) => c.id === cid);
  const ready = meta?.collections.filter((c) => c.ready) ?? [];

  return (
    <div className="mx-auto max-w-[1040px] px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <Eyebrow>Information Retrieval · Final project</Eyebrow>
        <h1 className="mb-1 mt-3 animate-fade-up font-serif text-[clamp(2.1rem,4.4vw,2.9rem)] font-semibold tracking-[-0.015em]" style={{ animationDelay: "50ms" }}>
          ContextWeave
        </h1>
        <p className="animate-fade-up text-[0.98rem] text-ink-soft" style={{ animationDelay: "90ms" }}>
          {SUBTITLE[page]}
        </p>

        <nav className="mt-7 flex animate-fade-up flex-wrap items-end justify-between gap-4" style={{ animationDelay: "130ms" }} aria-label="Pages">
          <Segmented
            label="Pages"
            value={page}
            onChange={(p) => navigate(p)}
            options={[
              { value: "search", label: <><Search className="h-4 w-4" />Search</> },
              { value: "evaluation", label: <><BarChart3 className="h-4 w-4" />Evaluation</> },
              { value: "judge", label: <><ClipboardCheck className="h-4 w-4" />Judge</> },
            ]}
          />
          {meta && collection && (
            <div className="grid justify-items-start gap-1.5 sm:justify-items-end">
              <span className="label-caps">Collection</span>
              <Segmented
                label="Collection"
                size="sm"
                value={collection.id}
                onChange={(c) => navigate(page, c)}
                options={meta.collections.map((c) => ({
                  value: c.id,
                  label: c.short,
                  disabled: !c.ready,
                  title: c.ready ? c.description : `Not built yet - python main.py build-index --collection ${c.id}`,
                }))}
              />
            </div>
          )}
        </nav>
        {collection && (
          <p className="mt-2 text-right text-[0.74rem] text-ink-faint max-sm:text-left">
            {collection.passages != null ? `${compact(collection.passages)} passages · ` : ""}
            {collection.description.split(" - ")[1] ?? collection.description}
          </p>
        )}
      </header>

      <main className="mt-7">
        {error && (
          <Callout tone="warn" title="Cannot reach the ContextWeave API.">
            {error}. Start it with <code>python main.py serve</code>.
          </Callout>
        )}
        {!meta && !error && <Skeleton className="h-16" />}
        {meta && ready.length === 0 && (
          <Callout tone="warn" title="No collection is built yet.">
            Run <code>python scripts/get_beir.py</code>, <code>python main.py data</code> and{" "}
            <code>python main.py build-index --collection scifact,nfcorpus</code>, then reload.
          </Callout>
        )}
        {collection && collection.ready && page === "search" && <SearchPage key="search" collection={collection} />}
        {collection && page === "evaluation" && <EvaluationPage collection={collection} />}
        {collection && page === "judge" && <JudgePage collection={collection} />}
      </main>

      <footer className="mt-16 border-t border-line pt-5 text-[0.78rem] text-ink-faint">
        Inverted index, BM25, TF-IDF, champion lists, fusion and every metric written from scratch · dense retrieval with
        all-MiniLM-L6-v2 + FAISS · <a className="underline decoration-line-strong underline-offset-2 hover:text-ink" href="/api/docs">API docs</a>
      </footer>
    </div>
  );
}
