import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import fs from 'fs';  // 使用 ESM 語法來引入 fs 模組
import { getAnalytics } from "firebase/analytics";

// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyDlfi88Z_XNbOTLNBPMfgU7Hr_Ymh6qEFM",
    authDomain: "api-db-f9a34.firebaseapp.com",
    projectId: "api-db-f9a34",
    storageBucket: "api-db-f9a34.firebasestorage.app",
    messagingSenderId: "856493410961",
    appId: "1:856493410961:web:4ad90e7633dd62097fcd30",
    measurementId: "G-GP8E2VNNNX"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 讀取 db.json 文件
fs.readFile('db.json', 'utf8', async (err, data) => {
  if (err) {
    console.log('Error reading file:', err);
    return;
  }

  const jsonData = JSON.parse(data);
  
  // 將 members 資料寫入 Firestore
  const membersCol = collection(db, 'members');
  for (const member of jsonData.members) {
    try {
      await addDoc(membersCol, member);
      console.log(`Member ${member.name} added to Firestore`);
    } catch (e) {
      console.error("Error adding member to Firestore: ", e);
    }
  }

  // 將 appointment 資料寫入 Firestore
  const appointmentCol = collection(db, 'appointments');
  for (const appointment of jsonData.appointment) {
    try {
      await addDoc(appointmentCol, appointment);
      console.log(`Appointment for ${appointment.name} added to Firestore`);
    } catch (e) {
      console.error("Error adding appointment to Firestore: ", e);
    }
  }

  // 將 scheduleConfig 資料寫入 Firestore
  const scheduleConfigCol = collection(db, 'scheduleConfig');
  for (const schedule of jsonData.scheduleConfig) {
    try {
      await addDoc(scheduleConfigCol, schedule);
      console.log(`Schedule Config added to Firestore`);
    } catch (e) {
      console.error("Error adding schedule config to Firestore: ", e);
    }
  }
});
