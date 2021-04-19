const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const md5 = require("md5");
const jwt = require("jsonwebtoken");
const Schema = mongoose.Schema;

const createToken = ({ username, email }, secret, expiresIn) => {
  return jwt.sign({ username, email }, secret, { expiresIn });
};

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    trim: true,
  },
  avatar: {
    type: String,
  },
  online: {
    type: Boolean,
    default: false,
  },
  joinDate: {
    type: Date,
    default: Date.now,
  },
  privateMessages: [
    {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Message",
    },
  ],
  unseenMessages: [
    {
      from: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      count: { type: Number, default: 0 },
      required: false,
    },
  ],
});

// Create and add avatar to user

UserSchema.pre("save", function (next) {
  this.avatar = `http://gravatar.com/avatar/${md5(this.username)}?d=identicon`;
  next();
});

// The user's password is never saved in plain text.  Prior to saving the
// user model, we 'salt' and 'hash' the users password.  This is a one way
// procedure that modifies the password - the plain text password cannot be
// derived from the salted + hashed version. See 'comparePassword' to understand
// how this is used.
UserSchema.pre("save", function (next) {
  const user = this;
  if (!user.isModified("password")) {
    return next();
  }
  bcrypt.genSalt(10, (err, salt) => {
    if (err) {
      return next(err);
    }
    bcrypt.hash(user.password, salt, (err, hash) => {
      if (err) {
        return next(err);
      }
      user.password = hash;
      next();
    });
  });
});

let UserModel;

UserSchema.statics.signin = async function ({ username, password }) {
  try {
    const user = await UserModel.findOne({ username });

    if (!user) {
      throw new Error("User not found");
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new Error("Invalid password");
    }

    await UserModel.findOneAndUpdate({ username }, { $set: { online: true } }, { new: true });
    return createToken(user, process.env.SECRET, "23hr");
  } catch (error) {
    console.error("error when add new user", error);
    throw error;
  }
};

UserSchema.statics.signup = async function ({ username, password, email }) {
  try {
    const user = await UserModel.findOne({ username });

    if (user) {
      throw new Error("User already exists");
    }

    await new UserModel({ username, password, email, online: true }).save();

    return createToken({ username, email }, process.env.SECRET, "1hr");
  } catch (error) {
    console.error("error when add new user", error);
    throw error;
  }
};

UserSchema.statics.addPrivateMessages = async function (userId, messageId) {
  try {
    return await UserModel.findOneAndUpdate(
      { _id: userId },
      { $addToSet: { privateMessages: messageId } },
      { new: true },
    );
  } catch (error) {
    console.error("error when add direct user messages", error);
    throw error;
  }
};

UserSchema.statics.addUnseenMessages = async function (userId, fromUserId) {
  try {
    const user = await UserModel.findById(userId);
    const isHaveMessageFromUser = user.unseenMessages.some((m) => m.from.toString() === fromUserId);

    if (isHaveMessageFromUser) {
      return await UserModel.updateOne(
        {
          _id: userId,
          unseenMessages: { $elemMatch: { from: fromUserId } },
        },
        { $inc: { "unseenMessages.$.count": 1 } },
      );
    }

    return await UserModel.findOneAndUpdate(
      { _id: userId },
      {
        $addToSet: {
          unseenMessages: {
            from: fromUserId,
            count: 1,
          },
        },
      },
      { new: true },
    );
  } catch (error) {
    console.error("error when add unseen messages", error);
    throw error;
  }
};

UserSchema.statics.resetUnseenMessages = async function (userId, fromUserId) {
  try {
    return await UserModel.updateOne(
      {
        _id: userId,
        unseenMessages: { $elemMatch: { from: fromUserId } },
      },
      { $set: { "unseenMessages.$.count": 0 } },
    );
  } catch (error) {
    console.error("error when reset unseen message", error);
    throw error;
  }
};

UserModel = mongoose.model("User", UserSchema);

module.exports = {
  UserModel,
  UserSchema,
};
