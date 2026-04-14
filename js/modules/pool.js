/**
 * pool.js — 模組二：名單池
 * 所有認識的人的大水庫，快速新增、篩選後選入首選名單
 */
import { registerTab } from '../router.js';
import {
  userCollection, userSubDoc,
  addDoc, updateDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from '../db.js';
import { toast, avatarColor, avatarInitial, emptyState, debounce } from '../utils.js';
import { recordPoolAdded } from './daily312.js';

let _unsubscribe = null;
let _allItems = [];
let _filter = 'pending';
let _searchQuery = '';

export function init() {
  registerTab('pool', render);
}

export function render(content) {
  // 停掉上一次的即時監聽
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _filter = 'pending';
  _searchQuery = '';

  content.innerHTML = _buildShell();
  _bindEvents(content);
  _startSnapshot(content);
}

// ── 骨架 HTML ──────────────────────────────────────────────

function _buildShell() {
  return `
    <div class="search-bar">
      <input class="search-input pool-search" type="search" placeholder="搜尋姓名…" autocomplete="off">
      <button class="fab-btn pool-add-btn" title="新增名單">＋</button>
    </div>
    <div class="filter-chips">
      <button class="chip pool-chip active" data-filter="pending">待篩選</button>
      <button class="chip pool-chip" data-filter="selected">已選入</button>
      <button class="chip pool-chip" data-filter="closed">已結案</button>
    </div>
    <div class="pool-list-area list-container"></div>
  `;
}

// ── 事件綁定 ──────────────────────────────────────────────

function _bindEvents(content) {
  content.querySelector('.pool-search').addEventListener(
    'input',
    debounce(e => {
      _searchQuery = e.target.value.trim().toLowerCase();
      _renderList(content);
    }, 250)
  );

  content.querySelector('.pool-add-btn').addEventListener('click', _openAddModal);

  content.querySelector('.filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.pool-chip');
    if (!chip) return;
    _filter = chip.dataset.filter;
    content.querySelectorAll('.pool-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.filter === _filter)
    );
    _renderList(content);
  });

  // 選入首選（事件代理）
  content.querySelector('.pool-list-area').addEventListener('click', e => {
    const btn = e.target.closest('.pool-select-btn');
    if (!btn) return;
    const item = _allItems.find(x => x.id === btn.dataset.id);
    if (item) _openSelectModal(item);
  });
}

// ── Firestore 即時監聽 ─────────────────────────────────────

function _startSnapshot(content) {
  try {
    const q = query(userCollection('pool'), orderBy('createdAt', 'desc'));
    _unsubscribe = onSnapshot(
      q,
      snap => {
        if (!content.querySelector('.pool-list-area')) return; // 已離開此 Tab
        _allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _refreshChips(content);
        _renderList(content);
      },
      err => {
        console.error('[pool] onSnapshot error', err);
        toast('名單池載入失敗，請重新整理', 'error');
      }
    );
  } catch (e) {
    console.error('[pool] query error', e);
    toast('名單池初始化失敗', 'error');
  }
}

// ── 更新 chip 計數 ─────────────────────────────────────────

function _refreshChips(content) {
  const counts = {
    pending:  _allItems.filter(x => x.status === 'pending').length,
    selected: _allItems.filter(x => x.status === 'selected').length,
    closed:   _allItems.filter(x => x.status === 'closed').length,
  };
  const labels = { pending: '待篩選', selected: '已選入', closed: '已結案' };
  content.querySelectorAll('.pool-chip').forEach(chip => {
    const f = chip.dataset.filter;
    chip.textContent = `${labels[f]} ${counts[f]}`;
  });
}

// ── 渲染清單 ──────────────────────────────────────────────

function _renderList(content) {
  const area = content.querySelector('.pool-list-area');
  if (!area) return;

  const pendingCount = _allItems.filter(x => x.status === 'pending').length;
  let items = _allItems.filter(x => x.status === _filter);
  if (_searchQuery) {
    items = items.filter(x => (x.name || '').toLowerCase().includes(_searchQuery));
  }

  let html = '';

  // 補充名單提醒（待篩選 < 10 時）
  if (_filter === 'pending' && pendingCount < 10 && !_searchQuery) {
    html += `<div class="pool-warning">⚠️ 待篩選不足 10 人，該補充名單了！</div>`;
  }

  if (items.length === 0) {
    const emptyMsg = {
      pending:  _searchQuery ? '找不到符合的名單' : '還沒有待篩選名單\n點右上角 ＋ 開始新增',
      selected: '尚未選入任何人到首選名單',
      closed:   '沒有已結案的名單',
    };
    html += emptyState('📋', emptyMsg[_filter]);
  } else {
    items.forEach(item => { html += _buildCard(item); });
  }

  area.innerHTML = html;
}

// ── 卡片 HTML ──────────────────────────────────────────────

