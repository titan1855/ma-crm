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

// 重新 export Firebase 原生函式，讓模組不需直接引用 SDK
export {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, onSnapshot, serverTimestamp
};

// 登入後由 app.js 呼叫 setCurrentUid() 設定，避免 getCurrentUser() 時序問題
let _uid = null;

export function setCurrentUid(uid) {
  _uid = uid;
}

export function getCurrentUid() {
  return _uid;
}

/**
 * 使用者根文件 DocumentReference：users/{uid}
 * ★ profile / achievements 等「單一文件」都存在這裡
 *   路徑 2 節點（偶數）= 合法 Document
 */
export function userRootDoc() {
  if (!_uid) throw new Error('未登入，無法存取資料');
  return doc(db, 'users', _uid);
}

/**
 * 子集合 CollectionReference：users/{uid}/{collectionName}
 * ★ pool、prospects、daily312 等多筆資料的集合
 *   路徑 3 節點（奇數）= 合法 Collection
 */
export function userCollection(name) {
  if (!_uid) throw new Error('未登入，無法存取資料');
  return collection(db, 'users', _uid, name);
}

/**
 * 子集合中的 Document Reference：users/{uid}/{collectionName}/{docId}
 *   路徑 4 節點（偶數）= 合法 Document
 */
export function userSubDoc(collectionName, docId) {
  if (!_uid) throw new Error('未登入，無法存取資料');
  return doc(db, 'users', _uid, collectionName, docId);
}

/**
 * 深層子集合 CollectionReference：users/{uid}/{col}/{docId}/{subCol}
 * ★ talks、sales 等子集合（5 節點 = 奇數 = Collection ✓）
 */
export function userSubCollection(col, docId, subCol) {
  if (!_uid) throw new Error('未登入，無法存取資料');
  return collection(db, 'users', _uid, col, docId, subCol);
}

/**
 * 深層子集合文件 DocumentReference：users/{uid}/{col}/{docId}/{subCol}/{subDocId}
 *   路徑 6 節點（偶數）= 合法 Document
 */
export function userSubSubDoc(col, docId, subCol, subDocId) {
  if (!_uid) throw new Error('未登入，無法存取資料');
  return doc(db, 'users', _uid, col, docId, subCol, subDocId);
}

/** 讀取使用者 profile（找不到文件返回 null；真正的錯誤往上拋） */
export async function getProfile() {
  const snap = await getDoc(userRootDoc());
  return snap.exists() ? snap.data() : null;
}

/** 寫入 / 合併更新 profile（merge:true 不會覆蓋其他欄位） */
export async function setProfile(data) {
  return setDoc(userRootDoc(), data, { merge: true });
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
