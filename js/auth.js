import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

const provider = new GoogleAuthProvider();
let _isAdmin = false;

/** 偵測是否為 PWA standalone 模式 */
export function isStandaloneMode() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * 觸發 Google 登入。
 * - standalone（iOS PWA）→ signInWithRedirect
 * - 一般瀏覽器 → signInWithPopup
 */
export function login() {
  if (isStandaloneMode()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

/** 處理 redirect 回來的結果（每次 App 初始化都要呼叫） */
export function handleRedirectResult() {
  return getRedirectResult(auth);
}

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
    const ref = doc(db, 'allowedUsers', email);
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
