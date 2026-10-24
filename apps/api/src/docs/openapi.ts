import { labelOf } from "../http/middleware/label.js";
import type { Access } from "../http/middleware/access.js";
import { API_PREFIX } from "../routes/index.js";
import type { ResponseDoc, RouteDefinition, RouteGroup, RouteRole, SchemaObject } from "../routes/types.js";
import { ref, schemas } from "./schemas.js";

export const API_VERSION = "0.1.0";

type Json = Record<string, unknown>;

const ACCESS_TEXT: Record<Access, string> = {
  public: "no token needed",
  authenticated: "any logged-in account",
  student: "students only (role USER)",
  staff: "teachers and admins",
  admin: "admins only",
};

const ROLES: Record<RouteRole, { label: string; note: string }> = {
  admin: { label: "Admin", note: "Endpoints for admins only. Log in at `POST /auth/login` with an admin account." },
  teacher: { label: "Teacher", note: "Endpoints for teachers (admins can use them too). Log in at `POST /auth/login`." },
  student: { label: "Student", note: "Endpoints for students. Log in at `POST /auth/student/login`." },
  shared: { label: "Shared", note: "Endpoints that more than one role uses." },
};
const ROLE_ORDER: RouteRole[] = ["admin", "teacher", "student", "shared"];

/** The Swagger tag of a group: its role, then its feature, e.g. "Teacher · sessions". */
export function tagOf(group: RouteGroup): string {
  return `${ROLES[group.role].label} · ${group.feature}`;
}

const STANDARD_ERRORS: Record<number, ResponseDoc> = {
  400: {
    description: "Invalid request body (field errors are in `error.details.fields`) or malformed JSON.",
    example: {
      error: { code: "validation_error", message: "Request validation failed", details: { fields: { email: "must be a valid email address" } } },
    },
  },
  401: {
    description: "Missing, invalid or expired token.",
    example: { error: { code: "unauthenticated", message: "Authentication required" } },
  },
  403: {
    description: "Logged in, but the role is not allowed.",
    example: { error: { code: "forbidden", message: "You do not have access to this resource" } },
  },
  429: {
    description: "Too many attempts. Try again later.",
    example: { error: { code: "too_many_requests", message: "Too many attempts, try again later" } },
  },
  500: {
    description: "Unexpected server error.",
    example: { error: { code: "internal_error", message: "Internal server error" } },
  },
};

export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function operationId(route: RouteDefinition): string {
  return `${route.method}_${route.path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function jsonContent(schema: SchemaObject, example?: unknown, contentType = "application/json"): Json {
  return { [contentType]: { schema, ...(example !== undefined ? { example } : {}) } };
}

function responseObject(doc: ResponseDoc): Json {
  return {
    description: doc.description,
    ...(doc.schema || doc.example !== undefined
      ? { content: jsonContent(doc.schema ?? ref("ErrorResponse"), doc.example, doc.contentType) }
      : {}),
  };
}

function standardErrorCodes(route: RouteDefinition): number[] {
  const codes: number[] = [];
  // a body, a query string or a path parameter can all be malformed
  if (route.doc.requestBody || route.doc.query?.length || route.path.includes(":")) codes.push(400);
  if (route.access !== "public") codes.push(401);
  if (route.access === "student" || route.access === "staff" || route.access === "admin") codes.push(403);
  if ((route.middleware ?? []).some((m) => labelOf(m).startsWith("rate-limit"))) codes.push(429);
  codes.push(500);
  return codes;
}

function buildOperation(group: RouteGroup, route: RouteDefinition): Json {
  const { doc } = route;
  const responses: Json = {};

  for (const [status, response] of Object.entries(doc.responses)) responses[status] = responseObject(response);
  for (const code of standardErrorCodes(route)) {
    responses[code] ??= responseObject({ ...STANDARD_ERRORS[code], schema: ref("ErrorResponse") });
  }

  const pathParams = [...route.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  const queryParams = (doc.query ?? []).map((q) => ({ name: q.name, in: "query", required: false, description: q.description, schema: q.schema }));
  const middleware = (route.middleware ?? []).map(labelOf);
  const accessLine = `**For:** ${ROLES[group.role].label} · **Access:** ${route.access} (${ACCESS_TEXT[route.access]})`;
  const middlewareLine = middleware.length > 0 ? `\n\n**Middleware:** ${middleware.join(", ")}` : "";

  return {
    tags: [tagOf(group)],
    summary: doc.summary,
    description: `${doc.description ? `${doc.description}\n\n` : ""}${accessLine}${middlewareLine}`,
    operationId: operationId(route),
    ...(pathParams.length + queryParams.length > 0 ? { parameters: [...pathParams, ...queryParams] } : {}),
    ...(doc.requestBody
      ? {
          requestBody: {
            required: true,
            description: doc.requestBody.description,
            content: jsonContent(doc.requestBody.schema, doc.requestBody.example, doc.requestBody.contentType),
          },
        }
      : {}),
    security: route.access === "public" ? [] : [{ bearerAuth: [] }],
    responses,
    "x-access": route.access,
    "x-role": group.role,
  };
}

/** Tags in display order: Admin groups, then Teacher, Student and Shared. */
function buildTags(groups: RouteGroup[]): Json[] {
  return ROLE_ORDER.flatMap((role) =>
    groups
      .filter((group) => group.role === role)
      .map((group) => ({ name: tagOf(group), description: `${ROLES[role].note} ${group.description}` })),
  );
}

/** Builds the OpenAPI 3 document from the route groups, so the docs cannot drift from the real route table. */
export function buildOpenApi(groups: RouteGroup[]): Json {
  const paths: Record<string, Json> = {};
  for (const group of groups) {
    for (const route of group.routes) {
      const key = toOpenApiPath(route.path);
      paths[key] = { ...paths[key], [route.method]: buildOperation(group, route) };
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Adikara API",
      version: API_VERSION,
      description:
        "REST JSON API. Log in at `/auth/login` (or `/auth/student/login`), then press **Authorize** and paste the `access_token`.\n\n" +
        "Endpoints are grouped by role: **Admin**, **Teacher** (admins can use these too), **Student**, and **Shared** (more than one role).\n\n" +
        "**Seeded accounts** (run `pnpm seed`; every password is `ChangeMe-123`):\n\n" +
        "| Role | Login | Endpoint |\n|---|---|---|\n" +
        "| ADMIN | `admin@adikara.com` | /auth/login |\n" +
        "| TEACHER | `guru@example.com` | /auth/login |\n" +
        "| USER | `siswa.satu`, `siswa.dua` | /auth/student/login |\n\n" +
        "**Try the admin role:** log in as `admin@adikara.com`, then `POST /admin/teachers`, `POST /admin/classes` (with that teacher's `id` as `teacher_id`) and `POST /admin/students` (with the class `id` as `class_id`). " +
        "`GET /admin/classes` lists the seeded class and its id. Details: docs/admin.md.\n\n" +
        "**Try a live session:** log in as the teacher, `POST /sessions` with `{\"class_code\": \"KELAS7A\"}` and note the PIN; " +
        "log in as `siswa.satu` (second browser profile) and `POST /sessions/join` with the PIN. Details: docs/sessions.md.\n\n" +
        "Errors always look like `{ \"error\": { \"code\", \"message\", \"details\"? } }`.",
    },
    servers: [{ url: API_PREFIX, description: "This server" }],
    tags: buildTags(groups),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas,
    },
  };
}
