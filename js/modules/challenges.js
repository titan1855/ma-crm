/**
 * challenges.js — 模組七：挑戰獎自訂目標
 */
import { navigate } from '../router.js';
import {
  userCollection, userSubDoc,
  addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from '../db.js';
import { toast, formatDate, emptyState, confirmDialog } from '../utils.js';

let _unsubscribe  = null;
let _allItems     = [];
let _statusFilter = 'active';

const STATUS_LABELS = { active: '進行中', completed: '已完成', expired: '已過期' };

export function render(content) {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _statusFilter = 'active';
  _allItems     = [];

  content.innerHTML = _buildShell();
  _bindEvents(content);
  _startSnapshot(content);
}

// ── 骨架 HTML ──────────────────────────────────────────────

function _buildShell() {
  return `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">🏆 挑戰獎目標</span>
      <button class="btn btn-primary chal-add-btn" style="font-size:.8rem;padding:.3rem .7rem">＋ 新增</button>
    </div>
    <div class="filter-chips">
      ${Object.entries(STATUS_LABELS).map(([k, v]) =>
        `<button class="chip chal-chip${k === 'active' ? ' active' : ''}" data-status="${k}">${v}</button>`
      ).join('')}
    </div>
    <div class="list-container chal-list"></div>
  `;
}

// ── 事件綁定 ──────────────────────────────────────────────

function _bindEvents(content) {
  content.querySelector('.sub-page-back').addEventListener('click', () => {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    navigate('more');
  });

  content.querySelector('.chal-add-btn').addEventListener('click', () => _openAddModal());

  content.querySelector('.filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chal-chip');
    if (!chip) return;
    _statusFilter = chip.dataset.status;
    content.querySelectorAll('.chal-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.status === _statusFilter)
    );
    _renderList(content);
  });

  content.querySelector('.chal-list').addEventListener('click', async e => {
    const updateBtn = e.target.closest('.chal-update-goal-btn');
    const delBtn    = e.target.closest('.chal-del-btn');
    if (updateBtn) {
      const ch = _allItems.find(x => x.id === updateBtn.dataset.cid);
      if (ch) _openEditGoalModal(ch, Number(updateBtn.dataset.gi));
    }
    if (delBtn) {
      await _deleteChallenge(delBtn.dataset.id);
    }
  });
}

// ── Firestore 即時監聽 ─────────────────────────────────────

function _startSnapshot(content) {
  try {
    const q = query(userCollection('challenges'), orderBy('createdAt', 'desc'));
    _unsubscribe = onSnapshot(q, snap => {
      if (!content.querySelector('.chal-list')) return;
      _allItems = snap.docs.map(d => {
        const data = { id: d.id, ...d.data() };
        // 自動過期檢查
        if (data.status === 'active' && data.deadline) {
          const dl = new Date(data.deadline);
          if (dl < new Date()) {
            const allDone = _allGoalsDone(data.goals ?? []);
            const newStatus = allDone ? 'completed' : 'expired';
            updateDoc(userSubDoc('challenges', d.id), {
              status: newStatus, updatedAt: serverTimestamp()
            }).catch(() => {});
            data.status = newStatus;
          }
        }
        return data;
      });
      _renderList(content);
    }, err => {
      console.error('[challenges] snapshot error', err);
      toast('挑戰獎載入失敗', 'error');
    });
  } catch (e) {
    console.error('[challenges] init error', e);
  }
}

// ── 渲染清單 ──────────────────────────────────────────────

function _renderList(content) {
  const area  = content.querySelector('.chal-list');
  if (!area) return;

  const items = _allItems.filter(x => x.status === _statusFilter);
  if (items.length === 0) {
    const msgs = {
      active:    '目前沒有進行中的挑戰\n點右上角 ＋ 新增挑戰',
      completed: '還沒有完成的挑戰',
      expired:   '沒有已過期的挑戰',
    };
    area.innerHTML = emptyState('🏆', msgs[_statusFilter]);
    return;
  }
  area.innerHTML = items.map(_buildCard).join('');
}

// ── 挑戰卡片 HTML ──────────────────────────────────────────

