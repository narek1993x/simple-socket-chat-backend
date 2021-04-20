const { UserModel } = require("../models/User");

class UserController {
  static async getAll(selectFields) {
    if (Array.isArray(selectFields)) {
      return await UserModel.find({}).select(selectFields);
    }

    return await UserModel.find({});
  }

  static async signin({ username, password }) {
    return await UserModel.signin({ username, password });
  }

  static async signup({ username, password, email }) {
    return await UserModel.signup({ username, password, email });
  }

  static async updateStatus(username, online) {
    return await UserModel.findOneAndUpdate({ username }, { $set: { online } }, { new: true });
  }

  static async getUserPrivateMessages(userId, currentUserId) {
    const user = await UserModel.findById(userId)
      .select("privateMessages")
      .populate({
        path: "privateMessages",
        model: "Message",
        match: { $or: [{ createdBy: currentUserId }, { to: currentUserId }] },
        populate: {
          path: "createdBy",
          model: "User",
          select: "username",
        },
      });

    return user.privateMessages;
  }

  static async getUserUnseenMessages(userId) {
    return await UserModel.findById(userId).select("unseenMessages");
  }

  static async resetUnseenMessages(userId, fromUserId) {
    return await UserModel.resetUnseenMessages(userId, fromUserId);
  }
}

module.exports = UserController;
