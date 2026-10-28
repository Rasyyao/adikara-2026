"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  FileUp,
  FolderOpen,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { editMessageAction, sendChatMessageAction, stopChatReplyAction } from "@/app/actions/chats";
import {
  AssessmentBoard,
  assessmentKindLabel,
  extractAssessmentsFromContent,
  replaceAssessmentsInContent,
  StatusBadge,
  type AssessmentPayload,
} from "@/components/materials/assessment-editor";
import {
  extractMindmapFromContent,
  MindmapBoard,
  replaceMindmapInContent,
  type MindmapPayload,
} from "@/components/materials/mindmap-canvas";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders";
import { useToast } from "@/components/ui/toast";
import type { MaterialView, MessageView } from "@/lib/api/types";
import {
  STARTER_PROMPTS,
  type ChatMessageItem,
  type ExtractionState,
  type FileKind,
  type MaterialRow,
  type MaterialSource,
} from "@/lib/dummy/teacher";
import { isUuid } from "@/lib/validation/auth";

const ALLOWED_EXTENSIONS: Record<string, FileKind> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatTimeFromIso(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toFileKind(raw: string): FileKind {
  const upper = raw.toUpperCase();
  if (upper === "DOCX" || upper === "PPTX") return upper;
  return "PDF";
}

function mapApiMaterial(item: MaterialView, fallbackSize = "Berkas"): MaterialSource {
  return {
    id: item.id,
    title: item.title,
    fileType: toFileKind(item.file_type),
    sizeLabel: fallbackSize,
    status: item.status,
    error: item.error ?? undefined,
  };
}

function mapApiMessage(item: MessageView, attachment?: MaterialSource): ChatMessageItem {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    createdAt: formatTimeFromIso(item.created_at),
    attachment,
    sources: item.sources ?? undefined,
  };
}

