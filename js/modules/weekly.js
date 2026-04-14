/**
 * weekly.js — 模組九：週報自動摘要
 */
import { navigate } from '../router.js';
import {
  userSubDoc, userCollection,
  getDoc, getDocs
} from '../db.js';
import { toast, currentQuarter, formatNumber } from '../utils.js';
import { completeOnboardingDay7 } from './onboarding.js';

let _weekOffset = 0;
let _profile    = null;
let _onAdvance  = null;

/** app.js 登入後呼叫，傳入 profile 與 profile 更新 callback */
export function setWeeklyProfile(p, onAdv) {
  _profile   = p;
  _onAdvance = onAdv;
}

export function render(content) {
  _weekOffset = 0;
  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">📈 週報摘要</span>
    </div>
    <div class="wk-loading">載入中…</div>
  `;
  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  _loadWeek(content);

  // Onboarding Day 7 完成條件：進入週報頁面
  if (_profile?.onboardingDay === 7) {
    completeOnboardingDay7(_profile, newP => {
      _profile = newP;
      if (_onAdvance) _onAdvance(newP);
    }).catch(() => {});
  }
}

// ── 載入並計算某週資料 ─────────────────────────────────────

async function _loadWeek(content) {
  const { start, end, label } = _getWeekRange(_weekOffset);
  const startStr = _dateStr(start);
  const endStr   = _dateStr(end);

  try {
    const [d312Snap, poolSnap, prospSnap, mufoSnap] = await Promise.all([
      getDocs(userCollection('daily312')),
      getDocs(userCollection('pool')),
      getDocs(userCollection('prospects')),
      getDoc(userSubDoc('mufo', currentQuarter())),
    ]);

    // 過濾週內 daily312 文件
    const weekDocs = d312Snap.docs
      .filter(d => d.id >= startStr && d.id <= endStr)
      .map(d => d.data());

    const completedDays  = weekDocs.filter(d => d.completed).length;
    const totalChatCount = weekDocs.reduce((s, d) => s + (d.chatCount ?? 0), 0);
    const totalMeetCount = weekDocs.reduce((s, d) => s + (d.meetCount ?? 0), 0);
    const totalPoolAdded = weekDocs.reduce((s, d) => s + (d.poolCount ?? 0), 0);

    // 本週有聯繫的不重複名單數
    const contactedIds = new Set();
    weekDocs.forEach(d => {
      (d.chats    ?? []).forEach(e => { if (e.prospectId) contactedIds.add(e.prospectId); });
      (d.meetings ?? []).forEach(e => { if (e.prospectId) contactedIds.add(e.prospectId); });
    });

    // 首選名單統計
    const allProspects    = prospSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const activeProspects = allProspects.filter(p => p.status === 'active');
    const contactedThisWeek = activeProspects.filter(p => {
      if (!p.lastContactAt) return false;
      const ts = p.lastContactAt.toDate?.() ?? new Date(p.lastContactAt);
      return ts >= start && ts <= end;
    }).length;

    // MUFO 進度摘要
    let mufoLine = '';
    if (mufoSnap.exists()) {
      const md     = mufoSnap.data();
      const done   = [
        (md.retailBV ?? 0) >= 1500, (md.ibv ?? 0) >= 300,
        (md.recruits ?? 0) >= 1,    (md.tickets ?? 0) >= 3,
        md.courseB5, md.courseNUOT,
      ].filter(Boolean).length;
      const retailPct = Math.min(100, Math.round(((md.retailBV ?? 0) / 1500) * 100));
      mufoLine = `MUFO ${currentQuarter()} 達標 ${done}/6+（零售 BV ${retailPct}%）`;
    }

    _renderPage(content, {
      label, startStr, endStr,
      completedDays, totalChatCount, totalMeetCount,
      totalPoolAdded,
      contactedCount:    contactedIds.size,
      poolTotal:         poolSnap.size,
      activeCount:       activeProspects.length,
      contactedThisWeek,
      mufoLine,
      weekDays: 7,
    });
  } catch (err) {
    console.error('[weekly] load error', err);
    toast('週報載入失敗，請重試', 'error');
  }
}

// ── 渲染頁面 ──────────────────────────────────────────────

function _renderPage(content, d) {
  const canForward = _weekOffset < 0;

  const rows = [
    ['312 達標',    `${d.completedDays} / ${d.weekDays} 天`],
    ['新增名單',    `${d.totalPoolAdded} 人`],
    ['聯繫次數',    `${d.totalChatCount + d.totalMeetCount} 次`],
    ['─ 其中會面', `${d.totalMeetCount} 次`],
    ['聯繫人數',    `${d.contactedCount} 人`],
    ['名單池',      `${formatNumber(d.poolTotal)} 人`],
    ['首選跟進中',  `${d.activeCount} 人`],
    ['本週有聯繫',  `${d.contactedThisWeek} 人`],
  ];

  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">📈 週報摘要</span>
    </div>
    <div class="wk-nav-row">
      <button class="btn btn-ghost wk-prev-btn" style="font-size:.8rem;padding:.3rem .7rem">← 上週</button>
      <span class="wk-week-label">${d.label}</span>
      <button class="btn btn-ghost wk-next-btn" style="font-size:.8rem;padding:.3rem .7rem"
        ${canForward ? '' : 'disabled style="opacity:.4"'}>下週 →</button>
    </div>
    <div class="card wk-card">
      ${rows.map(([label, val]) => `
        <div class="wk-stat-row">
          <span class="wk-stat-label">${label}</span>
          <span class="wk-stat-val">${val}</span>
        </div>
      `).join('')}
      ${d.mufoLine ? `<div class="wk-mufo-row">${d.mufoLine}</div>` : ''}
    </div>
    <button class="btn btn-secondary wk-copy-btn" style="width:100%;margin-top:.5rem">📋 複製文字分享</button>
  `;

  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  content.querySelector('.wk-prev-btn').addEventListener('click', () => { _weekOffset--; _loadWeek(content); });
  content.querySelector('.wk-next-btn').addEventListener('click', () => {
    if (!canForward) return;
    _weekOffset++;
    _loadWeek(content);
  });
  content.querySelector('.wk-copy-btn').addEventListener('click', () => _copyText(d));
}

// ── 複製純文字 ─────────────────────────────────────────────

function _copyText(d) {
  const lines = [
    `📊 MA 名單週報 ${d.label}`,
    '',
    `312 達標：${d.completedDays} / ${d.weekDays} 天`,
    `新增名單：${d.totalPoolAdded} 人`,
    `聯繫次數：${d.totalChatCount + d.totalMeetCount} 次（會面 ${d.totalMeetCount} 次）`,
    `名單池：${d.poolTotal} 人`,
    `首選跟進中：${d.activeCount} 人`,
    `本週有聯繫：${d.contactedThisWeek} 人`,
    d.mufoLine ? d.mufoLine : '',
  ].filter(l => l !== null);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => toast('已複製到剪貼簿', 'success'))
      .catch(() => toast('複製失敗', 'error'));
  } else {
    toast('此裝置不支援自動複製', 'warning');
  }
}

// ── 日期工具 ──────────────────────────────────────────────

function _getWeekRange(offset = 0) {
  const now     = new Date();
  const dow     = now.getDay(); // 0=Sun
  const fromMon = dow === 0 ? 6 : dow - 1;
  const monday  = new Date(now);
  monday.setDate(now.getDate() - fromMon + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const fmt   = d => `${d.getMonth() + 1}/${d.getDate()}`;
  return { start: monday, end: sunday, label: `${fmt(monday)} ~ ${fmt(sunday)}` };
}

function _dateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
