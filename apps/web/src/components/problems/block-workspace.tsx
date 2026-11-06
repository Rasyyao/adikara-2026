"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CornerDownRight,
  CornerLeftUp,
  Flag,
  GitBranch,
  Info,
  MoveVertical,
  Pencil,
  Puzzle,
  Repeat,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BlockKind, PuzzleBlock, PuzzleGrade, PuzzleNode } from "@/lib/api/types";
import { KIND_ORDER, KINDS, type FlowView, countNodes, findNode, insertNode, locate, moveNode, newNode, removeNode, usedIds } from "./blocks";

const ICONS: Record<BlockKind, LucideIcon> = { event: Flag, action: ChevronRight, loop: Repeat, if: GitBranch, part: Puzzle, info: Info };
const GROUP_LABEL: Record<BlockKind, string> = {
  event: "Mulai",
  action: "Langkah",
  if: "Jika · percabangan",
  loop: "Ulangi · perulangan",
  part: "Bagian masalah",
  info: "Informasi",
};
const STATE_ICON = { right: Check, misplaced: MoveVertical, extra: X } as const;
const STATE_LABEL = { right: "sudah tepat", misplaced: "posisinya belum tepat", extra: "tidak diperlukan" } as const;

type Drop = { kind: "stack"; parent: string | null; index: number; line: { left: number; top: number; width: number } } | { kind: "palette" } | null;
interface Drag {
  id: string;
  from: "palette" | "tree";
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface Props {
  /** author: the teacher builds the answer key; blocks left in the tray are distractors. solve: the student's view. */
  mode: "author" | "solve";
  blocks: PuzzleBlock[];
  tree: PuzzleNode[];
  onChange: (tree: PuzzleNode[]) => void;
  /** Tray order (solve mode shuffles it). Defaults to the order of `blocks`. */
  trayOrder?: string[];
  feedback?: PuzzleGrade["blocks"] | null;
  /** Author mode: change or delete a block itself. */
  onEditBlock?: (id: string, text: string) => void;
  onDeleteBlock?: (id: string) => void;
  disabled?: boolean;
  /** A running program: the block running now, the trail behind it and each loop's round. */
  flow?: FlowView | null;
}

/** The colours of a kind as CSS variables; the stylesheet paints the face, rim, arm and foot from them. */
function blockStyle(kind: BlockKind): CSSProperties {
  const k = KINDS[kind];
  return { ["--fill" as string]: k.fill, ["--edge" as string]: k.edge, ["--k-ink" as string]: k.ink };
}

/** Depth-first order of the placed blocks, so graded blocks light up top to bottom. */
function orderOf(tree: PuzzleNode[], into = new Map<string, number>()): Map<string, number> {
  for (const n of tree) {
    into.set(n.block, into.size);
    if (n.children) orderOf(n.children, into);
  }
  return into;
}

/** The card of one block, also used for the drag ghost: kind icon, text, and the grade once checked. */
function BlockFace({ block, state, badge }: { block: PuzzleBlock; state?: keyof typeof STATE_ICON; badge?: ReactNode }) {
  const Icon = ICONS[block.kind];
  const StateIcon = state ? STATE_ICON[state] : null;
  const shape = block.kind === "event" ? "pcard--start" : KINDS[block.kind].container ? "pcard--head" : "";
  return (
    <span className={`pcard ${shape}`} style={blockStyle(block.kind)}>
      <span className="pcard__icon" aria-hidden="true">
        <Icon size={15} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 break-words">{block.text}</span>
      {badge}
      {StateIcon && (
        <span className={`pcard__state pcard__state--${state}`} aria-hidden="true">
          <StateIcon size={12} strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

/** A loop or if around what it holds: the head, the indented body, and the closing mark. */
function Group({ block, children, running, looping }: { block: PuzzleBlock; children: ReactNode; running?: boolean; looping?: boolean }) {
  return (
    <div className="pgroup" style={blockStyle(block.kind)} data-running={running || undefined} data-looping={looping || undefined}>
      {children}
      <span className="pgroup__end" aria-hidden="true">
        akhir {block.kind === "loop" ? "ulangi" : "jika"}
      </span>
    </div>
  );
}

export function BlockWorkspace({ mode, blocks, tree, onChange, trayOrder, feedback, onEditBlock, onDeleteBlock, disabled = false, flow = null }: Props) {
  const activeBlock = flow?.active ?? null;
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const used = useMemo(() => usedIds(tree), [tree]);
  const tray = useMemo(() => (trayOrder ?? blocks.map((b) => b.id)).filter((id) => byId.has(id) && !used.has(id)).map((id) => byId.get(id)!), [trayOrder, blocks, byId, used]);

  const [picked, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [announce, setAnnounce] = useState("");
  /** The block just placed, for the snap-in animation. */
  const [fresh, setFresh] = useState<string | null>(null);
  const order = useMemo(() => orderOf(tree), [tree]);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLSpanElement>(null);
  const dropRef = useRef<Drop>(null);
  const suppressClick = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanup.current?.();
      document.documentElement.classList.remove("pblock-dragging");
    },
    [],
  );

  // a block deleted or put back stops being selected
  const selectedNode = picked ? findNode(tree, picked) : null;
  const selected = selectedNode ? picked : null;

  const text = (id: string) => byId.get(id)?.text ?? "";
  const say = (message: string) => setAnnounce(message);
  const place = (next: PuzzleNode[], id: string) => {
    onChange(next);
    setFresh(id);
  };

  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(null), 450);
    return () => clearTimeout(timer);
  }, [fresh]);

  // keep the running block in view while the flow plays
  useEffect(() => {
    if (!activeBlock) return;
    rootRef.current?.querySelector(`[data-node="${CSS.escape(activeBlock)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeBlock]);

  // the execution marker glides to the left edge of the running block; set directly on the element, it needs no render
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const token = tokenRef.current;
    if (!canvas || !token || !activeBlock) return;
    const card = canvas.querySelector(`[data-node="${CSS.escape(activeBlock)}"] .pcard`);
    if (!card) return;
    const box = canvas.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const x = r.left - box.left + canvas.scrollLeft - 7;
    const y = r.top - box.top + canvas.scrollTop + r.height / 2 - 7;
    // the first position is jumped to, every later one glided to
    if (token.dataset.placed !== "true") {
      token.style.transition = "none";
      token.style.transform = `translate(${x}px, ${y}px)`;
      void token.offsetWidth;
      token.style.transition = "";
      token.dataset.placed = "true";
      return;
    }
    token.style.transform = `translate(${x}px, ${y}px)`;
  }, [activeBlock, flow, tree]);

  /** Taps add a block at the end, or into the selected loop/if. */
  const addFromTray = (id: string) => {
    const block = byId.get(id);
    if (!block) return;
    const target = selectedNode && KINDS[byId.get(selectedNode.block)!.kind].container ? selectedNode.block : null;
    const parentLen = target ? (selectedNode!.children?.length ?? 0) : tree.length;
    place(insertNode(tree, target, parentLen, newNode(block)), block.id);
    say(target ? `${block.text} dimasukkan ke ${text(target)}.` : `${block.text} ditambahkan di akhir susunan.`);
  };

  const targetAt = useCallback(
    (x: number, y: number, dragId: string): Drop => {
      const root = rootRef.current;
      if (!root) return null;
      for (const el of document.elementsFromPoint(x, y)) {
        if (!(el instanceof HTMLElement) || !root.contains(el)) continue;
        if (el.closest(`[data-node="${CSS.escape(dragId)}"]`)) continue; // never into the block being dragged
        if (el.closest("[data-tray]")) return { kind: "palette" };
        const stack = el.closest<HTMLElement>("[data-stack]");
        if (!stack) continue;
        const items = [...stack.querySelectorAll<HTMLElement>(":scope > [data-node]")];
        const rect = stack.getBoundingClientRect();
        let index = items.findIndex((item) => {
          const r = item.firstElementChild?.getBoundingClientRect() ?? item.getBoundingClientRect();
          return y < r.top + Math.min(r.height, 44) / 2;
        });
        if (index < 0) index = items.length;
        const ref = items[index]?.getBoundingClientRect();
        const last = items[items.length - 1]?.getBoundingClientRect();
        const top = ref ? ref.top : last ? last.bottom - 4 : rect.top + 4;
        const parent = stack.dataset.stack === "root" ? null : stack.dataset.stack!;
        return { kind: "stack", parent, index, line: { left: rect.left, top, width: Math.min(260, Math.max(120, rect.width - 8)) } };
      }
      return null;
    },
    [],
  );

  const commit = (id: string, from: Drag["from"], target: Drop) => {
    if (!target) return;
    const block = byId.get(id)!;
    if (target.kind === "palette") {
      if (from === "tree") {
        onChange(removeNode(tree, id));
        say(`${block.text} dikembalikan ke ${mode === "author" ? "pengecoh" : "kotak blok"}.`);
      }
      return;
    }
    place(from === "palette" ? insertNode(tree, target.parent, target.index, newNode(block)) : moveNode(tree, id, target.parent, target.index), id);
    say(`${block.text} ditaruh ${target.parent ? `di dalam ${text(target.parent)}` : "di susunan"}, posisi ${target.index + 1}.`);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: string, from: Drag["from"]) => {
    if (disabled || event.button !== 0 || editing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        dragging = true;
        suppressClick.current = true;
        // no text selection while a block is carried across the page
        window.getSelection()?.removeAllRanges();
        document.documentElement.classList.add("pblock-dragging");
      }
      ev.preventDefault();
      setDrag({ id, from, x: ev.clientX, y: ev.clientY, dx: sx - rect.left, dy: sy - rect.top });
      const target = targetAt(ev.clientX, ev.clientY, id);
      dropRef.current = target;
      setDrop(target);
      // keep the page moving when the block is held near the edge
      if (ev.clientY < 56) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - 56) window.scrollBy(0, 14);
    };
    const finish = (ok: boolean) => {
      cleanup.current?.();
      document.documentElement.classList.remove("pblock-dragging");
      // the click that follows a drag lands on whatever is under the pointer, if anywhere; stop ignoring clicks after it
      setTimeout(() => (suppressClick.current = false), 0);
      if (dragging && ok) commit(id, from, dropRef.current);
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && finish(false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      cleanup.current = null;
    };
  };

  const swallowClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  // ---- toolbar actions on the selected block --------------------------------------------------------------------
  const where = selected && selectedNode ? locate(tree, selected) : null;
  const siblings = where ? (where.parent ? (findNode(tree, where.parent)?.children ?? []) : tree) : [];
  const previous = where && where.index > 0 ? siblings[where.index - 1] : null;
  const canEnter = !!previous && KINDS[byId.get(previous.block)!.kind].container;

  const act = {
    up: () => where && onChange(moveNode(tree, selected!, where.parent, where.index - 1)),
    down: () => where && onChange(moveNode(tree, selected!, where.parent, where.index + 2)),
    enter: () => previous && onChange(moveNode(tree, selected!, previous.block, previous.children?.length ?? 0)),
    leave: () => {
      if (!where?.parent) return;
      const outer = locate(tree, where.parent)!;
      onChange(moveNode(tree, selected!, outer.parent, outer.index + 1));
    },
    back: () => {
      onChange(removeNode(tree, selected!));
      say(`${text(selected!)} dikembalikan.`);
      setSelected(null);
    },
  };

  const renderStack = (nodes: PuzzleNode[], parent: string | null) => (
    <div data-stack={parent ?? "root"} className={`pstack ${parent === null ? "min-h-full flex-1 pb-16" : ""}`}>
      {nodes.map((node) => renderNode(node))}
      {parent !== null && nodes.length === 0 && <span className="pblock__slot">Taruh blok di sini</span>}
    </div>
  );

  /** While a program runs: a loop shows its round, an if shows its check. */
  const flowBadge = (block: PuzzleBlock): ReactNode => {
    if (!flow) return null;
    if (block.kind === "loop" && flow.rounds[block.id]) {
      const round = flow.rounds[block.id];
      return (
        <span key={round} className="pcard__round ppop">
          {round === "…" ? "terus berulang" : `putaran ${round}`}
        </span>
      );
    }
    if (block.kind === "if" && flow.trail.has(block.id)) {
      const checking = activeBlock === block.id && flow.kind === "check";
      return (
        <span key={checking ? "check" : "ok"} className={`pcard__round ppop ${checking ? "" : "pcard__round--ok"}`}>
          {checking ? "cek syarat…" : "syarat benar ✓"}
        </span>
      );
    }
    return null;
  };

  const renderNode = (node: PuzzleNode) => {
    const block = byId.get(node.block);
    if (!block) return null;
    const container = KINDS[block.kind].container;
    const state = feedback?.[block.id];
    const isSelected = selected === block.id;
    const dragged = drag?.id === block.id;
    const label = `${KINDS[block.kind].label}: ${block.text}${state ? `, ${STATE_LABEL[state]}` : ""}${container ? `, berisi ${node.children?.length ?? 0} blok` : ""}`;
    const button = (
      <button
        type="button"
        className="pblock-btn"
        style={{ ["--i" as string]: order.get(block.id) ?? 0 }}
        data-selected={isSelected || undefined}
        data-state={state}
        data-active={activeBlock === block.id || undefined}
        data-visited={(flow?.trail.has(block.id) && activeBlock !== block.id) || undefined}
        data-looping={(activeBlock === block.id && flow?.kind === "loop-back") || undefined}
        aria-pressed={isSelected}
        aria-label={label}
        disabled={disabled}
        onPointerDown={(e) => onPointerDown(e, block.id, "tree")}
        onClick={() => {
          if (swallowClick()) return;
          setSelected(isSelected ? null : block.id);
          setEditing(null);
        }}
      >
        <BlockFace block={block} state={state} badge={flowBadge(block)} />
      </button>
    );
    return (
      <div
        key={block.id}
        data-node={block.id}
        data-fresh={fresh === block.id || undefined}
        data-visited={flow?.trail.has(block.id) || undefined}
        className={`max-w-full transition-opacity ${dragged ? "opacity-35" : ""}`}
      >
        {container ? (
          <Group block={block} running={flow ? block.id in flow.rounds && !flow.finished : false} looping={activeBlock === block.id && flow?.kind === "loop-back"}>
            {button}
            <div className="pgroup__body">{renderStack(node.children ?? [], block.id)}</div>
          </Group>
        ) : (
          button
        )}
      </div>
    );
  };

  const ghost = drag ? byId.get(drag.id) : null;
  const ghostNode = drag?.from === "tree" ? findNode(tree, drag.id) : null;
  const placed = countNodes(tree);

  return (
    <div ref={rootRef} className={`flex flex-col gap-3 ${drag ? "select-none" : ""} ${flow?.finished ? "pfinished" : ""}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,5fr)_8fr]">
        {/* tray */}
        <section
          data-tray
          aria-label={mode === "author" ? "Blok pengecoh" : "Blok tersedia"}
          className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${drop?.kind === "palette" ? "border-primary bg-primary-tint" : "border-border bg-bg"}`}
        >
          <div>
            <p className="text-small font-semibold text-ink">{mode === "author" ? "Blok pengecoh" : "Blok tersedia"}</p>
            <p className="text-caption text-muted">
              {mode === "author" ? "Blok di sini tidak dipakai di jawaban. Seret ke kanan untuk memakainya." : "Seret blok ke area susun, atau ketuk untuk menambahkannya."}
            </p>
          </div>
          {tray.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-caption text-muted">
              {mode === "author" ? "Belum ada pengecoh. Pengecoh membuat siswa berpikir, bukan sekadar menyusun semua blok." : "Semua blok sudah dipakai."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {KIND_ORDER.filter((kind) => tray.some((b) => b.kind === kind)).map((kind) => (
                <div key={kind}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    <span className="size-2.5 rounded-[3px]" style={{ background: KINDS[kind].fill }} aria-hidden="true" />
                    {GROUP_LABEL[kind]}
                  </p>
                  <ul className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
                    {tray
                      .filter((b) => b.kind === kind)
                      .map((block) => (
                <li key={block.id} data-node={block.id} className={`flex max-w-full items-center gap-1 ${drag?.id === block.id ? "opacity-35" : ""}`}>
                  <button
                    type="button"
                    className="pblock-btn"
                    aria-label={`${KINDS[block.kind].label}: ${block.text}. Tambahkan ke susunan`}
                    disabled={disabled}
                    onPointerDown={(e) => onPointerDown(e, block.id, "palette")}
                    onClick={() => {
                      if (swallowClick()) return;
                      addFromTray(block.id);
                    }}
                  >
                    <BlockFace block={block} />
                  </button>
                  {mode === "author" && (
                    <>
                      <IconButton label={`Ubah teks ${block.text}`} onClick={() => setEditing({ id: block.id, text: block.text })}>
                        <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Hapus blok ${block.text}`} onClick={() => onDeleteBlock?.(block.id)}>
                        <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                    </>
                  )}
                </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* workspace */}
        <section aria-label={mode === "author" ? "Kunci jawaban" : "Area susun"} className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-border">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
            <p className="text-small font-semibold text-ink">
              {mode === "author" ? "Kunci jawaban" : "Area susun"} <span className="font-normal text-muted">· {placed} blok</span>
            </p>
            {selectedNode && !editing && (
              <div role="toolbar" aria-label={`Atur blok ${text(selected!)}`} className="flex flex-wrap items-center gap-1">
                <ToolButton label="Naik" disabled={!where || where.index === 0} onClick={act.up}>
                  <ArrowUp size={16} strokeWidth={1.75} aria-hidden="true" />
                </ToolButton>
                <ToolButton label="Turun" disabled={!where || where.index >= siblings.length - 1} onClick={act.down}>
                  <ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
                </ToolButton>
                <ToolButton label="Masukkan ke blok di atasnya" disabled={!canEnter} onClick={act.enter}>
                  <CornerDownRight size={16} strokeWidth={1.75} aria-hidden="true" />
                </ToolButton>
                <ToolButton label="Keluarkan dari blok" disabled={!where?.parent} onClick={act.leave}>
                  <CornerLeftUp size={16} strokeWidth={1.75} aria-hidden="true" />
                </ToolButton>
                {mode === "author" && (
                  <ToolButton label="Ubah teks" onClick={() => setEditing({ id: selected!, text: text(selected!) })}>
                    <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                  </ToolButton>
                )}
                <ToolButton label={mode === "author" ? "Jadikan pengecoh" : "Kembalikan"} onClick={act.back}>
                  <Undo2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </ToolButton>
                {mode === "author" && (
                  <ToolButton
                    label="Hapus blok"
                    onClick={() => {
                      onDeleteBlock?.(selected!);
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  </ToolButton>
                )}
              </div>
            )}
            {editing && (
              <form
                className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editing.text.trim()) onEditBlock?.(editing.id, editing.text.trim());
                  setEditing(null);
                }}
              >
                <label className="sr-only" htmlFor="pblock-edit">
                  Teks blok
                </label>
                <input
                  id="pblock-edit"
                  autoFocus
                  maxLength={120}
                  value={editing.text}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-small text-ink outline-none focus:border-primary sm:w-64"
                />
                <button type="submit" className="h-9 rounded-md bg-primary px-3 text-small font-semibold text-white hover:bg-primary-hover">
                  Simpan
                </button>
                <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-md px-2 text-small font-semibold text-muted hover:text-ink">
                  Batal
                </button>
              </form>
            )}
          </div>
          <div ref={canvasRef} className="pworkspace relative flex flex-1 flex-col overflow-x-auto p-4">
            {flow && !flow.finished && <span ref={tokenRef} className="pflow-token" aria-hidden="true" />}
            {tree.length === 0 && (
              <div
                className={`pointer-events-none absolute inset-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors ${drop?.kind === "stack" ? "border-primary bg-primary-tint/60" : "border-border"}`}
              >
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#F2B705]/20 text-[#8F6800]" aria-hidden="true">
                  <Flag size={18} strokeWidth={2.25} />
                </span>
                <p className="text-small font-semibold text-ink">{mode === "author" ? "Susun kunci jawaban di sini" : "Seret blok ke sini"}</p>
                <p className="max-w-64 text-caption text-muted">Mulai dari blok kuning, lalu tambahkan langkah di bawahnya. Atau ketuk blok di kiri untuk menambahkannya.</p>
              </div>
            )}
            {renderStack(tree, null)}
          </div>
        </section>
      </div>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {/* The dragged block and the drop line live on <body>: an ancestor with a transform (a stage sliding in, say)
          would otherwise become their positioning box and throw them far from the pointer. */}
      {drop?.kind === "stack" &&
        drag &&
        createPortal(<div aria-hidden="true" className="pdrop-line pointer-events-none fixed z-[100]" style={{ left: drop.line.left + 8, top: drop.line.top - 3, width: drop.line.width }} />, document.body)}
      {ghost &&
        drag &&
        createPortal(
          <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[100]" style={{ transform: `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px)` }}>
            {/* tilted around the point that was grabbed, so that point stays under the pointer */}
            <div className="pghost" style={{ transformOrigin: `${drag.dx}px ${drag.dy}px` }}>
              {KINDS[ghost.kind].container ? (
                <Group block={ghost}>
                  <span className="pblock-btn">
                    <BlockFace block={ghost} />
                  </span>
                  <div className="pgroup__body text-caption font-semibold text-muted">{ghostNode?.children?.length ? `berisi ${countNodes(ghostNode.children)} blok` : "kosong"}</div>
                </Group>
              ) : (
                <span className="pblock-btn">
                  <BlockFace block={ghost} />
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-md text-ink hover:bg-primary-tint disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink">
      {children}
    </button>
  );
}
