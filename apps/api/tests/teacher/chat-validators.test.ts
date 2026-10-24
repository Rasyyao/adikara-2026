import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import {
  MAX_MESSAGE_CHARS,
  parseCreateChat,
  parseMessageQuery,
  parseMessageText,
  parseOptionalFile,
} from "../../src/http/validators/teacher/chat.js";

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    expect((err as AppError).code).toBe("validation_error");
    return (err as AppError).details?.fields as Record<string, string>;
  }
  throw new Error("expected a validation error");
}

const PDF = Buffer.from("%PDF-1.7 rest of the file");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const file = (originalname: string, buffer: Buffer) => ({ originalname, buffer });

describe("parseCreateChat", () => {
  describe("success", () => {
    it.each([undefined, null, {}, { title: "" }, { title: null }])("no title for %j (the service picks a default)", (body) => {
      expect(parseCreateChat(body)).toEqual({ title: null });
    });
    it("trims the title", () => {
      expect(parseCreateChat({ title: "  Kelas 7A  " })).toEqual({ title: "Kelas 7A" });
    });
    it("accepts exactly 100 characters", () => {
      expect(parseCreateChat({ title: "x".repeat(100) }).title).toHaveLength(100);
    });
  });
  describe("failure", () => {
    it.each(["   ", "x".repeat(101), 5, ["a"], "line\nbreak", "bell\u0007"])("rejects title %j", (title) => {
      expect(fieldsOf(() => parseCreateChat({ title }))).toHaveProperty("title");
    });
    it.each(["text", [], 7])("rejects a body that is not an object: %j", (body) => {
      expect(fieldsOf(() => parseCreateChat(body))).toHaveProperty("body");
    });
  });
});

describe("parseMessageText", () => {
  describe("success", () => {
    it("trims the text and keeps line breaks and tabs inside", () => {
      expect(parseMessageText({ text: "  baris satu\nbaris\tdua  " })).toBe("baris satu\nbaris\tdua");
    });
    it(`accepts exactly ${MAX_MESSAGE_CHARS} characters`, () => {
      expect(parseMessageText({ text: "x".repeat(MAX_MESSAGE_CHARS) })).toHaveLength(MAX_MESSAGE_CHARS);
    });
  });
  describe("failure", () => {
    it.each([undefined, null, "string", []])("a missing or non-object body is 'text is required': %j", (body) => {
      expect(fieldsOf(() => parseMessageText(body))).toEqual({ text: "is required" });
    });
    it.each([undefined, null, "", "   \n ", 5, true, ["a"], {}])("rejects text %j", (text) => {
      expect(fieldsOf(() => parseMessageText({ text }))).toHaveProperty("text");
    });
    it("rejects text that is too long, and control characters", () => {
      expect(fieldsOf(() => parseMessageText({ text: "x".repeat(MAX_MESSAGE_CHARS + 1) })).text).toMatch(/at most 4000/);
      expect(fieldsOf(() => parseMessageText({ text: "a\u0000b" })).text).toMatch(/control/);
    });
  });
});

describe("parseOptionalFile", () => {
  describe("success", () => {
    it("no file is fine (the file is optional)", () => {
      expect(parseOptionalFile(undefined)).toBeNull();
    });
    it("a PDF: title without the extension, content type from the kind", () => {
      expect(parseOptionalFile(file("Modul Perulangan.pdf", PDF))).toMatchObject({
        title: "Modul Perulangan",
        extension: ".pdf",
        contentType: "application/pdf",
      });
    });
    it("DOCX and PPTX (zip containers) with their own content types", () => {
      expect(parseOptionalFile(file("a.docx", ZIP))?.contentType).toMatch(/wordprocessingml/);
      expect(parseOptionalFile(file("b.pptx", ZIP))?.contentType).toMatch(/presentationml/);
    });
    it("the extension check ignores case", () => {
      expect(parseOptionalFile(file("SLIDES.PPTX", ZIP))).toMatchObject({ extension: ".pptx", title: "SLIDES" });
    });
    it("a name with dots keeps everything before the last one", () => {
      expect(parseOptionalFile(file("modul.v2.final.pdf", PDF))?.title).toBe("modul.v2.final");
    });
    it("caps a very long title at 100 characters and strips control characters", () => {
      expect(parseOptionalFile(file(`${"a".repeat(300)}.pdf`, PDF))?.title).toHaveLength(100);
      expect(parseOptionalFile(file("ba\u0007d\nname.pdf", PDF))?.title).toBe("badname");
    });
    it("a name that is only control characters and an extension falls back to 'Untitled'", () => {
      expect(parseOptionalFile(file("\u0007\u0007.pdf", PDF))?.title).toBe("Untitled");
    });
  });

  describe("failure", () => {
    it.each(["virus.exe", "notes.txt", "image.png", "archive.zip", "old.doc", "old.ppt", "noextension", "file.", ".pdf"])(
      "rejects the type of %s",
      (name) => {
        expect(fieldsOf(() => parseOptionalFile(file(name, PDF))).file).toMatch(/must be one of: \.pdf, \.docx, \.pptx/);
      },
    );
    it("rejects an empty file", () => {
      expect(fieldsOf(() => parseOptionalFile(file("a.pdf", Buffer.alloc(0)))).file).toBe("is empty");
    });
    it("rejects a file whose first bytes do not match its extension", () => {
      expect(fieldsOf(() => parseOptionalFile(file("script.pdf", Buffer.from("<?php echo 1;"))))).toHaveProperty("file");
      expect(fieldsOf(() => parseOptionalFile(file("fake.docx", PDF))).file).toMatch(/not a valid DOCX/);
      expect(fieldsOf(() => parseOptionalFile(file("fake.pdf", ZIP))).file).toMatch(/not a valid PDF/);
    });
    it("rejects a file shorter than its signature", () => {
      expect(fieldsOf(() => parseOptionalFile(file("a.pdf", Buffer.from("%PD"))))).toHaveProperty("file");
    });
  });
});

describe("parseMessageQuery", () => {
  const ID = "8f6b9c0e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
  describe("success", () => {
    it("defaults to the latest 50", () => {
      expect(parseMessageQuery({})).toEqual({ limit: 50, after: undefined });
    });
    it("reads limit and after, lower-casing the id", () => {
      expect(parseMessageQuery({ limit: "200", after: ID.toUpperCase() })).toEqual({ limit: 200, after: ID });
    });
    it("takes the last value when a parameter is repeated, and ignores empty ones", () => {
      expect(parseMessageQuery({ limit: ["5", "7"], after: "" })).toEqual({ limit: 7, after: undefined });
    });
  });
  describe("failure", () => {
    it.each(["0", "201", "-1", "1.5", "abc", " 5"])("rejects limit=%s", (limit) => {
      expect(fieldsOf(() => parseMessageQuery({ limit }))).toHaveProperty("limit");
    });
    it.each(["zzz", "123", `${ID}x`, "'; DROP TABLE chats;--"])("rejects after=%s", (after) => {
      expect(fieldsOf(() => parseMessageQuery({ after }))).toHaveProperty("after");
    });
    it("reports every bad field at once", () => {
      expect(Object.keys(fieldsOf(() => parseMessageQuery({ limit: "0", after: "x" }))).sort()).toEqual(["after", "limit"]);
    });
  });
});
