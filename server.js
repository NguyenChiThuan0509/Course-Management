if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const port = 3000;
const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const passport = require("passport");
const initializePassport = require("./passport-config");
const flash = require("express-flash");
const session = require("express-session");
const methodOverride = require("method-override");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const registeredCourses = [];

// ========================= Kết nối Database ==================
mongoose.connect("mongodb://localhost:27017/quanlyhocphan", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "Lỗi kết nối MongoDB:"));
db.once("open", () => {
  console.log("Đã kết nối thành công đến MongoDB");
});

// Khởi tạo Multer để xử lý tải lên
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "public", "uploads"));
  },
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });
// ====================================== xữ lý đăng ký/đăng nhập ================================
// ========================== Tạo schema cho dữ liệu "users" ========================
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
});

const User = mongoose.model("User", userSchema);
initializePassport(
  passport,
  (email) => User.findOne({ email: email }),
  (id) => User.findById(id)
);

app.use(express.urlencoded({ extended: false }));
app.use(flash());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));

app.post(
  "/login",
  checkNotAuthenticated,
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.post("/register", checkNotAuthenticated, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Kiểm tra độ dài mật khẩu
    if (password.length < 8) {
      req.flash("error", "Mật khẩu phải có ít nhất 8 ký tự.");
      return res.redirect("/register");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name: name,
      email: email,
      password: hashedPassword,
    });

    await newUser.save();
    console.log(newUser);
    res.redirect("/login");
  } catch (e) {
    console.error(e);
    res.redirect("/register");
  }
});

// ========================== Tạo schema cho dữ liệu "courses" ========================
const courseSchema = new mongoose.Schema({
  mshp: String,
  name: String,
  sotc: String,
  ngayhoc: Date,
  description: String,
  khoa: String,
  dangky: Boolean,
  image: String,
  slug: String,
  videoID: String,
});

const Course = mongoose.model("Course", courseSchema);

// Routes
app.get("/", checkAuthenticated, (req, res) => {
  res.render("index.ejs", { name: req.user.name });
});

app.get("/login", checkNotAuthenticated, (req, res) => {
  res.render("login.ejs");
});

app.get("/register", checkNotAuthenticated, (req, res) => {
  res.render("register.ejs");
});

app.get("/home", checkAuthenticated, (req, res) => {
  res.render("home.ejs");
});