const LATEX_SYMBOLS: Array<[RegExp, string]> = [
  [/\\(?:ge|geq)\b/g, "≥"],
  [/\\(?:le|leq)\b/g, "≤"],
  [/\\(?:ne|neq)\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\equiv\b/g, "≡"],
  [/\\times\b/g, "×"],
  [/\\cdot\b/g, "·"],
  [/\\div\b/g, "÷"],
  [/\\pm\b/g, "±"],
  [/\\(?:to|rightarrow)\b/g, "→"],
  [/\\leftarrow\b/g, "←"],
  [/\\Rightarrow\b/g, "⇒"],
  [/\\Leftarrow\b/g, "⇐"],
  [/\\leftrightarrow\b/g, "↔"],
  [/\\infty\b/g, "∞"],
  [/\\(?:dots|ldots|cdots)\b/g, "…"],
  [/\\in\b/g, "∈"],
  [/\\notin\b/g, "∉"],
  [/\\subseteq\b/g, "⊆"],
  [/\\subset\b/g, "⊂"],
  [/\\cup\b/g, "∪"],
  [/\\cap\b/g, "∩"],
  [/\\forall\b/g, "∀"],
  [/\\exists\b/g, "∃"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\delta\b/g, "δ"],
  [/\\pi\b/g, "π"],
  [/\\theta\b/g, "θ"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"],
  [/\\sigma\b/g, "σ"],
  [/\\omega\b/g, "ω"],
];

/** Converts LaTeX math snippets like `\text{pear} \mathrel{+}= 6;` or `i \ge 1` into clean readable text. */
function formatLatexMath(raw: string): string {
  let out = raw.trim();
  // Unwrap nested \text{...}, \mathrel{...}, \mathrm{...}, etc.
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/\\(?:text|textrm|textbf|textit|texttt|mathrm|mathbf|mathit|mathtt|mathsf|mathrel|mathbin|mathop|mathord)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
    if (next === out) break;
    out = next;
  }
  for (const [pattern, replacement] of LATEX_SYMBOLS) {
    out = out.replace(pattern, replacement);
  }
  out = out
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:quad|qquad|,|;|:|!)/g, " ")
    .replace(/\\([{}%&_#$])/g, "$1")
    .replace(/\\[a-zA-Z]+\b/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+([+=<>!*/%&|^~-]=)/g, " $1")
    .replace(/([+=<>!*/%&|^~-])\s+=/g, "$1=")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

/** Renders any LaTeX math expression (inline or display block) using KaTeX with a readable fallback. */
function LatexMath({ raw, displayMode }: { raw: string; displayMode: boolean }) {
  const html = useMemo(() => {
    const normalized = raw
      .trim()
      .replace(/\\mathrel\s*\{([^{}]*)\}\s*=/g, "\\mathrel{$1=}");
    try {
      return katex.renderToString(normalized, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [raw, displayMode]);

  if (!html) {
    return (
      <code className="rounded-sm bg-bg px-1.5 py-0.5 font-mono text-caption text-ink">
        {formatLatexMath(raw)}
      </code>
    );
  }

  if (displayMode) {
    return (
      <div
        className="my-2 overflow-x-auto rounded-md border border-border bg-bg/60 px-4 py-2.5 text-ink"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className="mx-0.5 inline-block align-middle text-ink"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CODE_KEYWORDS = new Set([
  "abstract", "as", "async", "await", "base", "bool", "boolean", "break", "byte", "case", "catch",
  "char", "checked", "class", "const", "continue", "decimal", "def", "default", "delegate", "delete",
  "do", "double", "elif", "else", "enum", "event", "except", "explicit", "export", "extends", "extern",
  "false", "finally", "fixed", "float", "for", "foreach", "from", "fun", "function", "goto", "if",
  "implements", "import", "in", "int", "interface", "internal", "is", "lambda", "let", "lock", "long",
  "namespace", "new", "nil", "none", "None", "not", "null", "object", "operator", "or", "out", "override",
  "package", "params", "pass", "private", "protected", "public", "raise", "readonly", "ref", "return",
  "sbyte", "sealed", "select", "short", "sizeof", "stackalloc", "static", "string", "struct", "super",
  "switch", "this", "throw", "throws", "true", "True", "False", "try", "type", "typeof", "uint", "ulong",
  "unchecked", "unsafe", "ushort", "using", "val", "var", "virtual", "void", "volatile", "where", "while",
  "with", "yield", "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "JOIN", "LEFT", "RIGHT", "INNER", "ORDER", "BY", "GROUP", "LIMIT",
]);

function highlightCodeLine(line: string, lineIdx: number): ReactNode {
  const tokenPattern =
    /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\s*\()|\b[A-Za-z_]\w*\b)/g;
  const parts = line.split(tokenPattern);

  return (
    <span key={lineIdx} className="block min-h-[1.35rem]">
      {parts.map((token, idx) => {
        if (!token) return null;
        if (token.startsWith("//") || token.startsWith("#")) {
          return (
            <span key={idx} className="italic text-muted">
              {token}
            </span>
          );
        }
        if (
          (token.startsWith('"') && token.endsWith('"')) ||
          (token.startsWith("'") && token.endsWith("'")) ||
          (token.startsWith("`") && token.endsWith("`"))
        ) {
          return (
            <span key={idx} className="text-success">
              {token}
            </span>
          );
        }
        if (/^\d+(?:\.\d+)?$/.test(token)) {
          return (
            <span key={idx} className="font-medium text-warning">
              {token}
            </span>
          );
        }
        if (CODE_KEYWORDS.has(token)) {
          return (
            <span key={idx} className="font-semibold text-primary">
              {token}
            </span>
          );
        }
        const restAfter = parts.slice(idx + 1).join("");
        if (/^[A-Za-z_]\w*$/.test(token) && /^\s*\(/.test(restAfter)) {
          return (
            <span key={idx} className="font-medium text-[#4338CA]">
              {token}
            </span>
          );
        }
        return <span key={idx}>{token}</span>;
      })}
    </span>
  );
}

function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const lines = code.split("\n");

  return (
    <div className="my-1 overflow-hidden rounded-md border border-border bg-bg/70">
      <div className="flex items-center justify-between border-b border-border bg-bg px-3.5 py-1.5">
        <span className="font-mono text-caption font-semibold uppercase tracking-wide text-muted">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          title="Salin kode"
          aria-label="Salin kode"
          className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          {copied ? (
            <Check size={13} strokeWidth={1.75} className="text-success" aria-hidden="true" />
          ) : (
            <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
          <span>{copied ? "Tersalin" : "Salin"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-small leading-relaxed text-ink">
        <code>{lines.map((line, idx) => highlightCodeLine(line, idx))}</code>
      </pre>
    </div>
  );
}

/** Strips any stray unmatched markdown asterisks from plain text segments. */
/** Builds context-aware status phrases from the teacher's latest message/attachment. */
function getThinkingSteps(lastUser?: ChatMessageItem): string[] {
  const text = (lastUser?.content ?? "").toLowerCase();
  const hasFile = Boolean(lastUser?.attachment);

  if (/mind\s?map|peta konsep|peta pikiran/.test(text)) {
    return [
      "Thinking…",
      "Membaca struktur materi…",
      "Menyusun cabang & hierarki mindmap…",
      "Menata node dan warna konsep…",
      "Menyelesaikan mindmap…",
    ];
  }
  if (/pre[\s-]?test|pos[t]?[\s-]?test/.test(text)) {
    return [
      "Thinking…",
      "Membaca seluruh materi…",
      "Menyusun 10 soal pilihan ganda…",
      "Memeriksa kunci jawaban dan pengecoh…",
    ];
  }
  if (hasFile) {
    return [
      "Thinking…",
      "Membaca & mengekstrak berkas materi…",
      "Memahami isi dokumen…",
      "Menyiapkan jawaban dari materi…",
    ];
  }
  if (/rangkum|ringkas|summary|simpulkan/.test(text)) {
    return ["Thinking…", "Membaca materi sumber…", "Merangkum poin-poin utama…", "Merapikan hasil rangkuman…"];
  }
  if (/soal|kuis|quiz|latihan|ujian/.test(text)) {
    return ["Thinking…", "Menganalisis topik materi…", "Menyusun soal & pembahasan…", "Memeriksa kunci jawaban…"];
  }
  if (/jelaskan|apa itu|bagaimana|mengapa|kenapa|explain/.test(text)) {
    return ["Thinking…", "Mencari bagian materi yang relevan…", "Menyusun penjelasan bertahap…", "Menyiapkan contoh…"];
  }
  if (/kode|code|program|script|rumus|hitung|persamaan/.test(text)) {
    return ["Thinking…", "Menganalisis kode & rumus…", "Menyusun contoh dan penjelasan…", "Merapikan format jawaban…"];
  }
  return ["Thinking…", "Mencari konteks dari materi…", "Menyusun jawaban…", "Merapikan format jawaban…"];
}

function ContextualThinking({ steps }: { steps: string[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const signature = steps.join("|");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [steps.length, signature]);

  return (
    <div role="status" aria-live="polite" className="chat-item-in inline-flex items-center gap-2 py-1">
      <Sparkles size={16} strokeWidth={1.75} className="shrink-0 animate-pulse text-primary" aria-hidden="true" />
      <span key={stepIndex} className="thinking-text text-small font-medium">
        {steps[Math.min(stepIndex, steps.length - 1)]}
      </span>
    </div>
  );
}

function stripStrayAsterisks(value: string): string {
  return value.replace(/\*\*+/g, "").replace(/(^|[\s(])\*+(?=\S)|(?<=\S)\*+(?=[\s).,;:!?]|$)/g, "$1");
}

function FormattedInline({ text }: { text: string }) {
  const tokenRegex =
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\begin\{[a-z*]+\}[\s\S]+?\\end\{[a-z*]+\}|\*\*[\s\S]+?\*\*|`[^`]+`|\$(?!\s)[^$\n]+?(?<!\s)\$|\\\([\s\S]+?\\\)|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;

        if ((part.startsWith("$$") && part.endsWith("$$")) || (part.startsWith("\\[") && part.endsWith("\\]"))) {
          return <LatexMath key={index} raw={part.slice(2, -2)} displayMode={false} />;
        }

        if (part.startsWith("\\begin{") && part.includes("\\end{")) {
          return <LatexMath key={index} raw={part} displayMode />;
        }

        if ((part.startsWith("$") && part.endsWith("$") && part.length > 2) || (part.startsWith("\\(") && part.endsWith("\\)"))) {
          const inner = part.startsWith("\\(") ? part.slice(2, -2) : part.slice(1, -1);
          return <LatexMath key={index} raw={inner} displayMode={false} />;
        }

        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={index} className="font-semibold text-ink">
              <FormattedInline text={inner} />
            </strong>
          );
        }

        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={index}
              className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-caption text-primary"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
        if (linkMatch) {
          return (
            <a
              key={index}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline hover:text-primary-hover"
            >
              {stripStrayAsterisks(linkMatch[1])}
            </a>
          );
        }

        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          const inner = part.slice(1, -1);
          return (
            <em key={index} className="italic text-ink">
              <FormattedInline text={inner} />
            </em>
          );
        }

        return <span key={index}>{stripStrayAsterisks(part)}</span>;
      })}
    </>
  );
}

type ListEntry = {
  ordered: boolean;
  indent: number;
  lines: string[];
};

function isDisplayMathLine(trimmed: string): boolean {
  return (
    (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) ||
    (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4) ||
    (trimmed.startsWith("\\begin{") && /\\end\{[^}]+\}\s*$/.test(trimmed))
  );
}

function displayMathBody(trimmed: string): string {
  if (trimmed.startsWith("\\begin{")) return trimmed;
  return trimmed.slice(2, -2);
}

/** Collapses multi-line $$…$$, \[…\] and \begin{env}…\end{env} blocks onto single lines. */
function normalizeDisplayMath(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (match, inner: string) =>
      inner.includes("\n") ? `\n$$${inner.replace(/\s*\n\s*/g, " ").trim()}$$\n` : match,
    )
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => `\n\\[${inner.replace(/\s*\n\s*/g, " ").trim()}\\]\n`)
    .replace(
      /^[ \t]*(\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\2\})[ \t]*$/gm,
      (_m, block: string) => `\n${block.replace(/\s*\n\s*/g, " ").trim()}\n`,
    );
}

function renderListItemLines(lines: string[], keyPrefix: string) {
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (isDisplayMathLine(trimmed)) {
      return (
        <div key={`${keyPrefix}-math-${idx}`} className="my-1.5 overflow-x-auto">
          <LatexMath raw={displayMathBody(trimmed)} displayMode />
        </div>
      );
    }
    return (
      <div key={`${keyPrefix}-line-${idx}`} className={idx > 0 ? "mt-1" : undefined}>
        <FormattedInline text={trimmed} />
      </div>
    );
  });
}

/** Renders structured markdown-like blocks (headings, code blocks, LaTeX math, lists, dividers, paragraphs) safely. */
function FormattedContent({
  content,
  onOpenMindmap,
  onOpenAssessment,
}: {
  content: string;
  onOpenMindmap?: (mindmap: MindmapPayload) => void;
  onOpenAssessment?: () => void;
}) {
  const extractedAssessment = extractAssessmentsFromContent(content);
  if (extractedAssessment) {
    return (
      <div className="flex flex-col gap-3 text-body text-ink">
        {extractedAssessment.introText && <FormattedContent content={extractedAssessment.introText} />}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
              <ClipboardList size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-ink">{extractedAssessment.assessments[0].title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {extractedAssessment.assessments.map((a) => (
                  <span key={a.kind} className="inline-flex items-center gap-1.5 text-caption text-muted">
                    {assessmentKindLabel(a.kind)} · {a.questions.length} soal
                    <StatusBadge status={a.status} />
                  </span>
                ))}
              </div>
            </div>
          </div>
          {onOpenAssessment && (
            <button
              type="button"
              onClick={onOpenAssessment}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <ClipboardList size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{extractedAssessment.assessments.every((a) => a.status === "approved") ? "Lihat Soal" : "Periksa & Setujui"}</span>
            </button>
          )}
        </div>
        {extractedAssessment.outroText && <FormattedContent content={extractedAssessment.outroText} />}
      </div>
    );
  }
  const extractedMindmap = extractMindmapFromContent(content);
  if (extractedMindmap) {
    return (
      <div className="flex flex-col gap-3 text-body text-ink">
        {extractedMindmap.introText && <FormattedContent content={extractedMindmap.introText} />}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
              <Network size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-ink">{extractedMindmap.mindmap.title}</p>
              <p className="text-caption text-muted">
                {extractedMindmap.mindmap.nodes.length} konsep interaktif · Ditampilkan di panel Mindmap sebelah kanan
              </p>
            </div>
          </div>
          {onOpenMindmap && (
            <button
              type="button"
              onClick={() => onOpenMindmap(extractedMindmap.mindmap)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <Network size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Buka Mindmap</span>
            </button>
          )}
        </div>
        {extractedMindmap.outroText && <FormattedContent content={extractedMindmap.outroText} />}
      </div>
    );
  }

  // Normalize multi-line $$ ... $$ blocks onto single $$ ... $$ lines outside fenced code blocks
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="flex flex-col gap-3 text-body text-ink">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith("```") && segment.endsWith("```")) {
          const lines = segment.slice(3, -3).trim().split("\n");
          const firstLine = lines[0]?.trim() ?? "";
          const hasLang = /^[a-zA-Z0-9_+#-]+$/.test(firstLine);
          const code = hasLang ? lines.slice(1).join("\n") : lines.join("\n");
          return <CodeBlockCard key={segIdx} lang={hasLang ? firstLine : "code"} code={code} />;
        }

        const normalized = normalizeDisplayMath(segment);

        const rawLines = normalized.split("\n");
        const nodes: ReactNode[] = [];
        let paragraphBuffer: string[] = [];
        let listBuffer: ListEntry[] = [];

        const flushParagraph = (key: string) => {
          if (paragraphBuffer.length === 0) return;
          const text = paragraphBuffer.join("\n").trim();
          paragraphBuffer = [];
          if (!text) return;
          nodes.push(
            <p key={key} className="whitespace-pre-line leading-relaxed text-ink">
              <FormattedInline text={text} />
            </p>,
          );
        };

        const flushList = (key: string) => {
          if (listBuffer.length === 0) return;
          const items = listBuffer;
          listBuffer = [];
          const ordered = items[0]?.ordered ?? false;
          const ListTag = ordered ? "ol" : "ul";
          nodes.push(
            <ListTag
              key={key}
              className={`flex flex-col gap-2 pl-5 text-body text-ink ${ordered ? "list-decimal" : "list-disc"}`}
            >
              {items.map((item, itemIdx) => (
                <li
                  key={`${key}-item-${itemIdx}`}
                  className={`leading-relaxed ${item.indent >= 2 ? "ml-5 list-[circle]" : ""}`}
                >
                  {renderListItemLines(item.lines, `${key}-${itemIdx}`)}
                </li>
              ))}
            </ListTag>,
          );
        };

        rawLines.forEach((rawLine, lineIdx) => {
          const trimmed = rawLine.trim();

          if (!trimmed) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            flushList(`${segIdx}-list-${lineIdx}`);
            return;
          }

          if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            flushList(`${segIdx}-list-${lineIdx}`);
            nodes.push(<hr key={`${segIdx}-hr-${lineIdx}`} className="border-border" />);
            return;
          }

          const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
          if (headingMatch) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            flushList(`${segIdx}-list-${lineIdx}`);
            const cleanHeading = headingMatch[2].trim().replace(/^\*\*([\s\S]+)\*\*$/, "$1");
            nodes.push(
              <h3 key={`${segIdx}-h-${lineIdx}`} className="pt-1 text-h3 font-semibold text-ink">
                <FormattedInline text={cleanHeading} />
              </h3>,
            );
            return;
          }

          const listMatch = /^(\s*)([-*•]|\d+\.)\s+(.+)$/.exec(rawLine);
          if (listMatch) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            const indent = listMatch[1].length;
            const ordered = /^\d+\.$/.test(listMatch[2]);
            listBuffer.push({
              ordered,
              indent,
              lines: [listMatch[3].trim()],
            });
            return;
          }

          if (isDisplayMathLine(trimmed)) {
            if (listBuffer.length > 0) {
              listBuffer[listBuffer.length - 1].lines.push(trimmed);
              return;
            }
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            nodes.push(
              <div key={`${segIdx}-math-${lineIdx}`} className="overflow-x-auto">
                <LatexMath raw={displayMathBody(trimmed)} displayMode />
              </div>,
            );
            return;
          }

          if (listBuffer.length > 0 && /^\s{2,}\S/.test(rawLine)) {
            listBuffer[listBuffer.length - 1].lines.push(trimmed);
            return;
          }

          flushList(`${segIdx}-list-${lineIdx}`);
          paragraphBuffer.push(trimmed);
        });

        flushParagraph(`${segIdx}-p-end`);
        flushList(`${segIdx}-list-end`);

        return nodes;
      })}
    </div>
  );
}

const EXTRACTION_BADGES: Record<ExtractionState, { label: string; Icon: typeof CheckCircle2; tone: string }> = {
  EXTRACTED: { label: "Siap digunakan", Icon: CheckCircle2, tone: "text-success" },
  UPLOADED: { label: "Mengekstrak isi…", Icon: Clock, tone: "text-warning" },
  FAILED: { label: "Gagal dibaca", Icon: AlertCircle, tone: "text-danger" },
};

function SourceStatusBadge({ status }: { status: ExtractionState }) {
  const { label, Icon, tone } = EXTRACTION_BADGES[status];
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1 text-caption font-semibold ${tone}`}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={status === "EXTRACTED" ? "upload-check-pop" : undefined}
        aria-hidden="true"
      />
      {status !== "EXTRACTED" && <span>{label}</span>}
    </span>
  );
}

type SourceTextResult = { id: string; text: string | null; error: string | null };

/** Full-screen viewer for one source: the original file (PDF, in the browser's viewer) and the text the AI read from it. */
function SourceViewer({ chatId, source, onClose }: { chatId: string; source: MaterialSource; onClose: () => void }) {
  const isPdf = source.fileType === "PDF";
  const [view, setView] = useState<"file" | "text">(isPdf ? "file" : "text");
  const [result, setResult] = useState<SourceTextResult | null>(null);
  const fileUrl = `/api/chats/${chatId}/materials/${source.id}/file`;
  const loadingText = view === "text" && result?.id !== source.id;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (view !== "text") return;
    const controller = new AbortController();
    fetch(`/api/chats/${chatId}/materials/${source.id}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          extracted_text?: string | null;
          error?: { message?: string };
        } | null;
        if (!res.ok) throw new Error(body?.error?.message ?? "Gagal memuat isi berkas");
        setResult({ id: source.id, text: body?.extracted_text ?? null, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ id: source.id, text: null, error: err instanceof Error ? err.message : "Gagal memuat isi berkas" });
      });
    return () => controller.abort();
  }, [chatId, source.id, view]);

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-caption font-semibold transition-colors ${
      active ? "bg-primary-tint text-primary" : "text-muted hover:bg-bg hover:text-ink"
    }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Lihat berkas ${source.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="chat-item-in flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary">
              <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-small font-semibold text-ink" title={source.title}>
                {source.title}
              </p>
              <p className="text-caption text-muted">
                {source.fileType} · {source.sizeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isPdf && (
              <>
                <button type="button" onClick={() => setView("file")} className={tabClass(view === "file")}>
                  Berkas
                </button>
                <button type="button" onClick={() => setView("text")} className={tabClass(view === "text")}>
                  Teks terbaca
                </button>
              </>
            )}
            <a
              href={`${fileUrl}?download=1`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border px-3 text-caption font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
            >
              <Download size={14} strokeWidth={1.75} aria-hidden="true" />
              Unduh
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-ink"
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-bg">
          {view === "file" ? (
            <iframe src={fileUrl} title={source.title} className="size-full border-0 bg-surface" />
          ) : loadingText ? (
            <div className="flex h-full items-center justify-center gap-2 text-small text-muted">
              <Spinner size={16} /> Memuat isi berkas…
            </div>
          ) : result?.error ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-small text-danger">{result.error}</div>
          ) : result?.text ? (
            <div className="h-full overflow-y-auto p-6">
              {!isPdf && (
                <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-caption text-muted">
                  Pratinjau {source.fileType} belum didukung di browser. Berikut teks yang dibaca AI dari berkas ini; gunakan
                  tombol Unduh untuk membuka berkas aslinya.
                </p>
              )}
              <pre className="mx-auto max-w-3xl whitespace-pre-wrap font-sans text-small leading-relaxed text-ink">{result.text}</pre>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-small text-muted">
              {source.status === "UPLOADED"
                ? "Berkas masih diekstrak. Teks akan tersedia sebentar lagi."
                : "Belum ada teks yang berhasil dibaca dari berkas ini."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The right panel (mindmap, questions) starts at half the screen; dragging its edge left widens it, the chat gets the rest. */
const MINDMAP_DEFAULT_PCT = 50;
const MINDMAP_MAX_PCT = 70;
const MINDMAP_MIN_PCT = 25;

type RightSidebarTabId = "sources" | "mindmap" | "assessment";

const SIDEBAR_TABS: Array<{
  id: RightSidebarTabId;
  label: string;
  Icon: typeof FolderOpen;
}> = [
  { id: "sources", label: "Sumber", Icon: FolderOpen },
  { id: "mindmap", label: "Mindmap", Icon: Network },
  { id: "assessment", label: "Soal", Icon: ClipboardList },
];

export function MaterialChatbot({
  initialMaterial,
  initialReplyPending = false,
}: {
  initialMaterial?: MaterialRow;
  initialReplyPending?: boolean;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextIdRef = useRef(1);
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const promptInputId = useId();
  const titleInputId = useId();

  const [chatId, setChatId] = useState<string | null>(
    initialMaterial?.id && isUuid(initialMaterial.id) ? initialMaterial.id : null,
  );
  const [title, setTitle] = useState(initialMaterial?.title ?? "Materi kelas baru");
  const [sources, setSources] = useState<MaterialSource[]>(initialMaterial?.sources ?? []);
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMaterial?.messages ?? []);
  const [stagedFile, setStagedFile] = useState<MaterialSource | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(100);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(initialReplyPending);
  const [isSending, setIsSending] = useState(false);
  const stopRequestedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const initialHasMindmap = useMemo(
    () => (initialMaterial?.messages ?? []).some((m) => m.role === "ASSISTANT" && extractMindmapFromContent(m.content) !== null),
    [initialMaterial?.messages],
  );

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<RightSidebarTabId>(
    initialHasMindmap ? "mindmap" : "sources",
  );
  const [customMindmap, setCustomMindmap] = useState<MindmapPayload | null>(null);
  // the message the mindmap on the board came from, so an edit is saved back into it
  const [customMindmapMsgId, setCustomMindmapMsgId] = useState<string | null>(null);
  const [mindmapWidthPct, setMindmapWidthPct] = useState(MINDMAP_DEFAULT_PCT);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingSourceId, setViewingSourceId] = useState<string | null>(null);
  const viewingSource = sources.find((s) => s.id === viewingSourceId) ?? null;
  const prevMindmapMsgIdRef = useRef<string | null>(null);

  const latestMindmapEntry = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "ASSISTANT") {
        const extracted = extractMindmapFromContent(msg.content);
        if (extracted) return { id: msg.id, mindmap: extracted.mindmap };
      }
    }
    return null;
  }, [messages]);

  const activeMindmap = customMindmap ?? latestMindmapEntry?.mindmap ?? null;
  const activeMindmapMsgId = customMindmap ? customMindmapMsgId : (latestMindmapEntry?.id ?? null);

  /** Stores the teacher's edited mindmap in the AI message it belongs to. */
  async function saveMindmap(next: MindmapPayload): Promise<boolean> {
    const target = messages.find((m) => m.id === activeMindmapMsgId);
    if (!chatId || !target || !isUuid(target.id)) {
      toast.error("Mindmap ini belum tersimpan di percakapan, jadi belum bisa disimpan.");
      return false;
    }
    const result = await editMessageAction(chatId, target.id, replaceMindmapInContent(target.content, next));
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    const saved = result.saved;
    setMessages((prev) => prev.map((m) => (m.id === saved.id ? { ...m, content: saved.content } : m)));
    if (customMindmap) setCustomMindmap(extractMindmapFromContent(saved.content)?.mindmap ?? next);
    toast.success("Perubahan mindmap disimpan.");
    return true;
  }

  const [openAssessmentMsgId, setOpenAssessmentMsgId] = useState<string | null>(null);
  const [openAssessmentKind, setOpenAssessmentKind] = useState<"pretest" | "posttest" | null>(null);
  const prevAssessmentMsgIdRef = useRef<string | null>(null);

  const latestAssessmentEntry = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "ASSISTANT") {
        const extracted = extractAssessmentsFromContent(msg.content);
        if (extracted) return { id: msg.id, assessments: extracted.assessments };
      }
    }
    return null;
  }, [messages]);

  const activeAssessmentEntry = useMemo(() => {
    const opened = messages.find((m) => m.id === openAssessmentMsgId);
    const extracted = opened ? extractAssessmentsFromContent(opened.content) : null;
    return opened && extracted ? { id: opened.id, assessments: extracted.assessments } : latestAssessmentEntry;
  }, [messages, openAssessmentMsgId, latestAssessmentEntry]);

  // the newest test of each kind, whichever message holds it, for the cards in the Sumber tab
  const assessmentSlots = useMemo(
    () =>
      (["pretest", "posttest"] as const).map((kind) => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role !== "ASSISTANT") continue;
          const found = extractAssessmentsFromContent(messages[i].content)?.assessments.find((a) => a.kind === kind);
          if (found) return { kind, entry: { messageId: messages[i].id, assessment: found } };
        }
        return { kind, entry: null };
      }),
    [messages],
  );

  /** Stores the teacher's edited pre-test/post-test in the AI message it belongs to. */
  async function saveAssessments(next: AssessmentPayload[]): Promise<boolean> {
    const target = messages.find((m) => m.id === activeAssessmentEntry?.id);
    if (!chatId || !target || !isUuid(target.id)) {
      toast.error("Soal ini belum tersimpan di percakapan, jadi belum bisa disimpan.");
      return false;
    }
    const result = await editMessageAction(chatId, target.id, replaceAssessmentsInContent(target.content, next));
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    const saved = result.saved;
    setMessages((prev) => prev.map((m) => (m.id === saved.id ? { ...m, content: saved.content } : m)));
    const before = activeAssessmentEntry?.assessments ?? [];
    const approvedNow = next.some((a) => a.status === "approved" && before.find((b) => b.kind === a.kind)?.status !== "approved");
    const reopened = next.some((a) => a.status === "draft" && before.find((b) => b.kind === a.kind)?.status === "approved");
    toast.success(approvedNow ? "Soal disetujui." : reopened ? "Soal dibuka kembali sebagai draf." : "Draf soal disimpan.");
    return true;
  }

  // Open the Soal tab when a new pre-test/post-test message arrives
  useEffect(() => {
    if (!latestAssessmentEntry) return;
    if (prevAssessmentMsgIdRef.current !== latestAssessmentEntry.id) {
      prevAssessmentMsgIdRef.current = latestAssessmentEntry.id;
      setOpenAssessmentMsgId(null);
      setOpenAssessmentKind(null);
      setActiveTab("assessment");
      setSidebarOpen(true);
    }
  }, [latestAssessmentEntry]);

  const resizingRef = useRef(false);
  function stopResizing() {
    resizingRef.current = false;
    setIsResizingSidebar(false);
  }

  function clampMindmapWidth(pct: number) {
    return Math.min(MINDMAP_MAX_PCT, Math.max(MINDMAP_MIN_PCT, pct));
  }

  function resizeSidebarTo(clientX: number) {
    const row = sidebarRef.current?.parentElement;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    if (rect.width <= 0) return;
    setMindmapWidthPct(clampMindmapWidth(((rect.right - clientX) / rect.width) * 100));
  }

  // Automatically open the right sidebar to Mindmap tab when a new mindmap message arrives
  useEffect(() => {
    if (!latestMindmapEntry) return;
    if (prevMindmapMsgIdRef.current !== latestMindmapEntry.id) {
      prevMindmapMsgIdRef.current = latestMindmapEntry.id;
      setCustomMindmap(null);
      setCustomMindmapMsgId(null);
      setActiveTab("mindmap");
      setSidebarOpen(true);
    }
  }, [latestMindmapEntry]);

  const isUploadingFile = stagedFile !== null && uploadProgress < 100;

  // Scroll the internal chat container to the bottom whenever a new message arrives.
  useEffect(() => {
    const container = scrollAreaRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  // Subscribe to Server-Sent Events (`/api/chats/:id/events`) pushed when the Python worker finishes `extract` or `chat_reply`.
  useEffect(() => {
    if (!chatId) return;

    const source = new EventSource(`/api/chats/${chatId}/events`);

    const handleStreamPayload = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          materials?: MaterialView[];
          messages?: MessageView[];
          reply_pending?: boolean;
        };

        if (Array.isArray(data.materials)) {
          const nextMaterials = data.materials;
          setSources((prev) =>
            nextMaterials.map((item) => {
              const existing = prev.find((p) => p.id === item.id || p.title === item.title);
              return mapApiMaterial(item, existing?.sizeLabel ?? "Berkas");
            }),
          );
        }

        if (Array.isArray(data.messages)) {
          const nextMessages = data.messages;
          setMessages((prev) => {
            const attachmentById = new Map<string, MaterialSource>();
            for (const msg of prev) {
              if (msg.attachment) attachmentById.set(msg.id, msg.attachment);
            }
            return nextMessages.map((msg) => mapApiMessage(msg, attachmentById.get(msg.id)));
          });
        }

        if (typeof data.reply_pending === "boolean" && !data.reply_pending) {
          setThinking(false);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    };

    source.addEventListener("snapshot", handleStreamPayload as EventListener);
    source.addEventListener("update", handleStreamPayload as EventListener);

    return () => {
      source.close();
    };
  }, [chatId]);

  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    };
  }, []);

  function adjustTextareaHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }

  function validateAndCreateSource(file: File): MaterialSource | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const fileType = ALLOWED_EXTENSIONS[ext];
    if (!fileType) {
      toast.error("Format berkas belum didukung. Unggah berkas PDF, DOCX, atau PPTX.");
      return null;
    }
    if (file.size === 0) {
      toast.error("Berkas yang dipilih kosong.");
      return null;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Ukuran berkas melebihi batas maksimal 20 MB.");
      return null;
    }
    return {
      id: `src-${nextIdRef.current++}`,
      title: file.name,
      fileType,
      sizeLabel: formatFileSize(file.size),
      status: "UPLOADED",
    };
  }

  function attachFile(file: File) {
    const created = validateAndCreateSource(file);
    if (!created) return;

    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    setRawFile(file);
    setStagedFile(created);
    setUploadProgress(15);

    if (title === "Materi kelas baru") {
      const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      setTitle(cleanName);
    }

    let current = 15;
    uploadTimerRef.current = setInterval(() => {
      current += 28;
      if (current >= 100) {
        if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
        setUploadProgress(100);
        setStagedFile((prev) => (prev ? { ...prev, status: "EXTRACTED" } : null));
      } else {
        setUploadProgress(current);
      }
    }, 120);

    textareaRef.current?.focus();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) attachFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) attachFile(file);
  }

  async function submitMessage(customPrompt?: string) {
    if (thinking) return;
    const text = (customPrompt ?? prompt).trim();
    if (!text && !stagedFile) return;

    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    setUploadProgress(100);

    const attachedMeta = stagedFile ? { ...stagedFile, status: "UPLOADED" as const } : undefined;
    const fileToSend = rawFile;
    const finalText =
      text ||
      `Tolong pelajari berkas ${attachedMeta?.title} dan buatkan ringkasan materi serta soal latihan.`;

    const nextTitle = title === "Materi kelas baru" && text ? text.slice(0, 48) : title;
    if (nextTitle !== title) setTitle(nextTitle);

    const tempMessageId = `temp-user-${nextIdRef.current++}`;
    const optimisticMessage: ChatMessageItem = {
      id: tempMessageId,
      role: "USER",
      content: finalText,
      createdAt: formatTimeFromIso(),
      attachment: attachedMeta,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setPrompt("");
    setStagedFile(null);
    setRawFile(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setThinking(true);
    setIsSending(true);
    stopRequestedRef.current = false;

    const formData = new FormData();
    if (chatId) formData.set("chat_id", chatId);
    formData.set("title", nextTitle);
    formData.set("text", finalText);
    if (fileToSend) formData.set("file", fileToSend, fileToSend.name);

    const result = await sendChatMessageAction(formData);
    setIsSending(false);
    if (!result.ok) {
      setThinking(false);
      toast.error(result.message);
      return;
    }

    if (!chatId) {
      setChatId(result.chat.id);
      window.history.replaceState(null, "", `/teacher/materials/${result.chat.id}`);
    }

    const savedAttachment = result.material
      ? mapApiMaterial(result.material, attachedMeta?.sizeLabel ?? "Berkas")
      : attachedMeta;

    if (savedAttachment) {
      setSources((prev) =>
        prev.some((s) => s.id === savedAttachment.id || s.title === savedAttachment.title)
          ? prev.map((s) => (s.title === savedAttachment.title ? savedAttachment : s))
          : [...prev, savedAttachment],
      );
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === tempMessageId ? mapApiMessage(result.message, savedAttachment) : m)),
    );

    // the teacher pressed Stop while the message was still being sent: cancel the reply that was just queued
    if (stopRequestedRef.current) {
      stopRequestedRef.current = false;
      void stopChatReplyAction(result.chat.id);
    }
  }

  /** Stops waiting for the AI and cancels the reply that is being written. */
  async function stopReply() {
    setThinking(false);
    if (!chatId) {
      stopRequestedRef.current = true;
      return;
    }
    const result = await stopChatReplyAction(chatId);
    if (!result.ok) toast.error(result.message);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Teks tidak dapat disalin secara otomatis.");
    }
  }

  function removeSource(id: string) {
    setSources((prev) => prev.filter((item) => item.id !== id));
    toast.info("Berkas sumber dihapus dari tampilan.");
  }

  function resetNewChat() {
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    setChatId(null);
    setTitle("Materi kelas baru");
    setSources([]);
    setMessages([]);
    setCustomMindmap(null);
    setCustomMindmapMsgId(null);
    setOpenAssessmentMsgId(null);
    setOpenAssessmentKind(null);
    setActiveTab("sources");
    setStagedFile(null);
    setRawFile(null);
    setUploadProgress(100);
    setPrompt("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    window.history.replaceState(null, "", "/teacher/materials/new");
    textareaRef.current?.focus();
  }

  function handleGenerateMindmap() {
    const sourceNames = sources.map((s) => s.title).join(", ");
    const targetLabel = sourceNames || title;
    setActiveTab("mindmap");
    setSidebarOpen(true);
    void submitMessage(
      `Tolong buatkan kerangka mindmap hierarkis (topik utama, sub-topik, dan poin kunci) yang mudah dipahami dari materi ${targetLabel}.`,
    );
  }

  function handleGenerateAssessment(kind: "pretest" | "posttest" | "both") {
    const sourceNames = sources.map((s) => s.title).join(", ");
    const targetLabel = sourceNames || title;
    const request = {
      pretest: "Pre-Test",
      posttest: "Post-Test",
      both: "Pre-Test dan Post-Test",
    }[kind];
    setActiveTab("assessment");
    setSidebarOpen(true);
    void submitMessage(`Tolong buatkan ${request} pilihan ganda dari materi ${targetLabel}.`);
  }

  const widePanel = activeTab === "mindmap" || activeTab === "assessment";

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={handleDrop}
      /* Bleeds edge-to-edge inside DashboardShell's <main> (-mx-4 -my-6 sm:-mx-8) with a full-screen white surface */
      className="relative -mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden border-t border-border bg-surface sm:-mx-8 lg:border-l"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Unggah berkas materi PDF, DOCX, atau PPTX"
      />

      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary bg-primary-tint/95 p-6 text-center"
        >
          <span className="upload-check-pop flex size-14 items-center justify-center rounded-full bg-surface text-primary">
            <FileUp size={28} strokeWidth={1.75} />
          </span>
          <p className="text-h1 font-semibold text-primary">Lepaskan berkas untuk mengunggah materi</p>
          <p className="text-body text-ink">Mendukung PDF, DOCX, atau PPTX hingga 20 MB</p>
        </div>
      )}

      {/* Full-width top bar on the white canvas */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 sm:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Link
            href="/teacher/materials"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-small font-semibold text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
          >
            <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Materi</span>
          </Link>

          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <label htmlFor={titleInputId} className="sr-only">
              Judul materi
            </label>
            <input
              id={titleInputId}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="focus-bare w-full truncate rounded-sm bg-transparent px-2 py-1 font-heading text-h3 font-semibold text-ink outline-none hover:bg-bg focus:bg-bg"
              placeholder="Judul materi kelas…"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetNewChat}
            title="Mulai materi baru"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:bg-bg"
          >
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Baru</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            title={sidebarOpen ? "Sembunyikan sidebar kanan" : "Buka sidebar kanan"}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:bg-bg lg:hidden"
          >
            {sidebarOpen ? (
              <PanelRightClose size={20} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PanelRightOpen size={20} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Main full-screen body: splits 50/50 when Mindmap tab is open in the right sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-surface">
        <section
          aria-label="Percakapan asisten AI"
          style={sidebarOpen && widePanel ? ({ "--panel-w": `${mindmapWidthPct}%` } as CSSProperties) : undefined}
          className={`flex min-w-0 flex-col overflow-hidden bg-surface ${isResizingSidebar ? "" : "transition-[width] duration-200"} ${
            sidebarOpen && widePanel ? "w-full lg:w-[calc(100%-var(--panel-w))] lg:flex-none" : "flex-1"
          }`}
        >
          {/* Scrollable middle area with wider max-w-5xl reading & chat column */}
          <div ref={scrollAreaRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8">
            {messages.length === 0 ? (
              <div className="mx-auto my-auto flex w-full max-w-5xl flex-col gap-5 py-2">
                <div className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary-tint px-3 py-1 text-caption font-semibold text-primary">
                    <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
                    Asisten AI Guru
                  </span>
                  <h1 className="text-display font-semibold text-ink">
                    Materi apa yang ingin Anda susun hari ini?
                  </h1>
                  <p className="text-body text-muted">
                    Unggah berkas PDF, DOCX, atau PPTX melalui tombol di bawah, atau pilih salah satu perintah cepat untuk mulai menyusun bahan ajar.
                  </p>
                </div>

                {/* Wide 2x2 starter prompt grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => void submitMessage(item.prompt)}
                      className="flex flex-col items-start gap-1 rounded-lg border border-border bg-bg p-4 text-left transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint"
                    >
                      <span className="text-body font-semibold text-ink">{item.title}</span>
                      <span className="text-small text-muted">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Wide conversation stream (max-w-5xl) */
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2">
                {messages.map((message) =>
                  message.role === "USER" ? (
                    <article
                      key={message.id}
                      aria-label="Pesan Anda"
                      className="chat-item-in ml-auto flex max-w-[90%] flex-col items-end gap-2 sm:max-w-[78%]"
                    >
                      {message.attachment && (
                        <div className="inline-flex max-w-xs items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5">
                          <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate text-small font-medium text-ink">{message.attachment.title}</span>
                        </div>
                      )}
                      <div className="rounded-lg bg-primary-tint px-4 py-3 text-body text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                      <span className="text-caption text-muted">Anda · {message.createdAt}</span>
                    </article>
                  ) : (
                    <article
                      key={message.id}
                      aria-label="Balasan asisten AI"
                      className="chat-item-in flex w-full gap-3"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary"
                      >
                        <Sparkles size={16} strokeWidth={1.75} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">

                      <FormattedContent
                        content={message.content}
                        onOpenMindmap={(mm) => {
                          setCustomMindmap(mm);
                          setCustomMindmapMsgId(message.id);
                          setActiveTab("mindmap");
                          setSidebarOpen(true);
                        }}
                        onOpenAssessment={() => {
                          setOpenAssessmentMsgId(message.id);
                          setOpenAssessmentKind(null);
                          setActiveTab("assessment");
                          setSidebarOpen(true);
                        }}
                      />

                      <footer className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyMessage(message.id, message.content)}
                          aria-label={copiedId === message.id ? "Tersalin" : "Salin teks"}
                          title={copiedId === message.id ? "Tersalin" : "Salin teks"}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-primary"
                        >
                          {copiedId === message.id ? (
                            <Check size={15} strokeWidth={1.75} aria-hidden="true" />
                          ) : (
                            <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
                          )}
                        </button>
                        <span className="text-caption text-muted">{message.createdAt}</span>
                        {message.sources && message.sources.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-caption text-muted">
                            <FileText size={13} strokeWidth={1.75} aria-hidden="true" />
                            {message.sources.every((s) => isUuid(s))
                              ? `${message.sources.length} bagian materi`
                              : message.sources.join(", ")}
                          </span>
                        )}
                      </footer>
                      </div>
                    </article>
                  ),
                )}

                {thinking && (
                  <ContextualThinking
                    key={messages.length}
                    steps={getThinkingSteps(
                      [...messages].reverse().find((m) => m.role === "USER"),
                    )}
                  />
                )}
              </div>
            )}
          </div>

          {/* Docked bottom prompt composer (wide max-w-5xl, pinned to bottom of white screen, no top hr) */}
          <div className="shrink-0 bg-surface px-4 pb-4 pt-2 sm:px-8">
            <form onSubmit={handleFormSubmit} className="mx-auto w-full max-w-5xl">
              <div className="rounded-lg border border-border bg-bg px-4 py-3 transition-colors duration-150 ease-out focus-within:border-primary">
                {/* Compact inline file pill inside the textbox showing only the file name */}
                {stagedFile && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <div className="chat-item-in inline-flex max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
                      {isUploadingFile ? (
                        <Spinner size={16} />
                      ) : (
                        <FileText size={16} strokeWidth={1.75} className="upload-check-pop shrink-0 text-primary" aria-hidden="true" />
                      )}
                      <span className="truncate text-small font-medium text-ink" title={stagedFile.title}>
                        {stagedFile.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
                          setStagedFile(null);
                          setRawFile(null);
                          setUploadProgress(100);
                        }}
                        aria-label={`Batal melampirkan ${stagedFile.title}`}
                        className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
                      >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                <label htmlFor={promptInputId} className="sr-only">
                  Pesan untuk asisten AI
                </label>
                <textarea
                  id={promptInputId}
                  ref={textareaRef}
                  rows={2}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    adjustTextareaHeight();
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Tanyakan sesuatu, atau minta AI membuat bahan ajar & soal dari berkas Anda… (Tekan Enter untuk kirim)"
                  className="focus-bare block max-h-36 min-h-[48px] w-full resize-none bg-transparent px-1 py-1 text-body text-ink outline-none placeholder:text-muted"
                />

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint hover:text-primary"
                    >
                      <Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
                      <span>Unggah materi</span>
                    </button>
                  </div>

                  {thinking && !isSending ? (
                    <Button type="button" variant="secondary" onClick={() => void stopReply()} aria-label="Hentikan balasan AI">
                      <Square size={16} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
                      Berhenti
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      loading={isSending || isUploadingFile}
                      disabled={isSending || isUploadingFile || (!prompt.trim() && !stagedFile)}
                    >
                      {!(isSending || isUploadingFile) && <Send size={20} strokeWidth={1.75} aria-hidden="true" />}
                      {isUploadingFile ? "Mengunggah…" : isSending ? "Mengirim…" : "Kirim"}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* NotebookLM-style Right Studio Sidebar: collapsible rail + extensible feature tabs */}
        {sidebarOpen ? (
          <aside
            ref={sidebarRef}
            aria-label="Sidebar Studio & Materi"
            style={widePanel ? ({ "--mindmap-w": `${mindmapWidthPct}%` } as CSSProperties) : undefined}
            className={`fixed inset-y-16 right-0 z-20 flex max-w-full shrink-0 flex-col overflow-hidden border-l border-border bg-surface shadow-[var(--shadow-overlay)] lg:relative lg:inset-y-0 lg:z-auto lg:shadow-none ${
              isResizingSidebar ? "" : "transition-[width] duration-200"
            } ${widePanel ? "w-full lg:w-[var(--mindmap-w)]" : "w-80 sm:w-96"}`}
          >
            {/* Drag the left edge to change the mindmap width (desktop only, at most half of the screen) */}
            {widePanel && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Ubah lebar mindmap"
                aria-valuemin={MINDMAP_MIN_PCT}
                aria-valuemax={MINDMAP_MAX_PCT}
                aria-valuenow={Math.round(mindmapWidthPct)}
                tabIndex={0}
                title="Geser untuk mengubah lebar · klik 2x untuk mengembalikan"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  resizingRef.current = true;
                  setIsResizingSidebar(true);
                }}
                onPointerMove={(event) => {
                  if (!resizingRef.current) return;
                  // the button was released somewhere we did not hear about: end the drag instead of following the mouse
                  if (event.buttons === 0) return stopResizing();
                  resizeSidebarTo(event.clientX);
                }}
                onPointerUp={stopResizing}
                onPointerCancel={stopResizing}
                onLostPointerCapture={stopResizing}
                onDoubleClick={() => setMindmapWidthPct(MINDMAP_DEFAULT_PCT)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    setMindmapWidthPct((w) => clampMindmapWidth(w + 2));
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    setMindmapWidthPct((w) => clampMindmapWidth(w - 2));
                  }
                }}
                className={`absolute inset-y-0 left-0 z-10 hidden w-3 cursor-col-resize touch-none select-none transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 lg:block ${
                  isResizingSidebar ? "bg-primary/40" : ""
                }`}
              />
            )}
            {/* NotebookLM-style Sidebar Tab Bar */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
              <nav aria-label="Menu fitur materi" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {SIDEBAR_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const TabIcon = tab.Icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-caption font-semibold transition-colors ${
                        isActive
                          ? "bg-primary text-white"
                          : "text-muted hover:bg-bg hover:text-ink"
                      }`}
                    >
                      <TabIcon size={15} strokeWidth={1.75} aria-hidden="true" />
                      <span>{tab.label}</span>
                      {tab.id === "sources" && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[11px] font-semibold ${
                            isActive ? "bg-white/20 text-white" : "bg-bg text-muted"
                          }`}
                        >
                          {sources.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                title="Lipat sidebar kanan"
                aria-label="Lipat sidebar kanan"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-ink"
              >
                <PanelRightClose size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {activeTab === "sources" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                <div>
                  <h2 className="text-h3 font-semibold text-ink">Sumber materi</h2>
                  <p className="text-caption text-muted">Berkas referensi pada percakapan ini.</p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-caption font-semibold text-ink transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint hover:text-primary"
                >
                  <FileUp size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>Tambah berkas (PDF/DOCX/PPTX)</span>
                </button>

                {sources.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-bg p-5 text-center">
                    <p className="text-small font-semibold text-ink">Belum ada berkas</p>
                    <p className="mt-1 text-caption text-muted">
                      Unggah modul PDF, DOCX, atau slide PPTX agar AI menyusun materi sesuai bahan ajar Anda.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {sources.map((source) => (
                      <li key={source.id} className="chat-item-in flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span
                              aria-hidden="true"
                              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary"
                            >
                              <FileText size={18} strokeWidth={1.75} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-small font-semibold text-ink" title={source.title}>
                                {source.title}
                              </p>
                              <p className="text-caption text-muted">
                                {source.fileType} · {source.sizeLabel}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSource(source.id)}
                            aria-label={`Hapus berkas ${source.title}`}
                            className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-danger"
                          >
                            <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2">
                          <SourceStatusBadge status={source.status} />
                          <div className="flex items-center gap-3">
                            {chatId && isUuid(source.id) && (
                              <button
                                type="button"
                                onClick={() => setViewingSourceId(source.id)}
                                className="inline-flex items-center gap-1 text-caption font-semibold text-ink hover:text-primary"
                              >
                                <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                                Lihat
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void submitMessage(`Tolong buatkan ringkasan materi dan latihan soal dari berkas ${source.title}.`)
                              }
                              className="text-caption font-semibold text-primary hover:underline"
                            >
                              Gunakan di chat
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <hr className="mt-auto border-border" />

                <div>
                  <h2 className="text-h3 font-semibold text-ink">Soal asesmen</h2>
                  <p className="text-caption text-muted">Setujui soal agar tersimpan di sini; Pre-Test dan Post-Test dibuat terpisah.</p>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {assessmentSlots.map(({ kind, entry }) => (
                    <li key={kind} className="chat-item-in flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary"
                        >
                          <ClipboardList size={18} strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-small font-semibold text-ink" title={entry?.assessment.title}>
                            {entry?.assessment.title ?? assessmentKindLabel(kind)}
                          </p>
                          <p className="text-caption text-muted">
                            {assessmentKindLabel(kind)} · {entry ? `${entry.assessment.questions.length} soal` : "Belum dibuat"}
                          </p>
                        </div>
                        {entry && <StatusBadge status={entry.assessment.status} />}
                      </div>
                      <div className="flex items-center justify-end gap-3 border-t border-border pt-2">
                        {entry ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenAssessmentMsgId(entry.messageId);
                              setOpenAssessmentKind(kind);
                              setActiveTab("assessment");
                            }}
                            className="inline-flex items-center gap-1 text-caption font-semibold text-ink hover:text-primary"
                          >
                            <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                            {entry.assessment.status === "approved" ? "Lihat" : "Periksa & Setujui"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleGenerateAssessment(kind)}
                          disabled={thinking || isUploadingFile}
                          className="text-caption font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {entry ? "Buat ulang" : `Buat ${assessmentKindLabel(kind)}`}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="primary"
                  full
                  onClick={handleGenerateMindmap}
                  disabled={thinking || isUploadingFile}
                >
                  <Network size={18} strokeWidth={1.75} aria-hidden="true" />
                  Buat Mindmap
                </Button>
              </div>
            ) : activeTab === "assessment" ? (
              activeAssessmentEntry ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div role="tablist" aria-label="Soal asesmen" className="flex shrink-0 gap-2 border-b border-border bg-bg px-4 py-2.5">
                    {assessmentSlots.map(({ kind, entry }) => {
                      const selected = (openAssessmentKind ?? activeAssessmentEntry.assessments[0].kind) === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          disabled={!entry && (thinking || isUploadingFile)}
                          onClick={() => {
                            if (!entry) return handleGenerateAssessment(kind);
                            setOpenAssessmentMsgId(entry.messageId);
                            setOpenAssessmentKind(kind);
                          }}
                          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-1.5 text-body font-semibold transition-colors disabled:opacity-60 ${
                            selected ? "border-primary bg-surface text-primary" : "border-border bg-bg text-muted hover:border-primary/50 hover:text-ink"
                          }`}
                        >
                          {assessmentKindLabel(kind)}
                          {entry ? <StatusBadge status={entry.assessment.status} /> : <span className="text-caption font-normal">+ Buat</span>}
                        </button>
                      );
                    })}
                  </div>
                  <AssessmentBoard
                    key={`${activeAssessmentEntry.id}-${openAssessmentKind ?? ""}`}
                    assessments={activeAssessmentEntry.assessments}
                    kind={openAssessmentKind ?? activeAssessmentEntry.assessments[0].kind}
                    onSave={chatId && !thinking ? saveAssessments : undefined}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
                    <ClipboardList size={24} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="max-w-xs">
                    <p className="text-h3 font-semibold text-ink">
                      {thinking ? "Sedang menyusun soal…" : "Belum ada Pre-Test / Post-Test"}
                    </p>
                    <p className="mt-1 text-caption text-muted">
                      {thinking
                        ? "Harap tunggu, AI sedang menyusun 10 soal dari seluruh materi Anda."
                        : "Buat 10 soal pilihan ganda dari materi, lalu edit sebelum dipakai."}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="primary" onClick={() => handleGenerateAssessment("pretest")} loading={thinking} disabled={thinking || isUploadingFile}>
                      Buat Pre-Test
                    </Button>
                    <Button variant="secondary" onClick={() => handleGenerateAssessment("posttest")} disabled={thinking || isUploadingFile}>
                      Buat Post-Test
                    </Button>
                  </div>
                </div>
              )
            ) : activeMindmap ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <MindmapBoard
                  mindmap={activeMindmap}
                  fillHeight
                  onAskNodePrompt={(promptText) => void submitMessage(promptText)}
                  onSave={chatId && activeMindmapMsgId && !thinking ? saveMindmap : undefined}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
                  <Network size={24} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="max-w-xs">
                  <p className="text-h3 font-semibold text-ink">
                    {thinking ? "Sedang menyusun Mindmap…" : "Belum ada Mindmap"}
                  </p>
                  <p className="mt-1 text-caption text-muted">
                    {thinking
                      ? "Harap tunggu sebentar, AI sedang memetakan konsep utama dan cabang materi Anda."
                      : "Buat visualisasi peta konsep interaktif dari berkas materi pada percakapan ini."}
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={handleGenerateMindmap}
                  loading={thinking}
                  disabled={thinking || isUploadingFile}
                >
                  <Network size={18} strokeWidth={1.75} aria-hidden="true" />
                  Buat Mindmap Sekarang
                </Button>
              </div>
            )}
          </aside>
        ) : (
          /* Collapsed NotebookLM-style vertical icon rail on the right edge */
          <aside
            aria-label="Sidebar Studio terlipat"
            className="hidden w-14 shrink-0 flex-col items-center gap-2 border-l border-border bg-surface py-3 lg:flex"
          >
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              title="Buka sidebar kanan"
              aria-label="Buka sidebar kanan"
              className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-ink"
            >
              <PanelRightOpen size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>

            <span className="my-0.5 h-px w-7 bg-border" aria-hidden="true" />

            {SIDEBAR_TABS.map((tab) => {
              const TabIcon = tab.Icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSidebarOpen(true);
                  }}
                  title={tab.label}
                  aria-label={tab.label}
                  className={`relative flex size-10 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-muted hover:bg-bg hover:text-ink"
                  }`}
                >
                  <TabIcon size={18} strokeWidth={1.75} aria-hidden="true" />
                  {tab.id === "sources" && sources.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white ring-2 ring-surface">
                      {sources.length}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>
        )}
      </div>

      {viewingSource && chatId && (
        <SourceViewer chatId={chatId} source={viewingSource} onClose={() => setViewingSourceId(null)} />
      )}
    </div>
  );
}
