/**
 * onboarding.js — 模組十：新手引導
 * renderOnboardingCard() 供 daily312.js 呼叫（在 312 頁面頂端插入引導卡）
 * completeOnboardingDay7() 供 weekly.js 呼叫（進入週報即完成 Day 7）
 */
import { navigate } from '../router.js';
import {
  userSubDoc, userCollection,
  getDoc, getDocs, setProfile
} from '../db.js';
import { toast, todayStr, currentQuarter } from '../utils.js';

// ── 七天任務定義 ──────────────────────────────────────────

const TASKS = [
  { day: 1, msg: '先建立名單池，想 5 個你認識的人' },
  { day: 2, msg: '從名單池裡，選 2~3 人加入首選名單' },
  { day: 3, msg: '開始第一個 312：先聯繫一個人' },
  { day: 4, msg: '試著完成完整的 312（聊天×3 會面×1 名單×2）' },
  { day: 5, msg: '幫首選名單至少 1 人填 3 格以上 FORMHD' },
  { day: 6, msg: '更新你的 MUFO 數據' },
  { day: 7, msg: '看看你的第一份週報！' },
];

// ── 公開 API ──────────────────────────────────────────────

/**
 * 在 daily312 頁面頂端插入引導任務卡。
 * @param {Element} content  app-content DOM 元素
 * @param {Object}  profile  目前 profile（含 onboardingDay）
 * @param {Function} onAdvance  profile 更新後的 callback(newProfile)
 */
export async function renderOnboardingCard(content, profile, onAdvance) {
  const day = profile?.onboardingDay;
  if (!day || day <= 0) return; // 引導已結束

  const task = TASKS[day - 1];
  if (!task) return;

  // 先插入「載入中」版本的卡
  const card = document.createElement('div');
  card.className = 'ob-card ob-loading';
  card.innerHTML = `
    <div class="ob-progress">Day ${day} / 7</div>
    <div class="ob-task">${task.msg}</div>
    <div class="ob-status">檢查中…</div>
  `;
  content.insertBefore(card, content.firstChild);

  if (day === 7) {
    // Day 7 由進入週報觸發，這裡只顯示按鈕
    card.classList.remove('ob-loading');
    card.querySelector('.ob-status').innerHTML = `
      <button class="btn btn-primary ob-go-weekly-btn" style="font-size:.82rem;padding:.35rem .85rem">
        查看週報 →
      </button>
    `;
    card.querySelector('.ob-go-weekly-btn').addEventListener('click', () => {
      navigate('more', 'weekly');
    });
    return;
  }

  // 非同步檢查條件
  try {
    const done = await _checkCondition(day);
    card.classList.remove('ob-loading');

    if (done) {
      card.classList.add('ob-done');
      card.querySelector('.ob-status').innerHTML = `
        ✓ 完成！
        <button class="btn btn-primary ob-advance-btn" style="font-size:.82rem;padding:.3rem .8rem;margin-left:.5rem">
          下一步 →
        </button>
      `;
      card.querySelector('.ob-advance-btn').addEventListener('click', async () => {
        await _advanceDay(day, profile, onAdvance);
        card.remove();
      });
    } else {
      card.querySelector('.ob-status').textContent = '尚未完成，繼續加油！';
    }
  } catch (err) {
    console.error('[onboarding] check error', err);
    card.classList.remove('ob-loading');
    card.querySelector('.ob-status').textContent = '尚未完成，繼續加油！';
  }
}

/**
 * 由 weekly.js 在渲染時呼叫，完成 Day 7。
 */
export async function completeOnboardingDay7(profile, onAdvance) {
  if (!profile || profile.onboardingDay !== 7) return;
  await _advanceDay(7, profile, onAdvance);
}

// ── 條件檢查 ──────────────────────────────────────────────

async function _checkCondition(day) {
  switch (day) {
    case 1: {
      const snap = await getDocs(userCollection('pool'));
      return snap.size >= 5;
    }
    case 2: {
      const snap = await getDocs(userCollection('prospects'));
      return snap.size >= 2;
    }
    case 3: {
      const snap = await getDoc(userSubDoc('daily312', todayStr()));
      return snap.exists() && (snap.data().chatCount ?? 0) >= 1;
    }
    case 4: {
      const snap = await getDoc(userSubDoc('daily312', todayStr()));
      return snap.exists() && snap.data().completed === true;
    }
    case 5: {
      const FORMHD = ['family', 'occupation', 'recreation', 'money', 'health', 'dream'];
      const snap   = await getDocs(userCollection('prospects'));
      return snap.docs.some(d => {
        const data = d.data();
        return FORMHD.filter(f => (data[f] ?? '').trim()).length >= 3;
      });
    }
    case 6: {
      const snap = await getDoc(userSubDoc('mufo', currentQuarter()));
      return snap.exists() && !!snap.data().updatedAt;
    }
    default:
      return false;
  }
}

// ── 推進天數 ──────────────────────────────────────────────

async function _advanceDay(day, profile, onAdvance) {
  const nextDay   = day >= 7 ? 0 : day + 1;
  const newProfile = { ...profile, onboardingDay: nextDay };
  try {
    await setProfile({ onboardingDay: nextDay });
    if (nextDay === 0) {
      toast('🎉 新手引導完成！歡迎正式加入！', 'success', 6000);
      _showConfetti();
    } else {
      toast(`Day ${day} 完成！繼續加油！`, 'success');
    }
    if (onAdvance) onAdvance(newProfile);
  } catch (err) {
    console.error('[onboarding] advance error', err);
    toast('更新失敗，請重試', 'error');
  }
}

// ── 慶祝 confetti ─────────────────────────────────────────

function _showConfetti() {
  const colors = ['#1B5E3B', '#3A9E6F', '#D4800A', '#1A6FA8', '#F6C90E'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'm312-confetti';
    el.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}vw`,
      `animation-delay:${(Math.random() * 1.5).toFixed(2)}s`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}
