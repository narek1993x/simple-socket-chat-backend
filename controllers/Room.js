const { RoomModel } = require("../models/Room");

class RoomController {
  static async getAll() {
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
        },
      });

    return room.messages;
  }
}

module.exports = RoomController;
