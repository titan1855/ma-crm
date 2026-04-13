import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache
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

// 嘗試啟用 IndexedDB 離線持久化，失敗時 fallback 到記憶體模式（無痕視窗等）
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (e) {
  console.warn('[Firebase] 離線快取初始化失敗，改用記憶體模式:', e.message);
  db = getFirestore(app);
}
export { db };
