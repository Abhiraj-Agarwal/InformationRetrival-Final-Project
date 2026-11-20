import clsx from "clsx";
import { Hammer, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Callout, Meter, Pill, Skeleton } from "../components/ui";
import { api, type Collection, type JudgeItem, type JudgeState } from "../lib/api";

const GRADES = [
  { g: 0, label: "Not relevant", hint: "does not help answer the query" },
  { g: 1, label: "Partly relevant", hint: "on topic, but incomplete or indirect" },
  { g: 2, label: "Highly relevant", hint: "directly answers the query" },
];

function storedName(): string {
  try {
    return localStorage.getItem("cw.annotator") ?? "";
  } catch {
    return "";
  }
}

export function JudgePage({ collection }: { collection: Collection }) {
  const [state, setState] = useState<JudgeState | null>(null);
  const [item, setItem] = useState<JudgeItem | null | undefined>(undefined);
  const [qid, setQid] = useState<string>("");
  const [name, setName] = useState(storedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q?: string, pid?: string) => {
      setError(null);
      try {
        const st = await api.judge(collection.id);
        setState(st);
        if (!st.pool_ready) return setItem(null);
        const r = await api.judgeItem(collection.id, q || undefined, pid);
        setItem(r.item);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [collection.id],
  );

  useEffect(() => {
    if (collection.judging && collection.ready) load();
  }, [collection, load]);

  const grade = useCallback(
    async (g: number) => {
      if (!item || busy) return;
      setBusy(true);
      try {
        const st = await api.judgeSave(collection.id, { qid: item.qid, passage_id: item.passage.passage_id, grade: g, annotator: name });
        setState(st);
        setItem((await api.judgeItem(collection.id, qid || undefined)).item);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [item, busy, collection.id, name, qid],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (["0", "1", "2"].includes(e.key)) grade(Number(e.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade]);

  if (!collection.judging)
    return (
      <Callout tone="plain" title={`${collection.label} is already judged.`}>
        BEIR collections ship with human relevance judgements. Judging is for the <b>CS course material</b> benchmark - switch collection
        above.
      </Callout>
    );
  if (!collection.ready)
    return (
      <Callout tone="warn" title="The CS collection is not built yet.">
        Run <code>python -m contextweave.ingestion.download</code>, <code>python main.py data</code> and{" "}
        <code>python main.py build-index --collection cs</code>, then restart the server.
      </Callout>
    );
  if (error) return <Callout tone="warn" title="Something went wrong.">{error}</Callout>;
  if (!state || item === undefined) return <Skeleton className="mt-2 h-72" />;

  if (!state.pool_ready)
    return (
      <div className="card mt-2 p-6">
        <h2 className="font-serif text-[1.2rem] font-semibold">No judging pool yet</h2>
        <p className="mt-1 max-w-[65ch] text-[0.9rem] text-ink-soft">
          The pool is the top 10 passages of BM25, TF-IDF, dense, the fixed hybrid and the controller for every benchmark query, so every system
          is judged on the same passages.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setState(await api.buildPool(collection.id));
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-sage-deep px-5 py-2 text-[0.9rem] font-semibold text-white hover:bg-sage disabled:opacity-50"
        >
          <Hammer className="h-4 w-4" /> {busy ? "Pooling… (a minute or two)" : "Build the pool"}
        </button>
      </div>
    );

  const progress = state.total ? state.done / state.total : 0;
  return (
    <div>
      <div className="grid animate-fade-up gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="flex items-baseline justify-between text-[0.84rem]">
            <span className="font-semibold">
              {state.done.toLocaleString()} judged <span className="font-normal text-ink-faint">of {state.total.toLocaleString()}</span>
            </span>
            <span className="num text-ink-soft">{Math.round(progress * 100)}%</span>
          </div>
          <Meter value={progress} className="mt-2" label="judging progress" />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-[0.74rem] font-semibold text-ink-soft">
            Your name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                try {
                  localStorage.setItem("cw.annotator", e.target.value);
                } catch {
                  /* private mode */
                }
              }}
              placeholder="for inter-annotator agreement"
              className="w-52 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[0.86rem] font-normal text-ink outline-none focus:border-sage"
            />
          </label>
          <label className="grid gap-1 text-[0.74rem] font-semibold text-ink-soft">
            Query
            <select
              value={qid}
              onChange={(e) => {
                setQid(e.target.value);
                load(e.target.value);
              }}
              className="w-64 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[0.86rem] font-normal text-ink outline-none focus:border-sage"
            >
              <option value="">Next unjudged (any query)</option>
              {state.queries.map((q) => (
                <option key={q.qid} value={q.qid}>
                  {q.judged === q.total ? "✓ " : ""}
                  {q.qid}: {q.text.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!item ? (
        <div className="card mt-6 flex items-center gap-4 p-6 text-sage-ink">
          <PartyPopper className="h-6 w-6" />
          <div>
            <b>Everything {qid ? "for this query " : ""}is judged.</b>{" "}
            <span className="text-ink-soft">Run <code>python experiments/run_all.py cs --split test</code> to evaluate on the cs benchmark.</span>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid animate-fade-up gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.76rem] text-ink-faint">
              <span className="font-mono">{item.qid}</span>
              {item.type && <Pill tone="info">{item.type}</Pill>}
              {item.domain && <Pill>{item.domain}</Pill>}
              <span>
                passage {item.position} of {item.of}
              </span>
            </div>
            <h2 className="mt-1.5 font-serif text-[1.45rem] font-semibold leading-snug">{item.query}</h2>
          </div>
          <article className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{item.passage.title}</h3>
              <span className="text-[0.76rem] text-ink-faint">
                {item.passage.page ? `p. ${item.passage.page} · ` : ""}
                {item.passage.domain}
              </span>
            </div>
            <p className="mt-3 text-[0.94rem] leading-relaxed">{item.passage.text}</p>
          </article>
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Grade">
            {GRADES.map(({ g, label, hint }) => (
              <button
                key={g}
                type="button"
                disabled={busy}
                onClick={() => grade(g)}
                className={clsx(
                  "rounded-md2 border px-4 py-3 text-left transition-all duration-200 ease-soft hover:-translate-y-px disabled:opacity-50",
                  item.grade === g ? "border-sage bg-sage-bg" : "border-line-strong bg-surface hover:border-sage",
                )}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <kbd className="rounded border border-line-strong bg-paper px-1.5 font-mono text-[0.74rem]">{g}</kbd>
                  {label}
                </span>
                <span className="mt-0.5 block text-[0.76rem] text-ink-soft">{hint}</span>
              </button>
            ))}
          </div>
          <p className="text-[0.76rem] text-ink-faint">
            Press <kbd>0</kbd>, <kbd>1</kbd> or <kbd>2</kbd> to grade and move on. Guidelines: <code>benchmark/judging_guidelines.md</code>
            {item.grade != null && <> · current grade: {item.grade}</>}
          </p>
        </div>
      )}
    </div>
  );
}
