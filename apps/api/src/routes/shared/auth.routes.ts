import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import type { ProfileService } from "../../services/shared/profile.service.js";
import type { RouteGroup } from "../types.js";

export function sharedAuthRoutes(service: ProfileService): RouteGroup {
  return {
    role: "shared",
    feature: "auth",
    description: "The logged-in account, for any role.",
    routes: [
      {
        method: "get",
        path: "/auth/me",
        access: "authenticated",
        handler: async (req, res) => {
          res.json({ user: await service.getProfile(requireAuth(req)) });
        },
        doc: {
          summary: "Current user",
          description: "Reads the account from the database, so the role is always current.",
          responses: { 200: { description: "The logged-in user", schema: ref("MeResponse") } },
        },
      },
    ],
  };
}
