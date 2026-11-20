import clsx from "clsx";
import { Hammer, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Callout, Meter, Skeleton } from "../components/ui";
import { api, type Collection, type JudgeItem, type JudgeState } from "../lib/api";

const GRADES = [
  { g: 0, label: "Not relevant", hint: "Does not help answer the query" },
  { g: 1, label: "Partly relevant", hint: "On topic, but incomplete or indirect" },
  { g: 2, label: "Highly relevant", hint: "Directly answers the query" },
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
        BEIR collections ship with human relevance judgements. Judging is for the <b className="font-medium text-ink">CS course material</b>{" "}
        benchmark, so switch the collection at the top of the page.
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
      <div className="panel mt-2 max-w-2xl p-6">
        <h2 className="text-[1.1rem] font-semibold">No judging pool yet</h2>
        <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-soft">
          The pool is the top 10 passages of BM25, TF-IDF, dense, the fixed hybrid and the controller for every benchmark query, so every
          system is judged on the same passages.
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
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-ctl bg-ink px-4 text-[0.9rem] font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          <Hammer className="h-4 w-4" /> {busy ? "Building the pool, this takes a minute or two" : "Build the pool"}
        </button>
      </div>
    );

  const progress = state.total ? state.done / state.total : 0;
  const current = state.queries.find((q) => q.qid === item?.qid);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0">
        {!item ? (
          <div className="panel flex items-center gap-4 p-6">
            <PartyPopper className="h-6 w-6 flex-none text-pass" />
            <div>
              <b className="font-semibold">Everything {qid ? "for this query " : ""}is judged.</b>{" "}
              <span className="text-ink-soft">
                Run <code>python experiments/run_all.py cs --split test</code> to evaluate on the CS benchmark.
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-ink-faint">
                <span className="font-mono text-[0.78rem]">{item.qid}</span>
                {item.type && <Badge tone="accent">{item.type}</Badge>}
                {item.domain && <Badge>{item.domain}</Badge>}
                <span className="num">
                  passage {item.position} of {item.of}
                </span>
              </div>
              <h2 className="mt-2 text-[clamp(1.3rem,2.4vw,1.65rem)] font-semibold leading-snug tracking-[-0.015em]">{item.query}</h2>
            </div>
            <article className="panel overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b hairline px-6 py-3">
                <h3 className="font-medium">{item.passage.title}</h3>
                <span className="num text-[0.8rem] text-ink-faint">
                  {item.passage.page ? `p. ${item.passage.page}, ` : ""}
                  {item.passage.domain}
                </span>
              </div>
              <p className="prose-passage max-w-[68ch] px-6 py-5">{item.passage.text}</p>
            </article>
            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Grade">
              {GRADES.map(({ g, label, hint }) => (
                <button
                  key={g}
                  type="button"
                  disabled={busy}
                  onClick={() => grade(g)}
                  className={clsx(
                    "rounded-ctl border px-4 py-3 text-left transition-colors duration-150 disabled:opacity-50",
                    item.grade === g
                      ? "border-accent/50 bg-accent-soft"
                      : "border-line/[0.12] bg-surface hover:border-line/30",
                  )}
                >
                  <span className="flex items-center gap-2.5 font-medium">
                    <kbd>{g}</kbd>
                    {label}
                  </span>
                  <span className="mt-1 block text-[0.8rem] text-ink-soft">{hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[0.8rem] text-ink-faint">
              Press <kbd>0</kbd>, <kbd>1</kbd> or <kbd>2</kbd> to grade and move on. Guidelines are in <code>benchmark/judging_guidelines.md</code>.
              {item.grade != null && <> The current grade is {item.grade}.</>}
            </p>
          </div>
        )}
      </div>

      <aside className="panel grid gap-5 p-5 lg:sticky lg:top-[4.25rem]" aria-label="Judging progress">
        <div>
          <div className="flex items-baseline justify-between text-[0.88rem]">
            <span>
              <b className="num font-semibold">{state.done.toLocaleString()}</b>{" "}
              <span className="text-ink-faint">judged of {state.total.toLocaleString()}</span>
            </span>
            <span className="num text-ink-soft">{Math.round(progress * 100)}%</span>
          </div>
          <Meter value={progress} tone="pass" className="mt-2" label="judging progress" />
          {current && (
            <p className="num mt-2 text-[0.8rem] text-ink-faint">
              This query: {current.judged} of {current.total}
            </p>
          )}
        </div>
        <label className="grid gap-1.5 text-[0.82rem] font-medium text-ink-soft">
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
            placeholder="Used for inter-annotator agreement"
            className="h-9 rounded-ctl border border-line/[0.14] bg-surface px-3 text-[0.88rem] font-normal text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:shadow-focus"
          />
        </label>
        <label className="grid gap-1.5 text-[0.82rem] font-medium text-ink-soft">
          Query
          <select
            value={qid}
            onChange={(e) => {
              setQid(e.target.value);
              load(e.target.value);
            }}
            className="h-9 w-full rounded-ctl border border-line/[0.14] bg-surface px-2.5 text-[0.88rem] font-normal text-ink outline-none focus:border-accent/60 focus:shadow-focus"
          >
            <option value="">Next unjudged, any query</option>
            {state.queries.map((q) => (
              <option key={q.qid} value={q.qid}>
                {q.judged === q.total ? "✓ " : ""}
                {q.qid}: {q.text.slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
      </aside>
    </div>
  );
}
