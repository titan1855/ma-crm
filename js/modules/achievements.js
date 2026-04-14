/**
 * achievements.js — 模組八：成就與里程碑
 * checkAchievements(hints) 供其他模組呼叫；render() 顯示成就頁面
 */
import { navigate } from '../router.js';
import {
  userSubDoc, userCollection,
  getDoc, setDoc, getDocs, serverTimestamp
} from '../db.js';
import { getProfile } from '../db.js';
import { toast, currentQuarter } from '../utils.js';

// ── 成就定義表 ─────────────────────────────────────────────

const ACHIEVEMENTS = [
  { key: 'first_chat',   icon: '💬', name: '踏出第一步',     desc: '首次記錄聊天' },
  { key: 'first_meet',   icon: '🤝', name: '面對面',         desc: '首次記錄會面' },
  { key: 'first_312',    icon: '🏆', name: '第一次 312 達標', desc: '完成今日 3 聊天 1 會面 2 名單' },
  { key: 'first_step4',  icon: '🎯', name: '進入深水區',     desc: '首個名單進到說制度步驟' },
  { key: 'first_signed', icon: '🌟', name: '收穫！',         desc: '首個名單成功加入' },
  { key: 'first_sale',   icon: '🛒', name: '第一筆零售',     desc: '首筆優惠顧客購物記錄' },
  { key: 'first_mufo',   icon: '📊', name: '季度達標',       desc: '首季 MUFO 7 項全達標' },
  { key: 'streak_7',     icon: '🔥', name: '一週連勝',       desc: '連續 7 天 312 達標' },
  { key: 'streak_30',    icon: '⚡', name: '月度鐵人',       desc: '連續 30 天 312 達標' },
  { key: 'pool_50',      icon: '💧', name: '水庫半滿',       desc: '名單池累計 50 人' },
  { key: 'pool_100',     icon: '🌊', name: '百人名單',       desc: '名單池累計 100 人' },
  { key: 'prospects_10', icon: '👥', name: '十人同行',       desc: '同時 10 個首選名單持續跟進' },
];

const _achRef = () => userSubDoc('meta', 'achievements');

// ── 公開 API ──────────────────────────────────────────────

/**
 * 以 hints 快速解鎖成就（不需要額外 DB 讀取）
 * hints 可包含：
 *   first_chat, first_meet, first_312, first_step4,
 *   first_signed, first_sale, first_mufo  → boolean
 *   streak, pool_count, prospects_count    → number
 */
export async function checkAchievements(hints = {}) {
  try {
    const snap         = await getDoc(_achRef());
    const current      = snap.exists() ? (snap.data().unlocked ?? []) : [];
    const unlockedKeys = new Set(current.map(u => u.key));

    const toUnlock = ACHIEVEMENTS.filter(a =>
      !unlockedKeys.has(a.key) && _conditionMet(a.key, hints)
    );
    if (toUnlock.length === 0) return;

    const now        = new Date().toISOString();
    const newEntries = toUnlock.map(a => ({ key: a.key, unlockedAt: now, seen: false }));
    await setDoc(_achRef(), { unlocked: [...current, ...newEntries] }, { merge: true });

    for (const a of toUnlock) {
      _showUnlockModal(a);
      await _sleep(700);
    }
  } catch (err) {
    console.error('[achievements] checkAchievements error', err);
  }
}

// ── 成就頁面 ──────────────────────────────────────────────

