import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createPrisma } from "./db/prisma.js";
import { createRepositories } from "./repositories/index.js";

async function main() {
  const config = loadConfig();
  const prisma = createPrisma(config.databaseUrl);

  const app = await createApp({
    config,
    pingDb: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    repositories: createRepositories(prisma),
  });

  app.listen(config.port, () => {
    console.log(`api listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
