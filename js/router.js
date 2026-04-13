/**
 * router.js — Tab 切換 + 頁面渲染控制
 * 支援 URL hash 路由：#312, #prospects, #pool, #more, #more/mufo ...
 */

const TABS = ['312', 'prospects', 'pool', 'more'];
const _handlers = {};   // tab name → render function
let _currentTab = null;

/**
 * 向 router 註冊 Tab 的渲染函式
 * @param {string} tabName
 * @param {function} renderFn  接收 (contentEl) 參數
 */
export function registerTab(tabName, renderFn) {
  _handlers[tabName] = renderFn;
}

/** 取得目前 Tab */
export function getCurrentTab() {
  return _currentTab;
}

/**
 * 切換到指定 Tab
 * @param {string} tab  TABS 中的值
 * @param {string} [sub]  子路徑，例如 'mufo'
 */
export function navigate(tab, sub) {
  if (!TABS.includes(tab)) return;
  _currentTab = tab;

  // 更新底部 tab bar 樣式
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // 更新 URL hash（不觸發 hashchange）
  const hash = sub ? `${tab}/${sub}` : tab;
  history.replaceState(null, '', `#${hash}`);

  // 渲染內容
  const content = document.getElementById('app-content');
  if (!content) return;

  if (_handlers[tab]) {
    _handlers[tab](content, sub);
  } else {
    content.innerHTML = `
      <div class="placeholder-page">
        <div class="placeholder-icon">🔧</div>
        <p class="placeholder-text">此功能建構中，敬請期待</p>
      </div>
    `;
  }
}

/** 初始化 router（綁定 tab bar 點擊、解析初始 hash） */
export function initRouter() {
  // 底部 Tab 點擊
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.tab));
  });

  // 解析初始 hash
  const hash = location.hash.replace('#', '');
  const [tab, sub] = hash.split('/');
  const initialTab = TABS.includes(tab) ? tab : '312';
  navigate(initialTab, sub);
}