export function render(content) {
  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">🌟 成就與里程碑</span>
      <button class="btn btn-ghost ach-sync-btn" style="font-size:.78rem;padding:.3rem .6rem">同步狀態</button>
    </div>
    <div class="ach-grid">
      <div class="ach-loading-msg">載入中…</div>
    </div>
  `;
  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  content.querySelector('.ach-sync-btn').addEventListener('click', async () => {
    const btn = content.querySelector('.ach-sync-btn');
    btn.disabled = true;
    btn.textContent = '同步中…';
    try {
      await _fullCheck();
      await _renderGrid(content);
      toast('已同步成就狀態', 'success');
    } catch (err) {
      toast('同步失敗，請重試', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '同步狀態';
    }
  });

  _renderGrid(content).catch(() => {});
}

// ── 渲染成就格 ─────────────────────────────────────────────

async function _renderGrid(content) {
  const grid = content.querySelector('.ach-grid');
  if (!grid) return;

  const snap       = await getDoc(_achRef());
  const unlocked   = snap.exists() ? (snap.data().unlocked ?? []) : [];
  const unlockedMap = Object.fromEntries(unlocked.map(u => [u.key, u]));

  grid.innerHTML = ACHIEVEMENTS.map(a => {
    const u = unlockedMap[a.key];
    if (u) {
      const dateStr = u.unlockedAt
        ? new Date(u.unlockedAt).toLocaleDateString('zh-TW')
        : '';
      return `
        <div class="ach-card ach-unlocked">
          <div class="ach-icon">${a.icon}</div>
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          ${dateStr ? `<div class="ach-date">${dateStr}</div>` : ''}
        </div>
      `;
    }
    return `
      <div class="ach-card ach-locked">
        <div class="ach-icon">🔒</div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
    `;
  }).join('');
}

// ── 全量同步（同步按鈕觸發） ──────────────────────────────

async function _fullCheck() {
  const [poolSnap, prospSnap, d312Snap, profile, mufoSnap, yearSnap] = await Promise.all([
    getDocs(userCollection('pool')),
    getDocs(userCollection('prospects')),
    getDocs(userCollection('daily312')),
    getProfile(),
    getDoc(userSubDoc('mufo', currentQuarter())),
    getDoc(userSubDoc('mufo', currentQuarter().split('-')[0])),
  ]);

  const allProspects = prospSnap.docs.map(d => d.data());
  let hasChat = false, hasMeet = false, has312 = false;
  d312Snap.forEach(d => {
    const v = d.data();
    if ((v.chatCount ?? 0) > 0) hasChat = true;
    if ((v.meetCount ?? 0) > 0) hasMeet = true;
    if (v.completed) has312 = true;
  });

  let mufoAllDone = false;
  if (mufoSnap.exists()) {
    const md   = mufoSnap.data();
    const ecct = yearSnap.exists() ? (yearSnap.data().ecctDone ?? false) : false;
    const done = [
      (md.retailBV ?? 0) >= 1500, (md.ibv ?? 0) >= 300,
      (md.recruits ?? 0) >= 1,    (md.tickets ?? 0) >= 3,
      md.courseB5, md.courseNUOT,  ecct,
    ].filter(Boolean).length;
    mufoAllDone = done >= 7;
  }

  await checkAchievements({
    first_chat:      hasChat,
    first_meet:      hasMeet,
    first_312:       has312,
    first_step4:     allProspects.some(p => (p.recruitStep ?? 1) >= 4),
    first_signed:    allProspects.some(p => p.status === 'signed'),
    first_mufo:      mufoAllDone,
    streak:          profile?.streak?.current ?? 0,
    pool_count:      poolSnap.size,
    prospects_count: allProspects.filter(p => p.status === 'active').length,
  });
}

// ── 條件判定 ──────────────────────────────────────────────

function _conditionMet(key, hints) {
  switch (key) {
    case 'first_chat':    return hints.first_chat    === true;
    case 'first_meet':    return hints.first_meet    === true;
    case 'first_312':     return hints.first_312     === true;
    case 'first_step4':   return hints.first_step4   === true;
    case 'first_signed':  return hints.first_signed  === true;
    case 'first_sale':    return hints.first_sale    === true;
    case 'first_mufo':    return hints.first_mufo    === true;
    case 'streak_7':      return typeof hints.streak === 'number' && hints.streak >= 7;
    case 'streak_30':     return typeof hints.streak === 'number' && hints.streak >= 30;
    case 'pool_50':       return typeof hints.pool_count === 'number' && hints.pool_count >= 50;
    case 'pool_100':      return typeof hints.pool_count === 'number' && hints.pool_count >= 100;
    case 'prospects_10':  return typeof hints.prospects_count === 'number' && hints.prospects_count >= 10;
    default:              return false;
  }
}

// ── 解鎖慶祝 ──────────────────────────────────────────────

function _showUnlockModal(achievement) {
  toast(`🏆 成就解鎖：${achievement.name}`, 'success', 5000);
  _showConfetti();

  const container = document.getElementById('modal-container');
  const el        = document.createElement('div');
  el.className    = 'modal-backdrop';
  el.innerHTML    = `
    <div class="modal-box ach-unlock-modal">
      <div class="ach-unlock-icon">${achievement.icon}</div>
      <div class="ach-unlock-title">成就解鎖！</div>
      <div class="ach-unlock-name">${achievement.name}</div>
      <div class="ach-unlock-desc">${achievement.desc}</div>
      <button class="btn btn-primary ach-unlock-close" style="width:100%;margin-top:1.1rem">太棒了！</button>
    </div>
  `;
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

  const close = () => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };
  el.querySelector('.ach-unlock-close').onclick = close;
  el.addEventListener('click', e => { if (e.target === el) close(); });
  setTimeout(close, 9000);
}

function _showConfetti() {
  const colors = ['#1B5E3B', '#3A9E6F', '#D4800A', '#1A6FA8', '#F6C90E', '#B83030'];
  for (let i = 0; i < 50; i++) {
    const el       = document.createElement('div');
    el.className   = 'm312-confetti'; // 重用 Phase 4 confetti CSS
    el.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}vw`,
      `animation-delay:${(Math.random() * 1.2).toFixed(2)}s`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
