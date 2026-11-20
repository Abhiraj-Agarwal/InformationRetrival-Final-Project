import { render, screen, within } from "@testing-library/react";
import type { Collection } from "../lib/api";
import { placeLabels, plotted } from "../components/QualityCostChart";
import { fixtures, mockApi } from "../test/mockApi";
import { EvaluationPage } from "./EvaluationPage";

const coll = (id: string) => fixtures.collections.collections.find((c) => c.id === id) as unknown as Collection;
const r = fixtures.evaluationScifact.result!;

beforeEach(() => vi.unstubAllGlobals());

describe("Evaluation page", () => {
  it("leads with the controller's quality and cost against the fixed hybrid", async () => {
    mockApi();
    render(<EvaluationPage collection={coll("scifact")} />);
    const s7 = r.systems.find((s) => s.id === "S7")!;
    const s5 = r.systems.find((s) => s.id === "S5")!;
    const tile = (await screen.findByText("Controller quality")).parentElement!;
    expect(tile).toHaveTextContent(s7.metrics!["NDCG@10"]!.toFixed(3));
    expect(tile).toHaveTextContent(`of the fixed hybrid's ${s5.metrics!["NDCG@10"]!.toFixed(3)}`);
    const saving = Math.round(((s7.mean_cost! - s5.mean_cost!) / s5.mean_cost!) * 100);
    expect(screen.getByText("Cost vs fixed hybrid").parentElement!).toHaveTextContent(`${saving}%`);
    expect(screen.getByRole("figure", { name: "Quality versus cost" })).toBeInTheDocument();
  });

  it("lists every system with the controller row highlighted", async () => {
    mockApi();
    render(<EvaluationPage collection={coll("scifact")} />);
    const table = await screen.findByRole("region", { name: "All systems" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(r.systems.length);
    expect(rows.find((x) => x.textContent?.includes("Full controller"))).toHaveAttribute("data-highlight", "true");
  });

  it("reports significance, ablations and whether risk control held", async () => {
    mockApi();
    render(<EvaluationPage collection={coll("scifact")} />);
    expect(await screen.findByRole("region", { name: "Significance tests" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ablations" })).toHaveTextContent("without expansion");
    const risk = screen.getByRole("region", { name: "Risk control" });
    const certified = r.risk_curve.filter((x) => x.certified_on_val).length;
    expect(within(risk).getAllByText(/held|violated/)).toHaveLength(certified);
  });

  it("explains that the cs benchmark is not labelled yet and shows costs only", async () => {
    mockApi();
    render(<EvaluationPage collection={coll("cs")} />);
    expect(await screen.findByText(/No relevance labels yet/)).toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    const table = screen.getByRole("region", { name: "All systems" });
    expect(within(table).queryByText("NDCG@10")).not.toBeInTheDocument();
    expect(within(table).getByText("Mean cost")).toBeInTheDocument();
  });
});

describe("chart scale", () => {
  it("keeps far-below-the-rest systems off the scale instead of flattening the chart", () => {
    const { keep, off } = plotted(r.systems as never);
    expect(off.map((s) => s.id)).toContain("S0"); // Boolean AND scores ~0.04 on SciFact
    expect(keep.map((s) => s.id)).toEqual(expect.arrayContaining(["S2", "S4", "S5", "S7"]));
  });
});

describe("chart labels", () => {
  it("places labels in a tight cluster without overlapping each other or leaving the plot", () => {
    const plot = { x0: 50, x1: 700, y0: 10, y1: 300 };
    const pt = (id: string, x: number, y: number) => ({ id, label: `System ${id}`, x, y, cost: 1, ndcg: 0.7 });
    const pts = [pt("S5", 600, 60), pt("S7", 590, 72), pt("S8", 596, 66), pt("N4", 586, 64), pt("S4", 610, 250), pt("S2", 80, 120)];
    const labels = placeLabels(pts, plot);
    expect(labels.map((l) => l.id).sort()).toEqual(["S2", "S4", "S5", "S7"]);
    for (const l of labels) {
      expect(l.box.x0).toBeGreaterThanOrEqual(plot.x0);
      expect(l.box.x1).toBeLessThanOrEqual(plot.x1);
      expect(l.box.y0).toBeGreaterThanOrEqual(plot.y0);
      expect(l.box.y1).toBeLessThanOrEqual(plot.y1);
    }
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].box, b = labels[j].box;
        const ov = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
        expect(ov, `${labels[i].id} vs ${labels[j].id}`).toBe(0);
      }
  });
});
