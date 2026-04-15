/**
 * prospects.js — 模組一+三：首選名單 + FORMHD + 招募六步驟 + 會面記錄
 */
import { registerTab } from '../router.js';
import {
  userCollection, userSubDoc, userSubCollection, userSubSubDoc,
  addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from '../db.js';
import {
  toast, avatarColor, avatarInitial, emptyState, debounce,
  todayStr, formatRelativeDate, confirmDialog
} from '../utils.js';
import { checkAchievements } from './achievements.js';

// ── 常數設定 ──────────────────────────────────────────────

const STEPS = ['列名單', '講商機', '會邀約', '說制度', '懂締結', '要跟進'];

const STEP_TIPS = {
  4: '建議安排 ABC，找上線一起出席',
  5: '建議跟上線討論締結策略',
};

const STATUS_LABELS = {
  active: '持續跟進',
  paused: '暫停',
  vip:    '優惠顧客',
  signed: '成功簽約',
};

const STATUS_BADGE = {
  active: 'badge-active',
  paused: 'badge-paused',
  vip:    'badge-vip',
  signed: 'badge-signed',
};

const TALK_TYPE_LABELS = {
  chat:   '聊天',
  call:   '通話',
  meet:   '會面',
  social: '社群互動',
  other:  '其他',
};

const PROGRESS_OPTIONS = [
  '已介紹產品/商機',
  '已確認有興趣',
  '已約好下次見面',
  '已說明制度',
  '已確認意願',
  '需要上線協助',
];

const FORMHD_META = {
  F: { label: '家庭 Family',       icon: '🏠' },
  O: { label: '職業 Occupation',   icon: '💼' },
  R: { label: '休閒 Recreation',   icon: '🎯' },
  M: { label: '財務 Money',        icon: '💰' },
  H: { label: '健康 Health',       icon: '❤️' },
  D: { label: '夢想 Dream',        icon: '🌟' },
};

// ── 模組狀態 ──────────────────────────────────────────────

let _unsubscribe        = null;
let _detailUnsubTalks   = null;
let _detailUnsubSales   = null;
let _allProspects       = [];
let _filter             = 'all';
let _searchQuery        = '';
let _sortBy             = 'lastContact'; // 'lastContact' | 'created'
let _currentDetailPanel = null;

// ── 模組進入點 ────────────────────────────────────────────

export function init() {
  registerTab('prospects', render);
}

export function render(content) {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _closeDetail();
  _filter       = 'all';
  _searchQuery  = '';
  _sortBy       = 'lastContact';

  content.innerHTML = _buildShell();
  _bindListEvents(content);
  _startSnapshot(content);
}

// ── 骨架 HTML ──────────────────────────────────────────────

function _buildShell() {
  return `
    <div class="search-bar">
      <input class="search-input prs-search" type="search" placeholder="搜尋姓名…" autocomplete="off">
      <button class="btn btn-ghost prs-sort-btn" style="padding:.4rem .65rem;font-size:.75rem;white-space:nowrap;flex-shrink:0">久未聯繫</button>
      <button class="fab-btn prs-add-btn" title="新增名單">＋</button>
    </div>
    <div class="filter-chips">
      <button class="chip prs-chip active" data-filter="all">全部</button>
      <button class="chip prs-chip" data-filter="active">持續跟進</button>
      <button class="chip prs-chip" data-filter="paused">暫停</button>
      <button class="chip prs-chip" data-filter="vip">優惠顧客</button>
      <button class="chip prs-chip" data-filter="signed">成功簽約</button>
    </div>
    <div class="prs-list-area list-container"></div>
  `;
}

// ── 列表事件綁定 ───────────────────────────────────────────

function _bindListEvents(content) {
  content.querySelector('.prs-search').addEventListener(
    'input',
    debounce(e => {
      _searchQuery = e.target.value.trim().toLowerCase();
      _renderList(content);
    }, 250)
  );

  content.querySelector('.prs-add-btn').addEventListener('click', _openAddModal);

  const sortBtn = content.querySelector('.prs-sort-btn');
  sortBtn.addEventListener('click', () => {
    _sortBy = _sortBy === 'lastContact' ? 'created' : 'lastContact';
    sortBtn.textContent = _sortBy === 'lastContact' ? '久未聯繫' : '最新建立';
    _renderList(content);
  });

  content.querySelector('.filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.prs-chip');
    if (!chip) return;
    _filter = chip.dataset.filter;
    content.querySelectorAll('.prs-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.filter === _filter)
    );
    _renderList(content);
  });

  content.querySelector('.prs-list-area').addEventListener('click', e => {
    const card = e.target.closest('.prs-card');
    if (!card) return;
    const p = _allProspects.find(x => x.id === card.dataset.id);
    if (p) _openDetail(p);
  });
}

// ── Firestore 即時監聽 ─────────────────────────────────────

function _startSnapshot(content) {
  try {
    const q = query(userCollection('prospects'), orderBy('createdAt', 'desc'));
    _unsubscribe = onSnapshot(q, snap => {
      if (!content.querySelector('.prs-list-area')) return;
      _allProspects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _refreshChips(content);
      _renderList(content);
    }, err => {
      console.error('[prospects] snapshot error', err);
      toast('首選名單載入失敗，請重新整理', 'error');
    });
  } catch (e) {
    console.error('[prospects] query error', e);
    toast('首選名單初始化失敗', 'error');
  }
}

