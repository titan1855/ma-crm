/**
 * daily312.js — 模組四：每日 312 打卡（系統首頁）
 * 每天聊天×3、會面×1、新增名單×2
 */
import { registerTab, navigate } from '../router.js';
import { openTalkModal } from './prospects.js';
import {
  userCollection, userSubDoc, userSubCollection,
  getDoc, setDoc, updateDoc, addDoc,
  onSnapshot, query, orderBy, serverTimestamp, setProfile
} from '../db.js';
import {
  toast, avatarColor, avatarInitial, todayStr, formatRelativeDate
} from '../utils.js';

// ── 常數 ──────────────────────────────────────────────────

const GOALS  = { chat: 3, meet: 1, pool: 2 };
const LABELS = { chat: '聊天', meet: '會面', pool: '新名單' };
const ICONS  = { chat: '💬', meet: '🤝', pool: '📝' };
const TALK_TYPE_LABELS = {
  chat: '聊天', call: '通話', meet: '會面', social: '社群互動', other: '其他'
};
const STEP_LABELS = ['列名單', '講商機', '會邀約', '說制度', '懂締結', '要跟進'];

// ── 模組狀態 ──────────────────────────────────────────────

let _profile         = null; // 由 app.js 呼叫 setCurrentProfile() 設定
let _unsubD312       = null;
let _unsubProspects  = null;
let _todayData       = null;
let _activeProspects = [];

// ── 公開 API（供 app.js / pool.js 呼叫） ──────────────────

export function init() {
  registerTab('312', render);
}

/** app.js 登入後呼叫，讓 daily312 拿到 profile 資料 */
export function setCurrentProfile(p) {
  _profile = p;
}

/** pool.js 新增名單時呼叫，計入今日 poolCount */
export async function recordPoolAdded(poolId, name) {
  const ref  = userSubDoc('daily312', todayStr());
  const snap = await getDoc(ref);
  const cur  = snap.exists() ? snap.data() : _emptyDay();
  const entry = { poolId, name, time: new Date().toISOString() };
  const newPool  = [...(cur.newPool  ?? []), entry];
  const newCount = (cur.poolCount ?? 0) + 1;
  const newDoc   = { ...cur, newPool, poolCount: newCount };
  await setDoc(ref, newDoc);

  if (!cur.completed && (cur.chatCount ?? 0) >= 3 && (cur.meetCount ?? 0) >= 1 && newCount >= 2) {
    await updateDoc(ref, { completed: true });
    _celebrateCompletion();
    await _incrementStreak();
  }
}

// ── 模組進入點 ────────────────────────────────────────────

export function render(content) {
  if (_unsubD312)      { _unsubD312();      _unsubD312 = null; }
  if (_unsubProspects) { _unsubProspects(); _unsubProspects = null; }
  _todayData       = null;
  _activeProspects = [];

  content.innerHTML = _buildShell();
  _bindEvents(content);
  _startSnapshots(content);
  _checkStreakReset(); // 非同步，完成後更新 badge
}

// ── 骨架 HTML ──────────────────────────────────────────────

function _buildShell() {
  const d      = new Date();
  const weeks  = ['日', '一', '二', '三', '四', '五', '六'];
  const date   = `${d.getMonth() + 1}月${d.getDate()}日 星期${weeks[d.getDay()]}`;
  const streak = _profile?.streak?.current ?? 0;

  return `
    <div class="m312-page">
      <div class="m312-date-row">
        <span class="m312-date-text">${date}</span>
        <div class="streak-badge">
          <span class="streak-fire">🔥</span>
          <span class="m312-streak-val">${streak}</span> 天連續
        </div>
      </div>

      <div class="m312-progress-card">
        ${_buildProgressHtml(null)}
      </div>

      <div class="m312-section-title">建議今天聯繫</div>
      <div class="m312-suggestions">
        <div class="m312-loading">載入中…</div>
      </div>

      <div class="m312-bottom-btns">
        <button class="btn btn-secondary m312-quick-chat-btn" style="flex:1">＋ 快速記錄聊天</button>
        <button class="btn btn-ghost    m312-quick-pool-btn" style="flex:1">＋ 快速新增名單</button>
      </div>
    </div>
  `;
}

