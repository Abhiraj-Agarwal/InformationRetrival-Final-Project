import clsx from "clsx";
import { ArrowRight, Ban, CircleCheck, Compass, Gauge, Search, Sparkles, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { TraceStep } from "../lib/api";
import { fmt, methodLabel, ms, parseRoute } from "../lib/format";

export type PathNode =
  | { kind: "route"; method: string; cls: string; why: string }
  | { kind: "retrieve"; method: string; cost: number; latency: number; note: string }
  | { kind: "confidence"; value: number; tau: number | null; passed: boolean | null }
  | { kind: "skip"; method: string; note: string }
  | { kind: "stop"; reason: string };

/** Collapse the raw trace into the nodes the path draws (escalations become the arrows between them). */
export function buildPath(trace: TraceStep[], tau: number | null, mode: string): PathNode[] {
  const nodes: PathNode[] = [];
  for (const s of trace) {
    if (s.action === "route") {
      const { cls, why } = parseRoute(s.note);
      nodes.push({ kind: "route", method: s.method ?? "", cls, why });
    } else if (s.action === "retrieve") {
      nodes.push({ kind: "retrieve", method: s.method ?? "", cost: s.cost, latency: s.latency_ms, note: s.note });
    } else if (s.action === "confidence" && s.confidence != null) {
      const t = mode === "auto" || mode === "route" ? tau : null;
      nodes.push({ kind: "confidence", value: s.confidence, tau: t, passed: t == null ? null : s.confidence >= t });
    } else if (s.action === "escalate" && s.note.startsWith("skip")) {
      nodes.push({ kind: "skip", method: s.method ?? "", note: s.note });
    } else if (s.action === "stop") {
      nodes.push({ kind: "stop", reason: s.note });
    }
  }
  return nodes;
}

function Node({ icon, title, children, tone = "plain" }: { icon: ReactNode; title: ReactNode; children?: ReactNode; tone?: "plain" | "sage" | "warn" | "ghost" | "deep" }) {
  return (
    <li
      className={clsx(
        "flex min-w-[8.5rem] max-w-[15rem] animate-fade-up flex-col gap-1 rounded-md2 px-3.5 py-2.5 text-[0.8rem]",
        tone === "plain" && "bg-surface shadow-soft",
        tone === "sage" && "border border-sage/35 bg-sage-bg text-sage-ink",
        tone === "warn" && "border border-warn-ink/25 bg-warn-bg text-warn-ink",
        tone === "ghost" && "border border-dashed border-line-strong text-ink-faint",
        tone === "deep" && "bg-sage-deep text-white",
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        {icon}
        {title}
      </span>
      {children && <span className="text-[0.74rem] leading-snug opacity-85">{children}</span>}
    </li>
  );
}

const arrow = (
  <li aria-hidden className="flex items-center text-ink-faint">
    <ArrowRight className="h-4 w-4" />
  </li>
);

export function DecisionPath({ trace, tau, mode }: { trace: TraceStep[]; tau: number | null; mode: string }) {
  const nodes = buildPath(trace, tau, mode);
  const ico = "h-3.5 w-3.5 flex-none";
  return (
    <ol className="mt-3 flex flex-wrap items-stretch gap-2" aria-label="Decision path">
      {nodes.map((n, i) => {
        let el: ReactNode;
        if (n.kind === "route")
          el = (
            <Node icon={<Compass className={ico} />} title={<>Route · {n.cls || "query"}</>}>
              {n.why ? `${n.why} → ` : ""}start with <b>{methodLabel(n.method)}</b>
            </Node>
          );
        else if (n.kind === "retrieve")
          el = (
            <Node
              tone="plain"
              icon={n.method === "dense" ? <Sparkles className={ico} /> : <Search className={ico} />}
              title={methodLabel(n.method)}
            >
              <span className="num">
                cost {fmt(n.cost)} · {ms(n.latency)}
              </span>
            </Node>
          );
        else if (n.kind === "confidence")
          el = (
            <Node
              tone={n.passed === null ? "plain" : n.passed ? "sage" : "warn"}
              icon={<Gauge className={ico} />}
              title={
                <span className="num">
                  Confidence {fmt(n.value)}
                  {n.tau != null && (
                    <>
                      {" "}
                      {n.passed ? "≥" : "<"} τ {fmt(n.tau)}
                    </>
                  )}
                </span>
              }
            >
              {n.passed === null ? "measured, not used to stop" : n.passed ? "good enough" : "not sure yet → escalate"}
            </Node>
          );
        else if (n.kind === "skip")
          el = (
            <Node tone="ghost" icon={<Ban className={ico} />} title={<>{methodLabel(n.method)} skipped</>}>
              {n.note.replace(/^skip [^:]+: /, "")}
            </Node>
          );
        else
          el = (
            <Node
              tone="deep"
              icon={n.reason.startsWith("confident") ? <CircleCheck className={ico} /> : <Square className={ico} />}
              title="Stop"
            >
              {n.reason}
            </Node>
          );
        return (
          <FragmentWithArrow key={i} first={i === 0}>
            {el}
          </FragmentWithArrow>
        );
      })}
    </ol>
  );
}

function FragmentWithArrow({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <>
      {!first && arrow}
      {children}
    </>
  );
}
