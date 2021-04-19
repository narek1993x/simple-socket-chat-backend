const jwt = require("jsonwebtoken");
const UserController = require("./User");
const RoomController = require("./Room");
const MessageController = require("./Message");

const socketActions = {
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
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
  constructor(socketIO, clients) {
    this.clients = clients;
    this.addedUser = false;
    this.username = "";

    this.io = socketIO;
  }

  initialize(socket) {
    socket.on("disconnect", async () => {
      if (this.addedUser) {
        await UserController.updateStatus(this.username, false);

        socket.broadcast.emit("response", {
          action: socketActions.USER_LEFT,
          response: {
            users: await UserController.getAll(),
          },
        });

        this.deleteClient(socket);
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
    const newMessage = await this.requestMaker(MessageController, "addMessage", body);

    return socket.to(body.roomName).emit("response", {
      action,
      response: newMessage,
    });
  }

  async privateMessageHandler({ action, body }) {
    const newPrivateMessage = await this.requestMaker(MessageController, "addPrivateMessage", body);

    return this.directAction(action, body.username, newPrivateMessage);
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
    const roomMessages = await this.requestMaker(RoomController, "getRoomMessages", body.id);
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
    const privateMessages = await this.requestMaker(
      UserController,
      "getUserPrivateMessages",
      body.id,
      body.currentUserId,
    );

    return socket.emit("response", {
      action,
      response: privateMessages,
    });
  }

  async loginHandler({ socket, body, frontEndId }) {
    if (this.addedUser) return;

    this.username = body.username.toLowerCase();
    socket.username = this.username;

    this.clients[this.username] = {
      socket: socket.id,
    };

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
      this.addedUser = true;
      await this.loginSocket(socket, token, frontEndId);
    } catch (error) {
      this.addedUser = false;
      console.error("Error when add user: ", error);
    }
  }

  async loginWithTokenHandler({ socket, body, frontEndId }) {
    try {
      const currentUser = await this.loginSocket(socket, body.token, frontEndId, true);
      this.username = currentUser.username;
      socket.username = this.username;

      this.clients[this.username] = {
        socket: socket.id,
      };

      this.addedUser = true;
    } catch (error) {
      this.addedUser = false;
      console.error("Error when login_with_token: ", error);
    }
  }

  async loginSocket(socket, token, frontEndId, isFromToken) {
    const user = await this.getUserByToken(token);

    if (isFromToken) {
      await this.requestMaker(UserController, "updateStatus", user.username, true);
    }

    const users = await this.requestMaker(UserController, "getAll");
    const rooms = await this.requestMaker(RoomController, "getAll");

    let currentUser;
    if (user && user.username) {
      currentUser = users.find((u) => u.username === user.username);
    }

    socket.emit("response", {
      action: socketActions.LOGIN,
      frontEndId,
      response: {
        users,
        rooms,
        currentUser,
        token,
      },
    });

    socket.broadcast.emit("response", {
      action: socketActions.USER_JOINED,
      response: {
        users,
      },
    });

    return currentUser;
  }

  async getUserByToken(token) {
    if (!token) {
      console.error("getUserByToken: token is not defined");
      return;
    }

    try {
      return await jwt.verify(token, process.env.SECRET);
    } catch (error) {
      throw new AuthenticationError("Your session has ended. Please sign in again.");
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

  directAction(action, username, response) {
    if (this.clients[username]) {
      this.io.sockets.connected[this.clients[username].socket].emit("response", {
        action,
        response,
      });
    } else {
      console.log("User does not exist or offline:" + username);
    }
  }

  deleteClient(socket) {
    for (let name in this.clients) {
      if (this.clients[name].socket === socket.id) {
        delete this.clients[name];
        break;
      }
    }
  }

  errorSender(error) {
    const username = this.username;
    const clients = this.clients;

    this.io.sockets.connected[clients[username].socket].emit("response", {
      action: socketActions.ERROR,
      error: error.toString(),
    });
  }
}

module.exports = SocketController;
