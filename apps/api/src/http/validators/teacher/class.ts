import { parseCreateStudent, parseUpdateStudent } from "../admin/student.js";
import { asRecord, checkName, throwIfInvalid, validationError, type Fields } from "../shared/common.js";

const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

/** `name`, and optionally `class_code` (made up when left out). */
export function parseCreateTeacherClass(body: unknown): { name: string; classCode?: string } {
  const record = asRecord(body);
  const fields: Fields = {};
  const name = checkName(record.name, "name", fields);
  let classCode: string | undefined;
  if (record.class_code !== undefined && record.class_code !== "") {
    classCode = typeof record.class_code === "string" ? record.class_code.trim().toUpperCase() : "";
    if (!CLASS_CODE_PATTERN.test(classCode)) fields.class_code = "must be 3-32 characters: letters, digits, dash or underscore";
  }
  throwIfInvalid(fields);
  return { name, ...(classCode ? { classCode } : {}) };
}

/** At least one of name, archived. The class code never changes and a class is not handed to another teacher here. */
export function parseUpdateTeacherClass(body: unknown): { name?: string; archived?: boolean } {
  const record = asRecord(body);
  const fields: Fields = {};
  const patch: { name?: string; archived?: boolean } = {};
  if (record.name !== undefined) patch.name = checkName(record.name, "name", fields);
  if (record.archived !== undefined) {
    if (typeof record.archived === "boolean") patch.archived = record.archived;
    else fields.archived = "must be true or false";
  }
  if (record.class_code !== undefined) fields.class_code = "cannot be changed";
  if (record.teacher_id !== undefined) fields.teacher_id = "cannot be changed";
  throwIfInvalid(fields);
  if (Object.keys(patch).length === 0) throw validationError({ body: "send at least one of name, archived" });
  return patch;
}

/** `username`, `name`, `password`; the class is the one in the path. */
export function parseCreateClassStudent(body: unknown, classId: string): { username: string; name: string; password: string } {
  const { username, name, password } = parseCreateStudent({ ...asRecord(body), class_id: classId });
  return { username, name, password };
}

/** At least one of username, name, password, class_id (moves the student to another of the teacher's classes). */
export const parseUpdateClassStudent = parseUpdateStudent;
