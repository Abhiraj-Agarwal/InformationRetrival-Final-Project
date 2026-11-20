import clsx from "clsx";
import type { SearchResponse } from "../lib/api";
import { compact, fmt, methodLabel, ms, pct } from "../lib/format";
import { Callout, Panel, Pill, TableWrap, td, th } from "./ui";

const SIGNAL_HELP: Record<string, string> = {
  margin: "how far the top results stand out from the 10th",
  coverage: "share of (IDF-weighted) query terms the top 5 contain",
  concentration: "how peaked the score distribution is",
  agreement: "overlap of the lexical and semantic top lists",
  nqc: "normalised query commitment (QPP)",
  wig: "weighted information gain (QPP)",
};

export function TermChips({ resp }: { resp: SearchResponse }) {
  const terms = resp.query.terms;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" aria-label="How the query was read">
      <span className="label-caps w-full">How the query was read</span>
      {terms.length === 0 && <span className="text-[0.85rem] text-ink-soft">Only stop words - nothing left to match on.</span>}
      {terms.map((t, i) => (
        <span
          key={t.term}
          className={clsx(
            "inline-flex animate-fade-up items-baseline gap-2 rounded-md2 border px-3 py-1.5 text-[0.86rem]",
            t.known ? "border-sage/35 bg-sage-bg text-sage-ink" : "border-transparent bg-warn-bg text-warn-ink",
          )}
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <b className="font-bold">{t.term}</b>
          <span className="num font-mono text-[0.72rem] opacity-80">
            {t.known ? `df ${compact(t.df)} · idf ${fmt(t.idf)}` : "not in the collection"}
          </span>
        </span>
      ))}
    </div>
  );
}

export function QueryInsights({ resp }: { resp: SearchResponse }) {
  const ran = resp.methods_run.filter((m) => resp.lists[m]);
  const conf = resp.trace.filter((s) => s.action === "confidence" && s.confidence != null);
  const signalKeys = Array.from(
    new Set(conf.flatMap((s) => Object.keys(s.signals).filter((k) => !k.startsWith("alpha") && typeof s.signals[k] === "number"))),
  );
  let n = 0;
  return (
    <div>
      <Panel
        num={++n}
        title="What each method retrieved"
        pill={resp.agreement ? <Pill tone="on">{resp.agreement.overlap}/{resp.agreement.of} shared in top 10</Pill> : undefined}
        lead={
          ran.length > 1
            ? "Each method that ran produced its own ranked list; the controller fused them. Lexical methods match words, dense retrieval matches meaning, so they often disagree - that disagreement is one of the confidence signals."
            : "Only one method ran for this query, so its list is the result list."
        }
      >
        <div className={clsx("mt-4 grid gap-4", ran.length > 1 && "lg:grid-cols-2")}>
          {ran.map((m) => {
            const l = resp.lists[m];
            const st = l.stats;
            return (
              <div key={m} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <span className="font-semibold">{methodLabel(m)}</span>
                  <span className="num text-[0.74rem] text-ink-faint">
                    {st.passages_scored != null && st.N ? `${pct(st.passages_scored / st.N)} of passages scored · ` : ""}
                    {st.postings_touched != null ? `${compact(st.postings_touched)} postings · ` : ""}
                    {ms(st.latency_ms)}
                  </span>
                </div>
                {l.eliminated_terms.length > 0 && (
                  <p className="border-b border-line bg-paper/60 px-4 py-2 text-[0.76rem] text-ink-soft">
                    Index elimination dropped low-IDF terms: {l.eliminated_terms.join(", ")}
                  </p>
                )}
                <ol className="divide-y divide-line">
                  {l.top.slice(0, 8).map((x) => (
                    <li key={x.passage_id} className="grid grid-cols-[1.6rem_1fr_auto] gap-2 px-4 py-2 text-[0.82rem]">
                      <span className="num font-semibold text-ink-faint">{x.rank}</span>
                      <span className="truncate" title={x.title}>
                        {x.title}
                      </span>
                      <span className="num font-mono text-[0.74rem] text-ink-soft">{fmt(x.score, 3)}</span>
                    </li>
                  ))}
                  {l.top.length === 0 && <li className="px-4 py-3 text-[0.82rem] text-ink-faint">No passages matched.</li>}
                </ol>
              </div>
            );
          })}
        </div>
      </Panel>

      {resp.expansion && (
        <Panel
          num={++n}
          title="Query expansion"
          pill={<Pill tone={resp.expansion.added_terms.length ? "on" : "plain"}>{resp.expansion.added_terms.length ? "terms added" : "no change"}</Pill>}
          lead="Pseudo-relevance feedback: candidate terms come from the top passages, and an embedding filter keeps only those close in meaning to the query, so the query does not drift."
        >
          {resp.expansion.added_terms.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {resp.expansion.added_terms.map((a) => (
                <span key={String(a.term)} className="inline-flex items-baseline gap-2 rounded-md2 border border-sage/35 bg-sage-bg px-3 py-1.5 text-[0.86rem] text-sage-ink">
                  <b>+ {String(a.word ?? a.term)}</b>
                  {typeof a.similarity === "number" && <span className="num font-mono text-[0.72rem]">sim {fmt(a.similarity)}</span>}
                </span>
              ))}
            </div>
          ) : (
            <Callout tone="plain">No candidate passed the similarity filter, so the query was left unchanged.</Callout>
          )}
        </Panel>
      )}

      {conf.length > 0 && (
        <Panel
          num={++n}
          title="Why the controller was (not) confident"
          lead={
            <>
              confidence = sigmoid(bias + Σ wᵢ·signalᵢ), recomputed after every step and compared with τ ={" "}
              <b className="num">{fmt(resp.tau)}</b>. Weights live in <code className="rounded bg-sage-bg px-1 font-mono text-[0.8rem] text-sage-ink">config/settings.yaml</code>.
            </>
          }
        >
          <TableWrap label="Confidence signals per step">
            <thead>
              <tr>
                <th className={th}>After</th>
                {signalKeys.map((k) => (
                  <th key={k} className={th} title={SIGNAL_HELP[k]}>
                    {k}
                  </th>
                ))}
                <th className={th}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {conf.map((s, i) => {
                const after = resp.trace.slice(0, resp.trace.indexOf(s)).filter((t) => t.action === "retrieve").map((t) => methodLabel(t.method));
                const ok = resp.tau != null && (s.confidence ?? 0) >= resp.tau;
                return (
                  <tr key={i} className="hover:bg-paper/60">
                    <td className={td}>{after.join(" + ") || "—"}</td>
                    {signalKeys.map((k) => (
                      <td key={k} className={clsx(td, "num font-mono text-[0.8rem] text-ink-soft")}>
                        {fmt(s.signals[k] as number | null)}
                      </td>
                    ))}
                    <td className={clsx(td, "num font-mono font-semibold", ok ? "text-sage-ink" : "text-warn-ink")}>{fmt(s.confidence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-[0.78rem] text-ink-soft sm:grid-cols-2">
            {signalKeys.filter((k) => SIGNAL_HELP[k]).map((k) => (
              <div key={k}>
                <dt className="inline font-semibold text-ink">{k}</dt> <dd className="inline">- {SIGNAL_HELP[k]}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
    </div>
  );
}
