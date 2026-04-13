/**
 * app.js — 應用進入點
 * 初始化 Firebase Auth、路由、全域狀態
 */
import { onUserReady, login, logout, checkAllowList, getCurrentUser, isAdmin } from './auth.js';
import { getProfile, setProfile, serverTimestamp } from './db.js';
import { initRouter, registerTab, navigate } from './router.js';
import { initMigration } from './migration.js';
import { toast, getGreeting } from './utils.js';

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
      toast('儲存失敗，請重試', 'error');
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
  registerTab('more', (content) => {
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
// 進入主 App
// ==============================

function enterApp() {
  showScreen('app');
  updateHeader();
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

    // 讀取 profile
    const profile = await getProfile();
    if (!profile) {
      showScreen('setup-screen');
      return;
    }

    state.profile = profile;
    enterApp();
  });
}

document.addEventListener('DOMContentLoaded', init);
