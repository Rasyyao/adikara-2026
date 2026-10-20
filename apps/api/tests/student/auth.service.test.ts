import { beforeAll, describe, expect, it } from "vitest";
import { createTokenService } from "../../src/lib/token.js";
import type { StudentAuthService } from "../../src/services/student/auth.service.js";
import { TEST_SECRET } from "../helpers/config.js";
import { IDS, PASSWORDS } from "../helpers/fake-database.js";
import { buildServices, failure } from "../helpers/services.js";

const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 3600 });
let service: StudentAuthService;

beforeAll(async () => {
  service = (await buildServices()).services.student.auth;
});

describe("student auth service", () => {
  describe("success", () => {
    it("logs a student in and issues a USER token", async () => {
      const result = await service.login("siswa.satu", PASSWORDS.student);
      expect(result.user).toEqual({ id: IDS.student, role: "USER", name: "Siswa Satu" });
      expect(tokens.verify(result.access_token)).toEqual({ userId: IDS.student, role: "USER", kind: "student" });
    });
  });

  describe("failure", () => {
    it("rejects a wrong password", async () => {
      expect(await failure(service.login("siswa.satu", "wrong-pass-1"))).toMatchObject({ status: 401, code: "invalid_credentials" });
    });

    it("rejects an unknown username with the same error", async () => {
      expect(await failure(service.login("ghost", "wrong-pass-1"))).toMatchObject({ status: 401, code: "invalid_credentials" });
    });

    it("rejects an account that has no password set", async () => {
      expect((await failure(service.login("siswa.anon", "anything-1"))).code).toBe("invalid_credentials");
    });

    it("does not log a teacher in through the student login", async () => {
      expect((await failure(service.login("teacher@example.com", PASSWORDS.teacher))).code).toBe("invalid_credentials");
    });
  });
});
