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
] as const;

export type StreamEventType = (typeof EVENT_TYPES)[number];
export type StreamHandler = (type: StreamEventType, data: Record<string, unknown>) => void;

/**
 * Follows a session's live events through our own /api/sessions/:id/events route (same origin, so the
 * httpOnly login cookie goes along). EventSource reconnects by itself after a network drop, and the
 * server always starts with a fresh `snapshot`, so a reconnect cannot leave the screen out of date.
 */
export function useSessionStream(sessionId: string, onEvent: StreamHandler): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    const source = new EventSource(`/api/sessions/${sessionId}/events`);

    source.onopen = () => setStatus("live");
    source.onerror = () => {
      // CLOSED: the server refused (not joined, kicked, ended) or the stream ended on purpose. Otherwise it is retrying.
      setStatus(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
    };

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        try {
          const data: unknown = JSON.parse((event as MessageEvent<string>).data);
          if (typeof data === "object" && data !== null) handlerRef.current(type, data as Record<string, unknown>);
        } catch {
          // Ignore a malformed event instead of breaking the stream.
        }
      });
    }

    return () => source.close();
  }, [sessionId]);

  return status;
}
