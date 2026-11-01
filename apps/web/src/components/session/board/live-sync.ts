"use client";

// The whiteboard drawn on together, on the browser's side. Local changes are found by comparing the elements with what
// was last sent (every change makes a new element object, so a changed object is a changed element) and sent in order,
// one request at a time, so a later stroke never overtakes an earlier one. Changes of the others arrive on the
// session's event stream and are applied without being sent back. Cursors are sent a few times a second.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { sanitizeElements } from "./geometry";
import type { BoardElement, Point } from "./types";

/** Who is on the board. */
export interface LiveActor {
  id: string;
  name: string;
  role: "teacher" | "student";
}

/** Someone else's pointer, in board coordinates. */
export interface LiveCursor extends LiveActor {
  x: number;
  y: number;
  /** When it last moved, to let a still cursor fade away. */
  at: number;
}

export type LiveEvent =
  | { type: "snapshot"; elements: BoardElement[]; drawAllowed: boolean; me: LiveActor }
  | { type: "ops"; by: string; upserts: BoardElement[]; deletes: string[] }
  | { type: "mode"; drawAllowed: boolean }
  | { type: "cursor"; actor: LiveActor; point: Point | null }
  /** A quiz was opened or closed, or a student answered (teacher only): open results panels refresh. */
  | { type: "quiz"; quizId: string; change: "opened" | "closed" | "progress" };

/** Hands the board's events from the page's event stream to the whiteboard. */
export interface LiveChannel {
  emit(event: LiveEvent): void;
  subscribe(listener: (event: LiveEvent) => void): () => void;
}

