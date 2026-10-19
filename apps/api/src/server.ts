import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createPrisma } from "./db/prisma.js";
import { createAuthRepository } from "./repositories/auth.repository.js";

async function main() {
  const config = loadConfig();
  const prisma = createPrisma(config.databaseUrl);

  const app = await createApp({
    config,
    pingDb: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    authRepository: createAuthRepository(prisma),
  });

  app.listen(config.port, () => {
    console.log(`api listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