function _buildCard(item) {
  const bg      = avatarColor(item.name);
  const initial = avatarInitial(item.name);
  const parts   = [item.howMet, item.impression].filter(Boolean);
  const sub     = parts.join(' · ') || '（無描述）';

  const badgeHtml = {
    pending:  `<span class="badge badge-pending">待篩選</span>`,
    selected: `<span class="badge badge-active">已選入</span>`,
    closed:   `<span class="badge badge-paused">已結案</span>`,
  }[item.status] ?? '';

  const actionHtml = item.status === 'pending'
    ? `<button class="btn btn-secondary pool-select-btn" data-id="${item.id}" style="font-size:.75rem;padding:.28rem .7rem;margin-top:4px">選入首選 →</button>`
    : '';

  return `
    <div class="card">
      <div class="card-row">
        <div class="avatar" style="background:${bg}">${_esc(initial)}</div>
        <div class="card-info">
          <div class="card-name">${_esc(item.name || '未命名')}</div>
          <div class="card-sub">${_esc(sub)}</div>
        </div>
        <div class="card-actions">
          ${badgeHtml}
          ${actionHtml}
        </div>
      </div>
    </div>
  `;
}

// ── 新增名單 Modal ─────────────────────────────────────────

/** 供外部（daily312 快速新增按鈕）使用 */
export function openAddModal() {
  _openAddModal();
}

function _openAddModal() {
  const el = _createModal(`
    <div class="modal-title">新增名單</div>
    <div class="form-group">
      <label class="form-label">姓名 <span style="color:var(--dg)">*</span></label>
      <input class="form-input" id="pool-add-name" placeholder="例：王大明" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">怎麼認識的</label>
      <input class="form-input" id="pool-add-howmet" placeholder="例：大學同學、健身房認識">
    </div>
    <div class="form-group">
      <label class="form-label">大概印象</label>
      <textarea class="form-textarea" id="pool-add-impression" placeholder="例：對健康有興趣、在找副業" style="min-height:70px"></textarea>
    </div>
    <div class="pool-modal-actions">
      <button class="btn btn-ghost pool-modal-cancel">取消</button>
      <button class="btn btn-primary pool-modal-save">儲存</button>
    </div>
  `);

  setTimeout(() => el.querySelector('#pool-add-name')?.focus(), 300);

  el.querySelector('.pool-modal-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.pool-modal-save').onclick = async () => {
    const nameInput = el.querySelector('#pool-add-name');
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.style.borderColor = 'var(--dg)';
      nameInput.focus();
      return;
    }
    const saveBtn = el.querySelector('.pool-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中…';

    try {
      const docRef = await addDoc(userCollection('pool'), {
        name,
        howMet:     el.querySelector('#pool-add-howmet').value.trim(),
        impression: el.querySelector('#pool-add-impression').value.trim(),
        status:     'pending',
        createdAt:  serverTimestamp(),
      });
      // 計入今日 312 poolCount（靜默失敗不影響主流程）
      recordPoolAdded(docRef.id, name).catch(() => {});
      toast(`已新增 ${name}`, 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[pool] addDoc error', err);
      toast('新增失敗，請重試', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存';
    }
  };
}

// ── 選入首選 Modal ─────────────────────────────────────────

function _openSelectModal(item) {
  const el = _createModal(`
    <div class="modal-title">選入首選名單</div>
    <p class="pool-modal-desc">將 <strong>${_esc(item.name)}</strong> 加入首選名單，開始追蹤六步驟進度。</p>
    <div class="form-group">
      <label class="form-label">電話（選填）</label>
      <input class="form-input" id="pool-sel-phone" type="tel" placeholder="例：0912-345-678">
    </div>
    <div class="form-group">
      <label class="form-label">Email（選填）</label>
      <input class="form-input" id="pool-sel-email" type="email" placeholder="例：example@mail.com">
    </div>
    <div class="pool-modal-actions">
      <button class="btn btn-ghost pool-modal-cancel">取消</button>
      <button class="btn btn-primary pool-modal-confirm">確認選入</button>
    </div>
  `);

  el.querySelector('.pool-modal-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.pool-modal-confirm').onclick = async () => {
    const confirmBtn = el.querySelector('.pool-modal-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '處理中…';

    const phone = el.querySelector('#pool-sel-phone').value.trim();
    const email = el.querySelector('#pool-sel-email').value.trim();

    try {
      // 1. 將名單池條目標記為已選入
      await updateDoc(userSubDoc('pool', item.id), {
        status:     'selected',
        selectedAt: serverTimestamp(),
      });
      // 2. 在首選名單建立一筆新記錄
      await addDoc(userCollection('prospects'), {
        name:          item.name,
        phone,
        email,
        poolRef:       item.id,
        recruitStep:   1,
        status:        'active',
        howMet:        item.howMet || '',
        impression:    item.impression || '',
        createdAt:     serverTimestamp(),
        lastContactAt: null,
      });
      toast(`${item.name} 已加入首選名單`, 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[pool] select error', err);
      toast('操作失敗，請重試', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '確認選入';
    }
  };
}

// ── Modal 工具 ─────────────────────────────────────────────

function _createModal(innerHtml) {
  const container = document.getElementById('modal-container');
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="modal-box">${innerHtml}</div>`;
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  return el;
}

function _closeModal(el) {
  el.classList.remove('show');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ── 字串跳脫（防 XSS） ────────────────────────────────────

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
