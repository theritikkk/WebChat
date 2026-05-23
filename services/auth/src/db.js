import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn("DATABASE_URL is not set; auth service will fail to connect.");
}

export const sequelize = new Sequelize(databaseUrl || "postgres://webchat:webchat@127.0.0.1:5432/webchat", {
  logging: false,
  define: { underscored: true }
});
