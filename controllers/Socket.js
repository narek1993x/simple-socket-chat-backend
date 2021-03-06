const jwt = require("jsonwebtoken");
const UserController = require("./User");
const RoomController = require("./Room");
const MessageController = require("./Message");

const socketActions = {
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  USER_UPDATE: "user_update",
  LOGIN: "login",
  ERROR: "error",
};

const socketActionMethods = {
  message: "messageHandler",
  private_message: "privateMessageHandler",
  add_room: "addRoomHandler",
  subscribe_room: "subscribeRoomHandler",
  subscribe_user: "subscribeUserHandler",
  leave_room: "leaveRoomHandler",
  login: "loginHandler",
  login_with_token: "loginWithTokenHandler",
  typing: "typingHandler",
  stop_typing: "typingHandler",
};

class SocketController {
  constructor(socketIO, clients, subscribedUsers) {
    this.clients = clients;
    this.subscribedUsers = subscribedUsers;
    this.addedUser = false;
    this.username = "";

    this.socket = null;
    this.io = socketIO;
  }

  initialize(socket) {
    this.socket = socket;

    socket.on("disconnect", async () => {
      if (this.addedUser) {
        await UserController.updateStatus(this.username, false);

        socket.broadcast.emit("response", {
          action: socketActions.USER_LEFT,
          response: {
            users: await UserController.getAll(),
          },
        });

        this.deleteClient();
      }
    });

    socket.on("query", ({ action, body, frontEndId }) => {
      if (this[socketActionMethods[action]]) {
        const params = {
          socket,
          action,
          body,
          frontEndId,
        };

        this[socketActionMethods[action]](params);
      } else {
        console.log("No such action method in SocketController", action);
      }
    });
  }

  async messageHandler({ socket, action, body }) {
    const message = await this.requestMaker(MessageController, "addMessage", body);

    return socket.to(body.roomName).emit("response", {
      action,
      response: message,
    });
  }

  async privateMessageHandler({ action, body }) {
    const isUpdateUnseen = !this.subscribedUsers.some((s) => s.who === body.directUserId && s.whom === body.userId);
    const message = await this.requestMaker(MessageController, "addPrivateMessage", body);

    if (isUpdateUnseen) {
      await this.requestMaker(UserController, "addUnseenMessages", body.directUserId, body.userId);
      const { unseenMessages } = await this.requestMaker(UserController, "getUserUnseenMessages", body.directUserId);
      return this.directAction(socketActions.USER_UPDATE, body.username, { unseenMessages });
    }

    return this.directAction(action, body.username, message);
  }

  typingHandler({ socket, action, body }) {
    if (body.isDirect) {
      return this.directAction(action, body.username, {
        username: this.username,
        direct: true,
      });
    }

    return socket.to(body.roomName).emit("response", {
      action,
      response: {
        username: this.username,
        roomName: body.roomName,
      },
    });
  }

  async addRoomHandler({ action, body, frontEndId }) {
    const newRoom = await this.requestMaker(RoomController, "addRoom", body);

    return this.io.emit("response", {
      action,
      response: newRoom,
      frontEndId,
    });
  }

  async subscribeRoomHandler({ socket, action, body }) {
    this.subscribedUsersUpdates(body.currentUserId, body.roomId);

    const roomMessages = await this.requestMaker(RoomController, "getRoomMessages", body.roomId);
    socket.join(body.roomName);

    return socket.emit("response", {
      action,
      response: roomMessages,
    });
  }

  leaveRoomHandler({ socket, body }) {
    return socket.leave(body.roomName);
  }

  async subscribeUserHandler({ socket, action, body }) {
    this.subscribedUsersUpdates(body.currentUserId, body.id);

    const privateMessages = await this.requestMaker(
      UserController,
      "getUserPrivateMessages",
      body.id,
      body.currentUserId,
    );
    await this.requestMaker(UserController, "resetUnseenMessages", body.currentUserId, body.id);

    return socket.emit("response", {
      action,
      response: privateMessages,
    });
  }

  async loginHandler({ body, frontEndId }) {
    this.username = body.username.toLowerCase();

    let token;
    if (body.isSignin) {
      token = await this.requestMaker(UserController, "signin", { username: this.username, password: body.password });
    } else {
      token = await this.requestMaker(UserController, "signup", {
        username: this.username,
        password: body.password,
        email: body.email,
      });
    }

    try {
      await this.loginSocket(token, frontEndId);
      this.addNewUser(this.username);
    } catch (error) {
      console.error("Error in loginHandler: ", error);
    }
  }

  async loginWithTokenHandler({ body, frontEndId }) {
    try {
      const currentUser = await this.loginSocket(body.token, frontEndId, true);
      this.username = currentUser.username;
      this.addNewUser(this.username);
    } catch (error) {
      console.error("Error in loginWithTokenHandler: ", error);
    }
  }

  async loginSocket(token, frontEndId, isFromToken) {
    const user = await this.getUserByToken(token);

    if (isFromToken) {
      await this.requestMaker(UserController, "updateStatus", user.username, true);
    }

    const users = await this.requestMaker(UserController, "getAll", ["username", "unseenMessages", "online"]);
    const rooms = await this.requestMaker(RoomController, "getAll", ["name"]);

    let currentUser;
    if (user && user.username) {
      currentUser = users.find((u) => u.username === user.username);
      // Reset user old subscription
      this.subscribedUsersUpdates(currentUser._id.toString(), null);
    }

    this.socket.emit("response", {
      action: socketActions.LOGIN,
      frontEndId,
      response: {
        users,
        rooms,
        currentUser,
        token,
      },
    });

    this.socket.broadcast.emit("response", {
      action: socketActions.USER_JOINED,
      response: {
        users,
      },
    });

    return currentUser;
  }

  async getUserByToken(token) {
    try {
      return await jwt.verify(token, process.env.SECRET);
    } catch (error) {
      this.errorSender("Your session has ended. Please sign in again.");
      throw error;
    }
  }

  async requestMaker(Controller, method, ...params) {
    try {
      return await Controller[method](...params);
    } catch (error) {
      this.errorSender(error);
      throw error;
    }
  }

  subscribedUsersUpdates(who, whom) {
    const whoIndex = this.subscribedUsers.findIndex((s) => s.who === who);
    const subscribe = {
      who,
      whom,
    };

    if (whoIndex !== -1) {
      this.subscribedUsers[whoIndex] = subscribe;
    } else {
      this.subscribedUsers.push(subscribe);
    }
  }

  addNewUser(username) {
    this.addedUser = true;
    this.socket.username = username;
    this.clients[username] = {
      socketId: this.socket.id,
    };
  }

  deleteClient() {
    for (let name in this.clients) {
      if (this.clients[name].socketId === this.socket.id) {
        delete this.clients[name];
        break;
      }
    }
  }

  directAction(action, username, response) {
    if (this.clients[username]) {
      this.io.sockets.connected[this.clients[username].socketId].emit("response", {
        action,
        response,
      });
    } else {
      console.info("directAction: User does not exist or offline: " + username);
    }
  }

  errorSender(error) {
    this.socket.emit("response", {
      action: socketActions.ERROR,
      error: error.toString(),
    });
  }
}

module.exports = SocketController;
