import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// 啟用 Firestore 離線持久化（IndexedDB）
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});
