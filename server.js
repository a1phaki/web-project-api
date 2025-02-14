require('dotenv').config();
const cors = require('cors');
const express = require('express');
const jwt = require('jwt-simple');
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

// 驗證 Token 的中間件
// 修改 Token 驗證邏輯，確保已登出的 Token 不能使用
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "未提供身份驗證 Token" });
  }

  try {
    const decoded = jwt.decode(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "無效或過期的身份驗證 Token" });
  }
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

    const token = jwt.encode(
      { email: user.email, user: user.user },
      process.env.JWT_SECRET,
      'HS256',
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

app.get("/login/check", authenticateToken, async (req, res) => {
  try {
    // 假設 req.user 是解碼後的用戶資料，包含 user.email 等
    const membersCol = collection(db, 'members');
    const q = query(membersCol, where("email", "==", req.user.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(404).json({ message: "用戶資料未找到" });
    }

    const user = querySnapshot.docs[0].data();

    // 返回完整用戶資料
    res.status(200).json({
      login: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthday: user.birthday,
        LineID: user.LineID,
        user: user.user,
      }
    });
  } catch (err) {
    console.error("發生錯誤：", err);
    res.status(500).json({ message: "伺服器錯誤", error: err.message });
  }
});



app.post("/logout", (req, res) => {
  res.clearCookie("token", { path: "/" }); // 清除 token
  res.status(200).json({ message: "登出成功" });
});



// // 取得預約資料
// app.get("/appointments", authenticateToken, async (req, res) => {
//   try {
//     const appointmentCol = collection(db, 'appointments');
//     const querySnapshot = await getDocs(appointmentCol);

//     const appointments = querySnapshot.docs.map(doc => doc.data());

//     if (req.user.user === "admin") {
//       return res.json(appointments);
//     }

//     const userAppointments = appointments.filter(appointment => appointment.email === req.user.email);
//     res.json(userAppointments);
//   } catch (err) {
//     res.status(500).json({ message: "伺服器錯誤", error: err });
//   }
// });

app.patch("/members/update", authenticateToken, async (req, res) => {
  const { id, name, birthday, email, phone, LineID } = req.body;

if (!id) {
  return res.status(400).json({ message: "缺少會員 ID" });
}

try {
  // 使用自訂欄位 `id` 來查詢 Firestore
  const membersCol = collection(db, "members");
  const q = query(membersCol, where("id", "==", id));  // 這裡的 `id` 是你自己存的欄位
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return res.status(404).json({ message: "會員不存在" });
  }

  // 取得第一筆匹配的會員資料
  const memberDoc = querySnapshot.docs[0];
  const memberRef = memberDoc.ref;
  const memberData = memberDoc.data();

  // 限制非管理員只能修改自己的資料
  if (req.user.user !== "admin" && req.user.email !== memberData.email) {
    return res.status(403).json({ message: "您沒有權限修改此會員資料" });
  }

  let updateData = {};

  if (name !== undefined) updateData.name = name;
  if (birthday !== undefined) updateData.birthday = birthday;
  if (phone !== undefined) updateData.phone = phone;
  if (LineID !== undefined) updateData.LineID = LineID;

  // 如果 email 要修改，需確保不與其他會員重複
  if (email !== undefined && email !== memberData.email) {
    const emailQuery = query(membersCol, where("email", "==", email));
    const emailSnapshot = await getDocs(emailQuery);

    if (!emailSnapshot.empty) {
      return res.status(400).json({ message: "該電子郵件已被使用" });
    }

    updateData.email = email;
  }

  // 更新會員資料
  await updateDoc(memberRef, updateData);

  res.status(200).json({ message: "會員資料更新成功" });
} catch (err) {
  console.error("更新會員資料時發生錯誤：", err);
  res.status(500).json({ message: "伺服器錯誤", error: err });
}
});



app.get("/appointments", authenticateToken, async (req, res) => {
  try {
    const { page, limit } = req.query; // 提取 page 和 limit
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

    // 通用分頁函數
    const paginate = (data, page, limit) => {
      if (!page || !limit) return data; // 如果沒有分頁參數，返回全部資料
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      return data.slice(startIndex, endIndex);
    };

    // 如果是 admin，用戶可以看到所有預約資料
    if (req.user.user === "admin") {
      const paginatedAppointments = paginate(sortedAppointments, page, limit);
      return res.json(paginatedAppointments);
    }

    // 如果是普通用戶，只返回該用戶的預約資料
    const userAppointments = sortedAppointments.filter(appointment => appointment.email === req.user.email);
    const paginatedAppointments = paginate(userAppointments, page, limit);
    res.json(paginatedAppointments);
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