function _buildCard(ch) {
  const goals      = ch.goals ?? [];
  const doneGoals  = goals.filter(_isGoalDone).length;
  const totalGoals = goals.length;
  const overallPct = totalGoals > 0 ? Math.round((doneGoals / totalGoals) * 100) : 0;

  const dl       = ch.deadline ? new Date(ch.deadline) : null;
  const daysLeft = dl ? Math.max(0, Math.ceil((dl - new Date()) / 86400000)) : null;
  const dlText   = dl
    ? (ch.status === 'active'
        ? `截止 ${formatDate(ch.deadline)}（剩 ${daysLeft} 天）`
        : `截止：${formatDate(ch.deadline)}`)
    : '無截止日';

  const goalsHtml = goals.map((g, gi) => {
    const done  = _isGoalDone(g);
    const gPct  = g.type === 'number'
      ? Math.min(100, Math.round(((g.current ?? 0) / Math.max(1, g.target ?? 1)) * 100))
      : (done ? 100 : 0);
    const valHtml = g.type === 'number'
      ? `<span class="chal-goal-nums">${g.current ?? 0} / ${g.target ?? 1}${g.unit ? ` ${_esc(g.unit)}` : ''}</span>`
      : `<span class="chal-goal-done-txt">${done ? '✓ 完成' : '未完成'}</span>`;
    const editBtn = ch.status === 'active'
      ? `<button class="btn btn-ghost chal-update-goal-btn" data-cid="${ch.id}" data-gi="${gi}" style="font-size:.7rem;padding:.15rem .4rem;flex-shrink:0">更新</button>`
      : '';
    return `
      <div class="chal-goal-item">
        <div class="chal-goal-top">
          <span class="chal-goal-label${done ? ' done' : ''}">${_esc(g.label)}</span>
          ${valHtml}
          ${editBtn}
        </div>
        <div class="chal-bar-wrap"><div class="chal-bar${done ? ' done' : ''}" style="width:${gPct}%"></div></div>
      </div>
    `;
  }).join('');

  return `
    <div class="card chal-card">
      <div class="chal-card-header">
        <div class="chal-card-info">
          <div class="card-name">${_esc(ch.title)}</div>
          <div class="card-sub">${dlText}</div>
        </div>
        <div class="chal-card-right">
          <span class="chal-overall-pct${overallPct >= 100 ? ' done' : ''}">${overallPct}%</span>
          ${ch.status === 'active'
            ? `<button class="btn btn-ghost chal-del-btn" data-id="${ch.id}" style="font-size:.7rem;padding:.15rem .4rem;color:var(--dg)">刪除</button>`
            : ''}
        </div>
      </div>
      <div class="chal-goals-list">${goalsHtml}</div>
    </div>
  `;
}

// ── 新增挑戰 Modal ─────────────────────────────────────────

