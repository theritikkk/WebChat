import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    username: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    avatar_url: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM("online", "offline", "away"), defaultValue: "offline" },
    last_seen: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: "users", timestamps: true, createdAt: "created_at", updatedAt: false }
);

export const Room = sequelize.define(
  "Room",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    room_type: { type: DataTypes.ENUM("public", "private", "direct"), allowNull: false, defaultValue: "public" },
    created_by: { type: DataTypes.UUID, allowNull: false }
  },
  { tableName: "rooms", timestamps: true, createdAt: "created_at", updatedAt: false }
);

export const RoomMember = sequelize.define(
  "RoomMember",
  {
    room_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    role: { type: DataTypes.ENUM("admin", "member"), defaultValue: "member" }
  },
  { tableName: "room_members", timestamps: false }
);

export const RefreshToken = sequelize.define(
  "RefreshToken",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.STRING(128), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false }
  },
  { tableName: "refresh_tokens", timestamps: false }
);

User.hasMany(RefreshToken, { foreignKey: "user_id" });
RefreshToken.belongsTo(User, { foreignKey: "user_id" });

User.hasMany(Room, { foreignKey: "created_by", sourceKey: "id", as: "createdRooms" });
Room.belongsTo(User, { foreignKey: "created_by", as: "creator" });

Room.belongsToMany(User, { through: RoomMember, foreignKey: "room_id", otherKey: "user_id" });
User.belongsToMany(Room, { through: RoomMember, foreignKey: "user_id", otherKey: "room_id" });

RoomMember.belongsTo(Room, { foreignKey: "room_id" });
RoomMember.belongsTo(User, { foreignKey: "user_id" });
