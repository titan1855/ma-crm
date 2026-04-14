import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

const provider = new GoogleAuthProvider();
let _isAdmin = false;

/** 偵測是否為 PWA standalone 模式（iOS Safari 或 Android Chrome） */
function _isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * 觸發 Google 登入。
 * - standalone（PWA）模式：用 signInWithRedirect，頁面跳轉後 onUserReady 透過 getRedirectResult 接收結果
 * - 一般瀏覽器：用 signInWithPopup
 */
export function login() {
  if (_isStandalone()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

/**
 * 處理 redirect 回來的結果。
 * 在 app.js onUserReady 之前呼叫，確保 redirect 登入後的 user 能被正確接收。
 */
export async function handleRedirectResult() {
  try {
    await getRedirectResult(auth);
  } catch (err) {
    // popup-closed 或使用者取消不視為錯誤
    if (err.code !== 'auth/cancelled-popup-request' &&
        err.code !== 'auth/popup-closed-by-user') {
      console.error('[auth] getRedirectResult error', err);
    }
  }
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
 * @param {string} email
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
