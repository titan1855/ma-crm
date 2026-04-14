/**
 * calendar.js — 約會行程月曆
 * 顯示首選名單中已排定下次約會時間的人（nextMeetingDate 欄位）
 */
import { navigate } from '../router.js';
import { userCollection, getDocs } from '../db.js';
import { toast, todayStr, formatDate, emptyState } from '../utils.js';

export function render(content) {
  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">📅 約會行程</span>
    </div>
    <div class="cal-loading">載入中…</div>
  `;
  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  _loadCalendar(content);
}

async function _loadCalendar(content) {
  try {
    const snap = await getDocs(userCollection('prospects'));
    const today = todayStr();

    // 取有 nextMeetingDate 的人
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const withDate = all
      .filter(p => p.nextMeetingDate && p.status !== 'signed')
      .sort((a, b) => a.nextMeetingDate.localeCompare(b.nextMeetingDate));

    const upcoming = withDate.filter(p => p.nextMeetingDate >= today);
    const overdue  = withDate.filter(p => p.nextMeetingDate <  today);

    _renderPage(content, today, upcoming, overdue);
  } catch (err) {
    console.error('[calendar] load error', err);
    toast('行程載入失敗', 'error');
  }
}

function _renderPage(content, today, upcoming, overdue) {
  // 把 upcoming 按日期分組
  const groups = {};
  upcoming.forEach(p => {
    const d = p.nextMeetingDate;
    if (!groups[d]) groups[d] = [];
    groups[d].push(p);
  });

  const groupsHtml = Object.entries(groups).map(([date, people]) => {
    const isToday    = date === today;
    const isTomorrow = date === _addDays(today, 1);
    const label = isToday ? '今天' : isTomorrow ? '明天' : formatDate(date);
    return `
      <div class="cal-day-group">
        <div class="cal-day-label${isToday ? ' today' : ''}">${label}${isToday ? ' 📌' : ''}</div>
        ${people.map(p => _cardHtml(p)).join('')}
      </div>
    `;
  }).join('');

  const overdueHtml = overdue.length > 0 ? `
    <div class="cal-day-group">
      <div class="cal-day-label cal-overdue-label">⚠️ 已過期未確認</div>
      ${overdue.map(p => _cardHtml(p, true)).join('')}
    </div>
  ` : '';

  const emptyHtml = upcoming.length === 0 && overdue.length === 0
    ? emptyState('📅', '尚無排定行程\n在首選名單記錄會面時，填入「下次約定時間」即可顯示在這裡')
    : '';

  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">📅 約會行程</span>
    </div>
    <p class="cal-hint">記錄會面時填入「下次約定時間」，會自動出現在這裡</p>
    ${overdueHtml}
    ${groupsHtml || emptyHtml}
  `;

  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
}

function _cardHtml(p, isOverdue = false) {
  const step = p.recruitStep ?? 1;
  const STEPS = ['列名單', '講商機', '會邀約', '說制度', '懂締結', '要跟進'];
  return `
    <div class="card cal-card${isOverdue ? ' cal-overdue' : ''}">
      <div class="card-row" style="align-items:center">
        <div class="cal-avatar-wrap">
          <div class="avatar" style="background:${_avatarColor(p.name)}">${(p.name ?? '?').charAt(0)}</div>
        </div>
        <div class="card-info">
          <div class="card-name">${_esc(p.name)}</div>
          <div class="card-sub">Step ${step}：${STEPS[step - 1]}${p.nextMeetingDate ? ' · ' + formatDate(p.nextMeetingDate) : ''}</div>
          ${p.nextMeetingLoc ? `<div class="card-sub">📍 ${_esc(p.nextMeetingLoc)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function _addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

const _COLORS = ['#2D7D46','#1565C0','#7B1FA2','#C62828','#00695C','#E65100','#4527A0','#37474F'];
function _avatarColor(name) {
  if (!name) return _COLORS[0];
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return _COLORS[s % _COLORS.length];
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
