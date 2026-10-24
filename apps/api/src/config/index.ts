export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface Config {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtTtlMinutes: number;
  bcryptCost: number;
  loginRateLimitMax: number;
  loginRateLimitWindowMinutes: number;
  /** Attempts per student at joining a live session with a PIN. */
  joinRateLimitMax: number;
  joinRateLimitWindowMinutes: number;
  /** A live session closes by itself this long after it was created. */
  sessionTtlMinutes: number;
  /** A student whose stream drops is marked as left only after this many seconds without reconnecting. */
  sessionPresenceGraceSeconds: number;
  /** Largest material a teacher may upload, in bytes. */
  uploadMaxBytes: number;
  /** Cloudflare R2 (S3 API). Null when not configured: uploads then answer 503, everything else works. */
  storage: StorageConfig | null;
  corsOrigins: string[];
  /** Serve Swagger UI at /docs. Off in production unless DOCS_ENABLED=true. */
  docsEnabled: boolean;
}

function readInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
  problems: string[],
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${key} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return value;
}

/** Reads and validates the environment once. Throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? "";
  if (!databaseUrl) problems.push("DATABASE_URL is required");

  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    problems.push("JWT_SECRET is required and must be at least 32 characters (openssl rand -base64 48)");
  }

  const corsOrigins = (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes("*")) {
    problems.push("CORS_ALLOWED_ORIGINS must list explicit origins, not *");
  }

  const r2 = {
    accountId: env.R2_ACCOUNT_ID ?? "",
    accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: env.R2_BUCKET ?? "",
  };
  const r2Set = Object.values(r2).filter(Boolean).length;
  if (r2Set > 0 && r2Set < 4) {
    problems.push("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set together");
  }

  const nodeEnv = env.NODE_ENV ?? "development";
  const docsFlag = env.DOCS_ENABLED;
  if (docsFlag !== undefined && docsFlag !== "" && docsFlag !== "true" && docsFlag !== "false") {
    problems.push("DOCS_ENABLED must be true or false");
  }

  const config: Config = {
    nodeEnv,
    port: readInt(env, "PORT", 8080, 1, 65535, problems),
    databaseUrl,
    jwtSecret,
    jwtTtlMinutes: readInt(env, "JWT_TTL_MINUTES", 60, 1, 1440, problems),
    bcryptCost: readInt(env, "BCRYPT_COST", 12, 4, 15, problems),
    loginRateLimitMax: readInt(env, "LOGIN_RATE_LIMIT_MAX", 10, 1, 1000, problems),
    loginRateLimitWindowMinutes: readInt(env, "LOGIN_RATE_LIMIT_WINDOW_MINUTES", 15, 1, 1440, problems),
    joinRateLimitMax: readInt(env, "JOIN_RATE_LIMIT_MAX", 10, 1, 1000, problems),
    joinRateLimitWindowMinutes: readInt(env, "JOIN_RATE_LIMIT_WINDOW_MINUTES", 1, 1, 1440, problems),
    sessionTtlMinutes: readInt(env, "SESSION_TTL_MINUTES", 240, 5, 1440, problems),
    sessionPresenceGraceSeconds: readInt(env, "SESSION_PRESENCE_GRACE_SECONDS", 10, 0, 600, problems),
    uploadMaxBytes: readInt(env, "UPLOAD_MAX_MB", 20, 1, 100, problems) * 1024 * 1024,
    storage: r2Set === 4 ? r2 : null,
    corsOrigins,
    docsEnabled: docsFlag ? docsFlag === "true" : nodeEnv !== "production",
  };

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n- ${problems.join("\n- ")}`);
  }
  return config;
}
