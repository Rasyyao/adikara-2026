import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { parseLiveInput } from "../../src/http/validators/shared/live-board.js";

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    return (err as AppError).details?.fields as Record<string, string>;
  }
  throw new Error("expected a validation error");
}

const rect = { id: "a", type: "rectangle", x: 0, y: 0 };

describe("parseLiveInput", () => {
  describe("success", () => {
    it("reads changed elements, deleted ids, the cursor and the drawing rule", () => {
      expect(parseLiveInput({ upserts: [rect], deletes: ["b"], cursor: { x: 1.5, y: -2 }, draw_allowed: false })).toEqual({
        upserts: [rect],
        deletes: ["b"],
        cursor: { x: 1.5, y: -2 },
        drawAllowed: false,
      });
    });
    it("a cursor of null means the pointer left the board", () => {
      expect(parseLiveInput({ cursor: null })).toEqual({ cursor: null });
    });
    it("an empty message is allowed (nothing happens)", () => {
      expect(parseLiveInput({})).toEqual({});
    });
  });

  describe("failure: 400", () => {
    it.each([{ id: "a" }, { type: "rectangle" }, { id: 1, type: "rectangle" }, { id: "x".repeat(65), type: "rectangle" }, "a", null])("rejects the element %j", (element) => {
      expect(fieldsOf(() => parseLiveInput({ upserts: [element] }))).toHaveProperty("upserts");
    });
    it("rejects more than 600 elements at once", () => {
      expect(fieldsOf(() => parseLiveInput({ upserts: Array.from({ length: 601 }, (_, i) => ({ ...rect, id: `e${i}` })) }))).toHaveProperty("upserts");
    });
    it.each([[1], "a", [null]])("rejects deletes %j", (deletes) => {
      expect(fieldsOf(() => parseLiveInput({ deletes }))).toHaveProperty("deletes");
    });
    it.each([{ x: 1 }, { x: "1", y: 2 }, { x: Infinity, y: 0 }, { x: 1e8, y: 0 }, [1, 2]])("rejects the cursor %j", (cursor) => {
      expect(fieldsOf(() => parseLiveInput({ cursor }))).toHaveProperty("cursor");
    });
    it.each(["true", 1, null])("rejects draw_allowed %j", (draw_allowed) => {
      expect(fieldsOf(() => parseLiveInput({ draw_allowed }))).toHaveProperty("draw_allowed");
    });
  });
});