// ── 更新 chip 計數 ─────────────────────────────────────────

function _refreshChips(content) {
  const counts = {
    all:    _allProspects.length,
    active: _allProspects.filter(p => p.status === 'active').length,
    paused: _allProspects.filter(p => p.status === 'paused').length,
    vip:    _allProspects.filter(p => p.status === 'vip').length,
    signed: _allProspects.filter(p => p.status === 'signed').length,
  };
  const labels = { all: '全部', active: '持續跟進', paused: '暫停', vip: '優惠顧客', signed: '成功簽約' };
  content.querySelectorAll('.prs-chip').forEach(chip => {
    const f = chip.dataset.filter;
    chip.textContent = `${labels[f]} ${counts[f]}`;
  });
}

// ── 渲染列表 ──────────────────────────────────────────────

function _renderList(content) {
  const area = content.querySelector('.prs-list-area');
  if (!area) return;

  let items = _filter === 'all'
    ? [..._allProspects]
    : _allProspects.filter(p => p.status === _filter);

  if (_searchQuery) {
    items = items.filter(p => (p.name || '').toLowerCase().includes(_searchQuery));
  }

  if (_sortBy === 'lastContact') {
    // 久未聯繫在前（null = 從未聯繫，排最前）
    items.sort((a, b) => {
      const ta = a.lastContactAt?.toDate?.()?.getTime() ?? 0;
      const tb = b.lastContactAt?.toDate?.()?.getTime() ?? 0;
      return ta - tb;
    });
  } else {
    // 最新建立在前
    items.sort((a, b) => {
      const ta = a.createdAt?.toDate?.()?.getTime() ?? 0;
      const tb = b.createdAt?.toDate?.()?.getTime() ?? 0;
      return tb - ta;
    });
  }

  if (items.length === 0) {
    const msg = _searchQuery
      ? '找不到符合的名單'
      : _filter === 'all'
        ? '還沒有首選名單\n從名單池選入，或點 ＋ 直接新增'
        : `沒有「${STATUS_LABELS[_filter] ?? ''}」的名單`;
    area.innerHTML = emptyState('⭐', msg);
  } else {
    area.innerHTML = items.map(_buildCard).join('');
  }
}

// ── 列表卡片 HTML ─────────────────────────────────────────

