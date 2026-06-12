import { DataTypes } from "sequelize";

/** @param {import("sequelize").QueryInterface} qi */
export async function up(qi) {
  await qi.createTable("rooms", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    room_type: {
      type: DataTypes.ENUM("public", "private", "direct"),
      allowNull: false,
      defaultValue: "public",
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.createTable("room_members", {
    room_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: "rooms", key: "id" },
      onDelete: "CASCADE",
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    role: {
      type: DataTypes.ENUM("admin", "member"),
      defaultValue: "member",
    },
  });
}

export async function down(qi) {
  await qi.dropTable("room_members");
  await qi.dropTable("rooms");
}