// ── 事件綁定 ──────────────────────────────────────────────

function _bindEvents(content) {
  content.querySelector('.m312-quick-chat-btn').addEventListener('click', _openQuickChatModal);

  content.querySelector('.m312-quick-pool-btn').addEventListener('click', () => {
    navigate('pool');
  });

  // 「記錄接觸 →」（事件代理）
  content.querySelector('.m312-suggestions').addEventListener('click', e => {
    const btn = e.target.closest('.m312-contact-btn');
    if (!btn) return;
    const p = _activeProspects.find(x => x.id === btn.dataset.id);
    if (p) _openContactModal(p, content);
  });
}

// ── Firestore 監聽 ─────────────────────────────────────────

function _startSnapshots(content) {
  // 今日 312 文件
  try {
    _unsubD312 = onSnapshot(
      userSubDoc('daily312', todayStr()),
      snap => {
        if (!content.querySelector('.m312-progress-card')) return;
        _todayData = snap.exists() ? snap.data() : null;
        content.querySelector('.m312-progress-card').innerHTML = _buildProgressHtml(_todayData);
      },
      err => console.error('[312] d312 snapshot error', err)
    );
  } catch (e) { console.error('[312] d312 init error', e); }

  // 首選名單（取 active 作建議）
  try {
    const q = query(userCollection('prospects'), orderBy('createdAt', 'desc'));
    _unsubProspects = onSnapshot(q, snap => {
      if (!content.querySelector('.m312-suggestions')) return;
      _activeProspects = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => p.status === 'active');
      _renderSuggestions(content);
    }, err => console.error('[312] prospects snapshot error', err));
  } catch (e) { console.error('[312] prospects init error', e); }
}

// ── 進度卡 HTML ────────────────────────────────────────────

function _buildProgressHtml(data) {
  const counts = {
    chat: data?.chatCount ?? 0,
    meet: data?.meetCount ?? 0,
    pool: data?.poolCount ?? 0,
  };

  const rows = ['chat', 'meet', 'pool'].map(key => {
    const n    = counts[key];
    const goal = GOALS[key];
    const done = n >= goal;
    const dots = Array.from({ length: goal }, (_, i) =>
      `<span class="m312-dot${i < n ? ' done' : ''}"></span>`
    ).join('');

    return `
      <div class="m312-goal-row${done ? ' done' : ''}" data-goal="${key}">
        <span class="m312-goal-icon">${ICONS[key]}</span>
        <span class="m312-goal-label">${LABELS[key]}</span>
        <div class="m312-dots">${dots}</div>
        <span class="m312-goal-count">${n}&thinsp;/&thinsp;${goal}${done ? ' ✓' : ''}</span>
      </div>
    `;
  }).join('');

  const banner = data?.completed
    ? `<div class="m312-completed-banner">今日 312 達標！🎉</div>`
    : '';

  return rows + banner;
}

// ── 建議聯繫列表 ───────────────────────────────────────────

