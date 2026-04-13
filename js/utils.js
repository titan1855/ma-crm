/**
 * utils.js — 工具函式
 * toast 通知、日期格式、顏色、確認對話框等
 */

// ---- Toast 通知 ----

/**
 * 顯示 Toast 訊息
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 */
export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });

  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 2800);
}

// ---- 日期工具 ----

/** 回傳今天的 "YYYY-MM-DD" 字串 */
export function todayStr() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

/** 取得當前季度字串，例如 "2026-Q2" */
export function currentQuarter() {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}

/** 格式化日期為 "YYYY/MM/DD" */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('/');
}

/**
 * 相對時間，例如 "3天前"、"今天"
 * @param {string|Date} date
 */
export function formatRelativeDate(date) {
  if (!date) return '未聯繫';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '未聯繫';
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return `${diff}天前`;
  if (diff < 30) return `${Math.floor(diff / 7)}週前`;
  if (diff < 365) return `${Math.floor(diff / 30)}個月前`;
  return `${Math.floor(diff / 365)}年前`;
}

/** 依時段回傳問候語 */
export function getGreeting() {
  const h = new Date().getHours();
  if (h < 6)  return '晚安';
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

// ---- 頭像工具 ----

const AVATAR_COLORS = [
  '#2D7D46', '#1565C0', '#7B1FA2', '#C62828',
  '#00695C', '#E65100', '#4527A0', '#37474F'
];

/** 根據姓名決定頭像背景色 */
export function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let sum = 0;
  for (const c of name) sum += c.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/** 取出名字第一個字作為頭像文字 */
export function avatarInitial(name) {
  return name ? name.charAt(0) : '?';
}

// ---- 防抖 ----

/** Debounce：delay 毫秒後才執行 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ---- 確認對話框 ----

/**
 * 顯示確認對話框，返回 Promise<boolean>
 * @param {string} message 確認訊息
 * @param {string} [confirmText='確認']
 * @param {string} [cancelText='取消']
 */
export function confirmDialog(message, confirmText = '確認', cancelText = '取消') {
  return new Promise(resolve => {
    const container = document.getElementById('modal-container');
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `
      <div class="modal-box modal-confirm">
        <p class="modal-msg">${message}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-cancel">${cancelText}</button>
          <button class="btn btn-primary btn-confirm">${confirmText}</button>
        </div>
      </div>
    `;
    container.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('show'));
    });

    const close = result => {
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      resolve(result);
    };

    el.querySelector('.btn-cancel').onclick = () => close(false);
    el.querySelector('.btn-confirm').onclick = () => close(true);
    el.addEventListener('click', e => { if (e.target === el) close(false); });
  });
}

// ---- 數字格式化 ----

/** 千位數分隔，例如 1500 → "1,500" */
export function formatNumber(n) {
  return Number(n || 0).toLocaleString('zh-TW');
}

// ---- 空狀態卡片 ----

/**
 * 產生空狀態 HTML
 * @param {string} icon emoji
 * @param {string} text 說明文字
 */
export function emptyState(icon, text) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <p class="empty-text">${text}</p>
    </div>
  `;
}
