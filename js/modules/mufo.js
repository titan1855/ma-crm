/**
 * mufo.js — 模組六：MUFO 季度追蹤
 */
import { navigate } from '../router.js';
import {
  userSubDoc,
  getDoc, setDoc, serverTimestamp
} from '../db.js';
import { toast, currentQuarter, todayStr, formatNumber } from '../utils.js';
import { checkAchievements } from './achievements.js';

// 數字目標定義
const NUM_GOALS = [
  { key: 'retailBV', label: '零售 BV', target: 1500 },
  { key: 'ibv',      label: 'IBV',      target: 300  },
  { key: 'recruits', label: '招募人數', target: 1    },
  { key: 'tickets',  label: '大會票',   target: 3    },
];

export function render(content) {
  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">📊 MUFO 季度追蹤</span>
    </div>
    <div class="mufo-loading">載入中…</div>
  `;
  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  _loadAndRender(content);
}

// ── 資料載入 ──────────────────────────────────────────────

async function _loadAndRender(content) {
  const quarter = currentQuarter();          // e.g. "2026-Q2"
  const year    = quarter.split('-')[0];     // e.g. "2026"

  try {
    const [qSnap, ySnap] = await Promise.all([
      getDoc(userSubDoc('mufo', quarter)),
      getDoc(userSubDoc('mufo', year)),
    ]);
    const qData    = qSnap.exists() ? qSnap.data() : _emptyQuarter();
    const ecctDone = ySnap.exists() ? (ySnap.data().ecctDone ?? false) : false;
    _renderPage(content, quarter, year, qData, ecctDone);
  } catch (err) {
    console.error('[mufo] load error', err);
    toast('MUFO 資料載入失敗', 'error');
  }
}

// ── 渲染頁面 ──────────────────────────────────────────────

function _renderPage(content, quarter, year, qData, ecctDone) {
  const daysLeft  = _daysLeftInQuarter();
  const elapsed   = _elapsedInQuarter();
  const totalDays = _totalDaysInQuarter();
  const updatedTxt = qData.updatedAt ? _formatTs(qData.updatedAt) : '尚未更新';

  // 計算達標項目數
  let doneCount = 0;
  NUM_GOALS.forEach(({ key, target }) => { if ((qData[key] ?? 0) >= target) doneCount++; });
  if (qData.courseB5)   doneCount++;
  if (qData.courseNUOT) doneCount++;
  if (ecctDone)         doneCount++;

  // 過期提醒
  const staleHtml = (!qData.updatedAt || _daysSince(qData.updatedAt) > 7)
    ? `<div class="mufo-stale-warning">${qData.updatedAt ? '⚠️ 距上次更新已超過 7 天，記得更新數據！' : '⚠️ 尚未輸入本季數據，點「更新數據」開始吧！'}</div>`
    : '';

  // 數字目標列
  const numBarsHtml = NUM_GOALS.map(({ key, label, target }) => {
    const cur   = qData[key] ?? 0;
    const pct   = Math.min(100, Math.round((cur / target) * 100));
    const proj  = elapsed > 0 ? Math.round((cur / elapsed) * totalDays) : 0;
    const done  = cur >= target;
    const projOk = proj >= target;
    return `
      <div class="mufo-goal-row">
        <div class="mufo-goal-top">
          <span class="mufo-goal-label">${label}</span>
          <span class="mufo-goal-nums${done ? ' done' : ''}">${formatNumber(cur)}&thinsp;/&thinsp;${formatNumber(target)}${done ? ' ✓' : ''}</span>
        </div>
        <div class="mufo-bar-wrap"><div class="mufo-bar${done ? ' done' : ''}" style="width:${pct}%"></div></div>
        <div class="mufo-proj-text">預估季末：${formatNumber(proj)}&ensp;${projOk ? '✅' : '⚠️ 需加速'}</div>
      </div>
    `;
  }).join('');

  // 課程條件列
  const courses = [
    { key: 'b5',   label: 'B5 課程（本季）',    done: qData.courseB5   ?? false },
    { key: 'nuot', label: 'NUOT 課程（本季）',   done: qData.courseNUOT ?? false },
    { key: 'ecct', label: 'ECCT 課程（本年度）', done: ecctDone },
  ];
  const coursesHtml = courses.map(c => `
    <div class="mufo-course-row">
      <span class="mufo-course-check">${c.done ? '☑' : '☐'}</span>
      <span class="mufo-course-label${c.done ? ' done' : ''}">${c.label}</span>
    </div>
  `).join('');

  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">📊 MUFO ${quarter}</span>
    </div>
    ${staleHtml}
    <div class="card mufo-card">
      <div class="mufo-quarter-row">
        <span class="mufo-quarter-label">${quarter}</span>
        <span class="mufo-days-left">剩餘 ${daysLeft} 天</span>
      </div>

      <div class="mufo-section-title">── 數字目標 ──</div>
      ${numBarsHtml}

      <div class="mufo-section-title" style="margin-top:1rem">── 課程條件 ──</div>
      ${coursesHtml}

      <div class="mufo-card-footer">
        <span class="mufo-done-count">達標進度：<strong>${doneCount} / 7</strong> 項${doneCount === 7 ? ' 🎉' : ''}</span>
        <span class="mufo-updated-txt">上次更新：${updatedTxt}</span>
      </div>
    </div>
    <button class="btn btn-primary mufo-update-btn">更新數據</button>
  `;

  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  content.querySelector('.mufo-update-btn').addEventListener('click', () => {
    _openUpdateModal(content, quarter, year, qData, ecctDone);
  });
}

