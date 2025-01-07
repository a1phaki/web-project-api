const express = require('express');
const jsonServer = require('json-server');
const jwt = require("jsonwebtoken");
require("dotenv").config();

const server = jsonServer.create();
const router = jsonServer.router('db.json');  
const middlewares = jsonServer.defaults();

server.use(express.json());  
server.use(middlewares);

// 登入 API
server.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "請提供電子郵件和密碼" });
  }

  const db = router.db;
  const user = db.get("members").find({ email }).value();

  if (!user || user.password !== password) {
    return res.status(401).json({ message: "使用者不存在或密碼錯誤" });
  }

  const token = jwt.sign(
    { email: user.email, user: user.user },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.status(200).json({
    message: "登入成功",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      birthday: user.birthday,
      LineID: user.LineID,
      user: user.user,
    },
  });
});

// 註冊 API
server.post("/register", (req, res) => {
  const { user, name, email, password, LineID, phone, birthday } = req.body;

  if (!user || !name || !email || !password || !LineID || !phone || !birthday) {
    return res.status(400).json({ message: "請填寫所有必填欄位" });
  }

  const db = router.db;
  const existingUser = db.get("members").find({ email }).value();

  if (existingUser) {
    return res.status(400).json({ message: "該電子郵件已註冊，請使用其他電子郵件" });
  }

  const newUser = {
    id:'qt'+Date.now().toString(),
    user,
    name,
    email,
    password,
    LineID,
    phone,
    birthday,
  };

  db.get("members").push(newUser).write();

  res.status(201).json({
    message: "註冊成功",
    user: {
      id: newUser.id,
      user: newUser.user,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      birthday: newUser.birthday,
      LineID: newUser.LineID,
    },
  });
});

// 驗證 Token 的中間件
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "未提供身份驗證 Token" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "無效或過期的身份驗證 Token" });
    }
    req.user = user;
    next();
  });
}

// 受保護的 API - 訂單資料
server.get("/appointment", authenticateToken, (req, res) => {
  const db = router.db;

  if (req.user.user === "admin") {
    const appointments = db.get("appointment").value();
    return res.json(appointments);
  }

  const appointments = db.get("appointment").filter({ email: req.user.email }).value();
  res.json(appointments);
});

// POST 預約 API
server.post("/appointment", authenticateToken, (req, res) => {
  const {date ,timeSlot ,bodyPart ,nailRemoval ,nailExtension ,name ,birthday ,email ,phone ,LineID} = req.body;

  // 驗證必填資訊
  if (!date || !timeSlot || !bodyPart || !name || !email || !phone || !LineID || !nailRemoval || !birthday || !nailExtension) {
    return res.status(400).json({
      message: "請提供完整的預約資訊（日期、時段、服務內容、姓名、電子郵件、電話）",
    });
  }

  const db = router.db;

  // 確認預約是否已存在
  const existingAppointment = db
    .get("appointment")
    .find({ date, timeSlot })
    .value();

  if (existingAppointment) {
    return res.status(409).json({ message: "該時段已被預約，請選擇其他時段" });
  }

  // 創建新的預約
  const newAppointment = {
    id: 'qt'+Date.now().toString(), // 可以改用更安全的 ID 生成方式，如 uuid
    date,
    timeSlot,
    bodyPart,
    nailRemoval: nailRemoval || false,
    nailExtension: nailExtension || false,
    name,
    birthday,
    email,
    phone,
    LineID,
  };

  // 將新的預約寫入資料庫
  db.get("appointment").push(newAppointment).write();

  res.status(201).json({
    message: "預約成功",
    appointment: newAppointment,
  });
});




// 受保護的 API - 會員資料
server.get("/members", authenticateToken, (req, res) => {
  const db = router.db;

  if (req.user.user === "admin") {
    const members = db.get("members").value();
    return res.json(members);
  }

  return res.status(403).json({ message: "您沒有權限查看其他會員資料" });
});

// 取得 scheduleConfig 資料 (所有使用者皆可)
server.get("/scheduleConfig", authenticateToken, (req, res) => {
  const db = router.db;
  const scheduleConfig = db.get("scheduleConfig").value();
  res.json(scheduleConfig);
});

server.patch("/scheduleConfig/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { unavailableTimeSlots, lastBookableDate, reservedTimeSlots } = req.body;
  const db = router.db;

  const schedule = db.get("scheduleConfig").find({ id }).value();

  if (!schedule) {
    return res.status(404).json({ message: "無法找到對應的行程配置" });
  }

  // 管理員的操作：可以修改 unavailableTimeSlots 和 lastBookableDate
  if (req.user.user === "admin") {
    if (unavailableTimeSlots !== undefined) {
      schedule.unavailableTimeSlots = unavailableTimeSlots;
    }
    if (lastBookableDate !== undefined) {
      schedule.lastBookableDate = lastBookableDate;
    }
    db.get("scheduleConfig").find({ id }).assign(schedule).write();
    return res.status(200).json({ message: "行程配置更新成功", schedule });
  }

  // 一般使用者的操作：只能修改 reservedTimeSlots
  if (req.user.user === "user" ) {
    // 只處理傳遞過來的 reservedTimeSlots
    if (reservedTimeSlots !== undefined && reservedTimeSlots !== null) {
      schedule.reservedTimeSlots = reservedTimeSlots;
      db.get("scheduleConfig").find({ id }).assign(schedule).write();
      return res.status(200).json({ message: "預約時間更新成功", schedule });
    } else if(!lastBookableDate && !unavailableTimeSlots){
      return res.status(400).json({ message: "沒有提供預約時間" });  // 如果沒有提供 reservedTimeSlots，返回錯誤
    }
  }

  return res.status(403).json({ message: "您沒有權限執行此操作" });
});



server.use(router);

const PORT = process.env.PORT || 3500;
server.listen(PORT, () => {
  console.log(`JSON Server is running on port ${PORT}`);
});
