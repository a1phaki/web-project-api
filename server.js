require('dotenv').config();
const cors = require('cors');
const express = require('express');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, query, where, doc, getDoc, updateDoc } = require('firebase/firestore');


const app = express();
app.use(cors());
const port = process.env.PORT || 3500;

// Firebase 配置
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// 初始化 Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

app.use(express.json());

const jwt = require('jsonwebtoken');  // 使用 jsonwebtoken 库

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];  // 取得 Token

  if (!token) {
    return res.status(401).json({ message: "未提供身份驗證 Token" });
  }

  // 使用 jsonwebtoken 的 verify 方法來驗證 Token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "無效或過期的身份驗證 Token" });
    }
    req.user = decoded;  // 解碼後的用戶資料
    next();  // 繼續處理請求
  });
}


// 登入 API
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "請提供電子郵件和密碼" });
  }

  try {
    const membersCol = collection(db, 'members');
    const q = query(membersCol, where("email", "==", email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(401).json({ message: "使用者不存在或密碼錯誤" });
    }

    const user = querySnapshot.docs[0].data();
    if (user.password !== password) {
      return res.status(401).json({ message: "密碼錯誤" });
    }

    const token = jwt.sign(
      { id: user.id, user: user.user },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: "1h" }  // 使用 HS256 演算法並設置過期時間
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

  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});

// 註冊 API
app.post("/register", async (req, res) => {
  const { user, name, email, password, LineID, phone, birthday } = req.body;

  if (!user || !name || !email || !password || !LineID || !phone || !birthday) {
    return res.status(400).json({ message: "請填寫所有必填欄位" });
  }

  try {
    const membersCol = collection(db, 'members');
    const q = query(membersCol, where("email", "==", email));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      return res.status(400).json({ message: "該電子郵件已註冊，請使用其他電子郵件" });
    }

    const newUser = {
      id: 'qt' + Date.now().toString(),
      user,
      name,
      email,
      password,
      LineID,
      phone,
      birthday,
    };

    // 將新會員資料加入 Firestore
    await addDoc(membersCol, newUser);

    res.status(201).json({
      message: "註冊成功",
      user: newUser,
    });
  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});
// 驗證用戶是否登入並返回用戶資料
app.get("/login/check", authenticateToken, async (req, res) => {
  try {
    // 假設 req.user 是解碼後的用戶資料，包含 user.email 等
    const membersCol = collection(db, 'members');  // 指定 Firestore 資料集合
    const q = query(membersCol, where("id", "==", req.user.id));  // 查詢 email 是否與當前用戶匹配
    const querySnapshot = await getDocs(q);  // 執行查詢

    // 如果查詢結果為空，表示找不到用戶資料
    if (querySnapshot.empty) {
      return res.status(404).json({ message: "用戶資料未找到" });  // 返回 404 錯誤
    }

    // 提取查詢結果的第一筆用戶資料
    const user = querySnapshot.docs[0].data();

    // 返回用戶資料
    res.status(200).json({
      login: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthday: user.birthday,
        LineID: user.LineID,
        user: user.user,  // 可以包括其他需要的用戶資料
      }
    });
  } catch (err) {
    // 發生錯誤時返回 500 錯誤
    console.error("發生錯誤：", err);
    res.status(500).json({ message: "伺服器錯誤", error: err.message });
  }
});

// 登出處理，清除 token
app.post("/logout", (req, res) => {
  // 清除存儲的 token，並設置有效路徑為根目錄 "/"
  res.clearCookie("token", { path: "/" }); 
  res.status(200).json({ message: "登出成功" });  // 返回登出成功訊息
});

// 更新會員資料的 API
app.patch("/members/update", authenticateToken, async (req, res) => {
  const { id, name, birthday, email, phone, LineID } = req.body;

  // 檢查是否有提供會員 ID
  if (!id) {
    return res.status(400).json({ message: "缺少會員 ID" });  // 如果缺少會員 ID 返回 400 錯誤
  }

  try {
    // 使用會員 ID 查詢 Firestore
    const membersCol = collection(db, "members");
    const q = query(membersCol, where("id", "==", id));  // 查詢條件為會員 ID
    const querySnapshot = await getDocs(q);

    // 如果查詢結果為空，表示該會員不存在
    if (querySnapshot.empty) {
      return res.status(404).json({ message: "會員不存在" });  // 返回 404 錯誤
    }

    // 取得該會員資料
    const memberDoc = querySnapshot.docs[0];
    const memberRef = memberDoc.ref;  // 獲取該會員文檔的參照
    const memberData = memberDoc.data();  // 提取該會員的資料

    // 限制非管理員只能修改自己的資料
    if (req.user.user !== "admin" && req.user.id !== memberData.id) {
      return res.status(403).json({ message: "您沒有權限修改此會員資料" });  // 如果非管理員且嘗試修改其他會員資料，返回 403 錯誤
    }

    let updateData = {};  // 用來儲存更新的資料

    // 更新指定欄位的資料
    if (name !== undefined) updateData.name = name;
    if (birthday !== undefined) updateData.birthday = birthday;
    if (phone !== undefined) updateData.phone = phone;
    if (LineID !== undefined) updateData.LineID = LineID;

    // 如果 email 要修改，需確保不與其他會員重複
    if (email !== undefined && email !== memberData.email) {
      const emailQuery = query(membersCol, where("email", "==", email));  // 查詢是否已經有其他會員使用該 email
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        return res.status(400).json({ message: "該電子郵件已被使用" });  // 如果 email 已被使用，返回 400 錯誤
      }

      updateData.email = email;  // 如果 email 沒有重複，更新 email
    }

    // 更新會員資料
    await updateDoc(memberRef, updateData);  // 更新 Firestore 中的會員資料

    res.status(200).json({ message: "會員資料更新成功" });  // 返回更新成功訊息
  } catch (err) {
    // 如果發生錯誤，返回 500 錯誤
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});




