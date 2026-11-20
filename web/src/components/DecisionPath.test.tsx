import { render, screen, within } from "@testing-library/react";
import type { SearchResponse } from "../lib/api";
import auto from "../test/fixtures/search_auto.json";
import bm25 from "../test/fixtures/search_bm25.json";
import skips from "../test/fixtures/search_skips.json";
import stops from "../test/fixtures/search_auto_stops.json";
import { buildPath, DecisionPath } from "./DecisionPath";

const r = (x: unknown) => x as SearchResponse;

describe("buildPath", () => {
  it("turns a full escalation into route → retrieve/confidence pairs → stop", () => {
    const p = buildPath(r(auto).trace, r(auto).tau, "auto");
    expect(p[0]).toMatchObject({ kind: "route", method: "bm25_champion", cls: "default" });
    expect(p.filter((n) => n.kind === "retrieve").map((n) => (n as { method: string }).method)).toEqual(r(auto).methods_run);
    const conf = p.filter((n) => n.kind === "confidence");
    expect(conf).toHaveLength(r(auto).methods_run.length);
    expect(conf.every((n) => n.kind === "confidence" && n.passed === false)).toBe(true); // tau 0.99 never reached
    expect(p.at(-1)).toMatchObject({ kind: "stop", reason: "ladder exhausted or budget" });
  });

  it("marks a confident stop as passed", () => {
    const p = buildPath(r(stops).trace, r(stops).tau, "auto");
    expect(p.find((n) => n.kind === "confidence")).toMatchObject({ passed: true });
  });

  it("shows unaffordable steps as skipped", () => {
    const p = buildPath(r(skips).trace, r(skips).tau, "auto");
    expect(p.filter((n) => n.kind === "skip").map((n) => (n as { method: string }).method)).toEqual(["bm25", "dense", "expansion"]);
  });

  it("a fixed method is a single retrieve step", () => {
    expect(buildPath(r(bm25).trace, null, "bm25")).toEqual([
      expect.objectContaining({ kind: "retrieve", method: "bm25" }),
    ]);
  });
});

describe("<DecisionPath>", () => {
  it("renders every step in order with τ comparisons", () => {
    render(<DecisionPath trace={r(auto).trace} tau={r(auto).tau} mode="auto" />);
    const path = screen.getByRole("list", { name: "Decision path" });
    const items = within(path).getAllByRole("listitem").filter((li) => li.textContent);
    expect(items[0]).toHaveTextContent(/Route · default/);
    expect(items.at(-1)).toHaveTextContent(/Stop/);
    expect(within(path).getAllByText(/< τ 0\.99/).length).toBeGreaterThan(0);
    expect(within(path).getByText("Dense")).toBeInTheDocument();
  });

  it("renders skipped steps with the reason", () => {
    render(<DecisionPath trace={r(skips).trace} tau={r(skips).tau} mode="auto" />);
    expect(screen.getByText(/Dense skipped/)).toBeInTheDocument();
    expect(screen.getByText(/needs 23.30, 0.32 left/)).toBeInTheDocument();
  });
});
