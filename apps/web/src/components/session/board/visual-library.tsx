"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { editMessageAction } from "@/app/actions/chats";
import { Spinner } from "@/components/ui/loaders";
import { useToast } from "@/components/ui/toast";
import { ElementView } from "./element-view";
import { boundsOfAll } from "./geometry";
import { setVisualSaved, visualElements, type Visual } from "./visual";

// Visualizations the teacher prepared before class: a mark in the AI reply that holds them (so it lives with the chat
// and is the same on every device), and the list on the board they are put on from, without waiting for the AI.

/** A reply of the AI as the library needs it. */
export interface VisualMessage {
  id: string;
  content: string;
}

/** A still drawing of a visual, exactly as it will look on the board, for recognising it in a list. */
export function VisualThumb({ visual, className = "" }: { visual: Visual; className?: string }) {
  const elements = useMemo(() => visualElements(visual), [visual]);
  const box = boundsOfAll(elements);
  if (!box) return null;
  const pad = 16;
  return (
    <svg
      aria-hidden="true"
      viewBox={`${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className={`pointer-events-none block rounded-md bg-bg ${className}`}
    >
      {elements.map((el) => (
        <ElementView key={el.id} el={el} still />
      ))}
    </svg>
  );
}

/** Saves a visual for class, or takes it off the list again. */
export function SaveVisualButton({ saved, saving, onToggle, compact = false }: { saved: boolean; saving: boolean; onToggle: () => void; compact?: boolean }) {
  const label = saved ? "Tersimpan untuk kelas" : "Simpan untuk kelas";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      aria-pressed={saved}
      aria-label={compact ? (saved ? "Hapus dari daftar siap tempel" : "Simpan untuk kelas") : undefined}
      title={saved ? "Sudah ada di daftar Siap tempel pada papan kelas. Klik untuk menghapusnya dari daftar." : "Simpan agar bisa langsung ditempel di papan saat kelas, tanpa menunggu AI."}
      className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border text-caption font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${compact ? "w-9" : "px-3"} ${
        saved ? "border-success/40 bg-success/10 text-success hover:bg-success/15" : "border-border bg-surface text-ink hover:border-primary hover:text-primary"
      }`}
    >
      {saving ? <Spinner size={14} /> : saved ? <BookmarkCheck size={14} strokeWidth={2} aria-hidden="true" /> : <Bookmark size={14} strokeWidth={2} aria-hidden="true" />}
      {!compact && label}
    </button>
  );
}

/** Writes the saved mark into the reply on the server; `onSaved` gets the reply as it is now stored. */
export function useSaveVisual(chatId: string | null | undefined, onSaved: (message: VisualMessage) => void) {
  const toast = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggle(message: VisualMessage, saved: boolean) {
    const next = setVisualSaved(message.content, !saved);
    if (!chatId || !next || savingId) return;
    setSavingId(message.id);
    const result = await editMessageAction(chatId, message.id, next);
    setSavingId(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onSaved({ id: result.saved.id, content: result.saved.content });
    toast.success(saved ? "Visualisasi dihapus dari daftar siap tempel." : "Tersimpan. Di kelas, buka panel Materi di papan lalu klik Tempel ke papan.");
  }

  return { savingId, toggle };
}
