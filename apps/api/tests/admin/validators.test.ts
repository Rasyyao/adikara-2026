import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { parseCreateClass, parseIncludeArchived, parseUpdateClass } from "../../src/http/validators/admin/class.js";
import { parseCreateStudent, parseUpdateStudent } from "../../src/http/validators/admin/student.js";
import { parseCreateTeacher, parseUpdateTeacher } from "../../src/http/validators/admin/teacher.js";
import { parseOptionalUuidQuery, parsePageQuery } from "../../src/http/validators/shared/common.js";

const ID = "00000000-0000-4000-8000-0000000000c1";

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

describe("admin validators: teachers", () => {
  it("create trims and lower-cases the email and trims the name", () => {
    expect(parseCreateTeacher({ email: " A@B.co ", name: "  Pak  ", password: "Abcdefg1" })).toEqual({ email: "a@b.co", name: "Pak", password: "Abcdefg1" });
  });
  it("create reports every problem at once", () => {
    expect(Object.keys(fieldsOf(() => parseCreateTeacher({})))).toEqual(["email", "name", "password"]);
  });
  it.each(["a\u0000b", "x".repeat(101), "   "])("create rejects the name %j", (name) => {
    expect(fieldsOf(() => parseCreateTeacher({ email: "a@b.co", name, password: "Abcdefg1" }))).toHaveProperty("name");
  });
  it("update takes any subset", () => {
    expect(parseUpdateTeacher({ name: "X" })).toEqual({ name: "X" });
    expect(parseUpdateTeacher({ email: "A@B.co", password: "Abcdefg1" })).toEqual({ email: "a@b.co", password: "Abcdefg1" });
  });
  it("update ignores unknown fields such as role, but needs at least one real field", () => {
    expect(parseUpdateTeacher({ name: "X", role: "ADMIN" })).toEqual({ name: "X" });
    expect(fieldsOf(() => parseUpdateTeacher({ role: "ADMIN" }))).toHaveProperty("body");
  });
});

describe("admin validators: students", () => {
  const valid = { username: "Siswa.Baru", name: "Siswa", password: "Abcdefg1", class_id: ID };
  it("create normalizes the username and returns the class id", () => {
    expect(parseCreateStudent(valid)).toEqual({ username: "siswa.baru", name: "Siswa", password: "Abcdefg1", classId: ID });
  });
  it("create reports every problem at once", () => {
    expect(Object.keys(fieldsOf(() => parseCreateStudent({})))).toEqual(["username", "name", "password", "class_id"]);
  });
  it("update maps class_id to classId", () => {
    expect(parseUpdateStudent({ class_id: ID })).toEqual({ classId: ID });
  });
  it.each([{}, { role: "ADMIN" }])("update needs at least one real field: %j", (body) => {
    expect(fieldsOf(() => parseUpdateStudent(body))).toHaveProperty("body");
  });
});

describe("admin validators: classes", () => {
  it("create upper-cases the class code", () => {
    expect(parseCreateClass({ name: "7B", class_code: "kelas7b", teacher_id: ID })).toEqual({ name: "7B", classCode: "KELAS7B", teacherId: ID });
  });
  it("update takes name, teacher_id and archived", () => {
    expect(parseUpdateClass({ name: "X", teacher_id: ID, archived: true })).toEqual({ name: "X", teacherId: ID, archived: true });
  });
  it("update refuses to change the class code", () => {
    expect(fieldsOf(() => parseUpdateClass({ class_code: "NEW" }))).toHaveProperty("class_code");
  });
  it.each([["true", true], ["false", false], [undefined, false], ["", false]])("include_archived=%j is %s", (raw, expected) => {
    expect(parseIncludeArchived({ include_archived: raw })).toBe(expected);
  });
  it("include_archived rejects other values", () => {
    expect(fieldsOf(() => parseIncludeArchived({ include_archived: "1" }))).toHaveProperty("include_archived");
  });
});

describe("list query: paging, search and filters", () => {
  it("defaults to 50 rows from 0", () => {
    expect(parsePageQuery({})).toEqual({ limit: 50, offset: 0, search: undefined });
  });
  it("reads limit, offset and q; a repeated parameter uses the last value", () => {
    expect(parsePageQuery({ limit: "10", offset: "20", q: " ab " })).toEqual({ limit: 10, offset: 20, search: "ab" });
    expect(parsePageQuery({ limit: ["5", "7"] }).limit).toBe(7);
  });
  it.each([{ limit: "0" }, { limit: "101" }, { limit: "1.5" }, { limit: "-1" }, { limit: "x" }, { offset: "-1" }, { offset: "2000000" }])("rejects %j", (query) => {
    expect(fieldsOf(() => parsePageQuery(query))).toBeDefined();
  });
  it("optional uuid filter: absent is undefined, malformed is 400", () => {
    expect(parseOptionalUuidQuery({}, "class_id")).toBeUndefined();
    expect(parseOptionalUuidQuery({ class_id: ID }, "class_id")).toBe(ID);
    expect(fieldsOf(() => parseOptionalUuidQuery({ class_id: "x" }, "class_id"))).toHaveProperty("class_id");
  });
});