app.get("/appointments", authenticateToken, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const appointmentCol = collection(db, 'appointments');
    const querySnapshot = await getDocs(appointmentCol);

    // 取得所有預約資料
    const appointments = querySnapshot.docs.map(doc => doc.data());

    // 排序資料：先根據 date（降序），再根據 timeSlot 的結束時間（升序）
    const sortedAppointments = appointments.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateB - dateA; // 日期降序
      }

      const endTimeA = a.timeSlot?.split("～")[1] || "";
      const endTimeB = b.timeSlot?.split("～")[1] || "";

      return endTimeA.localeCompare(endTimeB); // 時間升序
    });

    // 計算分頁資訊
    const paginate = (data, page, limit) => {
      const totalItems = data.length;
      const totalPages = limit ? Math.ceil(totalItems / parseInt(limit)) : 1;
      const currentPage = page ? parseInt(page) : 1;

      if (!page || !limit) {
        return { paginatedData: data, pageInfo: { totalPages, currentPage, totalItems } };
      }

      const startIndex = (currentPage - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedData = data.slice(startIndex, endIndex);

      return { paginatedData, pageInfo: { totalPages, currentPage, totalItems } };
    };

    let filteredAppointments = sortedAppointments;

    // 如果是普通用戶，只返回該用戶的預約資料
    if (req.user.user !== "admin") {
      filteredAppointments = sortedAppointments.filter(appointment => appointment.userId === req.user.id);
    }

    const { paginatedData, pageInfo } = paginate(filteredAppointments, page, limit);

    res.json({
      appointments: paginatedData,
      pageInfo,
    });
  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});


// POST 預約資料
app.post("/appointments", authenticateToken, async (req, res) => {
  const { date, timeSlot, bodyPart, nailRemoval, nailExtension, name, birthday, email, phone, LineID } = req.body;

  if (!date || !timeSlot || !bodyPart || !name || !email || !phone || !LineID || !nailRemoval || !birthday || !nailExtension) {
    return res.status(400).json({ message: "請提供完整的預約資訊" });
  }

  try {
    const appointmentCol = collection(db, 'appointments');
    const querySnapshot = await getDocs(appointmentCol);

    // 確認預約是否已存在
    const existingAppointment = querySnapshot.docs.some(doc => {
      const appointment = doc.data();
      return appointment.date === date && appointment.timeSlot === timeSlot;
    });

    if (existingAppointment) {
      return res.status(409).json({ message: "該時段已被預約，請選擇其他時段" });
    }

    const newAppointment = {
      id: 'qt' + Date.now().toString(),
      userId: req.user.id,  // 新增會員 ID
      date,
      timeSlot,
      bodyPart,
      nailRemoval,
      nailExtension,
      name,
      birthday,
      email,
      phone,
      LineID,
    };

    await addDoc(appointmentCol, newAppointment);

    res.status(201).json({
      message: "預約成功",
      appointment: newAppointment,
    });
  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});

// 受保護的 API - 會員資料
app.get("/members", authenticateToken, async (req, res) => {
  try {
    if (req.user.user === "admin") {
      const membersCol = collection(db, "members");
      const querySnapshot = await getDocs(membersCol);

      const members = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.json(members);
    }

    return res.status(403).json({ message: "您沒有權限查看其他會員資料" });
  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});

// 取得 scheduleConfig 資料 (所有使用者皆可)
app.get("/scheduleConfig", authenticateToken, async (req, res) => {
  try {
    const scheduleConfigCol = collection(db, "scheduleConfig");
    const querySnapshot = await getDocs(scheduleConfigCol);

    const scheduleConfig = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(scheduleConfig);
  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});

// 更新 scheduleConfig 資料
app.patch("/scheduleConfig", authenticateToken, async (req, res) => {
  const { unavailableTimeSlots, lastBookableDate, reservedTimeSlots } = req.body;

  try {
    // 取得 scheduleConfig 集合
    const scheduleConfigCol = collection(db, "scheduleConfig");
    const querySnapshot = await getDocs(scheduleConfigCol);

    if (querySnapshot.empty) {
      return res.status(404).json({ message: "找不到行程配置" });
    }

    // 假設永遠只有一個文檔，抓取第一個文檔
    const scheduleDoc = querySnapshot.docs[0];
    const scheduleRef = scheduleDoc.ref;
    const schedule = scheduleDoc.data();

    console.log("原始行程配置：", schedule);

    // 管理員的操作：可以修改 unavailableTimeSlots 和 lastBookableDate
    if (req.user.user === "admin") {
      if (unavailableTimeSlots !== undefined) schedule.unavailableTimeSlots = unavailableTimeSlots;
      if (lastBookableDate !== undefined) schedule.lastBookableDate = lastBookableDate;
    }
    // 一般使用者的操作：只能修改 reservedTimeSlots
    else if (req.user.user === "user") {
      if (reservedTimeSlots !== undefined) {
        schedule.reservedTimeSlots = reservedTimeSlots;
      } else {
        return res.status(400).json({ message: "沒有提供預約時間" });
      }
    } else {
      return res.status(403).json({ message: "您沒有權限執行此操作" });
    }

    // 更新文檔
    await updateDoc(scheduleRef, schedule);

    res.status(200).json({
      message: "行程配置更新成功",
      schedule,
    });
  } catch (err) {
    console.error("更新行程配置時發生錯誤：", err);
    res.status(500).json({ message: "伺服器錯誤", error: err });
  }
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
