/**
 * app.js — 應用進入點
 * 初始化 Firebase Auth、路由、全域狀態
 */
import { onUserReady, login, logout, checkAllowList } from './auth.js';
import { getProfile, setProfile, serverTimestamp, setCurrentUid, getDocs, userCollection } from './db.js';
import { initRouter, registerTab, navigate } from './router.js';
import { initMigration } from './migration.js';
import { toast, getGreeting } from './utils.js';
import { init as initPool }      from './modules/pool.js';
import { init as initProspects } from './modules/prospects.js';
import { init as initDaily312, setCurrentProfile } from './modules/daily312.js';
import { render as renderProducts }    from './modules/products.js';
import { render as renderMufo }        from './modules/mufo.js';
import { render as renderChallenges }  from './modules/challenges.js';
import { render as renderAchievements } from './modules/achievements.js';
import { render as renderWeekly, setWeeklyProfile } from './modules/weekly.js';
import { render as renderCalendar } from './modules/calendar.js';

// ---- 全域狀態（其他模組可 import state） ----
export const state = {
  user: null,        // Firebase Auth User 物件
  profile: null,     // Firestore users/{uid}/profile
  isAdmin: false     // 是否為 admin
};

// ==============================
// 畫面管理
// ==============================

const SCREENS = ['loading-screen', 'login-screen', 'rejected-screen', 'setup-screen', 'app'];

function showScreen(id) {
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s === id) ? '' : 'none';
  });
}

// ==============================
// Header
// ==============================

function updateHeader() {
  const greetEl = document.getElementById('header-greeting');
  const nameEl  = document.getElementById('header-user-name');
  if (greetEl) greetEl.textContent = getGreeting();
  if (nameEl && state.profile?.name) nameEl.textContent = state.profile.name;
  _renderStreak();
}

function _renderStreak() {
  const el = document.getElementById('streak-count');
  if (el) el.textContent = state.profile?.streak?.current ?? 0;
}

// ==============================
// Setup Screen（初次設定姓名）
// ==============================

function initSetupScreen() {
  const btn   = document.getElementById('btn-setup-submit');
  const input = document.getElementById('setup-name');
  if (!btn || !input) return;

  const submit = async () => {
    const name = input.value.trim();
    if (!name) { toast('請輸入姓名', 'warning'); return; }

    btn.disabled = true;
    btn.textContent = '儲存中…';

    try {
      await setProfile({
        name,
        createdAt: serverTimestamp(),
        onboardingDay: 1,
        settings: { dailyReminder: true, weeklyReport: true },
        streak: { current: 0, best: 0, lastDate: '' }
      });
      state.profile = { name, onboardingDay: 1, streak: { current: 0, best: 0, lastDate: '' } };
      enterApp();
    } catch (err) {
      console.error('setProfile error:', err);
      // 顯示實際錯誤碼，方便診斷
      const msg = err.code ? `儲存失敗（${err.code}）` : `儲存失敗：${err.message}`;
      toast(msg, 'error');
      btn.disabled = false;
      btn.textContent = '開始使用';
    }
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

// ==============================
// 登入按鈕
// ==============================

function bindAuthButtons() {
  document.getElementById('btn-google-login')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-google-login');
    btn.disabled = true;
    try {
      await login();
      // onUserReady 會接手後續流程
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        toast('登入失敗，請重試', 'error');
      }
      btn.disabled = false;
    }
  });

  document.getElementById('btn-logout-rejected')?.addEventListener('click', () => {
    logout();
  });

  document.getElementById('btn-header-logout')?.addEventListener('click', async () => {
    await logout();
    location.reload();
  });
}

// ==============================
// 更多 Tab 選單
// ==============================

function registerMoreTab() {
  registerTab('more', (content, sub) => {
    // 子頁面路由
    if (sub === 'products')     { renderProducts(content);     return; }
    if (sub === 'mufo')         { renderMufo(content);         return; }
    if (sub === 'challenges')   { renderChallenges(content);   return; }
    if (sub === 'achievements') { renderAchievements(content); return; }
    if (sub === 'weekly')       { renderWeekly(content);       return; }
    if (sub === 'calendar')     { renderCalendar(content);     return; }
    if (sub === 'settings')     { _renderSettings(content);    return; }

    content.innerHTML = `
      <div class="more-menu">
        <div class="more-section-title">業績追蹤</div>
        <div class="more-list">
          <button class="more-item" data-sub="mufo">
            <span class="more-icon">📊</span>
            <span class="more-label">MUFO 季度追蹤</span>
            <span class="more-arrow">›</span>
          </button>
          <button class="more-item" data-sub="challenges">
            <span class="more-icon">🏆</span>
            <span class="more-label">挑戰獎目標</span>
            <span class="more-arrow">›</span>
          </button>
          <button class="more-item" data-sub="products">
            <span class="more-icon">🛍️</span>
            <span class="more-label">自用產品記錄</span>
            <span class="more-arrow">›</span>
          </button>
        </div>

        <div class="more-section-title">成長紀錄</div>
        <div class="more-list">
          <button class="more-item" data-sub="achievements">
            <span class="more-icon">🌟</span>
            <span class="more-label">成就與里程碑</span>
            <span class="more-arrow">›</span>
          </button>
          <button class="more-item" data-sub="weekly">
            <span class="more-icon">📈</span>
            <span class="more-label">週報自動摘要</span>
            <span class="more-arrow">›</span>
          </button>
          <button class="more-item" data-sub="calendar">
            <span class="more-icon">📅</span>
            <span class="more-label">約會行程月曆</span>
            <span class="more-arrow">›</span>
          </button>
        </div>

        ${state.isAdmin ? `
        <div class="more-section-title">管理員</div>
        <div class="more-list">
          <button class="more-item" data-sub="invite">
            <span class="more-icon">👥</span>
            <span class="more-label">邀請夥伴</span>
            <span class="more-arrow">›</span>
          </button>
        </div>
        ` : ''}

        <div class="more-section-title">帳號</div>
        <div class="more-list">
          <button class="more-item" data-sub="settings">
            <span class="more-icon">⚙️</span>
            <span class="more-label">設定</span>
            <span class="more-arrow">›</span>
          </button>
          <button class="more-item" id="more-logout-btn">
            <span class="more-icon">🚪</span>
            <span class="more-label" style="color:var(--dg)">登出</span>
            <span class="more-arrow">›</span>
          </button>
        </div>

        <p class="more-version">MA 名單管理 v1.0</p>
      </div>
    `;

    // 子頁面導覽（建構中）
    content.querySelectorAll('.more-item[data-sub]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate('more', btn.dataset.sub);
      });
    });

    // 登出
    document.getElementById('more-logout-btn')?.addEventListener('click', async () => {
      await logout();
      location.reload();
    });
  });
}

