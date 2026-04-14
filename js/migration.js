/**
 * migration.js — 舊版 localStorage 資料匯入（一次性）
 * 偵測 localStorage.ma3_c，提示使用者是否匯入至 Firestore
 */
import { toast } from './utils.js';
import { userCollection, addDoc, serverTimestamp } from './db.js';

/** 檢查並啟動遷移流程 */
export function initMigration() {
  const raw = localStorage.getItem('ma3_c');
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    localStorage.removeItem('ma3_c');
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    localStorage.removeItem('ma3_c');
    return;
  }

  _showPrompt(data);
}

function _showPrompt(data) {
  const container = document.getElementById('modal-container');
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `
    <div class="modal-box">
      <h3 class="modal-title">偵測到舊版資料</h3>
      <p class="modal-msg" style="margin:.5rem 0 1.25rem">
        發現 <strong>${data.length}</strong> 筆舊版名單資料。<br>
        是否要匯入新系統？
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="migrate-skip">略過並刪除</button>
        <button class="btn btn-primary" id="migrate-import">匯入</button>
      </div>
    </div>
  `;
  container.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

  document.getElementById('migrate-skip').onclick = () => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    localStorage.removeItem('ma3_c');
    toast('已刪除舊版資料', 'info');
  };

  document.getElementById('migrate-import').onclick = async () => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    await _doMigration(data);
  };
}

async function _doMigration(data) {
  let ok = 0;
  let fail = 0;

  for (const item of data) {
    try {
      await addDoc(userCollection('pool'), {
        name:       item.name ?? item.n ?? '（無名稱）',
        howMet:     item.howMet ?? item.hm ?? '',
        impression: item.impression ?? item.imp ?? '',
        status:     'pending',
        createdAt:  serverTimestamp(),
        _migratedFrom: 'ma3',
      });
      ok++;
    } catch (err) {
      console.error('[migration] addDoc error', err, item);
      fail++;
    }
  }

  localStorage.removeItem('ma3_c');

  if (fail === 0) {
    toast(`已匯入 ${ok} 筆名單到名單池`, 'success');
  } else {
    toast(`匯入完成：成功 ${ok} 筆，失敗 ${fail} 筆`, 'warning');
  }
}
