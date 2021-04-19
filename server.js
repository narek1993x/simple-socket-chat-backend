require("dotenv").config();
const express = require("express");
const cors = require("cors");
const socketIO = require("socket.io");

const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: process.env.CHAT_ORIGIN,
  optionsSuccessStatus: 200,
};

const server = express()
  .use(cors(corsOptions))
  .options("*", cors())
  .get("/", (req, res) => res.send("Connected"))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketIO(server);

const mongoose = require("mongoose");
mongoose.set("useFindAndModify", false);

const SocketController = require("./controllers/Socket");

// Local DB
const MONGO_URI = `mongodb://localhost:27017/simple-socket-chat`;
const OPTS = {
  useNewUrlParser: true,
  useCreateIndex: true,
};

// if (!process.env.MONGO_URI) {
//   throw new Error("You must provide a MongoLab URI");
// }

mongoose.Promise = global.Promise;
mongoose.connect(MONGO_URI, OPTS);
mongoose.connection
  .once("open", () => console.log("Connected to MongoLab instance."))
  .on("error", (error) => console.log("Error connecting to MongoLab:", error));

const clients = {};

io.on("connection", (socket) => {
  const socketController = new SocketController(io, clients);
  socketController.initialize(socket);
});
