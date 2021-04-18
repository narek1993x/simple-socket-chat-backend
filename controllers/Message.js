const { MessageModel } = require("../models/Message");

class MessageController {
  static async addMessage(params) {
    return await MessageModel.addMessage(params);
  }

  static async addPrivateMessage(params) {
    return await MessageModel.addPrivateMessage(params);
  }
}

module.exports = MessageController;
