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
  | { type: "quiz"; quizId: string; change: "opened" | "closed" | "progress" }
  /** A problem was sent or closed, or a student checked an answer (teacher only): open results panels refresh. */
  | { type: "problem"; problemId: string; change: "opened" | "closed" | "progress" }
  /** A student joined or left the session (teacher only): who has "not started" a quiz changes. */
  | { type: "presence" };

/** Hands the board's events from the page's event stream to the whiteboard. */
export interface LiveChannel {
  emit(event: LiveEvent): void;
  subscribe(listener: (event: LiveEvent) => void): () => void;
}

export function createLiveChannel(): LiveChannel {
  const listeners = new Set<(event: LiveEvent) => void>();
  let latestSnapshot: Extract<LiveEvent, { type: "snapshot" }> | null = null;
  return {
    emit: (event) => {
      if (event.type === "snapshot") {
        latestSnapshot = event;
      } else if (event.type === "ops" && latestSnapshot) {
        latestSnapshot = { ...latestSnapshot, elements: applyOps(latestSnapshot.elements, event.upserts, event.deletes) };
      } else if (event.type === "mode" && latestSnapshot) {
        latestSnapshot = { ...latestSnapshot, drawAllowed: event.drawAllowed };
      }
      listeners.forEach((listener) => listener(event));
    },
    subscribe(listener) {
      listeners.add(listener);
      if (latestSnapshot) listener(latestSnapshot);
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
  if (type === "problem_opened" || type === "problem_closed" || type === "problem_progress") {
    const problemId = type === "problem_progress" ? data.problem_id : isObject(data.problem) ? data.problem.id : null;
    return typeof problemId === "string" ? { type: "problem", problemId, change: type === "problem_opened" ? "opened" : type === "problem_closed" ? "closed" : "progress" } : null;
  }
  if (type === "participant_joined" || type === "participant_left") return { type: "presence" };
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
  role,
  elements,
  elementsRef,
  applyRemote,
  cursorEveryMs,
}: {
  sessionId: string;
  channel: LiveChannel | null;
  role?: "teacher" | "student";
  elements: BoardElement[];
  elementsRef: RefObject<BoardElement[]>;
  /** `replace`: the whole board was swapped (a reconnect), so the undo history no longer applies. */
  applyRemote: (change: (elements: BoardElement[]) => BoardElement[], replace?: boolean, upserts?: BoardElement[]) => void;
  /** How often this viewer's cursor is sent at most. */
  cursorEveryMs: number;
}) {
  const [me, setMe] = useState<LiveActor | null>(null);
  const [drawAllowed, setDrawAllowed] = useState(true);
  const [cursors, setCursors] = useState<LiveCursor[]>([]);
  const [online, setOnlineState] = useState(true);
  const onlineRef = useRef(true);
  const setOnline = useCallback((value: boolean) => {
    if (onlineRef.current === value) return;
    onlineRef.current = value;
    setOnlineState(value);
  }, []);
  /** Each element as the others last saw it. */
  const synced = useRef(new Map<string, BoardElement>(elements.map((e) => [e.id, e])));
  const meRef = useRef<LiveActor | null>(null);
  const out = useRef<{ upserts: Map<string, BoardElement>; deletes: Set<string>; cursor: Point | null | undefined }>({ upserts: new Map(), deletes: new Set(), cursor: undefined });
  const inFlightBatch = useRef<{ upserts: Map<string, BoardElement>; deletes: Set<string> }>({ upserts: new Map(), deletes: new Set() });
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerAt = useRef(0);
  const lastCursorAt = useRef(0);
  const sendRef = useRef<() => Promise<void>>(async () => {});
  const applyRef = useRef(applyRemote);
  useEffect(() => {
    applyRef.current = applyRemote;
  });

  const liveUrl = `/api/sessions/${sessionId}/live${role ? `?role=${role}` : ""}`;

  const send = useCallback(async () => {
    timer.current = null;
    timerAt.current = 0;
    if (inFlight.current) return;
    const batch = out.current;
    if (batch.upserts.size === 0 && batch.deletes.size === 0 && batch.cursor === undefined) return;
    out.current = { upserts: new Map(), deletes: new Set(), cursor: undefined };
    inFlightBatch.current = { upserts: batch.upserts, deletes: batch.deletes };
    inFlight.current = true;
    const body = {
      ...(batch.upserts.size ? { upserts: [...batch.upserts.values()] } : {}),
      ...(batch.deletes.size ? { deletes: [...batch.deletes] } : {}),
      ...(batch.cursor !== undefined ? { cursor: batch.cursor && { x: Math.round(batch.cursor[0]), y: Math.round(batch.cursor[1]) } } : {}),
    };
    try {
      const response = await fetch(liveUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setOnline(response.ok);
      if (response.ok) {
        // what the server refused (a student touching what is not theirs) is put back as it is there
        const result = (await response.json().catch(() => null)) as { revert?: { upserts?: unknown[]; deletes?: unknown[] } } | null;
        const upserts = sanitizeElements(result?.revert?.upserts ?? []);
        const deletes = (result?.revert?.deletes ?? []).filter((id): id is string => typeof id === "string");
        if (upserts.length || deletes.length) {
          for (const e of upserts) {
            synced.current.set(e.id, e);
            out.current.upserts.delete(e.id);
          }
          for (const id of deletes) {
            synced.current.delete(id);
            out.current.upserts.delete(id);
          }
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
      inFlightBatch.current = { upserts: new Map(), deletes: new Set() };
      inFlight.current = false;
    }
    const left = out.current;
    if (left.upserts.size || left.deletes.size || left.cursor !== undefined) schedule(onlineRef.current ? 40 : 1500);
  }, [liveUrl, setOnline]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  function schedule(delay: number) {
    const due = Date.now() + delay;
    if (timer.current) {
      if (due >= timerAt.current - 5) return;
      clearTimeout(timer.current);
    }
    timerAt.current = due;
    timer.current = setTimeout(() => void sendRef.current(), delay);
  }

  // local changes: whatever differs from what the others last saw
  useEffect(() => {
    if (!channel) return;
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
          const pendingUpserts = [...inFlightBatch.current.upserts.values(), ...out.current.upserts.values()];
          const pendingDeletes = [...inFlightBatch.current.deletes, ...out.current.deletes];
          const merged = applyOps(event.elements, pendingUpserts, pendingDeletes);
          synced.current = new Map(merged.map((e) => [e.id, e]));
          meRef.current = event.me;
          setMe(event.me);
          setDrawAllowed(event.drawAllowed);
          setOnline(true);
          applyRef.current(() => merged, true, event.elements);
          if (out.current.upserts.size || out.current.deletes.size || out.current.cursor !== undefined) {
            schedule(40);
          }
          break;
        }
        case "ops": {
          const localById = new Map(elementsRef.current.map((e) => [e.id, e]));
          const isSelf = Boolean(meRef.current?.id && event.by === meRef.current.id);
          const upserts = event.upserts.filter((u) => {
            if (out.current.upserts.has(u.id) || out.current.deletes.has(u.id)) return false;
            if (isSelf && (inFlightBatch.current.upserts.has(u.id) || inFlightBatch.current.deletes.has(u.id))) return false;
            const local = localById.get(u.id);
            if (!local) return true;
            return JSON.stringify(u) !== JSON.stringify(local);
          });
          const deletes = event.deletes.filter((id) => {
            if (out.current.upserts.has(id) || out.current.deletes.has(id)) return false;
            if (isSelf && (inFlightBatch.current.upserts.has(id) || inFlightBatch.current.deletes.has(id))) return false;
            return localById.has(id);
          });
          if (upserts.length === 0 && deletes.length === 0) break;
          for (const e of upserts) synced.current.set(e.id, e);
          for (const id of deletes) synced.current.delete(id);
          applyRef.current((current) => applyOps(current, upserts, deletes), false, upserts);
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
  }, [channel, elementsRef, setOnline]);

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
      if (!channel) return;
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
      const response = await fetch(liveUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draw_allowed: allowed }) }).catch(() => null);
      if (!response?.ok) setDrawAllowed(!allowed);
      return Boolean(response?.ok);
    },
    [liveUrl],
  );

  return { me, drawAllowed, cursors, online, moveCursor, setStudentsDraw };
}
