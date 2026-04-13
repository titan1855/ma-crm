/**
 * pool.js — 模組二：名單池
 */
import { registerTab } from '../router.js';

export function init() {
  registerTab('pool', render);
}

export function render(content) {
  content.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-icon">📋</div>
      <p class="placeholder-text">名單池<br><small>建構中，敬請期待</small></p>
    </div>
  `;
}
