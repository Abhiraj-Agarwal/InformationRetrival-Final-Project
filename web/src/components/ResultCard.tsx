import clsx from "clsx";
import { BookOpen, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Passage, type Result } from "../lib/api";
import { fmt, methodLabel, pct } from "../lib/format";
import { Meter, Pill, Skeleton } from "./ui";

export function Snippet({ r }: { r: Result }) {
  const s = r.snippet;
  return (
    <p className="snippet mt-1.5 text-[0.88rem] leading-relaxed text-ink-soft">
      {s.before && "… "}
      {s.segments.map(([text, hit], i) => (hit ? <mark key={i}>{text}</mark> : <span key={i}>{text}</span>))}
      {s.after && " …"}
    </p>
  );
}

function Bar({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-[0.8rem]">
      <span className="text-ink-soft">{label}</span>
      <Meter value={value ?? 0} label={label} />
      <span className="num text-right font-mono text-[0.76rem] text-ink-soft" title={note}>
        {fmt(value)}
      </span>
    </div>
  );
}

function Why({ r }: { r: Result }) {
  const w = r.why;
  const fused = w.alpha != null;
  const maxTerm = Math.max(...w.terms.map((t) => t.score ?? 0), 1e-9);
  return (
    <div className="mt-3 grid gap-4 rounded-md2 bg-paper/70 p-4 md:grid-cols-2">
      <div>
        <div className="label-caps mb-2">{fused ? "Fused score" : "Score"}</div>
        {fused ? (
          <div className="grid gap-2">
            <Bar label="Lexical (norm.)" value={w.lexical_norm} />
            <Bar label="Semantic (norm.)" value={w.semantic_norm} />
            <p className="text-[0.76rem] leading-relaxed text-ink-soft">
              score = <b>α</b>·lexical + (1−<b>α</b>)·semantic with α = <b className="num">{fmt(w.alpha)}</b>
              {w.lexical_method && <> · lexical list from {methodLabel(w.lexical_method)}</>}
              {w.in_lexical === false && <> · not in the lexical list</>}
              {w.in_semantic === false && <> · not in the semantic list</>}
            </p>
          </div>
        ) : (
          <p className="text-[0.8rem] text-ink-soft">
            {methodLabel(r.method)} score <b className="num font-mono">{fmt(r.score, 4)}</b>
          </p>
        )}
        {w.cosine != null && (
          <p className="mt-2 text-[0.76rem] text-ink-soft">
            Cosine similarity to the query embedding: <b className="num font-mono">{fmt(w.cosine, 3)}</b>
          </p>
        )}
      </div>
      <div>
        <div className="label-caps mb-2">Query terms in this passage</div>
        {w.terms.length ? (
          <ul className="grid gap-1.5">
            {w.terms.map((t) => (
              <li key={t.term} className="grid grid-cols-[6rem_1fr_6.5rem] items-center gap-3 text-[0.8rem]">
                <code className="truncate rounded bg-sage-bg px-1.5 py-0.5 font-mono text-[0.76rem] text-sage-ink">{t.term}</code>
                <Meter value={(t.score ?? 0) / maxTerm} label={`${t.term} contribution`} />
                <span className="num text-right font-mono text-[0.72rem] text-ink-faint">
                  tf {t.tf} · {pct(t.share)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.8rem] text-ink-soft">
            No query term occurs in this passage: it was found by meaning (dense retrieval), not by matching words.
          </p>
        )}
        {w.eliminated.length > 0 && (
          <p className="mt-2 text-[0.74rem] text-ink-faint">Index elimination ignored: {w.eliminated.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

export function PassageDialog({ collection, pid, onClose }: { collection: string; pid: string; onClose: () => void }) {
  const [p, setP] = useState<Passage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    let live = true;
    api.passage(collection, pid).then(
      (x) => live && setP(x),
      (e) => live && setErr(String(e.message ?? e)),
    );
    return () => {
      live = false;
    };
  }, [collection, pid]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.(); // return focus to the button that opened the dialog
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full passage"
        className="card max-h-[85vh] w-full max-w-2xl animate-fade-up overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-serif text-[1.15rem] font-semibold leading-snug">{p?.title ?? "Loading…"}</h3>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-soft hover:bg-shell">
            <X className="h-4 w-4" />
          </button>
        </div>
        {err && <p className="mt-3 text-warn-ink">{err}</p>}
        {!p && !err && <Skeleton className="mt-4 h-40" />}
        {p && (
          <>
            <p className="mt-1 text-[0.78rem] text-ink-faint">
              {p.page ? `p. ${p.page} · ` : ""}
              {p.domain} · {p.n_tokens} words · <span className="font-mono">{p.passage_id}</span>
            </p>
            <p className="mt-4 whitespace-pre-line text-[0.92rem] leading-relaxed">{p.text}</p>
            <p className="mt-4 break-all text-[0.74rem] text-ink-faint">Source: {p.source}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function ResultCard({ r, topScore, collection }: { r: Result; topScore: number; collection: string }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  return (
    <li className="card animate-fade-up p-5" style={{ animationDelay: `${Math.min(r.rank, 10) * 30}ms` }}>
      <div className="flex items-start gap-4">
        <span
          className={clsx(
            "num mt-0.5 w-6 flex-none text-right font-serif text-[1.15rem] font-semibold",
            r.rank <= 3 ? "text-sage" : "text-ink-faint",
          )}
        >
          {r.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[1fr_auto] items-start gap-x-4">
            <h3 className="min-w-0 text-[0.98rem] font-semibold leading-snug">{r.title}</h3>
            <div className="mt-1 flex flex-none items-center gap-2.5">
              <Meter value={topScore > 0 ? r.score / topScore : 0} className="w-16" label="score relative to the top result" />
              <span className="num font-mono text-[0.76rem] text-ink-soft">{fmt(r.score, 3)}</span>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.76rem] text-ink-faint">
            <Pill tone={r.method === "fusion" || r.method === "fused" ? "on" : r.method === "dense" ? "info" : "plain"}>{methodLabel(r.method)}</Pill>
            {r.page ? <span>p. {r.page}</span> : null}
            <span>{r.domain}</span>
            <span className="font-mono">{r.passage_id}</span>
          </div>
          <Snippet r={r} />
          <div className="mt-2 flex flex-wrap gap-4 text-[0.8rem] font-semibold">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-sage-ink hover:text-sage"
            >
              <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} />
              Why this result?
            </button>
            <button type="button" onClick={() => setReading(true)} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink">
              <BookOpen className="h-3.5 w-3.5" /> Read full passage
            </button>
          </div>
          {open && <Why r={r} />}
        </div>
      </div>
      {reading && <PassageDialog collection={collection} pid={r.passage_id} onClose={() => setReading(false)} />}
    </li>
  );
}