export function createLiveChannel(): LiveChannel {
  const listeners = new Set<(event: LiveEvent) => void>();
  return {
    emit: (event) => listeners.forEach((listener) => listener(event)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function actorOf(raw: unknown): LiveActor | null {
  if (!isObject(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, name: typeof raw.name === "string" && raw.name ? raw.name : "Tanpa nama", role: raw.role === "teacher" ? "teacher" : "student" };
}

/** A session stream event as a board event; null when it is not about the board. */
export function liveEventOf(type: string, data: Record<string, unknown>): LiveEvent | null {
  if (type === "snapshot") {
    const live = data.live;
    if (!isObject(live)) return null;
    const me = actorOf(live.me);
    const board = isObject(live.board) && Array.isArray(live.board.elements) ? live.board.elements : [];
    return me ? { type: "snapshot", elements: sanitizeElements(board), drawAllowed: live.draw_allowed !== false, me } : null;
  }
  if (type === "board_ops") {
    return {
      type: "ops",
      by: typeof data.by === "string" ? data.by : "",
      upserts: sanitizeElements(Array.isArray(data.upserts) ? data.upserts : []),
      deletes: Array.isArray(data.deletes) ? data.deletes.filter((id): id is string => typeof id === "string") : [],
    };
  }
  if (type === "quiz_opened" || type === "quiz_closed" || type === "quiz_progress") {
    const quizId = type === "quiz_progress" ? data.quiz_id : isObject(data.quiz) ? data.quiz.id : null;
    return typeof quizId === "string" ? { type: "quiz", quizId, change: type === "quiz_opened" ? "opened" : type === "quiz_closed" ? "closed" : "progress" } : null;
  }
  if (type === "board_mode") return { type: "mode", drawAllowed: data.draw_allowed !== false };
  if (type === "cursor") {
    const actor = actorOf(data);
    if (!actor) return null;
    const point = data.hidden !== true && typeof data.x === "number" && typeof data.y === "number" ? ([data.x, data.y] as Point) : null;
    return { type: "cursor", actor, point };
  }
  return null;
}

/** `elements` with `upserts` written in (in place, or added on top) and `deletes` taken out. */
export function applyOps(elements: BoardElement[], upserts: BoardElement[], deletes: string[]): BoardElement[] {
  if (upserts.length === 0 && deletes.length === 0) return elements;
  const byId = new Map(upserts.map((e) => [e.id, e]));
  const gone = new Set(deletes);
  const next = elements.flatMap((e) => (gone.has(e.id) ? [] : [byId.get(e.id) ?? e]));
  const present = new Set(elements.map((e) => e.id));
  for (const e of upserts) if (!present.has(e.id) && !gone.has(e.id)) next.push(e);
  return next;
}

/** A cursor that has not moved for this long fades away (its owner may have closed the tab). */
const CURSOR_TTL_MS = 12_000;

/**
 * Keeps the whiteboard in step with everyone else on it. `applyRemote` writes changes of others into the board (and its
 * undo history, so undo only takes back the teacher's own strokes).
 */
export function useLiveSync({
  sessionId,
  channel,
  elements,
  elementsRef,
  applyRemote,
  cursorEveryMs,
}: {
  sessionId: string;
  channel: LiveChannel | null;
  elements: BoardElement[];
  elementsRef: RefObject<BoardElement[]>;
  /** `replace`: the whole board was swapped (a reconnect), so the undo history no longer applies. */
  applyRemote: (change: (elements: BoardElement[]) => BoardElement[], replace?: boolean) => void;
  /** How often this viewer's cursor is sent at most. */
  cursorEveryMs: number;
}) {
  const [me, setMe] = useState<LiveActor | null>(null);
  const [drawAllowed, setDrawAllowed] = useState(true);
  const [cursors, setCursors] = useState<LiveCursor[]>([]);
  const [online, setOnlineState] = useState(true);
  const onlineRef = useRef(true);
  const setOnline = (value: boolean) => {
    onlineRef.current = value;
    setOnlineState(value);
  };
  /** Each element as the others last saw it. */
  const synced = useRef(new Map<string, BoardElement>());
  const started = useRef(false);
  const meRef = useRef<LiveActor | null>(null);
  const out = useRef<{ upserts: Map<string, BoardElement>; deletes: Set<string>; cursor: Point | null | undefined }>({ upserts: new Map(), deletes: new Set(), cursor: undefined });
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorAt = useRef(0);
  const sendRef = useRef<() => Promise<void>>(async () => {});
  const applyRef = useRef(applyRemote);
  useEffect(() => {
    applyRef.current = applyRemote;
  });

  const send = useCallback(async () => {
    timer.current = null;
    if (inFlight.current) return;
    const batch = out.current;
    if (batch.upserts.size === 0 && batch.deletes.size === 0 && batch.cursor === undefined) return;
    out.current = { upserts: new Map(), deletes: new Set(), cursor: undefined };
    inFlight.current = true;
    const body = {
      ...(batch.upserts.size ? { upserts: [...batch.upserts.values()] } : {}),
      ...(batch.deletes.size ? { deletes: [...batch.deletes] } : {}),
      ...(batch.cursor !== undefined ? { cursor: batch.cursor && { x: Math.round(batch.cursor[0]), y: Math.round(batch.cursor[1]) } } : {}),
    };
    try {
      const response = await fetch(`/api/sessions/${sessionId}/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setOnline(response.ok);
      if (response.ok) {
        // what the server refused (a student touching what is not theirs) is put back as it is there
        const result = (await response.json().catch(() => null)) as { revert?: { upserts?: unknown[]; deletes?: unknown[] } } | null;
        const upserts = sanitizeElements(result?.revert?.upserts ?? []);
        const deletes = (result?.revert?.deletes ?? []).filter((id): id is string => typeof id === "string");
        if (upserts.length || deletes.length) {
          for (const e of upserts) synced.current.set(e.id, e);
          for (const id of deletes) synced.current.delete(id);
          applyRef.current((current) => applyOps(current, upserts, deletes));
        }
      } else if (response.status >= 500 || response.status === 0) {
        // the server could not take it: try the same changes again with the next batch
        for (const [id, e] of batch.upserts) if (!out.current.upserts.has(id) && !out.current.deletes.has(id)) out.current.upserts.set(id, e);
        for (const id of batch.deletes) if (!out.current.upserts.has(id)) out.current.deletes.add(id);
      }
    } catch {
      setOnline(false);
      for (const [id, e] of batch.upserts) if (!out.current.upserts.has(id) && !out.current.deletes.has(id)) out.current.upserts.set(id, e);
      for (const id of batch.deletes) if (!out.current.upserts.has(id)) out.current.deletes.add(id);
    } finally {
      inFlight.current = false;
    }
    const left = out.current;
    if (left.upserts.size || left.deletes.size || left.cursor !== undefined) schedule(onlineRef.current ? 40 : 1500);
  }, [sessionId]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  function schedule(delay: number) {
    if (timer.current) return;
    timer.current = setTimeout(() => void sendRef.current(), delay);
  }

  // local changes: whatever differs from what the others last saw
  useEffect(() => {
    if (!channel || !started.current) return;
    const seen = new Set<string>();
    let changed = false;
    for (const e of elements) {
      seen.add(e.id);
      if (synced.current.get(e.id) === e) continue;
      synced.current.set(e.id, e);
      out.current.deletes.delete(e.id);
      out.current.upserts.set(e.id, e);
      changed = true;
    }
    for (const id of [...synced.current.keys()]) {
      if (seen.has(id)) continue;
      synced.current.delete(id);
      out.current.upserts.delete(id);
      out.current.deletes.add(id);
      changed = true;
    }
    if (changed) schedule(40);
  }, [channel, elements]);

  // what the others do
  useEffect(() => {
    if (!channel) return;
    return channel.subscribe((event) => {
      switch (event.type) {
        case "snapshot": {
          // (re)connected: the server's board, with this viewer's changes it has not got yet kept on top, to be sent
          const local = elementsRef.current;
          const pendingUpserts = started.current ? local.filter((e) => synced.current.get(e.id) !== e) : [];
          const pendingDeletes = started.current ? [...synced.current.keys()].filter((id) => !local.some((e) => e.id === id)) : [];
          synced.current = new Map(event.elements.map((e) => [e.id, e]));
          started.current = true;
          meRef.current = event.me;
          setMe(event.me);
          setDrawAllowed(event.drawAllowed);
          setOnline(true);
          out.current = { upserts: new Map(), deletes: new Set(), cursor: out.current.cursor };
          applyRef.current(() => applyOps(event.elements, pendingUpserts, pendingDeletes), true);
          break;
        }
        case "ops": {
          if (event.by === meRef.current?.id) break; // our own change, already on the board
          for (const e of event.upserts) synced.current.set(e.id, e);
          for (const id of event.deletes) synced.current.delete(id);
          applyRef.current((current) => applyOps(current, event.upserts, event.deletes));
          break;
        }
        case "mode":
          setDrawAllowed(event.drawAllowed);
          break;
        case "cursor": {
          if (event.actor.id === meRef.current?.id) break;
          const { actor, point } = event;
          setCursors((all) => {
            const others = all.filter((c) => c.id !== actor.id);
            return point ? [...others, { ...actor, x: point[0], y: point[1], at: Date.now() }] : others;
          });
          break;
        }
      }
    });
  }, [channel, elementsRef]);

  // a cursor that went quiet fades away
  useEffect(() => {
    if (!channel) return;
    const sweep = setInterval(() => {
      const now = Date.now();
      setCursors((all) => (all.some((c) => now - c.at > CURSOR_TTL_MS) ? all.filter((c) => now - c.at <= CURSOR_TTL_MS) : all));
    }, 3000);
    return () => clearInterval(sweep);
  }, [channel]);

  /** This viewer's pointer moved on the board (null: it left the board). */
  const moveCursor = useCallback(
    (point: Point | null) => {
      if (!channel || !started.current) return;
      out.current.cursor = point;
      const wait = Math.max(0, lastCursorAt.current + cursorEveryMs - Date.now());
      lastCursorAt.current = Date.now() + wait;
      schedule(point ? wait : 0);
    },
    [channel, cursorEveryMs],
  );

  /** Teacher: let the students draw, or not. */
  const setStudentsDraw = useCallback(
    async (allowed: boolean) => {
      setDrawAllowed(allowed);
      const response = await fetch(`/api/sessions/${sessionId}/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draw_allowed: allowed }) }).catch(() => null);
      if (!response?.ok) setDrawAllowed(!allowed);
      return Boolean(response?.ok);
    },
    [sessionId],
  );

  return { me, drawAllowed, cursors, online, moveCursor, setStudentsDraw };
}
