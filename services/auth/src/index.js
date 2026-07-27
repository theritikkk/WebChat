import "./tracing.js"; // must be first — patches Node http/net before other imports
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { app } from "./app.js";
import { sequelize } from "./db.js";
import { runMigrations } from "./lib/migrate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT_AUTH) || 3001;

async function main() {
  // Run SQL migrations (safe to re-run — already-applied ones are skipped)
  await runMigrations(sequelize);
  app.listen(PORT, () => {
    console.log(`Auth service listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
