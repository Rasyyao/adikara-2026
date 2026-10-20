import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { parseUuidParam } from "../../src/http/validators/shared/common.js";

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

describe("parseUuidParam", () => {
  it("accepts a UUID and lower-cases it", () => {
    expect(parseUuidParam("00000000-0000-4000-8000-0000000000AB", "id")).toBe("00000000-0000-4000-8000-0000000000ab");
  });
  it.each(["", "123", "not-a-uuid", "00000000-0000-4000-8000-00000000000g", undefined, ["x"]])("rejects %j", (value) => {
    expect(fieldsOf(() => parseUuidParam(value, "id"))).toHaveProperty("id");
  });
});