function _openAddModal() {
  let rowIdx = 0;

  const el = _createModal(`
    <div class="modal-title">新增挑戰</div>
    <div class="form-group">
      <label class="form-label">挑戰名稱 <span style="color:var(--dg)">*</span></label>
      <input class="form-input" id="chal-title" placeholder="例：2026 Q2 衝刺獎" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">截止日期</label>
      <input class="form-input" id="chal-deadline" type="date">
    </div>
    <div class="chal-goals-editor">
      <div class="chal-goals-editor-title">目標條件</div>
      <div id="chal-goal-rows">${_goalInputRowHtml(rowIdx++)}</div>
    </div>
    <button class="btn btn-ghost chal-add-row-btn" style="width:100%;font-size:.82rem;margin-top:.3rem">＋ 新增條件</button>
    <div class="form-actions">
      <button class="btn btn-ghost chal-modal-cancel">取消</button>
      <button class="btn btn-primary chal-modal-save">儲存</button>
    </div>
  `);

  setTimeout(() => el.querySelector('#chal-title')?.focus(), 300);
  el.querySelector('.chal-modal-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.chal-add-row-btn').addEventListener('click', () => {
    const container = el.querySelector('#chal-goal-rows');
    const div = document.createElement('div');
    div.innerHTML = _goalInputRowHtml(rowIdx++);
    container.appendChild(div.firstElementChild);
  });

  el.querySelector('.chal-modal-save').onclick = async () => {
    const titleInput = el.querySelector('#chal-title');
    const title = titleInput.value.trim();
    if (!title) { titleInput.style.borderColor = 'var(--dg)'; titleInput.focus(); return; }

    const goals = Array.from(el.querySelectorAll('.chal-goal-input-row')).map(row => ({
      type:    row.querySelector('.chal-gtype').value,
      label:   row.querySelector('.chal-glabel').value.trim(),
      target:  Number(row.querySelector('.chal-gtarget').value) || 1,
      unit:    row.querySelector('.chal-gunit').value.trim(),
      current: 0,
      done:    false,
    })).filter(g => g.label);

    if (goals.length === 0) { toast('請至少填一個目標條件', 'warning'); return; }

    const saveBtn = el.querySelector('.chal-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中…';

    try {
      await addDoc(userCollection('challenges'), {
        title,
        deadline:  el.querySelector('#chal-deadline').value || '',
        goals,
        status:    'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast(`已建立「${title}」`, 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[challenges] addDoc error', err);
      toast('建立失敗，請重試', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存';
    }
  };
}

function _goalInputRowHtml(idx) {
  return `
    <div class="chal-goal-input-row" data-idx="${idx}">
      <select class="form-select chal-gtype" style="flex:0 0 5rem;font-size:.82rem">
        <option value="number">數字</option>
        <option value="action">行動</option>
        <option value="team">團隊</option>
      </select>
      <input class="form-input chal-glabel" placeholder="條件描述 *" style="flex:1;font-size:.82rem" autocomplete="off">
      <input class="form-input chal-gtarget" type="number" min="1" placeholder="目標值" style="width:4.5rem;font-size:.82rem">
      <input class="form-input chal-gunit" placeholder="單位" style="width:3.2rem;font-size:.82rem">
    </div>
  `;
}

// ── 更新目標進度 Modal ────────────────────────────────────

function _openEditGoalModal(challenge, goalIndex) {
  const g = challenge.goals[goalIndex];
  const el = _createModal(`
    <div class="modal-title">更新目標進度</div>
    <p class="chal-edit-desc">${_esc(g.label)}${g.unit ? `（${_esc(g.unit)}）` : ''}</p>
    ${g.type === 'number' ? `
      <div class="form-group">
        <label class="form-label">目前數值 <small style="color:var(--tx3)">目標：${g.target}</small></label>
        <input class="form-input" id="chal-cur-val" type="number" min="0" value="${g.current ?? 0}">
      </div>
    ` : `
      <div class="form-group">
        <label class="form-check-label">
          <input type="checkbox" id="chal-cur-done" ${g.done ? 'checked' : ''}> 已完成
        </label>
      </div>
    `}
    <div class="form-actions">
      <button class="btn btn-ghost chal-edit-cancel">取消</button>
      <button class="btn btn-primary chal-edit-save">儲存</button>
    </div>
  `);

  el.querySelector('.chal-edit-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.chal-edit-save').onclick = async () => {
    const saveBtn = el.querySelector('.chal-edit-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中…';

    const newGoals = [...challenge.goals];
    if (g.type === 'number') {
      newGoals[goalIndex] = { ...g, current: Number(el.querySelector('#chal-cur-val').value) || 0 };
    } else {
      newGoals[goalIndex] = { ...g, done: el.querySelector('#chal-cur-done').checked };
    }

    const allDone = _allGoalsDone(newGoals);

    try {
      await updateDoc(userSubDoc('challenges', challenge.id), {
        goals:     newGoals,
        status:    allDone ? 'completed' : 'active',
        updatedAt: serverTimestamp(),
      });
      toast('已更新進度', 'success');
      if (allDone) toast(`🎉「${challenge.title}」全部達標！`, 'success', 5000);
      _closeModal(el);
    } catch (err) {
      console.error('[challenges] update error', err);
      toast('更新失敗，請重試', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存';
    }
  };
}

// ── 刪除挑戰 ──────────────────────────────────────────────

async function _deleteChallenge(id) {
  const ok = await confirmDialog('確定刪除這個挑戰？');
  if (!ok) return;
  try {
    await deleteDoc(userSubDoc('challenges', id));
    toast('已刪除', 'success');
  } catch (err) {
    console.error('[challenges] delete error', err);
    toast('刪除失敗', 'error');
  }
}

// ── 工具函式 ──────────────────────────────────────────────

function _isGoalDone(g) {
  return g.type === 'number'
    ? (g.current ?? 0) >= Math.max(1, g.target ?? 1)
    : !!g.done;
}

function _allGoalsDone(goals) {
  return goals.length > 0 && goals.every(_isGoalDone);
}

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
