import clsx from "clsx";
import { ArrowRight, LoaderCircle, RotateCcw, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DecisionPath } from "../components/DecisionPath";
import { QueryInsights, TermChips } from "../components/QueryInsights";
import { ResultCard } from "../components/ResultCard";
import { Callout, Chip, Meter, Pill, Segmented, Skeleton, Stat, Toggle } from "../components/ui";
import { api, type Collection, type FeatureFlag, type Mode, type SearchResponse } from "../lib/api";
import { fmt, methodLabel, ms, parseRoute, stopSentence } from "../lib/format";

const PRIMARY: Mode[] = ["auto", "bm25", "dense", "hybrid"];
const OTHER: Mode[] = ["tfidf", "boolean", "bm25_champion", "route"];
const MODE_HINT: Record<Mode, string> = {
  auto: "Routes the query, checks confidence, escalates only when needed",
  bm25: "Okapi BM25 over the inverted index",
  dense: "MiniLM sentence embeddings + FAISS inner product",
  hybrid: "Always BM25 + dense, fixed α - the expensive baseline",
  tfidf: "ltc.ltc cosine",
  boolean: "Pure Boolean AND / OR / NOT",
  bm25_champion: "BM25 on champion lists with index elimination",
  route: "The router's first choice only, no escalation",
};
const FEATURES: { id: FeatureFlag; label: string; hint: string }[] = [
  { id: "qpp_signals", label: "QPP confidence signals", hint: "Adds NQC and WIG query-performance predictors" },
  { id: "voc_policy", label: "Value-of-computation escalation", hint: "Takes the step with the best expected gain per cost" },
  { id: "risk_controlled_tau", label: "Risk-controlled τ", hint: "τ certified with Learn-then-Test on validation queries" },
  { id: "qpp_fusion", label: "QPP-percentile fusion", hint: "Sets α(q) from the two lists' predicted quality" },
];

interface Settings {
  budget: number;
  tau: number;
  expansion: boolean;
  features: Record<FeatureFlag, boolean>;
  domains: string[];
}

const defaultsFor = (c: Collection): Settings => ({
  budget: Math.min(c.defaults.budget, c.max_budget),
  tau: c.defaults.tau,
  expansion: c.expansion_default,
  features: { qpp_signals: false, voc_policy: false, risk_controlled_tau: false, qpp_fusion: false },
  domains: [],
});

function readUrl(): { q: string; mode: Mode } {
  const p = new URLSearchParams(window.location.search);
  const m = p.get("mode") as Mode | null;
  return { q: p.get("q") ?? "", mode: m && [...PRIMARY, ...OTHER].includes(m) ? m : "auto" };
}

