export interface Config {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtTtlMinutes: number;
  bcryptCost: number;
  loginRateLimitMax: number;
  loginRateLimitWindowMinutes: number;
  corsOrigins: string[];
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

  const config: Config = {
    nodeEnv: env.NODE_ENV ?? "development",
    port: readInt(env, "PORT", 8080, 1, 65535, problems),
    databaseUrl,
    jwtSecret,
    jwtTtlMinutes: readInt(env, "JWT_TTL_MINUTES", 60, 1, 1440, problems),
    bcryptCost: readInt(env, "BCRYPT_COST", 12, 4, 15, problems),
    loginRateLimitMax: readInt(env, "LOGIN_RATE_LIMIT_MAX", 10, 1, 1000, problems),
    loginRateLimitWindowMinutes: readInt(env, "LOGIN_RATE_LIMIT_WINDOW_MINUTES", 15, 1, 1440, problems),
    corsOrigins,
  };

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n- ${problems.join("\n- ")}`);
  }
  return config;
}