// =============================================== Routes để lấy dữ liệu từ courses ================================
app.get("/search", checkAuthenticated, async (req, res) => {
  try {
    const query = req.query.q;
    const courses = await Course.find({
      $or: [
        { name: { $regex: new RegExp(query, "i") } },
        { mshp: { $regex: new RegExp(query, "i") } },
      ],
    });

    res.render("hocphan.ejs", { courses });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/courses", async (req, res) => {
  try {
    const courses = await Course.find({});
    res.json(courses);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/hocphan", checkAuthenticated, async (req, res) => {
  try {
    const courses = await Course.find({});
    res.render("hocphan.ejs", { courses });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==================================== schema cho du lieu "school" ===================================
const schoolSchema = new mongoose.Schema({
  khoa: [String],
});

const School = mongoose.model("School", schoolSchema);

app.get("/api/schools", async (req, res) => {
  try {
    const schools = await School.find({});
    res.json({ khoaOptions: schools[0].khoa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// =================================================/hocphan/create================================================
app.get("/hocphan/create", checkAuthenticated, (req, res) => {
  res.render("create.ejs");
});

app.use(express.static(path.join(__dirname, "public")));

app.post(
  "/hocphan/create",
  upload.fields([
    { name: "imageFile", maxCount: 1 },
    { name: "videoIDFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { mshp, name, sotc, ngayhoc, description, khoa, slug } = req.body;
      const image = req.files["imageFile"][0].filename; // Lấy tên file hình ảnh
      const videoID = req.files["videoIDFile"][0].filename; // Lấy tên file video
      //lưu dữ liệu vào MongoDB
      const newCourse = new Course({
        mshp,
        name,
        sotc,
        ngayhoc,
        description,
        khoa,
        image,
        videoID,
        slug,
      });

      await newCourse.save();

      // Chuyển hướng về trang học phần sau khi thêm
      res.redirect("/hocphan");
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
);

// -------------------------------------------------------------------------------------------------

app.get("/hocphan/:slug", async (req, res) => {
  try {
    const requestedSlug = req.params.slug;
    const course = await Course.findOne({ slug: requestedSlug });

    if (!course) {
      return res.status(404).send("Không tìm thấy khóa học");
    }

    // Truyền dữ liệu của khóa học vào template
    res.render("ndhocphan.ejs", { course });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const registeredCourseSchema = new mongoose.Schema({
  mshp: String,
  name: String,
  sotc: String,
  ngayhoc: Date,
  description: String,
  khoa: String,
  image: String,
  videoID: String,
  slug: String,
});

const RegisteredCourse = mongoose.model(
  "RegisteredCourse",
  registeredCourseSchema
);

// Route để xử lý đăng ký khóa học
app.post("/hocphan/register/:slug", checkAuthenticated, async (req, res) => {
  try {
    const requestedSlug = req.params.slug;
    const course = await Course.findOne({ slug: requestedSlug });

    if (!course) {
      return res.status(404).send("Không tìm thấy khóa học.");
    }

    const registeredCourse = new RegisteredCourse({
      mshp: course.mshp,
      name: course.name,
      sotc: course.sotc,
      ngayhoc: course.ngayhoc,
      description: course.description,
      khoa: course.khoa,
      image: course.image,
      videoID: course.videoID,
      slug: course.slug,
    });

    await registeredCourse.save();

    // Trả về phản hồi JSON khi đăng ký thành công
    res.status(200).json({ message: "Đăng ký thành công." });
  } catch (err) {
    // Trả về phản hồi JSON khi có lỗi
    res.status(500).json({ message: err.message });
  }
});

// Trong route hiển thị trang dkhocphan
app.get("/dkhocphan", checkAuthenticated, async (req, res) => {
  try {
    // Lấy dữ liệu từ database
    const registeredCourses = await RegisteredCourse.find();

    // Render trang dkhocphan và truyền dữ liệu vào
    res.render("dkhocphan.ejs", { registeredCourses });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/filter", checkAuthenticated, async (req, res) => {
  try {
    const query = req.query.ngayhoc;
    const registeredCourses = await RegisteredCourse.find({ ngayhoc: query });

    res.render("dkhocphan.ejs", { registeredCourses });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ============================================ Delete + Update ====================================

// Route để xóa học phần
app.get("/hocphan/delete/:slug", checkAuthenticated, async (req, res) => {
  try {
    const requestedSlug = req.params.slug;
    // Xóa học phần từ database
    await Course.findOneAndDelete({ slug: requestedSlug });
    // Chuyển hướng về trang danh sách học phần sau khi xóa
    res.redirect("/hocphan");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Route để hiển thị form sửa học phần
app.get("/hocphan/update/:slug", checkAuthenticated, async (req, res) => {
  try {
    const requestedSlug = req.params.slug;
    const course = await Course.findOne({ slug: requestedSlug });

    if (!course) {
      return res.status(404).send("Không tìm thấy học phần.");
    }

    // Hiển thị form sửa với thông tin của học phần
    res.render("updatehp.ejs", { course });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Route để xử lý form sửa học phần
app.post(
  "/hocphan/update/:slug",
  upload.fields([
    { name: "imageFile", maxCount: 1 },
    { name: "videoIDFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const requestedSlug = req.params.slug;
      const { name, mshp, sotc, ngayhoc, description, khoa, slug } = req.body;

      // Kiểm tra xem có tệp hình ảnh được tải lên không
      const imageFile = req.files["imageFile"];
      const image = imageFile ? imageFile[0].filename : "";

      // Kiểm tra xem có tệp videoID được tải lên không
      const videoIDFile = req.files["videoIDFile"];
      const videoID = videoIDFile ? videoIDFile[0].filename : "";

      // Cập nhật thông tin của học phần trong database
      await Course.findOneAndUpdate(
        { slug: requestedSlug },
        {
          name,
          mshp,
          sotc,
          ngayhoc,
          description,
          khoa,
          image,
          videoID,
          slug,
        }
      );

      // Chuyển hướng về trang danh sách học phần sau khi cập nhật
      res.redirect("/hocphan");
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
);

// Route để xóa khóa học đã đăng ký
app.post("/dkhocphan/delete/:slug", checkAuthenticated, async (req, res) => {
  try {
    const requestedSlug = req.params.slug;
    // Xóa khóa học từ collection "registeredcourses"
    await RegisteredCourse.findOneAndDelete({ slug: requestedSlug });
    // Phản hồi JSON khi xóa thành công
    res.status(200).json({ message: "Xóa thành công." });
  } catch (err) {
    // Phản hồi JSON khi có lỗi xảy ra
    res.status(500).json({ error: "Lỗi khi xóa khóa học." });
  }
});
// ======================= Routes để lấy dữ liệu từ courses =====================

app.delete("/logout", (req, res) => {
  req.logout(req.user, (err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  next();
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
