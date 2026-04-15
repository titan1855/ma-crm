import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

let _isAdmin = false;

/** Email + 密碼登入 */
export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** 建立 Email + 密碼帳號 */
export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** 發送重設密碼信 */
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/** 登出 */
export function logout() {
  _isAdmin = false;
  return signOut(auth);
}

/** 監聽登入狀態變化 */
export function onUserReady(callback) {
  return onAuthStateChanged(auth, callback);
}

/** 取得目前登入的使用者 */
export function getCurrentUser() {
  return auth.currentUser;
}

/** 是否為管理員 */
export function isAdmin() {
  return _isAdmin;
}

/**
 * 檢查 email 是否在白名單中
 * @returns {Object|null} 白名單文件資料，或 null 代表無權限
 */
export async function checkAllowList(email) {
  if (!email) return null;
  try {
    const ref = doc(db, 'allowedUsers', email.toLowerCase().trim());
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      _isAdmin = data.role === 'admin';
      return data;
    }
    return null;
  } catch (err) {
    console.error('checkAllowList error:', err);
    return null;
  }
}