// ── 更新數據 Modal ─────────────────────────────────────────

function _openUpdateModal(content, quarter, year, qData, ecctDone) {
  const el = _createModal(`
    <div class="modal-title">更新 MUFO 數據</div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">零售 BV <small style="color:var(--tx3)">目標 1500</small></label>
        <input class="form-input" id="m-retailbv" type="number" min="0" value="${qData.retailBV ?? 0}">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">IBV <small style="color:var(--tx3)">目標 300</small></label>
        <input class="form-input" id="m-ibv" type="number" min="0" value="${qData.ibv ?? 0}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">招募人數 <small style="color:var(--tx3)">目標 1</small></label>
        <input class="form-input" id="m-recruits" type="number" min="0" value="${qData.recruits ?? 0}">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">大會票 <small style="color:var(--tx3)">目標 3</small></label>
        <input class="form-input" id="m-tickets" type="number" min="0" value="${qData.tickets ?? 0}">
      </div>
    </div>
    <div class="mufo-modal-courses">
      <label class="form-check-label"><input type="checkbox" id="m-b5" ${qData.courseB5 ? 'checked' : ''}> B5 課程（本季）</label>
      <label class="form-check-label"><input type="checkbox" id="m-nuot" ${qData.courseNUOT ? 'checked' : ''}> NUOT 課程（本季）</label>
      <label class="form-check-label"><input type="checkbox" id="m-ecct" ${ecctDone ? 'checked' : ''}> ECCT 課程（本年度）<small style="color:var(--tx3)"> 全年有效</small></label>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost mufo-cancel">取消</button>
      <button class="btn btn-primary mufo-save">儲存</button>
    </div>
  `);

  el.querySelector('.mufo-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  el.querySelector('.mufo-save').onclick = async () => {
    const saveBtn = el.querySelector('.mufo-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中…';

    const newRetailBV = Number(el.querySelector('#m-retailbv').value) || 0;
    const newIBV      = Number(el.querySelector('#m-ibv').value)      || 0;
    const newRecruits = Number(el.querySelector('#m-recruits').value) || 0;
    const newTickets  = Number(el.querySelector('#m-tickets').value)  || 0;
    const newB5       = el.querySelector('#m-b5').checked;
    const newNUOT     = el.querySelector('#m-nuot').checked;
    const newECCT     = el.querySelector('#m-ecct').checked;

    const histEntry = { date: todayStr(), retailBV: newRetailBV, ibv: newIBV, recruits: newRecruits, tickets: newTickets };

    try {
      // 季度文件
      await setDoc(userSubDoc('mufo', quarter), {
        retailBV:   newRetailBV,
        ibv:        newIBV,
        recruits:   newRecruits,
        tickets:    newTickets,
        courseB5:   newB5,
        courseNUOT: newNUOT,
        updatedAt:  serverTimestamp(),
        history:    [...(qData.history ?? []), histEntry],
      });
      // 年度文件（ECCT）
      await setDoc(userSubDoc('mufo', year), { ecctDone: newECCT }, { merge: true });

      toast('MUFO 數據已更新', 'success');
      _closeModal(el);

      // 直接以新資料重新渲染，不需要再 getDoc
      const newQData = {
        ...qData,
        retailBV: newRetailBV, ibv: newIBV,
        recruits: newRecruits, tickets: newTickets,
        courseB5: newB5, courseNUOT: newNUOT,
        history: [...(qData.history ?? []), histEntry],
      };
      _renderPage(content, quarter, year, newQData, newECCT);

      // 成就：MUFO 7/7 全達標
      const newDoneCount = [
        newRetailBV >= 1500, newIBV >= 300,
        newRecruits >= 1,    newTickets >= 3,
        newB5, newNUOT, newECCT,
      ].filter(Boolean).length;
      if (newDoneCount >= 7) checkAchievements({ first_mufo: true }).catch(() => {});
    } catch (err) {
      console.error('[mufo] save error', err);
      toast('儲存失敗，請重試', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存';
    }
  };
}

// ── 工具函式 ──────────────────────────────────────────────

function _emptyQuarter() {
  return { retailBV: 0, ibv: 0, recruits: 0, tickets: 0, courseB5: false, courseNUOT: false, history: [] };
}

function _daysLeftInQuarter() {
  const now = new Date();
  const m   = now.getMonth();
  const qEndMonth = [2, 5, 8, 11][Math.floor(m / 3)];
  const lastDay   = new Date(now.getFullYear(), qEndMonth + 1, 0);
  return Math.max(0, Math.ceil((lastDay - now) / 86400000));
}

function _elapsedInQuarter() {
  const now = new Date();
  const m   = now.getMonth();
  const qStartMonth = [0, 3, 6, 9][Math.floor(m / 3)];
  const startDay    = new Date(now.getFullYear(), qStartMonth, 1);
  return Math.max(1, Math.floor((now - startDay) / 86400000) + 1);
}

function _totalDaysInQuarter() {
  const now = new Date();
  const m   = now.getMonth();
  const qStartMonth = [0, 3, 6, 9][Math.floor(m / 3)];
  const qEndMonth   = [2, 5, 8, 11][Math.floor(m / 3)];
  const startDay    = new Date(now.getFullYear(), qStartMonth, 1);
  const lastDay     = new Date(now.getFullYear(), qEndMonth + 1, 0);
  return Math.floor((lastDay - startDay) / 86400000) + 1;
}

function _daysSince(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return Math.floor((Date.now() - d) / 86400000);
}

function _formatTs(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
