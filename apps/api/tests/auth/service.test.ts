import { beforeAll, describe, expect, it } from "vitest";
import { createAuthService, type AuthService } from "../../src/services/auth.service.js";
import { createTokenService } from "../../src/lib/token.js";
import { TEST_SECRET } from "../helpers/config.js";
import { IDS, PASSWORDS, createFakeRepository, type FakeRepository } from "../helpers/fake-repository.js";

const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 3600 });
let repository: FakeRepository;
let service: AuthService;

beforeAll(async () => {
  repository = await createFakeRepository();
  service = await createAuthService(repository, tokens, { bcryptCost: 4 });
});

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("expected rejection");
    },
    (err) => err as { status: number; code: string; message: string },
  );
}

describe("auth service", () => {
  describe("success cases", () => {
    it("logs a teacher in and issues a TEACHER token", async () => {
      const result = await service.loginTeacher("teacher@example.com", PASSWORDS.teacher);
      expect(result).toMatchObject({ token_type: "Bearer", expires_in: 3600, user: { id: IDS.teacher, role: "TEACHER" } });
      expect(tokens.verify(result.access_token)).toEqual({ userId: IDS.teacher, role: "TEACHER", kind: "teacher" });
    });

    it("logs an admin in through the teacher login", async () => {
      const result = await service.loginTeacher("admin@example.com", PASSWORDS.admin);
      expect(result.user.role).toBe("ADMIN");
      expect(tokens.verify(result.access_token).role).toBe("ADMIN");
    });

    it("logs a student in and issues a USER token", async () => {
      const result = await service.loginStudent("siswa.satu", PASSWORDS.student);
      expect(result.user).toEqual({ id: IDS.student, role: "USER", name: "Siswa Satu" });
      expect(tokens.verify(result.access_token)).toEqual({ userId: IDS.student, role: "USER", kind: "student" });
    });

    it("never exposes the password hash", async () => {
      const result = await service.loginTeacher("teacher@example.com", PASSWORDS.teacher);
      expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$|password/i);
    });

    it("returns the current profile for a valid context", async () => {
      const user = await service.getProfile({ userId: IDS.teacher, role: "TEACHER", kind: "teacher" });
      expect(user).toEqual({ id: IDS.teacher, role: "TEACHER", name: "Bu Guru" });
    });
  });

  describe("failure cases", () => {
    it("rejects a wrong teacher password", async () => {
      const err = await failure(service.loginTeacher("teacher@example.com", "wrong-pass-1"));
      expect(err).toMatchObject({ status: 401, code: "invalid_credentials" });
    });

    it("rejects a wrong student password", async () => {
      const err = await failure(service.loginStudent("siswa.satu", "wrong-pass-1"));
      expect(err).toMatchObject({ status: 401, code: "invalid_credentials" });
    });

    it("gives an unknown account the same error as a wrong password", async () => {
      const wrongPassword = await failure(service.loginTeacher("teacher@example.com", "wrong-pass-1"));
      const unknown = await failure(service.loginTeacher("ghost@example.com", "wrong-pass-1"));
      expect(unknown.status).toBe(wrongPassword.status);
      expect(unknown.code).toBe(wrongPassword.code);
      expect(unknown.message).toBe(wrongPassword.message);
    });

    it("rejects an account that has no password set", async () => {
      const err = await failure(service.loginStudent("siswa.anon", "anything-1"));
      expect(err.code).toBe("invalid_credentials");
    });

    it("does not let a student log in as a teacher", async () => {
      repository.teachersById.set("x", { id: "x", role: "USER", name: "Odd", passwordHash: repository.studentsById.get(IDS.student)!.passwordHash });
      const odd = { ...repository, findTeacherByEmail: async () => repository.teachersById.get("x")! };
      const oddService = await createAuthService(odd, tokens, { bcryptCost: 4 });
      const err = await failure(oddService.loginTeacher("odd@example.com", PASSWORDS.student));
      expect(err.code).toBe("invalid_credentials");
      repository.teachersById.delete("x");
    });

    it("rejects the profile of an account that no longer exists", async () => {
      const err = await failure(service.getProfile({ userId: "missing", role: "TEACHER", kind: "teacher" }));
      expect(err).toMatchObject({ status: 401, code: "invalid_token" });
    });

    it("uses the stored role, not the token role, for the profile", async () => {
      const user = await service.getProfile({ userId: IDS.teacher, role: "ADMIN", kind: "teacher" });
      expect(user.role).toBe("TEACHER");
    });
  });
});
