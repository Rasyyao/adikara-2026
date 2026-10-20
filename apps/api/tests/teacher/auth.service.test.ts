import { beforeAll, describe, expect, it } from "vitest";
import { createCredentialChecker } from "../../src/services/shared/credentials.js";
import { createTeacherAuthService, type TeacherAuthService } from "../../src/services/teacher/auth.service.js";
import { createTokenService } from "../../src/lib/token.js";
import { TEST_SECRET } from "../helpers/config.js";
import { IDS, PASSWORDS } from "../helpers/fake-database.js";
import { buildServices, failure } from "../helpers/services.js";

const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 3600 });
let service: TeacherAuthService;

beforeAll(async () => {
  service = (await buildServices()).services.teacher.auth;
});

describe("teacher auth service (login for teachers and admins)", () => {
  describe("success", () => {
    it("logs a teacher in and issues a TEACHER token", async () => {
      const result = await service.login("teacher@example.com", PASSWORDS.teacher);
      expect(result).toMatchObject({ token_type: "Bearer", expires_in: 3600, user: { id: IDS.teacher, role: "TEACHER" } });
      expect(tokens.verify(result.access_token)).toEqual({ userId: IDS.teacher, role: "TEACHER", kind: "teacher" });
    });

    it("logs an admin in through the same login", async () => {
      const result = await service.login("admin@example.com", PASSWORDS.admin);
      expect(result.user.role).toBe("ADMIN");
      expect(tokens.verify(result.access_token).role).toBe("ADMIN");
    });

    it("never exposes the password hash", async () => {
      const result = await service.login("teacher@example.com", PASSWORDS.teacher);
      expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$|password/i);
    });
  });

  describe("failure", () => {
    it("rejects a wrong password", async () => {
      expect(await failure(service.login("teacher@example.com", "wrong-pass-1"))).toMatchObject({ status: 401, code: "invalid_credentials" });
    });

    it("gives an unknown account the same error as a wrong password", async () => {
      const wrongPassword = await failure(service.login("teacher@example.com", "wrong-pass-1"));
      const unknown = await failure(service.login("ghost@example.com", "wrong-pass-1"));
      expect(unknown).toMatchObject({ status: wrongPassword.status, code: wrongPassword.code, message: wrongPassword.message });
    });

    it("does not let an account with a student role log in as a teacher", async () => {
      const credentials = await createCredentialChecker(tokens, { bcryptCost: 4 });
      const { db } = await buildServices();
      const oddRepository = {
        async findByEmail() {
          return { id: "x", role: "USER" as const, name: "Odd", passwordHash: db.studentsById.get(IDS.student)!.passwordHash };
        },
      };
      const odd = createTeacherAuthService(oddRepository, credentials);
      expect((await failure(odd.login("odd@example.com", PASSWORDS.student))).code).toBe("invalid_credentials");
    });
  });
});
