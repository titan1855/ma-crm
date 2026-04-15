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

/** 偵測是否為 PWA standalone 模式 */
export function isStandaloneMode() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * 觸發 Google 登入。
 * - standalone（iOS PWA）→ signInWithRedirect：window.location 直接導航，
 *   WKWebView 跟著跳頁，整個 redirect chain 在同一個 WebView 裡完成，
 *   回到 App 後 getRedirectResult() 取得 user。
 * - 一般瀏覽器 → signInWithPopup（彈出視窗）。
 */
export function login() {
  if (isStandaloneMode()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

/**
 * 處理 redirect 回來的結果。
 * 每次 App 初始化都要呼叫，若不是從 redirect 回來則回傳 null。
 */
export function handleRedirectResult() {
  return getRedirectResult(auth);
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
