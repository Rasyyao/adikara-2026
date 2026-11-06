"use client";

import { useEffect, useRef, useState } from "react";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "closed";

const EVENT_TYPES = [
  "snapshot",
  "participant_joined",
  "participant_left",
  "session_started",
  "session_locked",
  "session_unlocked",
  "session_ended",
  "kicked",
  "board_ops",
  "board_mode",
  "cursor",
  "quiz_opened",
  "quiz_closed",
  "quiz_progress",
  "problem_opened",
  "problem_closed",
  "problem_progress",
] as const;

export type StreamEventType = (typeof EVENT_TYPES)[number];
export type StreamHandler = (type: StreamEventType, data: Record<string, unknown>) => void;

/**
 * Follows a session's live events through our own /api/sessions/:id/events route (same origin, so the
 * httpOnly login cookie goes along). EventSource reconnects by itself after a network drop, and the
 * server always starts with a fresh `snapshot`, so a reconnect cannot leave the screen out of date.
 */
export function useSessionStream(sessionId: string, onEvent: StreamHandler, role?: "teacher" | "student"): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    let closedByLifecycle = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedByLifecycle) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      source?.close();
      const current = new EventSource(`/api/sessions/${sessionId}/events${role ? `?role=${role}` : ""}`);
      source = current;

      current.onopen = () => {
        if (closedByLifecycle) return;
        setStatus("live");
      };
      current.onerror = () => {
        if (closedByLifecycle) return;
        if (current.readyState === EventSource.CLOSED) {
          // A transient 502/network error closes EventSource permanently in browsers; reopen after a short pause.
          setStatus("reconnecting");
          current.close();
          if (!retryTimer) retryTimer = setTimeout(connect, 1500);
        } else {
          setStatus("reconnecting");
        }
      };

      for (const type of EVENT_TYPES) {
        current.addEventListener(type, (event) => {
          try {
            const data: unknown = JSON.parse((event as MessageEvent<string>).data);
            if (typeof data === "object" && data !== null) {
              if (type === "session_ended" || type === "kicked") {
                closedByLifecycle = true;
                setStatus("closed");
              }
              handlerRef.current(type, data as Record<string, unknown>);
            }
          } catch {
            // Ignore a malformed event instead of breaking the stream.
          }
        });
      }
    };

    connect();

    const onWake = () => {
      if (!closedByLifecycle && document.visibilityState === "visible" && (!source || source.readyState === EventSource.CLOSED)) {
        connect();
      }
    };
    window.addEventListener("online", connect);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      closedByLifecycle = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("online", connect);
      document.removeEventListener("visibilitychange", onWake);
      source?.close();
    };
  }, [role, sessionId]);

  return status;
}
