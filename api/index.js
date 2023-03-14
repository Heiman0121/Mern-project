const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const bcrypt = require("bcryptjs");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const Grid = require("gridfs-stream");
const fs = require("fs");

const salt = bcrypt.genSaltSync(Number(process.env.SALT));
const secret = process.env.SECRET;

app.use(
  cors({
    credentials: true,
    origin: [
      "http://localhost:3000",
      "https://mern-project-ujkp.onrender.com",
      "https://mern-project-api.onrender.com",
    ],
  }),
);

app.use(express.json());
app.use(cookieParser());

mongoose
  .connect(process.env.MOONGO_DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error(
      "Error connecting to MongoDB:",
      error.message,
    );
  });

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });
  const passOk = bcrypt.compareSync(
    password,
    userDoc.password,
  );
  if (passOk) {
    // logged in
    jwt.sign(
      { username, id: userDoc._id },
      secret,
      {},
      (err, token) => {
        if (err) throw err;
        res.cookie("token", token).json({
          id: userDoc._id,
          username,
        });
      },
    );
  } else {
    res.status(400).json("wrong credentials");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  if (!token) {
    return res
      .status(401)
      .json({ message: "JWT token is missing" });
  }
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      return res
        .status(401)
        .json({ message: "Invalid JWT token" });
    }
    res.json(info);
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

//storage
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
});
//create post
app.post(
  "/post",
  uploadMiddleware.single("file"),
  async (req, res) => {
    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) throw err;
      const { title, summary, content } = req.body;

      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

      const file = req.file;
      const fileName = file.originalname;

      const s3Params = {
        Bucket: "mernblog",
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
        Region: "ap-southeast-1",
      };

      s3.upload(s3Params, async (error, data) => {
        if (error) {
          console.log(error);
          return res.status(400).json(error);
        }

        const link = data.Location;

        const postDoc = await Post.create({
          title,
          summary,
          content,
          image: link,
          author: info.id,
        });
        res.json(postDoc);
      });
    });
  },
);

//update post
app.put(
  "/post",
  uploadMiddleware.single("file"),
  async (req, res) => {
    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) throw err;
      const { id, title, summary, content } = req.body;
      const postDoc = await Post.findById(id);
      const isAuthor =
        JSON.stringify(postDoc.author) ===
        JSON.stringify(info.id);
      if (!isAuthor) {
        return res
          .status(400)
          .json("you are not the author");
      }

      let image = postDoc.image;
      if (req.file) {
        const s3 = new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey:
            process.env.AWS_SECRET_ACCESS_KEY,
        });

        const file = req.file;
        const fileName = file.originalname;

        const s3Params = {
          Bucket: "mernblog",
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: "public-read",
          Region: "ap-southeast-1",
        };

        s3.upload(s3Params, async (error, data) => {
          if (error) {
            console.log(error);
            return res.status(400).json(error);
          }

          image = data.Location;
        });
      }

      await postDoc.update({
        title,
        summary,
        content,
        image,
      });

      res.json(postDoc);
    });
  },
);

app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20),
  );
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate(
    "author",
    ["username"],
  );
  res.json(postDoc);
});

app.get("/post/:id/file", async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    res.status(404).json({ message: "Post not found" });
  } else {
    res.set("Content-Type", post.file.contentType);
    res.send(post.file.data);
  }
});

app.listen(4000);
