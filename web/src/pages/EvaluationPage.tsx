import clsx from "clsx";
import { CircleCheck, CircleX } from "lucide-react";
import { useEffect, useState } from "react";
import { isAdaptive, QualityCostChart } from "../components/QualityCostChart";
import { Badge, Callout, Meter, Panel, Segmented, Skeleton, Stat, TableWrap, td, tdNum, th, thNum } from "../components/ui";
import { api, type Collection, type EvaluationResponse, type EvaluationResult, type SystemRow } from "../lib/api";
import { fmt, ms, pct, relChange, signed } from "../lib/format";

const METRICS = ["NDCG@10", "P@5", "Recall@10", "MAP"] as const;
const nd = (s?: SystemRow) => s?.metrics?.["NDCG@10"] ?? null;

function SystemsTable({ rows, labelled, highlight }: { rows: SystemRow[]; labelled: boolean; highlight: string }) {
  const best = Math.max(...rows.map((r) => r.metrics?.["NDCG@10"] ?? 0), 1e-9);
  const bestOf = Object.fromEntries(METRICS.map((m) => [m, Math.max(...rows.map((r) => r.metrics?.[m] ?? -1))]));
  return (
    <TableWrap label="All systems">
      <thead>
        <tr>
          <th className={th}>System</th>
          {labelled && METRICS.map((m) => <th key={m} className={thNum}>{m}</th>)}
          <th className={thNum}>Mean cost</th>
          <th className={thNum}>Escalated</th>
          <th className={thNum}>Latency p50 / p95</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const on = r.id === highlight;
          return (
            <tr key={r.id} data-highlight={on || undefined} className={clsx(on ? "bg-accent-soft/70" : "hover:bg-raised")}>
              <td className={clsx(td, "min-w-[15rem]")}>
                <span className="inline-flex items-center gap-2.5">
                  <span className={clsx("h-2 w-2 flex-none rounded-full", isAdaptive(r.id) ? "bg-accent" : "bg-ink-faint/60")} aria-hidden />
                  <span className="num w-7 text-[0.8rem] text-ink-faint">{r.id}</span>
                  <span className={clsx(on && "font-semibold")}>{r.label}</span>
                </span>
              </td>
              {labelled &&
                METRICS.map((m) => {
                  const v = r.metrics?.[m];
                  const top = v != null && v === bestOf[m];
                  return (
                    <td key={m} className={clsx(tdNum, top && "font-semibold")}>
                      {m === "NDCG@10" ? (
                        <span className="inline-flex items-center justify-end gap-2.5">
                          <Meter value={(v ?? 0) / best} tone={isAdaptive(r.id) ? "accent" : "mute"} className="w-14" label={`${r.id} NDCG@10`} />
                          {fmt(v, 3)}
                        </span>
                      ) : (
                        fmt(v, 3)
                      )}
                    </td>
                  );
                })}
              <td className={tdNum}>{fmt(r.mean_cost)}</td>
              <td className={tdNum}>{isAdaptive(r.id) ? pct(r.escalation_rate) : "—"}</td>
              <td className={clsx(tdNum, "whitespace-nowrap text-ink-soft")}>
                {ms(r.latency_median_ms)} / {ms(r.latency_p95_ms)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

/** NDCG@10 per query type for the key systems: shows where adaptivity pays off. */
function ByType({ r }: { r: EvaluationResult }) {
  const ids = ["S2", "S4", "S5", "S7"].filter((id) => r.systems.some((s) => s.id === id));
  const sys = ids.map((id) => r.systems.find((s) => s.id === id)!);
  const types = Array.from(new Set(sys.flatMap((s) => Object.keys(s.by_type ?? {}))));
  if (types.length < 2) return null;
  const max = Math.max(...sys.flatMap((s) => types.map((t) => s.by_type?.[t]?.["NDCG@10"] ?? 0)), 1e-9);
  return (
    <Panel
      title="By query type"
      lead="The router sorts every query into a class. Fixed methods are strong on some classes and weak on others; the controller should track the best of them in each class while spending only what that class needs."
    >
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {types.map((t) => {
          const n = sys[0].by_type?.[t]?.n;
          const vals = sys.map((s) => s.by_type?.[t]?.["NDCG@10"] ?? null);
          const best = Math.max(...vals.map((v) => v ?? -1));
          return (
            <div key={t} className="panel p-4" aria-label={`${t} queries`}>
              <div className="flex items-baseline justify-between">
                <span className="font-medium capitalize">{t}</span>
                {n != null && <span className="num text-[0.8rem] text-ink-faint">{n} queries</span>}
              </div>
              <ul className="mt-3 grid gap-2.5">
                {sys.map((s, i) => {
                  const b = s.by_type?.[t];
                  const v = vals[i];
                  return (
                    <li key={s.id} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-[0.82rem]">
                      <span className={clsx("truncate", isAdaptive(s.id) ? "font-medium text-ink" : "text-ink-soft")} title={s.label}>
                        {s.label}
                      </span>
                      <Meter value={(v ?? 0) / max} tone={isAdaptive(s.id) ? "accent" : "mute"} label={`${s.label} on ${t}`} />
                      <span className="num w-[6.5rem] whitespace-nowrap text-right">
                        <span className={clsx(v === best && "font-semibold")}>{fmt(v, 3)}</span>
                        <span className="text-ink-faint"> · {fmt(b?.mean_cost, 1)}u</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[0.8rem] text-ink-faint">Each row: NDCG@10, then mean cost in BM25 units.</p>
    </Panel>
  );
}

/** Mean difference with its 95% CI on a shared axis around zero. */
function CiBar({ lo, hi, mean, span }: { lo: number; hi: number; mean: number; span: number }) {
  const x = (v: number) => 50 + (v / span) * 50;
  const sig = lo > 0 || hi < 0;
  return (
    <div className="relative h-5 w-40" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-ink/30" />
      <span
        className={clsx("absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full", sig ? "bg-fail/70" : "bg-pass/70")}
        style={{ left: `${x(lo)}%`, width: `${Math.max(x(hi) - x(lo), 0.5)}%` }}
      />
      <span
        className={clsx("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface", sig ? "bg-fail" : "bg-pass")}
        style={{ left: `${x(mean)}%` }}
      />
    </div>
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
  const certified = r.risk_curve.filter((x) => x.certified_on_val);
  const held = certified.filter((x) => x.test_failure_rate != null && x.test_failure_rate <= x.delta);
  const vsHybrid = r.significance.filter((s) => s.b === "S5" && isAdaptive(s.a));
  const ciSpan = Math.max(...vsHybrid.flatMap((s) => [Math.abs(s.ci95[0]), Math.abs(s.ci95[1])]), 0.01) * 1.1;
  const s8 = sys.S8;
  const ablSpan = Math.max(...r.ablations.map((a) => Math.abs((nd(a) ?? 0) - (nd(s8) ?? 0))), 0.005);
  const keep = ctl && hyb && nd(hyb) ? (nd(ctl) ?? 0) / (nd(hyb) as number) : null;
  const saving = ctl && hyb ? relChange(hyb.mean_cost ?? 0, ctl.mean_cost ?? 0) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.88rem] text-ink-soft">
          Saved results for <b className="num font-medium text-ink">{r.n_queries}</b> {r.split} queries, run{" "}
          {r.timestamp_utc.replace(/T(\d\d)(\d\d).*/, " at $1:$2 UTC")}
          {r.hardware.cpu_count ? ` on ${r.hardware.cpu_count} CPUs` : ""}.
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
          This collection's benchmark has not been judged, so only cost and latency are shown. Grade the pool on the Judge page, then run{" "}
          <code>python experiments/run_all.py {collection.id} --split test</code>.
        </Callout>
      ) : (
        <>
          {keep != null && saving != null && (
            <p className="mt-6 max-w-[34ch] text-[clamp(1.35rem,2.6vw,1.9rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
              The controller keeps {pct(keep)} of the fixed hybrid's quality and spends {pct(Math.abs(saving))}{" "}
              {saving <= 0 ? "less" : "more"} per query.
            </p>
          )}
          <div className="panel mt-6 grid grid-cols-2 divide-line/[0.08] lg:grid-cols-4 lg:divide-x [&>*]:px-5 [&>*]:py-4">
            <Stat
              label="Controller quality"
              value={fmt(nd(ctl), 3)}
              sub="NDCG@10"
              note={hyb && ctl ? `${pct((nd(ctl) ?? 0) / (nd(hyb) || 1))} of the fixed hybrid's ${fmt(nd(hyb), 3)}` : undefined}
            />
            <Stat
              label="Cost vs fixed hybrid"
              value={ctl && hyb ? pct(relChange(hyb.mean_cost ?? 0, ctl.mean_cost ?? 0)) : "—"}
              note={ctl && hyb ? `${fmt(ctl.mean_cost, 1)} vs ${fmt(hyb.mean_cost, 1)} units per query` : undefined}
              tone={saving != null && saving < 0 ? "pass" : undefined}
            />
            <Stat
              label="vs BM25 alone"
              value={ctl && bm25 ? signed(nd(ctl)! - nd(bm25)!) : "—"}
              sub="NDCG@10"
              note={bm25 ? `BM25 from scratch scores ${fmt(nd(bm25), 3)} at cost 1` : undefined}
            />
            <Stat
              label="Risk control held"
              value={held.length}
              sub={`of ${certified.length}`}
              note="certified risk levels where the test failure rate stayed at or below δ"
              tone={certified.length && held.length === certified.length ? "pass" : undefined}
            />
          </div>
          <QualityCostChart result={r} />
        </>
      )}

      {r.labelled && <ByType r={r} />}

      <Panel
        title="Every system"
        lead={
          <>
            S0 to S5 are fixed methods. S6 to S8 are the adaptive controller (routing only, full, full with expansion), and N1 to N4 add the
            ContextWeave+ extensions. The cost unit is one BM25 query on the evaluation machine. The highlighted row is the full controller;
            bold values are the best in their column.
          </>
        }
      >
        <SystemsTable rows={r.systems} labelled={r.labelled} highlight="S7" />
      </Panel>

      {r.labelled && vsHybrid.length > 0 && (
        <Panel
          title="Is the difference real?"
          lead="Paired t-test against the fixed hybrid (S5) over the same queries, Holm-corrected. An interval that crosses zero means no significant loss: the controller matches the hybrid's quality at a fraction of its cost."
        >
          <TableWrap label="Significance tests">
            <thead>
              <tr>
                <th className={th}>System</th>
                <th className={thNum}>Δ NDCG@10 vs S5</th>
                <th className={th}>95% CI around zero</th>
                <th className={thNum}>p (Holm)</th>
                <th className={th}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {vsHybrid.map((s) => {
                const sig = s.p_holm < 0.05;
                return (
                  <tr key={s.a} className="hover:bg-raised">
                    <td className={clsx(td, "min-w-[14rem]")}>
                      <span className="num mr-2 text-[0.8rem] text-ink-faint">{s.a}</span>
                      {sys[s.a]?.label}
                    </td>
                    <td className={tdNum}>{signed(s.mean_diff)}</td>
                    <td className={td}>
                      <span className="flex items-center gap-3">
                        <CiBar lo={s.ci95[0]} hi={s.ci95[1]} mean={s.mean_diff} span={ciSpan} />
                        <span className="num whitespace-nowrap text-[0.8rem] text-ink-soft">
                          [{fmt(s.ci95[0], 3)}, {fmt(s.ci95[1], 3)}]
                        </span>
                      </span>
                    </td>
                    <td className={tdNum}>{s.p_holm < 0.001 ? "< 0.001" : fmt(s.p_holm, 3)}</td>
                    <td className={td}>{sig ? <Badge tone="fail">significant</Badge> : <Badge tone="pass">no significant loss</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Panel>
      )}

      {r.ablations.length > 0 && (
        <Panel title="What each part contributes" lead="Ablations: the full controller (S8) with one component switched off at a time.">
          <TableWrap label="Ablations">
            <thead>
              <tr>
                <th className={th}>Variant</th>
                {r.labelled && <th className={thNum}>NDCG@10</th>}
                {r.labelled && <th className={th}>Δ vs S8</th>}
                <th className={thNum}>Mean cost</th>
                <th className={thNum}>Δ cost vs S8</th>
              </tr>
            </thead>
            <tbody>
              {r.ablations.map((a) => {
                const d = nd(a) != null && nd(s8) != null ? nd(a)! - nd(s8)! : null;
                return (
                  <tr key={a.id} className="hover:bg-raised">
                    <td className={clsx(td, "min-w-[13rem]")}>{a.label.replace("S8 - ", "without ")}</td>
                    {r.labelled && <td className={tdNum}>{fmt(nd(a), 3)}</td>}
                    {r.labelled && (
                      <td className={td}>
                        <span className="flex items-center gap-3">
                          <span className="relative h-2 w-28 flex-none" aria-hidden>
                            <span className="absolute inset-y-[-2px] left-1/2 w-px bg-ink/30" />
                            {d != null && (
                              <span
                                className={clsx("absolute inset-y-0 rounded-[2px]", d < 0 ? "bg-fail/70" : "bg-pass/70")}
                                style={d < 0 ? { right: "50%", width: `${(Math.abs(d) / ablSpan) * 50}%` } : { left: "50%", width: `${(d / ablSpan) * 50}%` }}
                              />
                            )}
                          </span>
                          <span className="num text-[0.84rem]">{d != null ? signed(d) : "—"}</span>
                        </span>
                      </td>
                    )}
                    <td className={tdNum}>{fmt(a.mean_cost)}</td>
                    <td className={tdNum}>{s8?.mean_cost ? pct(relChange(s8.mean_cost, a.mean_cost ?? 0)) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Panel>
      )}

      {r.labelled && r.risk_curve.length > 0 && (
        <Panel
          title="Risk-controlled stopping"
          lead="Learn-then-Test picks τ on validation queries so that, with 90% confidence, at most δ of queries lose more than 0.05 NDCG@10 against the fixed hybrid. The test split checks whether that promise held."
        >
          <TableWrap label="Risk control">
            <thead>
              <tr>
                <th className={thNum}>Allowed failure rate δ</th>
                <th className={thNum}>τ chosen</th>
                <th className={th}>Test failure rate vs δ</th>
                <th className={thNum}>Test NDCG@10</th>
                <th className={thNum}>Test cost</th>
                <th className={th}>Guarantee</th>
              </tr>
            </thead>
            <tbody>
              {r.risk_curve.map((x) => {
                const ok = x.certified_on_val && x.test_failure_rate != null && x.test_failure_rate <= x.delta;
                const scale = Math.max(x.delta, x.test_failure_rate ?? 0, 1e-9) * 1.25;
                return (
                  <tr key={x.delta} className="hover:bg-raised">
                    <td className={tdNum}>{pct(x.delta)}</td>
                    <td className={tdNum}>{x.certified_on_val ? fmt(x.tau) : "—"}</td>
                    <td className={td}>
                      <span className="flex items-center gap-3">
                        <Meter
                          value={(x.test_failure_rate ?? 0) / scale}
                          marker={x.delta / scale}
                          tone={!x.certified_on_val ? "mute" : ok ? "pass" : "fail"}
                          className="w-24 flex-none"
                          label={`test failure rate at δ ${pct(x.delta)}`}
                        />
                        <span className="num text-[0.84rem]">{pct(x.test_failure_rate, 1)}</span>
                      </span>
                    </td>
                    <td className={tdNum}>{fmt(x.test_ndcg, 3)}</td>
                    <td className={tdNum}>{fmt(x.test_cost, 1)}</td>
                    <td className={td}>
                      {!x.certified_on_val ? (
                        <span className="text-[0.82rem] text-ink-faint">not certifiable</span>
                      ) : ok ? (
                        <span className="inline-flex items-center gap-1.5 text-[0.84rem] font-medium text-pass">
                          <CircleCheck className="h-4 w-4" /> held
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[0.84rem] font-medium text-fail">
                          <CircleX className="h-4 w-4" /> violated
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <p className="mt-2 text-[0.8rem] text-ink-faint">The tick on each bar marks δ; a bar that stays left of it means the guarantee held.</p>
        </Panel>
      )}
    </div>
  );
}