export function SearchPage({ collection }: { collection: Collection }) {
  const init = readUrl();
  const [input, setInput] = useState(init.q);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [settings, setSettings] = useState<Settings>(() => defaultsFor(collection));
  const [showSettings, setShowSettings] = useState(false);
  const [resp, setResp] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastQuery = useRef(init.q);

  const run = useCallback(
    async (q: string, m: Mode, s: Settings) => {
      const query = q.trim();
      if (!query) return;
      lastQuery.current = query;
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setLoading(true);
      setError(null);
      const slowTimer = window.setTimeout(() => setSlow(true), 1500);
      const url = new URL(window.location.href);
      url.searchParams.set("q", query);
      if (m === "auto") url.searchParams.delete("mode");
      else url.searchParams.set("mode", m);
      window.history.replaceState(null, "", url);
      try {
        const r = await api.search(
          {
            collection: collection.id,
            query,
            mode: m,
            budget: s.budget,
            tau: s.tau,
            expansion: s.expansion,
            features: s.features,
            domains: s.domains,
          },
          ctl.signal,
        );
        setResp(r);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        window.clearTimeout(slowTimer);
        if (abort.current === ctl) {
          setLoading(false);
          setSlow(false);
        }
      }
    },
    [collection.id],
  );

  // new collection: its own tuned defaults, and re-run the current query there
  useEffect(() => {
    const s = defaultsFor(collection);
    setSettings(s);
    setResp(null);
    if (lastQuery.current) run(lastQuery.current, mode, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id]);

  const submit = (q = input, m = mode, s = settings) => {
    setInput(q);
    run(q, m, s);
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    if (lastQuery.current) run(lastQuery.current, m, settings);
  };
  const changeSettings = (patch: Partial<Settings>) => {
    const s = { ...settings, ...patch };
    setSettings(s);
    if (lastQuery.current) run(lastQuery.current, mode, s);
  };

  const defaults = defaultsFor(collection);
  const custom =
    settings.budget !== defaults.budget ||
    settings.tau !== defaults.tau ||
    settings.expansion !== defaults.expansion ||
    Object.values(settings.features).some(Boolean) ||
    settings.domains.length > 0;
  const adaptive = mode === "auto";
  const finalConf = resp ? [...resp.trace].reverse().find((s) => s.confidence != null)?.confidence ?? null : null;
  const route = resp?.route ? parseRoute(resp.route.note) : null;
  const top = resp?.results[0]?.score ?? 0;

  return (
    <div>
      <form
        className="animate-fade-up"
        style={{ animationDelay: "120ms" }}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="rounded-xl2 bg-shell p-[0.45rem] shadow-inset transition-shadow duration-300 ease-soft focus-within:shadow-ring">
          <div className="flex items-center gap-3 rounded-[1.3rem] bg-surface py-[0.45rem] pl-5 pr-[0.45rem] shadow-soft">
            <SearchIcon className="h-[1.1rem] w-[1.1rem] flex-none text-ink-faint" aria-hidden />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question or type a few keywords…"
              aria-label="Query"
              autoFocus
              className="min-w-0 flex-1 border-none bg-transparent py-2.5 text-[1.02rem] text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="group inline-flex flex-none items-center gap-2 rounded-full bg-sage-deep py-2 pl-5 pr-2 text-[0.92rem] font-semibold text-white transition-all duration-300 ease-soft hover:bg-sage hover:shadow-[0_10px_20px_-10px_rgba(47,79,44,0.6)] active:scale-[0.97] disabled:opacity-50 max-sm:pl-2"
            >
              <span className="max-sm:hidden">Search</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-0.5">
                {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              </span>
            </button>
          </div>
        </div>
      </form>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[0.78rem] text-ink-faint">Try</span>
        {collection.examples.map((ex) => (
          <Chip key={ex} active={ex === lastQuery.current && !!resp} onClick={() => submit(ex)}>
            {ex}
          </Chip>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="Retrieval method"
          size="sm"
          value={PRIMARY.includes(mode) ? mode : ("other" as Mode)}
          onChange={changeMode}
          options={PRIMARY.map((m) => ({ value: m, label: methodLabel(m), title: MODE_HINT[m] }))}
        />
        <label className="relative">
          <select
            aria-label="Other methods"
            value={OTHER.includes(mode) ? mode : ""}
            onChange={(e) => e.target.value && changeMode(e.target.value as Mode)}
            className={clsx(
              "cursor-pointer appearance-none rounded-full border py-1.5 pl-3 pr-7 text-[0.78rem] font-semibold outline-none",
              OTHER.includes(mode) ? "border-sage bg-sage-bg text-sage-ink" : "border-line-strong bg-surface text-ink-soft",
            )}
          >
            <option value="">More methods…</option>
            {OTHER.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.6rem] text-ink-faint">▼</span>
        </label>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className={clsx(
            "ml-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors",
            showSettings || custom ? "border-sage bg-sage-bg text-sage-ink" : "border-line-strong bg-surface text-ink-soft hover:text-ink",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Controller settings
          {custom && <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-label="changed from defaults" />}
        </button>
      </div>
      <p className="mt-2 text-[0.8rem] text-ink-faint">{MODE_HINT[mode]}</p>

      {showSettings && (
        <div className="card mt-3 grid animate-fade-up gap-6 p-5 md:grid-cols-2">
          <div className="grid content-start gap-4">
            <label className="grid gap-1.5 text-[0.84rem]">
              <span className="flex justify-between font-semibold">
                Budget per query <span className="num font-mono text-sage-ink">{fmt(settings.budget, 1)} units</span>
              </span>
              <input
                type="range"
                min={0.5}
                max={collection.max_budget}
                step={0.5}
                value={settings.budget}
                onChange={(e) => setSettings({ ...settings, budget: Number(e.target.value) })}
                onPointerUp={() => changeSettings({})}
                onKeyUp={() => changeSettings({})}
                aria-label="Budget"
              />
              <span className="text-[0.76rem] text-ink-soft">
                1 unit = one BM25 query on this machine. Dense search costs {fmt(collection.costs.dense, 1)}, expansion{" "}
                {fmt(collection.costs.expansion, 1)}.
              </span>
            </label>
            <label className="grid gap-1.5 text-[0.84rem]">
              <span className="flex justify-between font-semibold">
                Confidence threshold τ <span className="num font-mono text-sage-ink">{fmt(settings.tau)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.tau}
                disabled={settings.features.risk_controlled_tau}
                onChange={(e) => setSettings({ ...settings, tau: Number(e.target.value) })}
                onPointerUp={() => changeSettings({})}
                onKeyUp={() => changeSettings({})}
                aria-label="Confidence threshold"
              />
              <span className="text-[0.76rem] text-ink-soft">
                Stop as soon as confidence reaches τ. Higher τ → more escalation, more cost.
              </span>
            </label>
            <Toggle
              checked={settings.expansion}
              onChange={(v) => changeSettings({ expansion: v })}
              label="Query expansion in the ladder"
              hint="Last, most expensive step: pseudo-relevance feedback with a drift filter"
            />
            <button
              type="button"
              onClick={() => changeSettings(defaults)}
              disabled={!custom}
              className="inline-flex w-fit items-center gap-1.5 text-[0.8rem] font-semibold text-ink-soft hover:text-ink disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to tuned defaults
            </button>
            <p className="-mt-2 text-[0.74rem] text-ink-faint">Defaults: {collection.defaults.source}.</p>
          </div>
          <div className="grid content-start gap-1">
            <div className="label-caps mb-1">ContextWeave+ extensions</div>
            {FEATURES.map((f) => (
              <Toggle
                key={f.id}
                checked={settings.features[f.id]}
                onChange={(v) => changeSettings({ features: { ...settings.features, [f.id]: v } })}
                label={f.label}
                hint={f.hint}
                disabled={!collection.features[f.id]}
                disabledHint="No fitted model for this collection - run experiments/fit_and_tune.py"
              />
            ))}
            {collection.domains.length > 0 && (
              <div className="mt-3">
                <div className="label-caps mb-2">Only search these domains</div>
                <div className="flex flex-wrap gap-1.5">
                  {collection.domains.map((d) => (
                    <Chip
                      key={d}
                      active={settings.domains.includes(d)}
                      onClick={() =>
                        changeSettings({
                          domains: settings.domains.includes(d) ? settings.domains.filter((x) => x !== d) : [...settings.domains, d],
                        })
                      }
                    >
                      {d}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <Callout tone="warn" title="Search failed.">{error}</Callout>}
      {loading && !resp && (
        <div className="mt-8 grid gap-3" aria-busy="true">
          {slow && <p className="text-[0.85rem] text-ink-soft">Loading the indexes and the embedding model - only the first search on a collection is slow…</p>}
          <Skeleton className="h-24" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {!resp && !loading && !error && (
        <Callout tone="plain">
          ContextWeave decides <b>per query</b> how much retrieval effort to spend. Pick an example above: short exact queries usually
          stop after one cheap BM25 pass, questions get routed to semantic search, and the controller escalates only when it is not yet
          confident.
        </Callout>
      )}

      {resp && (
        <div className={clsx("transition-opacity duration-300", loading && "opacity-60")} aria-busy={loading}>
          <TermChips resp={resp} />

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Cost"
              value={<span className="num">{fmt(resp.total_cost)}</span>}
              sub={adaptive && resp.budget ? `of ${fmt(resp.budget, 1)}` : "units"}
              note={adaptive ? "budget used" : "1 unit = one BM25 query"}
              tone={adaptive && resp.budget && resp.total_cost > resp.budget ? "warn" : undefined}
            >
              {adaptive && resp.budget ? <Meter value={resp.total_cost / resp.budget} label="budget used" /> : null}
            </Stat>
            <Stat
              label="Confidence"
              value={<span className="num">{fmt(finalConf)}</span>}
              sub={resp.tau != null && (adaptive || mode === "route") ? `τ ${fmt(resp.tau)}` : undefined}
              note={finalConf == null ? "only measured by the adaptive modes" : adaptive ? resp.tau_source === "learn-then-test" ? "τ from risk control" : "final, after the last step" : "measured for reference"}
              tone={finalConf != null && resp.tau != null && adaptive ? (finalConf >= resp.tau ? "good" : "warn") : undefined}
              delay={40}
            >
              {finalConf != null ? <Meter value={finalConf} marker={adaptive ? resp.tau : null} label="confidence" /> : null}
            </Stat>
            <Stat
              label="Methods run"
              value={resp.methods_run.length}
              note={resp.methods_run.map(methodLabel).join(" → ")}
              delay={80}
            />
            <Stat label="Latency" value={<span className="num">{ms(resp.latency_ms)}</span>} note="server-side, this query" delay={120} />
          </div>

          <section className="mt-8" aria-label="How the controller decided">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps">How it decided</span>
              {route?.cls && <Pill tone="info">{route.cls} query</Pill>}
            </div>
            <p className="mt-1 text-[0.9rem] text-ink-soft">{stopSentence(resp.stop_reason, resp.mode)}</p>
            <DecisionPath trace={resp.trace} tau={resp.tau} mode={resp.mode} />
          </section>

          <section className="mt-9" aria-label="Results">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-[1.3rem] font-semibold">Results</h2>
              <span className="text-[0.8rem] text-ink-faint">
                {resp.results.length} passages · {methodLabel(resp.mode)}
              </span>
            </div>
            {resp.results.length ? (
              <ol className="mt-3 grid gap-3">
                {resp.results.map((r) => (
                  <ResultCard key={r.passage_id} r={r} topScore={top} collection={collection.id} />
                ))}
              </ol>
            ) : (
              <Callout tone="warn">
                No passage matched.{" "}
                {resp.mode === "boolean" ? "Boolean AND needs every term in the same passage - try fewer terms." : "Try other words, or the Dense method, which matches by meaning."}
              </Callout>
            )}
          </section>

          <QueryInsights resp={resp} />
        </div>
      )}
    </div>
  );
}
