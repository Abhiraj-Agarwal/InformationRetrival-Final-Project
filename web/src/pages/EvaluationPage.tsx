import clsx from "clsx";
import { CircleCheck, CircleX } from "lucide-react";
import { useEffect, useState } from "react";
import { isAdaptive, QualityCostChart } from "../components/QualityCostChart";
import { Callout, Meter, Panel, Pill, Segmented, Skeleton, Stat, TableWrap, td, th } from "../components/ui";
import { api, type Collection, type EvaluationResponse, type SystemRow } from "../lib/api";
import { fmt, ms, pct, relChange } from "../lib/format";

const METRICS = ["NDCG@10", "P@5", "Recall@10", "MAP"] as const;

function SystemsTable({ rows, labelled, highlight }: { rows: SystemRow[]; labelled: boolean; highlight: string }) {
  const best = Math.max(...rows.map((r) => r.metrics?.["NDCG@10"] ?? 0), 1e-9);
  return (
    <TableWrap label="All systems">
      <thead>
        <tr>
          <th className={th}>System</th>
          {labelled && METRICS.map((m) => <th key={m} className={th}>{m}</th>)}
          <th className={th}>Mean cost</th>
          <th className={th}>Escalated</th>
          <th className={th}>Latency p50 / p95</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={clsx(r.id === highlight ? "bg-sage-bg font-semibold text-sage-ink" : "hover:bg-paper/60")}>
            <td className={td}>
              <span className="inline-flex items-center gap-2">
                <span className={clsx("h-2 w-2 flex-none rounded-full", isAdaptive(r.id) ? "bg-sage-chart" : "bg-mute")} aria-hidden />
                <span className="font-mono text-[0.78rem] text-ink-faint">{r.id}</span> {r.label}
              </span>
            </td>
            {labelled &&
              METRICS.map((m) => (
                <td key={m} className={clsx(td, "num font-mono text-[0.82rem]")}>
                  {m === "NDCG@10" ? (
                    <span className="inline-flex items-center gap-2.5">
                      <Meter value={(r.metrics?.[m] ?? 0) / best} className="w-14" label={`${r.id} NDCG@10`} />
                      {fmt(r.metrics?.[m], 3)}
                    </span>
                  ) : (
                    fmt(r.metrics?.[m], 3)
                  )}
                </td>
              ))}
            <td className={clsx(td, "num font-mono text-[0.82rem]")}>{fmt(r.mean_cost)}</td>
            <td className={clsx(td, "num font-mono text-[0.82rem]")}>{isAdaptive(r.id) ? pct(r.escalation_rate) : "—"}</td>
            <td className={clsx(td, "num whitespace-nowrap font-mono text-[0.82rem] text-ink-soft")}>
              {ms(r.latency_median_ms)} / {ms(r.latency_p95_ms)}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function EvaluationPage({ collection }: { collection: Collection }) {
  const [split, setSplit] = useState<string | undefined>(undefined);
  const [data, setData] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setSplit(undefined);
  }, [collection.id]);
  useEffect(() => {
    let live = true;
    setError(null);
    api.evaluation(collection.id, split).then(
      (d) => live && setData(d),
      (e) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [collection.id, split]);

  if (error) return <Callout tone="warn" title="Could not load results.">{error}</Callout>;
  if (!data) return <Skeleton className="mt-2 h-72" />;
  const r = data.result;
  if (!r)
    return (
      <Callout tone="plain" title="No saved results yet.">
        Run <code>python experiments/fit_and_tune.py {collection.id}</code> then{" "}
        <code>python experiments/run_all.py {collection.id} --split test</code>.
      </Callout>
    );

  const sys = Object.fromEntries(r.systems.map((s) => [s.id, s]));
  const ctl = sys.S7;
  const hyb = sys.S5;
  const bm25 = sys.S2;
  const nd = (s?: SystemRow) => s?.metrics?.["NDCG@10"] ?? null;
  const certified = r.risk_curve.filter((x) => x.certified_on_val);
  const held = certified.filter((x) => x.test_failure_rate != null && x.test_failure_rate <= x.delta);
  const vsHybrid = r.significance.filter((s) => s.b === "S5" && isAdaptive(s.a));
  let panel = 0; // numbers only the panels that are shown

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <p className="text-[0.9rem] text-ink-soft">
          Saved results · <b className="text-ink">{r.n_queries}</b> {r.split} queries · {r.timestamp_utc.replace(/T(\d\d)(\d\d).*/, " $1:$2 UTC")}
          {r.hardware.cpu_count ? ` · ${r.hardware.cpu_count} CPUs` : ""}
        </p>
        {data.available.length > 1 && (
          <Segmented
            label="Query split"
            size="sm"
            value={r.split}
            onChange={setSplit}
            options={data.available.map((s) => ({ value: s, label: s === "val" ? "Validation" : s === "test" ? "Test" : s }))}
          />
        )}
      </div>

      {!r.labelled ? (
        <Callout tone="warn" title="No relevance labels yet.">
          This collection's benchmark has not been judged, so only cost and latency are shown. Grade the pool in the Judge tab, then run{" "}
          <code>python experiments/run_all.py {collection.id} --split test</code>.
        </Callout>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Controller quality"
            value={<span className="num">{fmt(nd(ctl), 3)}</span>}
            sub="NDCG@10"
            note={hyb && ctl ? `${pct((nd(ctl) ?? 0) / (nd(hyb) || 1))} of the fixed hybrid's ${fmt(nd(hyb), 3)}` : undefined}
            tone="good"
          />
          <Stat
            label="Cost vs fixed hybrid"
            value={<span className="num">{ctl && hyb ? pct(relChange(hyb.mean_cost ?? 0, ctl.mean_cost ?? 0)) : "—"}</span>}
            note={ctl && hyb ? `${fmt(ctl.mean_cost, 1)} vs ${fmt(hyb.mean_cost, 1)} units per query` : undefined}
            tone="good"
            delay={40}
          />
          <Stat
            label="vs BM25 alone"
            value={<span className="num">{ctl && bm25 ? `${(nd(ctl)! - nd(bm25)! >= 0 ? "+" : "")}${fmt(nd(ctl)! - nd(bm25)!, 3)}` : "—"}</span>}
            sub="NDCG@10"
            note={bm25 ? `BM25 from scratch: ${fmt(nd(bm25), 3)} at cost 1` : undefined}
            delay={80}
          />
          <Stat
            label="Risk control held"
            value={<span className="num">{held.length}</span>}
            sub={`of ${certified.length}`}
            note="certified risk levels where the test failure rate stayed ≤ δ"
            tone={certified.length && held.length === certified.length ? "good" : undefined}
            delay={120}
          />
        </div>
      )}

      {r.labelled && <QualityCostChart result={r} />}

      <Panel
        num={++panel}
        title="Every system"
        lead={
          <>
            S0–S5 are fixed methods; S6–S8 are the adaptive controller (routing only, full, full + expansion); N1–N4 add the ContextWeave+
            extensions. Cost unit = one BM25 query on the evaluation machine. The highlighted row is the full controller.
          </>
        }
      >
        <SystemsTable rows={r.systems} labelled={r.labelled} highlight="S7" />
      </Panel>

      {r.labelled && vsHybrid.length > 0 && (
        <Panel
          num={++panel}
          title="Is the difference real?"
          lead="Paired t-test against the fixed hybrid (S5) over the same queries, Holm-corrected. A negative difference that is not significant means the controller matches the hybrid's quality at a fraction of its cost."
        >
          <TableWrap label="Significance tests">
            <thead>
              <tr>
                <th className={th}>System</th>
                <th className={th}>Δ NDCG@10 vs S5</th>
                <th className={th}>95% CI</th>
                <th className={th}>p (Holm)</th>
                <th className={th}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {vsHybrid.map((s) => {
                const sig = s.p_holm < 0.05;
                return (
                  <tr key={s.a} className="hover:bg-paper/60">
                    <td className={td}>
                      <span className="font-mono text-[0.78rem] text-ink-faint">{s.a}</span> {sys[s.a]?.label}
                    </td>
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{(s.mean_diff >= 0 ? "+" : "") + fmt(s.mean_diff, 3)}</td>
                    <td className={clsx(td, "num font-mono text-[0.82rem] text-ink-soft")}>
                      [{fmt(s.ci95[0], 3)}, {fmt(s.ci95[1], 3)}]
                    </td>
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{s.p_holm < 0.001 ? "< 0.001" : fmt(s.p_holm, 3)}</td>
                    <td className={td}>
                      {sig ? <Pill tone="warn">significant</Pill> : <Pill tone="on">no significant loss</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Panel>
      )}

      {r.ablations.length > 0 && (
        <Panel
          num={++panel}
          title="What each part contributes"
          lead="Ablations: the full controller (S8) with one component switched off at a time."
        >
          <TableWrap label="Ablations">
            <thead>
              <tr>
                <th className={th}>Variant</th>
                {r.labelled && <th className={th}>NDCG@10</th>}
                {r.labelled && <th className={th}>Δ vs S8</th>}
                <th className={th}>Mean cost</th>
                <th className={th}>Δ cost vs S8</th>
              </tr>
            </thead>
            <tbody>
              {r.ablations.map((a) => (
                <tr key={a.id} className="hover:bg-paper/60">
                  <td className={td}>{a.label.replace("S8 - ", "without ")}</td>
                  {r.labelled && <td className={clsx(td, "num font-mono text-[0.82rem]")}>{fmt(nd(a), 3)}</td>}
                  {r.labelled && (
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>
                      {nd(a) != null && nd(sys.S8) != null ? `${nd(a)! - nd(sys.S8)! >= 0 ? "+" : ""}${fmt(nd(a)! - nd(sys.S8)!, 3)}` : "—"}
                    </td>
                  )}
                  <td className={clsx(td, "num font-mono text-[0.82rem]")}>{fmt(a.mean_cost)}</td>
                  <td className={clsx(td, "num font-mono text-[0.82rem]")}>
                    {sys.S8?.mean_cost ? pct(relChange(sys.S8.mean_cost, a.mean_cost ?? 0)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      )}

      {r.labelled && r.risk_curve.length > 0 && (
        <Panel
          num={++panel}
          title="Risk-controlled stopping"
          lead="Learn-then-Test picks τ on validation queries so that, with 90% confidence, at most δ of queries lose more than 0.05 NDCG@10 against the fixed hybrid. The test split checks whether that promise held."
        >
          <TableWrap label="Risk control">
            <thead>
              <tr>
                <th className={th}>Allowed failure rate δ</th>
                <th className={th}>τ chosen</th>
                <th className={th}>Test failure rate</th>
                <th className={th}>Test NDCG@10</th>
                <th className={th}>Test cost</th>
                <th className={th}>Guarantee</th>
              </tr>
            </thead>
            <tbody>
              {r.risk_curve.map((x) => {
                const ok = x.certified_on_val && x.test_failure_rate != null && x.test_failure_rate <= x.delta;
                return (
                  <tr key={x.delta} className="hover:bg-paper/60">
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{pct(x.delta)}</td>
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{x.certified_on_val ? fmt(x.tau) : "—"}</td>
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{pct(x.test_failure_rate, 1)}</td>
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{fmt(x.test_ndcg, 3)}</td>
                    <td className={clsx(td, "num font-mono text-[0.82rem]")}>{fmt(x.test_cost, 1)}</td>
                    <td className={td}>
                      {!x.certified_on_val ? (
                        <span className="text-[0.8rem] text-ink-faint">not certifiable</span>
                      ) : ok ? (
                        <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-sage-ink">
                          <CircleCheck className="h-4 w-4" /> held
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-warn-ink">
                          <CircleX className="h-4 w-4" /> violated
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Panel>
      )}
    </div>
  );
}
