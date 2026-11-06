import { describe, expect, it } from "vitest";
import { extractMindmapFromContent } from "@/components/materials/mindmap-parse";
import { diagramPseudocode, diagramSteps } from "@/components/session/board/diagram";
import { extractVisualFromContent, parseVisual, setVisualSaved, visualElements, type Visual } from "@/components/session/board/visual";

const fenced = (raw: object) => "Ini visualnya:\n```visual\n" + JSON.stringify(raw) + "\n```\nSelesai.";

const TRACE = {
  type: "trace",
  title: "Menimpa variabel",
  analogy: "Variabel seperti loker: isi baru membuang isi lama.",
  thing: "Loker",
  icon: "🔐",
  code: ["umur = 15", "umur = 16", "print(umur)"],
  steps: [
    { line: 1, say: "Loker umur diisi 15.", vars: { umur: 15 } },
    { line: 2, say: "15 dibuang, diganti 16.", vars: { umur: 16 } },
    { line: 3, say: "Layar menampilkan 16.", output: "16" },
  ],
};

const FLOW = {
  type: "flowchart",
  title: "Lulus?",
  nodes: [
    { id: "a", kind: "start", label: "Mulai" },
    { id: "b", kind: "decision", label: "nilai >= 75" },
    { id: "c", kind: "step", label: "Lulus" },
    { id: "d", kind: "end", label: "Selesai" },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c", label: "Ya" },
    { from: "b", to: "d", label: "Tidak" },
    { from: "c", to: "d" },
  ],
};

const idOf = (els: ReturnType<typeof visualElements>) => els[0].diagram!.id;

describe("reading the AI's visual", () => {
  it("reads a code simulation with its analogy, and the text around it", () => {
    const found = extractVisualFromContent(fenced(TRACE))!;
    expect(found).toMatchObject({ saved: false, introText: "Ini visualnya:", outroText: "Selesai." });
    expect(found.visual).toMatchObject({ type: "trace", analogy: TRACE.analogy, thing: "loker", icon: "🔐" });
  });
  it("falls back to a box and its emoji when the analogy gives none, or gives text as the icon", () => {
    expect(parseVisual({ ...TRACE, thing: undefined, icon: "kotak" })).toMatchObject({ thing: "kotak", icon: "📦" });
  });
  it("accepts the type names models use (flowchart, simulasi)", () => {
    expect(extractVisualFromContent(fenced(FLOW))?.visual.type).toBe("flow");
    expect(extractVisualFromContent(fenced({ ...TRACE, type: "simulasi" }))?.visual.type).toBe("trace");
  });
  it("runs every line once when the AI gave only the code", () => {
    const v = parseVisual({ type: "trace", title: "T", code: ["a = 1", "", "b = 2"] }) as Extract<Visual, { type: "trace" }>;
    expect(v.steps.map((s) => s.line)).toEqual([1, 3]);
  });
  it("is not a visual without code or nodes", () => {
    expect(parseVisual({ type: "trace", title: "T", code: [] })).toBeNull();
    expect(extractVisualFromContent("hanya teks")).toBeNull();
  });
});

describe("saving a visual for class", () => {
  it("marks and unmarks the reply without changing the visual or the text around it", () => {
    const content = fenced(TRACE);
    const saved = setVisualSaved(content, true)!;
    expect(extractVisualFromContent(saved)).toMatchObject({ saved: true, introText: "Ini visualnya:", outroText: "Selesai." });
    expect(extractVisualFromContent(saved)!.visual).toEqual(extractVisualFromContent(content)!.visual);
    expect(extractVisualFromContent(setVisualSaved(saved, false)!)!.saved).toBe(false);
  });
  it("leaves a reply with no visual alone", () => {
    expect(setVisualSaved("tanpa visual", true)).toBeNull();
  });
});

