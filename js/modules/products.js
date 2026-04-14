/**
 * products.js — 模組五：自用產品記錄
 */
import { navigate } from '../router.js';
import {
  userCollection, userSubDoc,
  addDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from '../db.js';
import { toast, todayStr, formatDate, formatNumber, emptyState, confirmDialog } from '../utils.js';

let _unsubscribe = null;
let _allItems    = [];
let _catFilter   = 'all';

const CAT_LABELS = {
  all:        '全部',
  supplement: '保健品',
  skincare:   '護膚品',
  household:  '家用品',
  other:      '其他',
};

const CAT_ICONS = {
  supplement: '💊',
  skincare:   '✨',
  household:  '🏠',
  other:      '📦',
};

export function render(content) {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _catFilter = 'all';
  _allItems  = [];

  content.innerHTML = _buildShell();
  _bindEvents(content);
  _startSnapshot(content);
}

// ── 骨架 HTML ──────────────────────────────────────────────

function _buildShell() {
  const catChips = Object.entries(CAT_LABELS).map(([k, v]) =>
    `<button class="chip prod-chip${k === 'all' ? ' active' : ''}" data-cat="${k}">${v}</button>`
  ).join('');

  return `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">🛍️ 自用產品記錄</span>
      <button class="btn btn-primary prod-add-btn" style="font-size:.8rem;padding:.3rem .7rem">＋ 新增</button>
    </div>
    <div class="card prod-summary-card">
      <span class="prod-summary-label">本月消費</span>
      <span class="prod-summary-val" id="prod-month-summary">計算中…</span>
    </div>
    <div class="filter-chips">
      ${catChips}
    </div>
    <div class="list-container prod-list"></div>
  `;
}

// ── 事件綁定 ──────────────────────────────────────────────

function _bindEvents(content) {
  content.querySelector('.sub-page-back').addEventListener('click', () => {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    navigate('more');
  });

  content.querySelector('.prod-add-btn').addEventListener('click', _openAddModal);

  content.querySelector('.filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.prod-chip');
    if (!chip) return;
    _catFilter = chip.dataset.cat;
    content.querySelectorAll('.prod-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.cat === _catFilter)
    );
    _renderList(content);
  });

  content.querySelector('.prod-list').addEventListener('click', async e => {
    const btn = e.target.closest('.prod-del-btn');
    if (!btn) return;
    await _deleteItem(btn.dataset.id);
  });
}

// ── Firestore 即時監聽 ─────────────────────────────────────

function _startSnapshot(content) {
  try {
    const q = query(userCollection('products'), orderBy('date', 'desc'));
    _unsubscribe = onSnapshot(q, snap => {
      if (!content.querySelector('.prod-list')) return;
      _allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _updateSummary();
      _renderList(content);
    }, err => {
      console.error('[products] snapshot error', err);
      toast('產品記錄載入失敗', 'error');
    });
  } catch (e) {
    console.error('[products] init error', e);
  }
}

// ── 本月統計 ──────────────────────────────────────────────

function _updateSummary() {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  let totalAmt = 0, totalBV = 0;
  _allItems.forEach(item => {
    const d = new Date(item.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      totalAmt += Number(item.amount) || 0;
      totalBV  += Number(item.bv)     || 0;
    }
  });
  const el = document.getElementById('prod-month-summary');
  if (el) el.textContent = `NT$${formatNumber(totalAmt)} ／ BV ${formatNumber(totalBV)}`;
}

// ── 渲染清單 ──────────────────────────────────────────────

function _renderList(content) {
  const area = content.querySelector('.prod-list');
  if (!area) return;

  const items = _catFilter === 'all'
    ? _allItems
    : _allItems.filter(x => x.category === _catFilter);

  if (items.length === 0) {
    area.innerHTML = emptyState('🛍️',
      _catFilter === 'all' ? '還沒有產品記錄\n點右上角 ＋ 新增' : '此分類沒有記錄'
    );
    return;
  }

  area.innerHTML = items.map(item => `
    <div class="card">
      <div class="card-row" style="align-items:center">
        <div class="prod-cat-icon">${CAT_ICONS[item.category] ?? '📦'}</div>
        <div class="card-info">
          <div class="card-name">${_esc(item.item)}</div>
          <div class="card-sub">
            ${formatDate(item.date)} · ${CAT_LABELS[item.category] ?? item.category}${item.isAutoship ? ' 🔄 自動訂貨' : ''}
          </div>
          <div class="card-sub">
            NT$${formatNumber(item.amount)} ／ BV ${formatNumber(item.bv)}${item.note ? ` · ${_esc(item.note)}` : ''}
          </div>
        </div>
        <button class="btn btn-ghost prod-del-btn" data-id="${item.id}"
          style="font-size:.75rem;padding:.25rem .5rem;color:var(--dg);flex-shrink:0">刪除</button>
      </div>
    </div>
  `).join('');
}

// ── 新增 Modal ─────────────────────────────────────────────

function _openAddModal() {
  const catOpts = Object.entries(CAT_LABELS)
    .filter(([k]) => k !== 'all')
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');

  const el = _createModal(`
    <div class="modal-title">新增產品記錄</div>
    <div class="form-group">
      <label class="form-label">品項名稱 <span style="color:var(--dg)">*</span></label>
      <input class="form-input" id="prod-item" placeholder="例：OPC-3" autocomplete="off">
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">購買日期</label>
        <input class="form-input" id="prod-date" type="date" value="${todayStr()}">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">分類</label>
        <select class="form-select" id="prod-cat">${catOpts}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">金額（NT$）</label>
        <input class="form-input" id="prod-amount" type="number" min="0" placeholder="0">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">BV 點數</label>
        <input class="form-input" id="prod-bv" type="number" min="0" placeholder="0">
      </div>
    </div>
    <div class="form-group">
      <label class="form-check-label">
        <input type="checkbox" id="prod-autoship"> 自動訂貨
      </label>
    </div>
    <div class="form-group">
      <label class="form-label">備註</label>
      <input class="form-input" id="prod-note" placeholder="選填">
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost prod-modal-cancel">取消</button>
      <button class="btn btn-primary prod-modal-save">儲存</button>
    </div>
  `);

  setTimeout(() => el.querySelector('#prod-item')?.focus(), 300);
  el.querySelector('.prod-modal-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.prod-modal-save').onclick = async () => {
    const itemInput = el.querySelector('#prod-item');
    const item = itemInput.value.trim();
    if (!item) {
      itemInput.style.borderColor = 'var(--dg)';
      itemInput.focus();
      return;
    }
    const saveBtn = el.querySelector('.prod-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中…';

    try {
      await addDoc(userCollection('products'), {
        date:       el.querySelector('#prod-date').value || todayStr(),
        item,
        category:   el.querySelector('#prod-cat').value,
        amount:     Number(el.querySelector('#prod-amount').value) || 0,
        bv:         Number(el.querySelector('#prod-bv').value)     || 0,
        isAutoship: el.querySelector('#prod-autoship').checked,
        note:       el.querySelector('#prod-note').value.trim(),
        createdAt:  serverTimestamp(),
      });
      toast(`已新增 ${item}`, 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[products] addDoc error', err);
      toast('新增失敗，請重試', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存';
    }
  };
}

// ── 刪除 ───────────────────────────────────────────────────

async function _deleteItem(id) {
  const ok = await confirmDialog('確定刪除這筆產品記錄？');
  if (!ok) return;
  try {
    await deleteDoc(userSubDoc('products', id));
    toast('已刪除', 'success');
  } catch (err) {
    console.error('[products] delete error', err);
    toast('刪除失敗', 'error');
  }
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

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
