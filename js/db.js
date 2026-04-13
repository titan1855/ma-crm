/**
 * db.js — Firestore 共用操作封裝
 * 所有模組透過這裡存取資料庫，不直接 import firebase-config
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { getCurrentUser } from './auth.js';

// 重新 export Firebase 原生函式，讓模組不需直接引用 SDK
export {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, onSnapshot, serverTimestamp
};

/**
 * 取得 users/{uid}/{collectionName} 的 CollectionReference
 */
export function userCollection(name) {
  const user = getCurrentUser();
  if (!user) throw new Error('未登入，無法存取資料');
  return collection(db, 'users', user.uid, name);
}

/**
 * 取得 users/{uid}/{...path} 的 DocumentReference
 * @param {...string} pathSegments 路徑片段，例如 'profile' 或 'pool', 'abc123'
 */
export function userDoc(...pathSegments) {
  const user = getCurrentUser();
  if (!user) throw new Error('未登入，無法存取資料');
  return doc(db, 'users', user.uid, ...pathSegments);
}

/** 讀取使用者 profile（找不到文件返回 null；真正的錯誤往上拋） */
export async function getProfile() {
  const snap = await getDoc(userDoc('profile'));
  return snap.exists() ? snap.data() : null;
}

/** 寫入 / 合併更新 profile */
export async function setProfile(data) {
  return setDoc(userDoc('profile'), data, { merge: true });
}

/**
 * 新增白名單使用者（限管理員）
 * @param {string} email 要加入的 email
 * @param {string} role  'admin' | 'member'
 * @param {string} name  顯示名稱
 * @param {string} addedByEmail 邀請者的 email
 */
export async function addAllowedUser(email, role, name, addedByEmail) {
  const ref = doc(db, 'allowedUsers', email);
  return setDoc(ref, {
    role,
    name,
    addedAt: serverTimestamp(),
    addedBy: addedByEmail
  });
}

/** 取得所有白名單使用者（限管理員） */
export async function getAllowedUsers() {
  const snap = await getDocs(collection(db, 'allowedUsers'));
  return snap.docs.map(d => ({ email: d.id, ...d.data() }));
}