describe("a code simulation on the board", () => {
  const els = visualElements(parseVisual(TRACE)!);
  const id = idOf(els);
  const steps = diagramSteps(els, id);

  it("plays one step per line run, lighting the boxes the line wrote", () => {
    expect(steps.map((s) => [s.kindLabel, s.title])).toEqual([
      ["Baris 1", "umur = 15"],
      ["Baris 2", "umur = 16"],
      ["Baris 3", "print(umur)"],
    ]);
    expect(steps[1].focus).toHaveLength(2); // the line and the box it overwrote
    expect(steps[1].hint).toBe("15 dibuang, diganti 16.");
  });
  it("names the boxes after the analogy and says what was thrown away", () => {
    const texts = els.flatMap((e) => (e.type === "text" ? [e.text] : "label" in e && e.label ? [e.label] : []));
    expect(texts).toEqual(expect.arrayContaining(["🔐 umur", "✓ loker baru", "✕ 15 dibuang", "16", "🖥️ Layar"]));
    expect(texts.some((t) => t.startsWith("💡 Perumpamaan: Variabel seperti loker"))).toBe(true);
  });
  it("its code panel is the whole program, each line tied to its step", () => {
    expect(diagramPseudocode(els, id).map((l) => [l.text, l.node])).toEqual([
      ["umur = 15", "L1"],
      ["umur = 16", "L2"],
      ["print(umur)", "L3"],
    ]);
  });
  it("every shape has a real position", () => {
    expect(els.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y))).toBe(true);
  });
});

describe("which visuals play", () => {
  it("a flow has code to play along", () => {
    const els = visualElements(parseVisual({ ...FLOW, type: "flow" })!);
    expect(diagramPseudocode(els, idOf(els)).length).toBeGreaterThan(0);
    expect(diagramSteps(els, idOf(els)).length).toBeGreaterThan(1);
  });
  it("a timeline has no code, so it is only shown", () => {
    const els = visualElements(parseVisual({ type: "timeline", title: "T", items: [{ label: "a" }, { label: "b" }] })!);
    expect(diagramPseudocode(els, idOf(els))).toEqual([]);
  });
});

describe("extracting mindmap payloads from AI replies", () => {
  it("parses worker mindmap JSON even when React Flow edges and node.data are included", () => {
    const reply = [
      "Berikut peta konsep materi ini:",
      "```mindmap",
      JSON.stringify(
        {
          title: "Modul Pemrograman C#",
          nodes: [
            {
              id: "n1",
              parent_id: null,
              type: "root",
              label: "Modul Pemrograman C#",
              text: "Jelaskan keseluruhan isi materi Modul Pemrograman C# secara ringkas.",
              source: null,
              data: {
                label: "Modul Pemrograman C#",
                text: "Jelaskan keseluruhan isi materi Modul Pemrograman C# secara ringkas.",
                source: null,
                type: "root",
              },
            },
            {
              id: "n2",
              parent_id: "n1",
              type: "materi",
              label: "TOPIK 1: HELLO, PROGRAMMING !",
              text: "Jelaskan materi tentang TOPIK 1: HELLO, PROGRAMMING !",
              source: "Halaman 1",
              data: {
                label: "TOPIK 1: HELLO, PROGRAMMING !",
                text: "Jelaskan materi tentang TOPIK 1: HELLO, PROGRAMMING !",
                source: "Halaman 1",
                type: "materi",
              },
            },
          ],
          edges: [{ id: "e-n1-n2", source: "n1", target: "n2" }],
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    const extracted = extractMindmapFromContent(reply);
    expect(extracted).not.toBeNull();
    expect(extracted?.mindmap.title).toBe("Modul Pemrograman C#");
    expect(extracted?.mindmap.nodes).toHaveLength(2);
    expect(extracted?.mindmap.nodes[1]).toMatchObject({
      id: "n2",
      parent_id: "n1",
      label: "TOPIK 1: HELLO, PROGRAMMING !",
      source: "Halaman 1",
    });
  });

  it("recovers complete nodes when a mindmap JSON block is truncated mid-stream", () => {
    const truncated = `\`\`\`mindmap
{
  "title": "Modul Pemrograman C#",
  "nodes": [
    {
      "id": "n1",
      "parent_id": null,
      "label": "Modul Pemrograman C#",
      "text": "Jelaskan keseluruhan isi materi"
    },
    {
      "id": "n2",
      "parent_id": "n1",
      "label": "TOPIK 1: HELLO, PROGRAMMING !",
      "text": "Jelaskan TOPIK 1"
    },
    {
      "id": "n3",
      "parent_id": "n1",
      "Data terpotong`;

    const extracted = extractMindmapFromContent(truncated);
    expect(extracted).not.toBeNull();
    expect(extracted?.mindmap.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("does not mistake a flow visual for a mindmap", () => {
    expect(extractMindmapFromContent("```json\n" + JSON.stringify(FLOW) + "\n```")).toBeNull();
  });
});
