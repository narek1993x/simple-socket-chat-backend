const jwt = require("jsonwebtoken");
const UserController = require("./controllers/User");
const RoomController = require("./controllers/Room");

// Verify JWT Token passed from client
const getUser = async (token) => {
  if (token) {
    try {
      return await jwt.verify(token, process.env.SECRET);
    } catch (error) {
      throw new AuthenticationError("Your session has ended. Please sign in again.");
    }
  }
};

const loginSocket = async (socket, token, frontEndId, isFromToken) => {
  const user = await getUser(token);

  if (isFromToken) {
    await UserController.updateStatus(user.username, true);
  }

  const users = await UserController.getAll();
  const rooms = await RoomController.getAll();

  let currentUser;
  if (user && user.username) {
    currentUser = users.find((u) => u.username === user.username);
  }

  socket.emit("response", {
    action: "login",
    frontEndId,
    response: {
      users,
      rooms,
      currentUser,
      token,
    },
  });

  socket.broadcast.emit("response", {
    action: "user_joined",
    response: {
      users,
    },
  });

  return currentUser;
};

module.exports = {
  loginSocket,
};
