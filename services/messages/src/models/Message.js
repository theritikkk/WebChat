import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    delivered_at: { type: Date },
    read_at: { type: Date }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    room_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true },
    username: { type: String },
    message_type: { type: String, enum: ["text", "image", "file", "system"], default: "text" },
    content: { type: String, default: "" },
    file_url: { type: String },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    // Delivery & read receipts
    deliveries: { type: [deliverySchema], default: [] },
    status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" }
  },
  { timestamps: { createdAt: "timestamp", updatedAt: "updated_at" } }
);

messageSchema.index({ room_id: 1, timestamp: -1 });
messageSchema.index({ room_id: 1, "deliveries.user_id": 1 });

export const Message = mongoose.model("Message", messageSchema);
