import { DataTypes } from "sequelize";

/** @param {import("sequelize").QueryInterface} qi */
export async function up(qi) {
  await qi.createTable("refresh_tokens", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    token_hash: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Fast lookup by hash (logout / refresh queries)
  await qi.addIndex("refresh_tokens", ["token_hash"], {
    name: "refresh_tokens_token_hash_idx",
    unique: true,
  });

  // TTL cleanup: find all expired tokens quickly
  await qi.addIndex("refresh_tokens", ["expires_at"], {
    name: "refresh_tokens_expires_at_idx",
  });
}

export async function down(qi) {
  await qi.dropTable("refresh_tokens");
}
