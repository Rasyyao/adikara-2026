import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileService } from "../../src/services/shared/profile.service.js";
import { IDS } from "../helpers/fake-database.js";
import { buildServices, failure } from "../helpers/services.js";

let service: ProfileService;

beforeAll(async () => {
  service = (await buildServices()).services.shared.profile;
});

describe("profile service (/auth/me)", () => {
  describe("success", () => {
    it("returns the current teacher", async () => {
      expect(await service.getProfile({ userId: IDS.teacher, role: "TEACHER", kind: "teacher" })).toEqual({
        id: IDS.teacher,
        role: "TEACHER",
        name: "Bu Guru",
      });
    });

    it("returns the current student", async () => {
      const user = await service.getProfile({ userId: IDS.student, role: "USER", kind: "student" });
      expect(user).toEqual({ id: IDS.student, role: "USER", name: "Siswa Satu" });
    });

    it("uses the stored role, not the token role", async () => {
      const user = await service.getProfile({ userId: IDS.teacher, role: "ADMIN", kind: "teacher" });
      expect(user.role).toBe("TEACHER");
    });
  });

  describe("failure", () => {
    it("rejects an account that no longer exists", async () => {
      expect(await failure(service.getProfile({ userId: "missing", role: "TEACHER", kind: "teacher" }))).toMatchObject({
        status: 401,
        code: "invalid_token",
      });
    });
  });
});