// ==============================
// 設定頁面
// ==============================

function _renderSettings(content) {
  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">⚙️ 設定</span>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">個人資訊</div>
      <div class="card settings-card">
        <div class="settings-row">
          <span class="settings-label">顯示名稱</span>
          <span class="settings-value" id="st-name-val">${_esc(state.profile?.name ?? '')}</span>
        </div>
        <button class="btn btn-ghost settings-edit-name-btn" style="margin-top:.5rem;width:100%">修改名稱</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">資料管理</div>
      <div class="card settings-card">
        <button class="btn btn-ghost" id="st-export-btn" style="width:100%;margin-bottom:.5rem">匯出資料（JSON）</button>
        <p class="settings-hint">將名單池與首選名單以 JSON 格式下載備份</p>
      </div>
    </div>
  `;

  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));

  // 修改名稱
  content.querySelector('.settings-edit-name-btn').addEventListener('click', () => {
    const container = document.getElementById('modal-container');
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">修改顯示名稱</div>
        <div class="form-group">
          <label class="form-label">新名稱</label>
          <input class="form-input" id="st-new-name" value="${_esc(state.profile?.name ?? '')}" autocomplete="off">
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" id="st-name-cancel">取消</button>
          <button class="btn btn-primary" id="st-name-save">儲存</button>
        </div>
      </div>
    `;
    container.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

    const closeModal = () => {
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    };
    el.querySelector('#st-name-cancel').onclick = closeModal;
    el.addEventListener('click', e => { if (e.target === el) closeModal(); });

    el.querySelector('#st-name-save').onclick = async () => {
      const newName = el.querySelector('#st-new-name').value.trim();
      if (!newName) return;
      const saveBtn = el.querySelector('#st-name-save');
      saveBtn.disabled = true; saveBtn.textContent = '儲存中…';
      try {
        await setProfile({ ...state.profile, name: newName });
        state.profile = { ...state.profile, name: newName };
        document.getElementById('header-user-name').textContent = newName;
        content.querySelector('#st-name-val').textContent = newName;
        closeModal();
        toast('名稱已更新', 'success');
      } catch (err) {
        console.error('[settings] name update error', err);
        toast('更新失敗，請重試', 'error');
        saveBtn.disabled = false; saveBtn.textContent = '儲存';
      }
    };
  });

  // 匯出 JSON
  content.querySelector('#st-export-btn').addEventListener('click', async () => {
    const btn = content.querySelector('#st-export-btn');
    btn.disabled = true; btn.textContent = '匯出中…';
    try {
      const [poolSnap, prospectsSnap] = await Promise.all([
        getDocs(userCollection('pool')),
        getDocs(userCollection('prospects')),
      ]);
      const exportData = {
        exportedAt: new Date().toISOString(),
        pool:       poolSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        prospects:  prospectsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `ma-crm-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('資料已匯出', 'success');
    } catch (err) {
      console.error('[settings] export error', err);
      toast('匯出失敗，請重試', 'error');
    } finally {
      btn.disabled = false; btn.textContent = '匯出資料（JSON）';
    }
  });
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==============================
// 進入主 App
// ==============================

function enterApp() {
  showScreen('app');
  updateHeader();
  initPool();
  initProspects();
  initDaily312();
  setCurrentProfile(state.profile);
  setWeeklyProfile(state.profile, p => { state.profile = p; });
  registerMoreTab();
  initRouter();
  initMigration();
}

// ==============================
// 主初始化
// ==============================

async function init() {
  showScreen('loading-screen');
  bindAuthButtons();
  initSetupScreen();

  onUserReady(async (user) => {
    if (!user) {
      showScreen('login-screen');
      return;
    }

    // 白名單檢查
    const allowed = await checkAllowList(user.email);
    if (!allowed) {
      showScreen('rejected-screen');
      // 顯示聯絡資訊
      const msgEl = document.getElementById('rejected-email');
      if (msgEl) msgEl.textContent = user.email;
      return;
    }

    state.user = user;
    state.isAdmin = allowed.role === 'admin';
    // 把 UID 明確存入 db.js，之後所有 Firestore 操作使用此 UID
    setCurrentUid(user.uid);

    // 讀取 profile
    let profile;
    try {
      profile = await getProfile();
    } catch (err) {
      console.error('getProfile error:', err);
      // 如果是找不到文件以外的錯誤（例如權限問題），顯示錯誤訊息
      toast(`讀取資料失敗（${err.code || err.message}），請重新整理`, 'error');
      showScreen('login-screen');
      return;
    }

    if (!profile) {
      showScreen('setup-screen');
      return;
    }

    state.profile = profile;
    enterApp();
  });
}

document.addEventListener('DOMContentLoaded', init);
