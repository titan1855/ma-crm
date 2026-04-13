/**
 * prospects.js — 模組一+三：首選名單 + 招募六步驟 + 詳情頁
 */
import { registerTab } from '../router.js';

export function init() {
  registerTab('prospects', render);
}

export function render(content) {
  content.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-icon">⭐</div>
      <p class="placeholder-text">首選名單<br><small>建構中，敬請期待</small></p>
    </div>
  `;
}
