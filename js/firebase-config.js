import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7X2lFf0_cHgM5n0VwmhbfKZjXYGNDIzk",
  authDomain: "ma-crm-c662d.firebaseapp.com",
  projectId: "ma-crm-c662d",
  storageBucket: "ma-crm-c662d.firebasestorage.app",
  messagingSenderId: "1066017787188",
  appId: "1:1066017787188:web:0183e5158335ff74732961"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// 先取得標準 db（記憶體模式，一定成功）
export const db = getFirestore(app);

// 然後嘗試升級為 IndexedDB 離線持久化（失敗不影響 db 正常使用）
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firestore] 多個分頁同時開啟，離線持久化停用');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firestore] 此瀏覽器不支援離線持久化（無痕模式）');
  } else {
    console.warn('[Firestore] 離線持久化初始化失敗:', err.message);
  }
});