function _renderSuggestions(content) {
  const el = content.querySelector('.m312-suggestions');
  if (!el) return;

  const sorted = [..._activeProspects]
    .sort((a, b) => {
      const ta = a.lastContactAt?.toDate?.()?.getTime() ?? 0;
      const tb = b.lastContactAt?.toDate?.()?.getTime() ?? 0;
      if (ta !== tb) return ta - tb; // 久未聯繫在前
      return (b.recruitStep ?? 1) - (a.recruitStep ?? 1); // 步驟高的優先
    })
    .slice(0, 5);

  if (sorted.length === 0) {
    el.innerHTML = `<p class="m312-empty-suggestions">首選名單還沒有「持續跟進」的人<br>去首選名單新增幾位吧！</p>`;
    return;
  }

  el.innerHTML = sorted.map(p => {
    const bg    = avatarColor(p.name);
    const init  = avatarInitial(p.name);
    const step  = p.recruitStep ?? 1;
    const last  = p.lastContactAt
      ? formatRelativeDate(p.lastContactAt.toDate?.() ?? p.lastContactAt)
      : '尚未聯繫';
    return `
      <div class="card m312-suggestion-card">
        <div class="card-row" style="align-items:center">
          <div class="avatar" style="background:${bg}">${_esc(init)}</div>
          <div class="card-info">
            <div class="card-name" style="font-size:.9rem">${_esc(p.name)}</div>
            <div class="card-sub">${last} · Step ${step}：${STEP_LABELS[step - 1]}</div>
          </div>
          <button class="btn btn-secondary m312-contact-btn" data-id="${p.id}"
            style="font-size:.75rem;padding:.28rem .65rem;white-space:nowrap;flex-shrink:0">
            記錄接觸 →
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ── 記錄接觸（完整 talk modal + 計入 312） ────────────────

function _openContactModal(p, content) {
  openTalkModal(p, async ({ type }) => {
    await _recordDailyContact(type, p.id, p.name);
    _animateGoalRow(content, type === 'meet' ? 'meet' : 'chat');
  });
}

// ── 快速記錄聊天 Modal ─────────────────────────────────────

function _openQuickChatModal() {
  const personOpts = _activeProspects.length > 0
    ? _activeProspects.map(p =>
        `<option value="${p.id}" data-name="${_esc(p.name)}">${_esc(p.name)}</option>`
      ).join('')
    : `<option value="">（沒有持續跟進的名單）</option>`;

  const typeOpts = Object.entries(TALK_TYPE_LABELS).map(([v, l]) =>
    `<option value="${v}">${l}</option>`
  ).join('');

  const el = _createModal(`
    <div class="modal-title">快速記錄聊天</div>
    <div class="form-group">
      <label class="form-label">聯繫對象 <span style="color:var(--dg)">*</span></label>
      <select class="form-select" id="qc-person">${personOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">類型</label>
      <select class="form-select" id="qc-type">${typeOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">簡單備註（選填）</label>
      <input class="form-input" id="qc-note" placeholder="簡短記錄">
    </div>
    <div class="m312-modal-actions">
      <button class="btn btn-ghost m312-cancel">取消</button>
      <button class="btn btn-primary m312-save">打卡完成</button>
    </div>
  `);

  el.querySelector('.m312-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.m312-save').onclick = async () => {
    const sel  = el.querySelector('#qc-person');
    const pid  = sel.value;
    const pname = sel.options[sel.selectedIndex]?.dataset?.name ?? '';
    const type = el.querySelector('#qc-type').value;
    const note = el.querySelector('#qc-note').value.trim();

    if (!pid) { toast('請選擇聯繫對象', 'warning'); return; }

    const btn = el.querySelector('.m312-save');
    btn.disabled = true; btn.textContent = '記錄中…';

    try {
      // 建立 talk 記錄
      await addDoc(userSubCollection('prospects', pid, 'talks'), {
        type, date: todayStr(), content: note,
        preMemo: '', reaction: '', progress: [],
        nextDt: '', nextLoc: '', postMemo: '', nextPlan: '',
        emotion: null, stuckNote: '', createdAt: serverTimestamp(),
      });
      await updateDoc(userSubDoc('prospects', pid), { lastContactAt: serverTimestamp() });
      // 計入 312
      await _recordDailyContact(type, pid, pname);

      toast('已記錄 ✓', 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[quick-chat] error', err);
      toast('記錄失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '打卡完成';
    }
  };
}

// ── 更新今日 daily312 文件 ────────────────────────────────

async function _recordDailyContact(type, prospectId, prospectName) {
  const ref   = userSubDoc('daily312', todayStr());
  const snap  = await getDoc(ref);
  const cur   = snap.exists() ? snap.data() : _emptyDay();
  const entry = { prospectId, name: prospectName, time: new Date().toISOString() };

  const isMeet = type === 'meet';
  const patch  = isMeet
    ? { meetings: [...(cur.meetings ?? []), entry], meetCount: (cur.meetCount ?? 0) + 1 }
    : { chats:    [...(cur.chats    ?? []), entry], chatCount: (cur.chatCount ?? 0) + 1 };

  const newDoc = { ...cur, ...patch };
  await setDoc(ref, newDoc);

  const nowDone = (newDoc.chatCount ?? 0) >= 3
    && (newDoc.meetCount ?? 0) >= 1
    && (newDoc.poolCount ?? 0) >= 2;

  if (!cur.completed && nowDone) {
    await updateDoc(ref, { completed: true });
    _celebrateCompletion();
    await _incrementStreak();
  }
}

function _emptyDay() {
  return {
    chats: [], meetings: [], newPool: [],
    chatCount: 0, meetCount: 0, poolCount: 0,
    completed: false, emotions: [],
  };
}

// ── Streak ────────────────────────────────────────────────

async function _checkStreakReset() {
  if (!_profile) return;
  const streak  = _profile.streak ?? { current: 0, best: 0, lastDate: '' };
  const today   = todayStr();
  const yester  = _yesterdayStr();

  if (streak.lastDate === today)   return; // 今天已處理
  if (streak.lastDate === yester)  return; // 昨天有達標，等今天完成再 +1
  if ((streak.current ?? 0) === 0) return; // 本來就是 0，不需重置

  // lastDate < yesterday → 中斷，重置
  const newStreak = { ...streak, current: 0 };
  try {
    await setProfile({ streak: newStreak });
    _profile = { ..._profile, streak: newStreak };
    _updateStreakBadge(0);
  } catch (err) {
    console.error('[streak] reset error', err);
  }
}

async function _incrementStreak() {
  if (!_profile) return;
  const streak = _profile.streak ?? { current: 0, best: 0, lastDate: '' };
  const today  = todayStr();
  if (streak.lastDate === today) return; // 今天已計算過

  const newCurrent = (streak.current ?? 0) + 1;
  const newStreak  = {
    current:  newCurrent,
    best:     Math.max(streak.best ?? 0, newCurrent),
    lastDate: today,
  };
  try {
    await setProfile({ streak: newStreak });
    _profile = { ..._profile, streak: newStreak };
    _updateStreakBadge(newCurrent);
  } catch (err) {
    console.error('[streak] increment error', err);
  }
}

function _updateStreakBadge(n) {
  document.getElementById('streak-count')?.nodeValue; // header
  const headerEl = document.getElementById('streak-count');
  if (headerEl) headerEl.textContent = n;
  const pageEl = document.querySelector('.m312-streak-val');
  if (pageEl) pageEl.textContent = n;
}

function _yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ── 達標慶祝 ──────────────────────────────────────────────

function _celebrateCompletion() {
  toast('今日 312 達標！🎉', 'success', 5000);
  _showConfetti();
}

function _animateGoalRow(content, goalKey) {
  const row = content.querySelector(`[data-goal="${goalKey}"]`);
  if (!row) return;
  row.classList.remove('m312-goal-bounce');
  void row.offsetWidth; // force reflow
  row.classList.add('m312-goal-bounce');
  setTimeout(() => row.classList.remove('m312-goal-bounce'), 600);
}

function _showConfetti() {
  const colors = ['#1B5E3B', '#3A9E6F', '#D4800A', '#1A6FA8', '#F6C90E', '#B83030'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'm312-confetti';
    el.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}vw`,
      `animation-delay:${(Math.random() * 1.5).toFixed(2)}s`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `transform:rotate(${Math.floor(Math.random() * 360)}deg)`,
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
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
