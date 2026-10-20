import { AppError } from "../../http/errors.js";
import { hashPassword } from "../../lib/password.js";
import type { AdminTeacherRepository, TeacherRow } from "../../types/admin/teacher.types.js";
import { toPageView, type PageView } from "../shared/class-views.js";

export interface TeacherView {
  id: string;
  email: string;
  name: string;
  role: "TEACHER";
  class_count: number;
  created_at: string;
}

export interface TeacherInput {
  email: string;
  name: string;
  password: string;
}

/** Admin management of teacher accounts. Admin accounts are not managed here (they come from the seed). */
export interface AdminTeacherService {
  list(query: { limit: number; offset: number; search?: string }): Promise<PageView<TeacherView>>;
  get(id: string): Promise<{ teacher: TeacherView }>;
  create(input: TeacherInput): Promise<{ teacher: TeacherView }>;
  update(id: string, patch: Partial<TeacherInput>): Promise<{ teacher: TeacherView }>;
  remove(id: string): Promise<void>;
}

const toView = (row: TeacherRow): TeacherView => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: "TEACHER",
  class_count: row.classCount,
  created_at: row.createdAt.toISOString(),
});

const notFound = () => new AppError(404, "teacher_not_found", "Teacher not found");
const emailTaken = () => new AppError(409, "email_taken", "That email is already used by another account");

export function createAdminTeacherService(repository: AdminTeacherRepository, options: { bcryptCost: number }): AdminTeacherService {
  return {
    async list(query) {
      return toPageView(await repository.list(query), query, toView);
    },

    async get(id) {
      const row = await repository.findById(id);
      if (!row) throw notFound();
      return { teacher: toView(row) };
    },

    async create({ email, name, password }) {
      const result = await repository.create({ email, name, passwordHash: await hashPassword(password, options.bcryptCost) });
      if (result === "email_taken") throw emailTaken();
      return { teacher: toView(result) };
    },

    async update(id, { password, ...rest }) {
      const result = await repository.update(id, {
        ...rest,
        ...(password === undefined ? {} : { passwordHash: await hashPassword(password, options.bcryptCost) }),
      });
      if (result === "email_taken") throw emailTaken();
      if (!result) throw notFound();
      return { teacher: toView(result) };
    },

    async remove(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFound();
      const result = await repository.delete(id);
      if (result === "not_found") throw notFound();
      if (result === "in_use") {
        throw new AppError(409, "teacher_in_use", "This teacher still has classes or other data. Assign the classes to another teacher first.", {
          class_count: existing.classCount,
        });
      }
    },
  };
}
