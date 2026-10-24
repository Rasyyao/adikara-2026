import { describe, expect, it } from "vitest";
import { createObjectStorage } from "../../src/lib/storage.js";

describe("object storage", () => {
  describe("success", () => {
    it("builds a client from R2 settings without calling the network", () => {
      const storage = createObjectStorage({ accountId: "acc", accessKeyId: "id", secretAccessKey: "secret", bucket: "b" });
      expect(typeof storage.put).toBe("function");
      expect(typeof storage.remove).toBe("function");
    });

    it("removing with no storage configured is a no-op (cleanup must never throw)", async () => {
      await expect(createObjectStorage(null).remove("anything")).resolves.toBeUndefined();
    });
  });

  describe("failure", () => {
    it("putting with no storage configured answers 503 storage_unavailable", async () => {
      await expect(createObjectStorage(null).put("k", Buffer.from("x"), "application/pdf")).rejects.toMatchObject({
        status: 503,
        code: "storage_unavailable",
      });
    });
  });
});
