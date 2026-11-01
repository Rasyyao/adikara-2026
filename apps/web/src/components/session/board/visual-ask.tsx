"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The AI conversation a visualization sits in. A card asks its questions through it, and reads the answer back from the
 * same conversation, so the explanation shows in the card's popup as well as in the chat.
 */
export interface VisualAsk {
  /** Sends a question; resolves to the id of the sent message, or null when it was not sent. */
  ask: (text: string) => Promise<string | null>;
  /** The AI's reply to message `id`; `pending` while it is still being written. */
  answerTo: (id: string) => { pending: boolean; content: string | null };
  /** True while the AI is answering something, when a new question cannot be sent yet. */
  busy: boolean;
  /** How an answer is drawn; plain text when absent. */
  render?: (content: string) => ReactNode;
}

const VisualAskContext = createContext<VisualAsk | null>(null);

export const VisualAskProvider = VisualAskContext.Provider;
export const useVisualAsk = () => useContext(VisualAskContext);

/** The reply of the AI to the message `id` in `messages`: the first assistant message after it. */
export function answerIn(messages: { id: string; role: string; content: string }[], id: string, thinking: boolean) {
  const at = messages.findIndex((m) => m.id === id);
  const reply = at < 0 ? undefined : messages.slice(at + 1).find((m) => m.role === "ASSISTANT");
  return { pending: !reply && (thinking || at < 0), content: reply?.content ?? null };
}