function _buildCard(p) {
  const bg         = avatarColor(p.name);
  const initial    = avatarInitial(p.name);
  const badgeCls   = STATUS_BADGE[p.status] ?? 'badge-active';
  const badgeLabel = STATUS_LABELS[p.status] ?? '';
  const stepLabel  = `Step ${p.recruitStep ?? 1}：${STEPS[(p.recruitStep ?? 1) - 1]}`;
  const lastTouch  = p.lastContactAt
    ? formatRelativeDate(p.lastContactAt.toDate?.() ?? p.lastContactAt)
    : '尚未聯繫';

  return `
    <div class="card prs-card" data-id="${p.id}">
      <div class="card-row">
        <div class="avatar" style="background:${bg}">${_esc(initial)}</div>
        <div class="card-info">
          <div class="card-name">
            ${_esc(p.name || '未命名')}
            <span class="badge ${badgeCls}">${badgeLabel}</span>
          </div>
          <div class="card-sub">${stepLabel} · ${lastTouch}</div>
        </div>
        <div class="card-actions" style="font-size:1.2rem;color:var(--tx3)">›</div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  詳情滑入面板
// ═══════════════════════════════════════════════════════════

function _openDetail(p) {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  if (_detailUnsubTalks) { _detailUnsubTalks(); _detailUnsubTalks = null; }
  if (_detailUnsubSales) { _detailUnsubSales(); _detailUnsubSales = null; }

  _currentDetailPanel = panel;
  panel.innerHTML     = _buildDetailHtml(p);
  panel.classList.add('open');
  _bindDetailEvents(p);
  _startDetailSnapshots(p.id);
}

function _closeDetail() {
  if (_detailUnsubTalks) { _detailUnsubTalks(); _detailUnsubTalks = null; }
  if (_detailUnsubSales) { _detailUnsubSales(); _detailUnsubSales = null; }
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.remove('open');
  _currentDetailPanel = null;
}

// ── 詳情頁 HTML ────────────────────────────────────────────

function _buildDetailHtml(p) {
  const bg         = avatarColor(p.name);
  const initial    = avatarInitial(p.name);
  const badgeCls   = STATUS_BADGE[p.status] ?? 'badge-active';
  const badgeLabel = STATUS_LABELS[p.status] ?? '';
  const step       = p.recruitStep ?? 1;
  const isLastStep = step >= 6;

  // FORMHD 六格
  const fkeys      = ['F', 'O', 'R', 'M', 'H', 'D'];
  const formhd     = p.formhd ?? {};
  const formhdHtml = fkeys.map(k => {
    const { label, icon } = FORMHD_META[k];
    const val = formhd[k] || '';
    return `
      <div class="formhd-cell" data-key="${k}">
        <div class="formhd-label">${icon} ${label.split(' ')[0]}</div>
        <div class="formhd-content ${val ? '' : 'formhd-empty'}">${val ? _esc(val) : '點擊填寫…'}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="prs-detail-header">
      <button class="btn btn-ghost prs-back-btn" style="padding:.5rem .8rem">← 返回</button>
      <button class="btn btn-ghost prs-edit-btn" style="padding:.5rem .8rem">編輯</button>
    </div>

    <div class="prs-detail-profile">
      <div class="avatar" style="background:${bg};width:52px;height:52px;font-size:1.2rem;flex-shrink:0">${_esc(initial)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:1.05rem;font-weight:600">${_esc(p.name || '未命名')}</div>
        <div style="margin-top:5px;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
          <span class="badge ${badgeCls}">${badgeLabel}</span>
          ${p.phone ? `<span style="font-size:.77rem;color:var(--tx3)">${_esc(p.phone)}</span>` : ''}
          ${p.email ? `<span style="font-size:.77rem;color:var(--tx3)">${_esc(p.email)}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- 六步驟 -->
    <div class="prs-detail-section">
      <div class="prs-section-title">
        <span>招募六步驟</span>
        ${isLastStep
          ? `<span class="badge badge-signed">全部完成 🎉</span>`
          : `<button class="btn btn-secondary prs-nextstep-btn" style="font-size:.75rem;padding:.28rem .7rem">推進下一步 →</button>`
        }
      </div>
      ${_buildStepBar(step)}
    </div>

    <!-- FORMHD -->
    <div class="prs-detail-section">
      <div class="prs-section-title">
        <span>FORMHD 資料</span>
        <button class="btn btn-ghost prs-formhd-btn" style="font-size:.73rem;padding:.25rem .6rem">全部編輯</button>
      </div>
      <div class="formhd-grid">${formhdHtml}</div>
    </div>

    <!-- 會面記錄 -->
    <div class="prs-detail-section">
      <div class="prs-section-title">
        <span>會面記錄</span>
        <button class="btn btn-secondary prs-add-talk-btn" style="font-size:.75rem;padding:.28rem .7rem">＋ 新增</button>
      </div>
      <div class="prs-talks-list"><div class="prs-loading">載入中…</div></div>
    </div>

    ${(p.status === 'vip' || p.status === 'signed') ? `
    <!-- 購物記錄 -->
    <div class="prs-detail-section">
      <div class="prs-section-title">
        <span>購物記錄</span>
        <button class="btn btn-secondary prs-add-sale-btn" style="font-size:.75rem;padding:.28rem .7rem">＋ 新增</button>
      </div>
      <div class="prs-sales-list"><div class="prs-loading">載入中…</div></div>
    </div>
    ` : ''}

    <div style="height:2.5rem"></div>
  `;
}

// ── 詳情事件綁定 ───────────────────────────────────────────

function _bindDetailEvents(p) {
  const panel = _currentDetailPanel;
  if (!panel) return;

  panel.querySelector('.prs-back-btn').addEventListener('click', _closeDetail);

  panel.querySelector('.prs-edit-btn').addEventListener('click', () => {
    const latest = _allProspects.find(x => x.id === p.id) ?? p;
    _openEditModal(latest);
  });

  panel.querySelector('.prs-nextstep-btn')?.addEventListener('click', () => {
    const latest = _allProspects.find(x => x.id === p.id) ?? p;
    _openStepModal(latest);
  });

  // FORMHD 格子點擊
  panel.querySelector('.formhd-grid').addEventListener('click', e => {
    const cell = e.target.closest('.formhd-cell');
    if (!cell) return;
    const latest = _allProspects.find(x => x.id === p.id) ?? p;
    _openFormhdModal(latest, cell.dataset.key);
  });

  panel.querySelector('.prs-formhd-btn').addEventListener('click', () => {
    const latest = _allProspects.find(x => x.id === p.id) ?? p;
    _openFormhdModal(latest, null);
  });

  panel.querySelector('.prs-add-talk-btn').addEventListener('click', () => {
    const latest = _allProspects.find(x => x.id === p.id) ?? p;
    _openTalkModal(latest);
  });

  panel.querySelector('.prs-add-sale-btn')?.addEventListener('click', () => {
    _openSaleModal(p.id, p.name);
  });
}

// ── 子集合即時監聽 ─────────────────────────────────────────

function _startDetailSnapshots(prospectId) {
  const panel = _currentDetailPanel;
  if (!panel) return;

  // Talks
  try {
    const tq = query(userSubCollection('prospects', prospectId, 'talks'), orderBy('createdAt', 'desc'));
    _detailUnsubTalks = onSnapshot(tq, snap => {
      const el = panel.querySelector('.prs-talks-list');
      if (!el) return;
      const talks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      el.innerHTML = talks.length
        ? talks.map(_buildTalkCard).join('')
        : `<p class="prs-empty-sub">尚無會面記錄</p>`;
    }, err => console.error('[talks] snapshot error', err));
  } catch (e) {
    console.error('[talks] query error', e);
  }

  // Sales
  const salesEl = panel.querySelector('.prs-sales-list');
  if (salesEl) {
    try {
      const sq = query(userSubCollection('prospects', prospectId, 'sales'), orderBy('createdAt', 'desc'));
      _detailUnsubSales = onSnapshot(sq, snap => {
        const el = panel.querySelector('.prs-sales-list');
        if (!el) return;
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        el.innerHTML = sales.length
          ? sales.map(_buildSaleCard).join('')
          : `<p class="prs-empty-sub">尚無購物記錄</p>`;
      }, err => console.error('[sales] snapshot error', err));
    } catch (e) {
      console.error('[sales] query error', e);
    }
  }
}

// ── 會面記錄卡片 ──────────────────────────────────────────

function _buildTalkCard(talk) {
  const typeLabel   = TALK_TYPE_LABELS[talk.type] ?? talk.type ?? '其他';
  const emotionIcon = { good: '😊', normal: '😐', stuck: '😰' }[talk.emotion] ?? '';
  const progress    = Array.isArray(talk.progress) && talk.progress.length > 0;

  return `
    <div class="prs-talk-card">
      <div class="prs-talk-meta">
        <span class="prs-talk-type">${typeLabel}</span>
        <span>${_esc(talk.date ?? '')}</span>
        ${emotionIcon ? `<span>${emotionIcon}</span>` : ''}
      </div>
      ${talk.content  ? `<div class="prs-talk-field"><span class="prs-talk-field-label">內容</span>${_esc(talk.content)}</div>` : ''}
      ${talk.reaction ? `<div class="prs-talk-field"><span class="prs-talk-field-label">對方反應</span>${_esc(talk.reaction)}</div>` : ''}
      ${progress ? `<div class="prs-talk-progress">${talk.progress.map(t => `<span class="chip" style="font-size:.68rem;padding:.12rem .45rem;cursor:default">${_esc(t)}</span>`).join('')}</div>` : ''}
      ${(talk.nextDt || talk.nextLoc) ? `<div class="prs-talk-field" style="color:var(--ac)"><span class="prs-talk-field-label">下次約定</span>${_esc([talk.nextDt, talk.nextLoc].filter(Boolean).join('　'))}</div>` : ''}
      ${talk.stuckNote ? `<div class="prs-talk-field" style="color:var(--wn)"><span class="prs-talk-field-label">遇到的問題</span>${_esc(talk.stuckNote)}</div>` : ''}
    </div>
  `;
}

// ── 購物記錄卡片 ──────────────────────────────────────────

function _buildSaleCard(sale) {
  return `
    <div class="prs-sale-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:.88rem;font-weight:500">${_esc(sale.item ?? '未填品項')}</div>
          <div style="font-size:.74rem;color:var(--tx3)">${_esc(sale.date ?? '')}</div>
        </div>
        <div style="font-size:.9rem;font-weight:600;color:var(--ac)">NT$ ${Number(sale.amount ?? 0).toLocaleString('zh-TW')}</div>
      </div>
      ${sale.note ? `<div style="font-size:.77rem;color:var(--tx3);margin-top:3px">${_esc(sale.note)}</div>` : ''}
    </div>
  `;
}

// ── 六步驟進度條 HTML ─────────────────────────────────────

function _buildStepBar(currentStep) {
  let html = '<div class="step-bar">';
  STEPS.forEach((label, i) => {
    const step    = i + 1;
    const done    = step < currentStep;
    const current = step === currentStep;
    const cls     = done ? 'step-dot done' : current ? 'step-dot current' : 'step-dot';
    html += `<div class="step-node"><div class="${cls}"></div><div class="step-label">${label}</div></div>`;
    if (i < STEPS.length - 1) {
      html += `<div class="step-line ${done ? 'done' : ''}"></div>`;
    }
  });
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════
//  新增 / 編輯名單 Modal
// ═══════════════════════════════════════════════════════════

function _openAddModal() {
  const el = _createModal(`
    <div class="modal-title">新增首選名單</div>
    <div class="form-group">
      <label class="form-label">姓名 <span style="color:var(--dg)">*</span></label>
      <input class="form-input" id="prs-add-name" placeholder="例：王大明" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">電話</label>
      <input class="form-input" id="prs-add-phone" type="tel" placeholder="例：0912-345-678">
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-input" id="prs-add-email" type="email" placeholder="例：example@mail.com">
    </div>
    <div class="form-group">
      <label class="form-label">怎麼認識的</label>
      <input class="form-input" id="prs-add-howmet" placeholder="例：大學同學">
    </div>
    <div class="prs-modal-actions">
      <button class="btn btn-ghost prs-cancel">取消</button>
      <button class="btn btn-primary prs-save">新增</button>
    </div>
  `);

  setTimeout(() => el.querySelector('#prs-add-name')?.focus(), 300);
  _bindCancel(el);

  el.querySelector('.prs-save').onclick = async () => {
    const nameInput = el.querySelector('#prs-add-name');
    const name = nameInput.value.trim();
    if (!name) { nameInput.style.borderColor = 'var(--dg)'; nameInput.focus(); return; }
    const btn = el.querySelector('.prs-save');
    btn.disabled = true; btn.textContent = '新增中…';
    try {
      await addDoc(userCollection('prospects'), {
        name,
        phone:         el.querySelector('#prs-add-phone').value.trim(),
        email:         el.querySelector('#prs-add-email').value.trim(),
        howMet:        el.querySelector('#prs-add-howmet').value.trim(),
        status:        'active',
        recruitStep:   1,
        stepHistory:   [],
        formhd:        { F: '', O: '', R: '', M: '', H: '', D: '' },
        poolRef:       null,
        createdAt:     serverTimestamp(),
        lastContactAt: null,
      });
      toast(`已新增 ${name}`, 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[prospects] addDoc error', err);
      toast('新增失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '新增';
    }
  };
}

function _openEditModal(p) {
  const statusOpts = Object.entries(STATUS_LABELS).map(([v, l]) =>
    `<option value="${v}" ${p.status === v ? 'selected' : ''}>${l}</option>`
  ).join('');

  const el = _createModal(`
    <div class="modal-title">編輯名單</div>
    <div class="form-group">
      <label class="form-label">姓名 <span style="color:var(--dg)">*</span></label>
      <input class="form-input" id="prs-edit-name" value="${_esc(p.name ?? '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">電話</label>
      <input class="form-input" id="prs-edit-phone" type="tel" value="${_esc(p.phone ?? '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-input" id="prs-edit-email" type="email" value="${_esc(p.email ?? '')}">
    </div>
    <div class="form-group">
      <label class="form-label">狀態</label>
      <select class="form-select" id="prs-edit-status">${statusOpts}</select>
    </div>
    <div class="prs-modal-actions">
      <button class="btn btn-danger prs-delete" style="flex:0;padding:.8rem .9rem">刪除</button>
      <button class="btn btn-ghost prs-cancel" style="flex:1">取消</button>
      <button class="btn btn-primary prs-save" style="flex:1">儲存</button>
    </div>
  `);

  _bindCancel(el);

  el.querySelector('.prs-delete').onclick = async () => {
    const ok = await confirmDialog(`確定要刪除「${p.name}」？\n此操作無法復原。`, '刪除', '取消');
    if (!ok) return;
    try {
      await deleteDoc(userSubDoc('prospects', p.id));
      // 同步將名單池的狀態改回待篩選
      if (p.poolRef) {
        updateDoc(userSubDoc('pool', p.poolRef), { status: 'pending' }).catch(() => {});
      }
      toast(`已刪除 ${p.name}`, 'info');
      _closeModal(el);
      _closeDetail();
    } catch (err) {
      console.error('[prospects] delete error', err);
      toast('刪除失敗，請重試', 'error');
    }
  };

  el.querySelector('.prs-save').onclick = async () => {
    const nameInput = el.querySelector('#prs-edit-name');
    const name = nameInput.value.trim();
    if (!name) { nameInput.style.borderColor = 'var(--dg)'; nameInput.focus(); return; }
    const btn = el.querySelector('.prs-save');
    btn.disabled = true; btn.textContent = '儲存中…';
    const phone  = el.querySelector('#prs-edit-phone').value.trim();
    const email  = el.querySelector('#prs-edit-email').value.trim();
    const status = el.querySelector('#prs-edit-status').value;
    try {
      await updateDoc(userSubDoc('prospects', p.id), { name, phone, email, status });
      toast('已更新', 'success');
      _closeModal(el);
      _refreshDetailProfile({ ...p, name, phone, email, status });
      if (status === 'signed') checkAchievements({ first_signed: true }).catch(() => {});
    } catch (err) {
      console.error('[prospects] update error', err);
      toast('儲存失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

// ── 更新詳情頁名片區（編輯後即時反映） ───────────────────────

function _refreshDetailProfile(p) {
  const panel = _currentDetailPanel;
  if (!panel) return;
  const profileEl = panel.querySelector('.prs-detail-profile');
  if (!profileEl) return;
  const bg = avatarColor(p.name);
  const initial = avatarInitial(p.name);
  const badgeCls = STATUS_BADGE[p.status] ?? 'badge-active';
  const badgeLabel = STATUS_LABELS[p.status] ?? '';
  profileEl.innerHTML = `
    <div class="avatar" style="background:${bg};width:52px;height:52px;font-size:1.2rem;flex-shrink:0">${_esc(initial)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:1.05rem;font-weight:600">${_esc(p.name || '未命名')}</div>
      <div style="margin-top:5px;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
        <span class="badge ${badgeCls}">${badgeLabel}</span>
        ${p.phone ? `<span style="font-size:.77rem;color:var(--tx3)">${_esc(p.phone)}</span>` : ''}
        ${p.email ? `<span style="font-size:.77rem;color:var(--tx3)">${_esc(p.email)}</span>` : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  FORMHD 編輯 Modal
// ═══════════════════════════════════════════════════════════

function _openFormhdModal(p, focusKey) {
  const fkeys  = ['F', 'O', 'R', 'M', 'H', 'D'];
  const formhd = p.formhd ?? {};

  const fieldsHtml = fkeys.map(k => {
    const { label, icon } = FORMHD_META[k];
    return `
      <div class="form-group">
        <label class="form-label">${icon} ${label}</label>
        <textarea class="form-textarea prs-fhd-field" data-key="${k}" style="min-height:58px" placeholder="填寫觀察…">${_esc(formhd[k] ?? '')}</textarea>
      </div>
    `;
  }).join('');

  const el = _createModal(`
    <div class="modal-title">FORMHD 資料</div>
    ${fieldsHtml}
    <div class="prs-modal-actions">
      <button class="btn btn-ghost prs-cancel">取消</button>
      <button class="btn btn-primary prs-save">儲存</button>
    </div>
  `);

  if (focusKey) {
    setTimeout(() => {
      const ta = el.querySelector(`[data-key="${focusKey}"]`);
      ta?.focus();
      ta?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  }

  _bindCancel(el);

  el.querySelector('.prs-save').onclick = async () => {
    const updated = {};
    el.querySelectorAll('.prs-fhd-field').forEach(ta => {
      updated[ta.dataset.key] = ta.value.trim();
    });
    const btn = el.querySelector('.prs-save');
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      await updateDoc(userSubDoc('prospects', p.id), { formhd: updated });
      toast('FORMHD 已更新', 'success');
      _closeModal(el);
      _refreshDetailFormhd(updated);
    } catch (err) {
      console.error('[formhd] update error', err);
      toast('儲存失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

function _refreshDetailFormhd(formhd) {
  const panel = _currentDetailPanel;
  if (!panel) return;
  panel.querySelectorAll('.formhd-cell').forEach(cell => {
    const k   = cell.dataset.key;
    const el  = cell.querySelector('.formhd-content');
    if (!el) return;
    const val = formhd[k] ?? '';
    el.textContent = val || '點擊填寫…';
    el.classList.toggle('formhd-empty', !val);
  });
}

// ═══════════════════════════════════════════════════════════
//  六步驟推進 Modal
// ═══════════════════════════════════════════════════════════

function _openStepModal(p) {
  const currentStep = p.recruitStep ?? 1;
  const nextStep    = currentStep + 1;
  if (nextStep > 6) return;

  const el = _createModal(`
    <div class="modal-title">推進到步驟 ${nextStep}</div>
    <div class="prs-step-confirm-text">
      確認「${_esc(p.name)}」已完成<br>
      <strong>Step ${currentStep}：${STEPS[currentStep - 1]}</strong><br>
      準備推進到 <strong>Step ${nextStep}：${STEPS[nextStep - 1]}</strong>？
    </div>
    <div class="form-group">
      <label class="form-label">備註（選填）</label>
      <textarea class="form-textarea" id="step-note" style="min-height:65px" placeholder="記錄這一步的狀況…"></textarea>
    </div>
    <div class="prs-modal-actions">
      <button class="btn btn-ghost prs-cancel">取消</button>
      <button class="btn btn-primary prs-confirm">確認推進</button>
    </div>
  `);

  _bindCancel(el);

  el.querySelector('.prs-confirm').onclick = async () => {
    const note    = el.querySelector('#step-note').value.trim();
    const btn     = el.querySelector('.prs-confirm');
    btn.disabled  = true; btn.textContent = '處理中…';

    const newHistory = [
      ...(p.stepHistory ?? []),
      { step: currentStep, completedAt: new Date().toISOString(), note },
    ];

    try {
      await updateDoc(userSubDoc('prospects', p.id), {
        recruitStep: nextStep,
        stepHistory: newHistory,
      });
      _closeModal(el);
      _refreshDetailStepBar(nextStep);
      toast(`已推進到 Step ${nextStep}：${STEPS[nextStep - 1]}`, 'success');
      if (STEP_TIPS[nextStep]) {
        setTimeout(() => _showStepTip(STEP_TIPS[nextStep]), 500);
      }
      checkAchievements({ first_step4: nextStep >= 4 }).catch(() => {});
    } catch (err) {
      console.error('[step] advance error', err);
      toast('更新失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '確認推進';
    }
  };
}

function _refreshDetailStepBar(newStep) {
  const panel = _currentDetailPanel;
  if (!panel) return;
  const oldBar = panel.querySelector('.step-bar');
  if (oldBar) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _buildStepBar(newStep);
    oldBar.replaceWith(tmp.firstElementChild);
  }
  // 若已到最後一步，替換按鈕
  if (newStep >= 6) {
    const nextBtn = panel.querySelector('.prs-nextstep-btn');
    if (nextBtn) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-signed';
      badge.textContent = '全部完成 🎉';
      nextBtn.replaceWith(badge);
    }
  }
}

function _showStepTip(tip) {
  const el = _createModal(`
    <div style="text-align:center;padding:.5rem 0 1rem">
      <div style="font-size:2.2rem;margin-bottom:.75rem">💡</div>
      <div style="font-size:.95rem;line-height:1.75;font-weight:500">${_esc(tip)}</div>
    </div>
    <div class="prs-modal-actions" style="justify-content:center">
      <button class="btn btn-primary prs-cancel" style="padding:.8rem 2.5rem">了解</button>
    </div>
  `);
  _bindCancel(el);
}

// ═══════════════════════════════════════════════════════════
//  會面記錄 Modal
// ═══════════════════════════════════════════════════════════

/** 供 daily312 使用的公開入口 */
export function openTalkModal(prospect, onAfterSave = null) {
  _openTalkModal(prospect, onAfterSave);
}

function _openTalkModal(p, onAfterSave = null) {
  const typeOpts = Object.entries(TALK_TYPE_LABELS).map(([v, l]) =>
    `<option value="${v}">${l}</option>`
  ).join('');

  const progressChecks = PROGRESS_OPTIONS.map(opt => `
    <label class="prs-progress-label">
      <input type="checkbox" class="prs-progress-check" value="${_esc(opt)}" style="accent-color:var(--ac)">
      ${_esc(opt)}
    </label>
  `).join('');

  const el = _createModal(`
    <div class="modal-title">新增會面記錄</div>
    <div style="display:flex;gap:.75rem;margin-bottom:.5rem">
      <div class="form-group" style="flex:1;margin-bottom:0">
        <label class="form-label">類型</label>
        <select class="form-select" id="talk-type">${typeOpts}</select>
      </div>
      <div class="form-group" style="flex:1;margin-bottom:0">
        <label class="form-label">日期</label>
        <input class="form-input" type="date" id="talk-date" value="${todayStr()}">
      </div>
    </div>

    <div class="prs-talk-section-title prs-talk-section-first">會前</div>
    <div class="form-group">
      <label class="form-label">會前筆記</label>
      <textarea class="form-textarea" id="talk-prememo" style="min-height:58px" placeholder="這次接觸前的準備想法…"></textarea>
    </div>

    <div class="prs-talk-section-title">會中</div>
    <div class="form-group">
      <label class="form-label">會面內容</label>
      <textarea class="form-textarea" id="talk-content" style="min-height:68px" placeholder="聊了什麼、進行了什麼…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">對方反應</label>
      <textarea class="form-textarea" id="talk-reaction" style="min-height:58px" placeholder="對方的態度與反應…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">進度確認</label>
      <div style="padding:.25rem 0">${progressChecks}</div>
    </div>

    <div class="prs-talk-section-title">會後</div>
    <div style="display:flex;gap:.75rem">
      <div class="form-group" style="flex:1">
        <label class="form-label">下次約定時間</label>
        <input class="form-input" type="date" id="talk-nextdt">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">地點</label>
        <input class="form-input" id="talk-nextloc" placeholder="例：星巴克">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">會後筆記</label>
      <textarea class="form-textarea" id="talk-postmemo" style="min-height:58px" placeholder="會後複盤…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">下次跟進計畫</label>
      <input class="form-input" id="talk-nextplan" placeholder="例：下週傳資料、安排 ABC">
    </div>

    <div class="prs-modal-actions">
      <button class="btn btn-ghost prs-cancel">取消</button>
      <button class="btn btn-primary prs-save">儲存</button>
    </div>
  `);

  _bindCancel(el);

  el.querySelector('.prs-save').onclick = async () => {
    const typeVal = el.querySelector('#talk-type').value; // 在關閉前先取得
    const btn = el.querySelector('.prs-save');
    btn.disabled = true; btn.textContent = '儲存中…';

    const progress = [...el.querySelectorAll('.prs-progress-check:checked')].map(cb => cb.value);

    try {
      const talkRef = await addDoc(
        userSubCollection('prospects', p.id, 'talks'),
        {
          type:      el.querySelector('#talk-type').value,
          date:      el.querySelector('#talk-date').value,
          preMemo:   el.querySelector('#talk-prememo').value.trim(),
          content:   el.querySelector('#talk-content').value.trim(),
          reaction:  el.querySelector('#talk-reaction').value.trim(),
          progress,
          nextDt:    el.querySelector('#talk-nextdt').value,
          nextLoc:   el.querySelector('#talk-nextloc').value.trim(),
          postMemo:  el.querySelector('#talk-postmemo').value.trim(),
          nextPlan:  el.querySelector('#talk-nextplan').value.trim(),
          emotion:   null,
          stuckNote: '',
          createdAt: serverTimestamp(),
        }
      );
      // 更新最後聯繫時間 + 下次約定時間（若有填）
      const nextDtVal = el.querySelector('#talk-nextdt').value;
      const nextLocVal = el.querySelector('#talk-nextloc').value.trim();
      const prospectUpdate = { lastContactAt: serverTimestamp() };
      if (nextDtVal) {
        prospectUpdate.nextMeetingDate = nextDtVal;
        prospectUpdate.nextMeetingLoc  = nextLocVal;
      }
      await updateDoc(userSubDoc('prospects', p.id), prospectUpdate);
      _closeModal(el);
      if (onAfterSave) onAfterSave({ type: typeVal, prospectId: p.id });
      _openEmotionModal(talkRef.id, p.id);
    } catch (err) {
      console.error('[talk] addDoc error', err);
      toast('儲存失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

// ── 情緒回饋 Modal ─────────────────────────────────────────

function _openEmotionModal(talkId, prospectId) {
  const el = _createModal(`
    <div style="text-align:center;padding:.25rem 0 .5rem">
      <div class="modal-title" style="margin-bottom:.4rem">這次感覺如何？</div>
      <p style="font-size:.82rem;color:var(--tx3);margin-bottom:1.1rem">記錄你的狀態</p>
      <div class="prs-emotion-row">
        <button class="prs-emotion-btn" data-emotion="good">😊<br><span>順利</span></button>
        <button class="prs-emotion-btn" data-emotion="normal">😐<br><span>普通</span></button>
        <button class="prs-emotion-btn" data-emotion="stuck">😰<br><span>有點卡</span></button>
      </div>
      <div id="stuck-area" style="display:none;text-align:left;margin-top:.9rem">
        <div class="form-group">
          <label class="form-label">你覺得卡在哪裡？</label>
          <textarea class="form-textarea" id="stuck-note" style="min-height:70px" placeholder="寫下你的感受…"></textarea>
        </div>
        <p style="font-size:.74rem;color:var(--tx3);text-align:center;margin-bottom:.75rem">可以找你的上線聊聊這個狀況</p>
        <button class="btn btn-primary" id="stuck-submit" style="width:100%;padding:.8rem">送出</button>
      </div>
    </div>
    <button class="btn btn-ghost" id="prs-emotion-skip" style="width:100%;padding:.65rem;margin-top:.5rem">跳過</button>
  `, false);

  const saveEmotion = async (emotion, stuckNote = '') => {
    try {
      await updateDoc(
        userSubSubDoc('prospects', prospectId, 'talks', talkId),
        { emotion, stuckNote }
      );
    } catch (err) {
      console.error('[emotion] update error', err);
    }
    toast('會面記錄已儲存', 'success');
    _closeModal(el);
  };

  el.querySelector('#prs-emotion-skip').onclick = () => {
    toast('會面記錄已儲存', 'success');
    _closeModal(el);
  };

  el.querySelectorAll('.prs-emotion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emotion = btn.dataset.emotion;
      el.querySelectorAll('.prs-emotion-btn').forEach(b =>
        b.style.borderColor = b === btn ? 'var(--ac)' : 'var(--bd)'
      );
      if (emotion === 'stuck') {
        el.querySelector('#stuck-area').style.display = '';
        return;
      }
      saveEmotion(emotion);
    });
  });

  el.querySelector('#stuck-submit').onclick = () => {
    saveEmotion('stuck', el.querySelector('#stuck-note').value.trim());
  };
}

// ═══════════════════════════════════════════════════════════
//  購物記錄 Modal
// ═══════════════════════════════════════════════════════════

function _openSaleModal(prospectId, prospectName) {
  const el = _createModal(`
    <div class="modal-title">新增購物記錄</div>
    <p style="font-size:.83rem;color:var(--tx2);margin-bottom:.85rem">${_esc(prospectName)}</p>
    <div class="form-group">
      <label class="form-label">購買日期</label>
      <input class="form-input" type="date" id="sale-date" value="${todayStr()}">
    </div>
    <div class="form-group">
      <label class="form-label">品項名稱 <span style="color:var(--dg)">*</span></label>
      <input class="form-input" id="sale-item" placeholder="例：OPC-3、魚油">
    </div>
    <div class="form-group">
      <label class="form-label">金額（NT$）</label>
      <input class="form-input" type="number" id="sale-amount" placeholder="0" min="0">
    </div>
    <div class="form-group">
      <label class="form-label">備註</label>
      <input class="form-input" id="sale-note" placeholder="選填">
    </div>
    <div class="prs-modal-actions">
      <button class="btn btn-ghost prs-cancel">取消</button>
      <button class="btn btn-primary prs-save">儲存</button>
    </div>
  `);

  _bindCancel(el);

  el.querySelector('.prs-save').onclick = async () => {
    const itemInput = el.querySelector('#sale-item');
    const item = itemInput.value.trim();
    if (!item) { itemInput.style.borderColor = 'var(--dg)'; itemInput.focus(); return; }
    const btn = el.querySelector('.prs-save');
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      await addDoc(userSubCollection('prospects', prospectId, 'sales'), {
        date:      el.querySelector('#sale-date').value,
        item,
        amount:    Number(el.querySelector('#sale-amount').value) || 0,
        note:      el.querySelector('#sale-note').value.trim(),
        createdAt: serverTimestamp(),
      });
      toast('購物記錄已新增', 'success');
      checkAchievements({ first_sale: true }).catch(() => {});
      _closeModal(el);
    } catch (err) {
      console.error('[sale] addDoc error', err);
      toast('儲存失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

// ═══════════════════════════════════════════════════════════
//  共用工具
// ═══════════════════════════════════════════════════════════

function _createModal(innerHtml, scrollable = true) {
  const container = document.getElementById('modal-container');
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="modal-box">${innerHtml}</div>`;
  if (scrollable) {
    const box = el.querySelector('.modal-box');
    box.style.maxHeight  = '88vh';
    box.style.overflowY  = 'auto';
  }
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  return el;
}

function _closeModal(el) {
  el.classList.remove('show');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// 取消按鈕 + 點擊背景關閉
function _bindCancel(el) {
  el.querySelector('.prs-cancel')?.addEventListener('click', () => _closeModal(el));
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
