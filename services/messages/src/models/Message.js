import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    room_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true },
    username: { type: String },
    message_type: { type: String, enum: ["text", "image", "file"], default: "text" },
    content: { type: String, default: "" },
    file_url: { type: String },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }
  },
  { timestamps: { createdAt: "timestamp", updatedAt: "updated_at" } }
);

messageSchema.index({ room_id: 1, timestamp: -1 });

export const Message = mongoose.model("Message", messageSchema);
