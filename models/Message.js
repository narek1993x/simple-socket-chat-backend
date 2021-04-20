const mongoose = require("mongoose");
const { UserModel } = require("./User");
const { RoomModel } = require("./Room");
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  message: {
    type: String,
    required: true,
  },
  createdDate: {
    type: Date,
    default: Date.now,
  },
  room: {
    type: Schema.Types.ObjectId,
    required: false,
    ref: "Room",
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  to: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
});

let MessageModel;

MessageSchema.statics.addPrivateMessage = async function ({ message, userId, directUserId }) {
  if (!userId || !directUserId) return;

  try {
    const newMessage = await new MessageModel({
      message,
      createdBy: userId,
      to: directUserId,
    }).save();

    const withOwner = await MessageModel.findById(newMessage._id).populate({
      path: "createdBy",
      model: "User",
      select: "username",
    });

    await UserModel.addPrivateMessages(userId, newMessage._id);
    await UserModel.addPrivateMessages(directUserId, newMessage._id);
    await UserModel.addUnseenMessages(directUserId, userId);

    return withOwner;
  } catch (error) {
    console.error("error when create direct message and update user", error);
  }
};

MessageSchema.statics.addMessage = async function ({ message, userId, roomId }) {
  if (!userId || !roomId) return;

  try {
    const newMessage = await new MessageModel({
      message,
      createdBy: userId,
      room: roomId,
    }).save();

    const withOwner = await MessageModel.findById(newMessage._id).populate({
      path: "createdBy",
      model: "User",
      select: "username",
    });

    await RoomModel.findOneAndUpdate({ _id: roomId }, { $addToSet: { messages: newMessage._id } }, { new: true });

    return withOwner;
  } catch (error) {
    console.error("error when create new message and update user", error);
  }
};

MessageModel = mongoose.model("Message", MessageSchema);

module.exports = {
  MessageModel,
  MessageSchema,
};
