/**
 * Database migration runner.
 *
 * Executes SQL migration files in order inside a `migrations` table used
 * as a ledger of applied migrations. Safe to run multiple times — already-
 * applied migrations are skipped.
 *
 * Usage (from auth/src/index.js):
 *   import { runMigrations } from "./lib/migrate.js";
 *   await runMigrations(sequelize);
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { QueryTypes } from "sequelize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

/**
 * @param {import("sequelize").Sequelize} sequelize
 */
export async function runMigrations(sequelize) {
  // Ensure the migrations ledger table exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);

  // Load migration files sorted by name (alphanumeric order = chronological)
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

  for (const file of files) {
    const already = await sequelize.query(
      "SELECT 1 FROM _migrations WHERE name = :name",
      { replacements: { name: file }, type: QueryTypes.SELECT }
    );

    if (already.length > 0) {
      console.log(`[migrate] Already applied: ${file}`);
      continue;
    }

    console.log(`[migrate] Applying: ${file}`);
    const { up } = await import(path.join(MIGRATIONS_DIR, file));
    await up(sequelize.getQueryInterface(), sequelize);
    await sequelize.query(
      "INSERT INTO _migrations (name) VALUES (:name)",
      { replacements: { name: file } }
    );
    console.log(`[migrate] Done: ${file}`);
  }
}
