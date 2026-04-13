/**
 * daily312.js — 模組四：每日 312 打卡（系統首頁）
 * 目標：每天 聊天×3、會面×1、新增名單×2
 */
import { registerTab } from '../router.js';

export function init() {
  registerTab('312', render);
}

export function render(content) {
  content.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-icon">✅</div>
      <p class="placeholder-text">每日 312 打卡<br><small>建構中，敬請期待</small></p>
    </div>
  `;
}
