const { RoomModel } = require("../models/Room");

class RoomController {
  static async getAll(selectFields) {
    if (Array.isArray(selectFields)) {
      return await RoomModel.find({}).select(selectFields);
    }

    return await RoomModel.find({});
  }

  static async addRoom(params) {
    return await RoomModel.addRoom(params);
  }

  static async getRoomMessages(roomId) {
    const room = await RoomModel.findById(roomId)
      .select("messages")
      .populate({
        path: "messages",
        model: "Message",
        populate: {
          path: "createdBy",
          model: "User",
          select: "username",
        },
      });

    return room.messages;
  }
}

module.exports = RoomController;
