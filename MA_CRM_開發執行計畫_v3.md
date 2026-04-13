# MA CRM 開發執行計畫（v3）

> 本文件為完整的開發規格書，供 Claude Code 逐步執行開發。
> 使用者不具備程式背景，所有開發與維護由 Claude Code 或 Claude.ai 對話完成。
> 部署平台：GitHub Pages | 資料庫：Firebase Firestore（免費 Spark Plan）
> 最後更新：2026年4月13日

---

## 零、整體架構總覽

```
┌──────────────────────────────────────────────┐
│  使用者手機 / 電腦瀏覽器                        │
│  https://titan1855.github.io/ma-crm/         │
└──────────────┬───────────────────────────────┘
               │ HTTPS
┌──────────────▼───────────────────────────────┐
│  GitHub Pages（免費靜態託管）                    │
│  - 自帶 HTTPS / SSL                           │
│  - git push 自動部署                           │
│  - repo: github.com/titan1855/ma-crm         │
└──────────────┬───────────────────────────────┘
               │ Firebase JS SDK（瀏覽器直連）
┌──────────────▼───────────────────────────────┐
│  Firebase（Google 免費 Spark Plan）             │
│  ├── Authentication（Google 帳號登入）          │
│  ├── Cloud Firestore（NoSQL 資料庫）           │
│  │   └── 離線快取（自動同步）                    │
│  └── Security Rules（白名單 + 個人資料隔離）     │
└──────────────────────────────────────────────┘
```

### 為什麼這樣設計？

| 決策 | 理由 |
|------|------|
| 不用 Python 後端 | 所有邏輯都是 CRUD + 簡單計算，JS 完全夠用。加後端 = 多一套東西要維護 |
| 不用單一 HTML 檔 | 預估完成後 5000-8000 行，AI 維護時 context window 會吃不下，容易改壞 |
| 多檔案模組化 | 每個模組獨立 200-400 行，Claude Code 改一個模組不會碰到別的 |
| Firebase 而非自建 DB | 免費 Spark Plan 額度夠用、自帶離線同步、不需維護伺服器 |
| GitHub Pages 部署 | 免費、自帶 HTTPS、git push 自動部署、Claude Code 直接操作 |

---

## 一、檔案架構

```
ma-crm/                          ← 專案根目錄（= GitHub repo root）
│
├── index.html                   ← 主框架：導覽殼、登入畫面、Modal 容器
├── manifest.json                ← PWA 設定
├── sw.js                        ← Service Worker（離線快取）
│
├── css/
│   └── style.css                ← 所有樣式（一個檔就夠，CSS 不需要拆太細）
│
├── js/
│   ├── app.js                   ← 應用進入點：初始化 Firebase、路由、全域狀態
│   ├── firebase-config.js       ← Firebase 設定（apiKey 等，單獨一檔方便更換）
│   ├── auth.js                  ← 登入 / 登出 / onAuthStateChanged
│   ├── router.js                ← Tab 切換 + 頁面渲染控制
│   ├── db.js                    ← Firestore 共用操作（讀寫封裝、離線啟用）
│   ├── utils.js                 ← 工具函式（日期格式、動畫、toast 通知、confetti）
│   ├── migration.js             ← 舊版 localStorage 資料匯入（一次性）
│   │
│   └── modules/                 ← 每個業務模組獨立一檔
│       ├── daily312.js          ← 模組四：每日 312 打卡（系統首頁）
│       ├── prospects.js         ← 模組一+三：首選名單 + 招募六步驟 + 詳情頁
│       ├── pool.js              ← 模組二：名單池
│       ├── calendar.js          ← 約會行程月曆 / 週曆
│       ├── products.js          ← 模組五：自用產品記錄
│       ├── mufo.js              ← 模組六：MUFO 季度追蹤
│       ├── challenges.js        ← 模組七：挑戰獎自訂目標
│       ├── achievements.js      ← 模組八：成就與里程碑
│       ├── weekly.js            ← 模組九：週報自動摘要
│       └── onboarding.js        ← 模組十：新手引導
│
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

### 模組間的依賴關係

```
app.js（進入點）
  ├── firebase-config.js（設定）
  ├── auth.js（登入狀態）
  ├── db.js（資料層）
  ├── router.js（頁面切換）
  └── modules/
        ├── daily312.js    ← 依賴 prospects.js（推薦聯繫人）、pool.js（新增名單計數）
        ├── prospects.js   ← 獨立，被 daily312 引用
        ├── pool.js        ← 獨立，被 daily312 引用
        ├── calendar.js    ← 依賴 prospects.js（讀取約會資料）
        ├── products.js    ← 獨立
        ├── mufo.js        ← 獨立
        ├── challenges.js  ← 獨立
        ├── achievements.js← 依賴所有模組（監聽觸發條件）
        ├── weekly.js      ← 依賴 daily312, prospects, pool, mufo（彙整數據）
        └── onboarding.js  ← 依賴所有模組（檢查完成條件）
```

### 技術約定

- 使用 **ES Module**（`import` / `export`），瀏覽器原生支援，不需要打包工具
- index.html 用 `<script type="module" src="js/app.js"></script>` 載入
- 所有模組 export 一個 `init()` 函式 + 一個 `render()` 函式
- 共用狀態（當前使用者 UID、當前選中的名單 ID 等）透過 `app.js` 管理
- Firebase SDK 透過 CDN 引入（`https://www.gstatic.com/firebasejs/10.12.0/`）

---

## 二、前置作業（已全部完成 ✅）

> 以下步驟已由使用者完成，記錄在此供 Claude Code 參考。

### Step 1：建立 Firebase 專案 ✅
- 專案已建立於 Firebase Console
- Spark Plan（免費方案）

### Step 2：啟用 Google 登入 ✅
- Authentication → Google Sign-in 已啟用

### Step 3：建立 Firestore 資料庫 ✅
- Cloud Firestore（Standard 版）
- 位置：asia-east1（台灣）

### Step 4：取得 Firebase 設定 ✅
- 使用 CDN script 方式引入（非 npm）
- firebaseConfig 已取得（使用者會提供給 Claude Code）

### Step 5：Firestore 安全規則 ✅
- 已設定白名單 + 個人資料隔離規則：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 白名單：任何已登入的人都可以「讀取」自己的 email 是否在白名單中
    // 只有管理者可以寫入（透過 admin 欄位判斷）
    match /allowedUsers/{email} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email)).data.role == 'admin';
    }

    // 每個使用者只能讀寫自己的資料
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Step 5.5：白名單管理者記錄 ✅
- `allowedUsers` collection 已建立
- 使用者自己的 Gmail 已加入，role = `admin`

### Step 6：Firebase 授權網域 ✅
- 已新增 `titan1855.github.io`

### 部署資訊

| 項目 | 值 |
|------|-----|
| GitHub Repo | `github.com/titan1855/ma-crm` |
| 線上網址 | `https://titan1855.github.io/ma-crm/` |
| Firebase Plan | Spark（免費） |
| Firestore 位置 | asia-east1（台灣） |
| 登入方式 | Google 帳號 |
| 存取控制 | 白名單制（admin 可在 App 內管理） |

### Claude Code 開工前需要的資訊

```
□ firebaseConfig JSON（使用者提供）
□ 確認 GitHub repo 已 clone 到本機
```

---

## 三、Firestore 資料結構

```
firestore root
│
├── [collection] allowedUsers/         ← 白名單（系統層級，不在 users 下）
│   └── {"email@gmail.com"}/           // 文件 ID = Email 地址
│       ├── role: string               // "admin" | "member"
│       ├── name: string               // 顯示名稱（管理者填的）
│       ├── addedAt: timestamp
│       └── addedBy: string            // 誰邀請的（admin 的 email）
│
└── users/{userId}/                    ← Firebase Auth UID，每個使用者獨立空間
    │
    ├── [document] profile
    │   ├── name: string               // 使用者姓名
    │   ├── createdAt: timestamp
    │   ├── onboardingDay: number       // 0=完成, 1~7=引導中
    │   ├── settings: {
    │   │     dailyReminder: boolean,
    │   │     weeklyReport: boolean
    │   │   }
    │   └── streak: {
    │         current: number,          // 目前 312 連續天數
    │         best: number,             // 歷史最佳
    │         lastDate: string          // 最後達標日 "YYYY-MM-DD"
    │       }
    │
    ├── [collection] pool/              ← 模組二：名單池
    │   └── {poolId}/
    │       ├── name: string
    │       ├── source: string          // 怎麼認識的
    │       ├── impression: string      // 大概印象
    │       ├── status: string          // "pending" | "selected" | "archived"
    │       ├── createdAt: timestamp
    │       └── selectedAt: timestamp?  // 被選入首選的時間
    │
    ├── [collection] prospects/         ← 模組一+三：首選名單 + 六步驟
    │   └── {prospectId}/
    │       ├── name: string
    │       ├── phone: string
    │       ├── email: string
    │       ├── status: string          // "active" | "paused" | "signed" | "closed"
    │       ├── isVip: boolean
    │       ├── note: string            // 初步印象 / 認識管道
    │       ├── poolRef: string?        // 來源名單池 ID（手動新增的為 null）
    │       ├── createdAt: timestamp
    │       ├── lastContactDate: string // 最後聯繫日期（用於 312 推薦排序）
    │       │
    │       ├── formhd: {               // FORMHD 六格
    │       │     F: string,  O: string,  R: string,
    │       │     M: string,  H: string,  D: string
    │       │   }
    │       │
    │       ├── recruitStep: number     // 1~6（招募六步驟）
    │       │     // 1=列名單 2=講商機 3=會邀約 4=說制度 5=懂締結 6=要跟進
    │       └── stepHistory: [          // 每步完成紀錄
    │             { step: number, completedAt: timestamp, note: string }
    │           ]
    │
    │       ├── [subcollection] talks/
    │       │   └── {talkId}/
    │       │       ├── type: string        // "chat"|"call"|"meet"|"social"|"other"
    │       │       ├── date: string        // "YYYY-MM-DD"
    │       │       ├── preMemo: string     // 會前筆記（原 preLeader，拿掉 Leader 標題）
    │       │       ├── content: string     // 會面內容
    │       │       ├── reaction: string    // 對方反應
    │       │       ├── progress: [string]  // 進度標籤
    │       │       ├── nextDt: string      // 下次約會時間
    │       │       ├── nextLoc: string     // 下次約會地點
    │       │       ├── action: string      // 預計行動
    │       │       ├── postMemo: string    // 會後筆記（原 postLeader）
    │       │       ├── nextPlan: string    // 下次跟進計畫
    │       │       ├── emotion: string     // "good"|"normal"|"stuck"
    │       │       └── createdAt: timestamp
    │       │
    │       └── [subcollection] sales/
    │           └── {saleId}/
    │               ├── date: string
    │               ├── item: string
    │               ├── amount: number
    │               ├── note: string
    │               └── createdAt: timestamp
    │
    ├── [collection] daily312/          ← 模組四：每日打卡
    │   └── {"YYYY-MM-DD"}/             // 文件 ID = 日期
    │       ├── chats: [{ prospectId, name, time }]
    │       ├── meetings: [{ prospectId, name, time }]
    │       ├── newPool: [{ poolId, name, time }]
    │       ├── chatCount: number       // 目標 3
    │       ├── meetCount: number       // 目標 1
    │       ├── poolCount: number       // 目標 2
    │       ├── completed: boolean      // 3+1+2 全達標
    │       └── emotions: [{ prospectId, emotion, note, time }]
    │
    ├── [collection] products/          ← 模組五：自用產品
    │   └── {productId}/
    │       ├── date: string
    │       ├── item: string
    │       ├── category: string        // "supplement"|"skincare"|"household"|"other"
    │       ├── amount: number
    │       ├── bv: number
    │       ├── isAutoship: boolean
    │       ├── note: string
    │       └── createdAt: timestamp
    │
    ├── [collection] mufo/              ← 模組六：MUFO 季度
    │   └── {"YYYY-QN"}/               // 例如 "2026-Q2"
    │       ├── retailBV: number        // 零售 BV（目標 1500）
    │       ├── ibv: number             // IBV（目標 300）
    │       ├── recruits: number        // 招募人數（目標 1）
    │       ├── tickets: number         // 大會票購買張數（目標 3）
    │       ├── courseB5: boolean       // 當季 B5 課程（每季歸零）
    │       ├── courseNUOT: boolean     // 當季 NUOT 課程（每季歸零）
    │       ├── courseECCT: boolean     // 年度 ECCT 課程（整年有效，存在年度文件中）
    │       ├── updatedAt: timestamp
    │       └── history: [{ date, retailBV, ibv, recruits, tickets }]
    │
    │   └── {"YYYY"}/                  // 年度文件，例如 "2026"
    │       └── ecctDone: boolean      // ECCT 是年度條件，獨立存放
    │
    ├── [collection] challenges/        ← 模組七：挑戰獎
    │   └── {challengeId}/
    │       ├── title: string
    │       ├── deadline: string
    │       ├── goals: [{
    │       │     type: "number"|"action"|"team",
    │       │     label: string,
    │       │     target: number,
    │       │     current: number,
    │       │     unit: string,
    │       │     done: boolean
    │       │   }]
    │       ├── status: string          // "active"|"completed"|"expired"
    │       ├── createdAt: timestamp
    │       └── updatedAt: timestamp
    │
    └── [document] achievements         ← 模組八：成就
        ├── unlocked: [{
        │     key: string,
        │     unlockedAt: timestamp,
        │     seen: boolean
        │   }]
        └── stats: {
              totalChats: number,
              totalMeetings: number,
              totalPoolAdded: number,
              totalProspects: number,
              totalSigned: number,
              first312Date: string
            }
```

---

## 四、模組開發規格

> 按開發順序排列。每個模組標明：做什麼、UI 長什麼樣、資料怎麼操作。
> Claude Code 應逐模組開發，每完成一個模組確認可獨立運作後再做下一個。

---

### 模組 0：專案骨架 + Firebase 登入

**產出檔案：** `index.html`, `css/style.css`, `js/app.js`, `js/firebase-config.js`, `js/auth.js`, `js/router.js`, `js/db.js`, `js/utils.js`, `manifest.json`, `sw.js`

**index.html 結構：**
```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>MA 名單管理</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="manifest" href="manifest.json">
  <!-- PWA meta tags -->
</head>
<body>
  <!-- 登入畫面 -->
  <div id="login-screen">...</div>

  <!-- 初次設定（輸入姓名）-->
  <div id="setup-screen" style="display:none">...</div>

  <!-- 主畫面殼 -->
  <div id="app" style="display:none">
    <header id="app-header">...</header>
    <main id="app-content">
      <!-- 各模組的內容會動態渲染到這裡 -->
    </main>
    <nav id="tab-bar">
      <!-- 底部 Tab：312 | 首選 | 名單池 | 更多 -->
    </nav>
  </div>

  <!-- Modal 容器（所有模組共用） -->
  <div id="modal-container"></div>

  <!-- 詳情面板（滑入式） -->
  <div id="detail-panel"></div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

**登入流程：**
1. 頁面載入 → `onAuthStateChanged` 檢查狀態
2. 未登入 → 顯示 `#login-screen`，有「使用 Google 帳號登入」按鈕
3. 點登入 → `signInWithPopup(auth, googleProvider)`
4. 登入成功 → **檢查白名單**：讀取 `allowedUsers/{user.email}`
   - **不在白名單** → 顯示 `#rejected-screen`：「你尚未獲得使用權限，請聯繫邀請你的人」+ 登出按鈕
   - **在白名單** → 繼續下一步
5. 讀取 `users/{uid}/profile`
   - profile 不存在 → 顯示 `#setup-screen`（輸入姓名）→ 建立 profile → 進入 App
   - profile 存在 → 直接進入 App
6. 進入 App → 隱藏登入畫面，顯示 `#app`，初始化路由
7. 如果 `allowedUsers/{email}.role == "admin"` → 在 App 狀態中標記為管理者（解鎖「邀請夥伴」功能）

**index.html 新增一個被拒畫面：**
```html
<!-- 未授權畫面 -->
<div id="rejected-screen" style="display:none">
  <!-- 顯示：你尚未獲得使用權限，請聯繫 XXX -->
  <!-- 登出按鈕 -->
</div>
```

**auth.js 核心 export：**
```javascript
export { login, logout, onUserReady, getCurrentUser, isAdmin, checkAllowList }
```

**db.js 核心 export：**
```javascript
export { 
  getProfile, setProfile,
  addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy,
  userCollection,  // helper: 回傳 users/{uid}/{collectionName} 的 ref
  serverTimestamp
}
```

**router.js 功能：**
- 管理四個主要 Tab：`312` / `prospects` / `pool` / `more`
- Tab 切換時呼叫對應模組的 `render()`
- 支援子頁面（例如「更多」裡面的 MUFO、挑戰獎等）
- URL hash 路由（`#312`, `#prospects`, `#pool`, `#more/mufo`）方便直接連結

**離線支援：**
- `db.js` 中啟用 Firestore 離線持久化
- `sw.js` 快取所有靜態資源（HTML/CSS/JS/icons）
- 離線時操作正常，上線後 Firestore 自動同步

**舊資料遷移（migration.js）：**
- 檢查 `localStorage.getItem('ma3_c')`
- 如果有舊資料 → 顯示提示：「偵測到舊版資料，是否匯入？」
- 確認 → 把每筆名單轉換成 prospects 格式寫入 Firestore
- 完成 → 清除 localStorage

---

### 模組二：名單池

**檔案：** `js/modules/pool.js`

**功能：** 所有認識的人的大水庫，門檻低，快速新增。

**UI — 名單池 Tab 頁面：**
```
┌─────────────────────────────────────┐
│  📋 名單池  82人        [＋ 新增]    │
│                                     │
│  [待篩選 68] [已選入 12] [已結案 2]  │  ← 篩選 chips
│                                     │
│  ⚠️ 待篩選不足 10 人，該補充名單了！  │  ← 橘色提醒（< 10 人時顯示）
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 王大明                        │  │
│  │ 大學同學 · 對健康蠻有興趣      │  │
│  │           待篩選  [選入首選 →] │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 李小花                        │  │
│  │ 健身房認識 · 在找副業           │  │
│  │           待篩選  [選入首選 →] │  │
│  └───────────────────────────────┘  │
│  ...                                │
└─────────────────────────────────────┘
```

**新增名單池 Modal：**
- 姓名（必填）
- 怎麼認識的（選填）
- 大概印象（選填）
- 儲存 → 寫入 `pool` collection，status = "pending"

**「選入首選」流程：**
1. 點某人的「選入首選 →」
2. 彈出確認 Modal：顯示姓名 + 可補填電話 / Email
3. 確認後：
   - `pool/{id}.status` 改為 `"selected"`
   - `pool/{id}.selectedAt` 寫入時間
   - `prospects` 新增一筆，`poolRef` = 該 pool ID，`recruitStep` = 1
4. Toast 提示「已加入首選名單」

**資料操作：**
- 列表用 `onSnapshot` 即時同步
- 篩選用 `where("status", "==", filterValue)` 查詢
- 搜尋用前端 filter（名單池量不大，不需要後端搜尋）

---

### 模組一（改造）：首選名單 + FORMHD + 會面記錄

**檔案：** `js/modules/prospects.js`

**改造重點：**
- 從 localStorage 改為 Firestore `prospects` collection
- 會面記錄改為 subcollection `talks`
- 購物記錄改為 subcollection `sales`
- 「Leader 討論」欄位標題改為「會前筆記」「會後筆記」（欄位名改為 preMemo / postMemo）

**保留的全部功能：**
- 首選名單列表 + 搜尋 + 篩選（全部/持續跟進/暫停/優惠顧客/成功簽約）
- 新增 / 編輯 / 刪除名單
- 名單詳情頁：FORMHD 六格卡 + 會面記錄 + 購物記錄
- 會面記錄 Modal（會前/會中/會後，含進度 checkbox）

**詳情頁新增內容（模組三）：**
- 頂端加入六步驟進度條（見模組三）

**列表排序：**
- 預設按最後聯繫日期排序（久沒聯繫的在前面）
- 可切換為按建立時間排序

---

### 模組三：招募六步驟進度

**整合在：** `js/modules/prospects.js`（因為是詳情頁的一部分）

**UI — 詳情頁頂端進度條：**
```
[●]──[●]──[◉]──[○]──[○]──[○]
列名單 講商機 會邀約 說制度 懂締結 要跟進
  ✓      ✓    目前
```

- 已完成：綠色實心 ● + 綠色連線
- 進行中：藍色脈動 ◉
- 未到：灰色空心 ○ + 灰色連線

**操作：**
- 點「下一步」按鈕 → 確認對話框 → 標記當前步驟完成 → 推進到下一步
- 可寫備註（選填）
- 記錄到 `stepHistory`

**關鍵節點提示：**
- 推進到 Step 4「說制度」→ 彈出提示卡：  
  `「💡 建議安排 ABC，找上線一起出席」`
- 推進到 Step 5「懂締結」→ 彈出提示卡：  
  `「💡 建議跟上線討論締結策略」`

**完成動畫：**
- 每步完成 → 短暫的 ✓ 動畫
- 到達 Step 6 → 較大的慶祝動畫

---

### 模組四：每日 312 打卡（系統首頁）

**檔案：** `js/modules/daily312.js`

**UI — 312 首頁（預設 Tab）：**
```
┌─────────────────────────────────────┐
│  4月13日 星期一          連續 5 天 🔥 │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 💬 聊天   ● ● ○        2 / 3   ││
│  │ 🤝 會面   ●            1 / 1 ✓ ││
│  │ 📝 新名單  ○ ○          0 / 2   ││
│  └─────────────────────────────────┘│
│                                     │
│  ── 建議今天聯繫 ──                  │
│  ┌─────────────────────────────────┐│
│  │ 👤 王小明                       ││
│  │    上次聯繫 3 天前 · Step 3 會邀約││
│  │                     [記錄接觸 →] ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 👤 李小華                       ││
│  │    上次聯繫 5 天前 · Step 2 講商機││
│  │                     [記錄接觸 →] ││
│  └─────────────────────────────────┘│
│                                     │
│  [＋ 快速記錄聊天]  [＋ 快速新增名單] │
└─────────────────────────────────────┘
```

**建議聯繫排序邏輯：**
1. `prospects` 中 `status == "active"` 的人
2. 排序：`lastContactDate` 越早的越前面（久沒聯繫優先）
3. 同天數 → `recruitStep` 越大的越前面（快締結的優先）
4. 最多顯示 5 人

**打卡方式：**

方式 A：點建議列表的「記錄接觸 →」
→ 跳出會面記錄 Modal（同模組一的 talk modal）
→ 儲存後自動計入今日 chatCount 或 meetCount（根據 type）
→ 更新 `prospects/{id}.lastContactDate`

方式 B：點「＋ 快速記錄聊天」
→ 小型 Modal：選擇對象（下拉選首選名單）→ 選類型 → 一行備註 → 打卡完成

方式 C：名單池新增
→ 在名單池新增時自動計入今日 poolCount

**情緒回饋（每次接觸後）：**
- 儲存會面記錄後，彈出情緒選擇：
  - 😊 順利 / 😐 普通 / 😰 有點卡
- 選「有點卡」→ 展開文字框「你覺得卡在哪裡？」
- 底部灰字提示「可以找你的上線聊聊這個狀況」
- 記錄到 `daily312/{date}.emotions` 和 `talks/{id}.emotion`

**連續天數 Streak：**
- 每天 312 全部達標（chatCount ≥ 3 且 meetCount ≥ 1 且 poolCount ≥ 2）
- 達標 → `profile.streak.current += 1`，更新 `lastDate`
- 中斷（昨天沒達標）→ `current = 0`
- 每次打開 App 時計算

**312 達標動畫：**
- 單項達標 → 對應圓點變綠 + 小震動
- 全部達標 → 「今日 312 達標！🎉」+ confetti 動畫

---

### 模組五：自用產品記錄

**檔案：** `js/modules/products.js`

**UI — 在「更多」選單中：**
```
┌─────────────────────────────────────┐
│  🛍️ 自用產品記錄          [＋ 新增]  │
│                                     │
│  本月消費：NT$ 3,200 / BV 580       │
│                                     │
│  [全部] [保健品] [護膚品] [家用品]    │
│                                     │
│  4/10 · OPC-3 · NT$1,200 · BV 200  │
│  4/05 · 魚油   · NT$800  · BV 130  │
│  4/01 · 洗髮精 · NT$450  · BV 80   │  ← 🔄 自動訂貨標籤
│  ...                                │
└─────────────────────────────────────┘
```

**新增 Modal 欄位：**
- 購買日期（預設今天）
- 品項名稱（必填）
- 分類：保健品 / 護膚品 / 家用品 / 其他
- 金額（NT$）
- BV 點數
- 自動訂貨（toggle）
- 備註

---

### 模組六：MUFO 季度追蹤

**檔案：** `js/modules/mufo.js`

**MUFO 達成條件（全部達成才算達標）：**

| # | 條件 | 類型 | 週期 | 說明 |
|---|------|------|------|------|
| 1 | 零售 BV ≥ 1500 | 數字 | 每季 | 去 MA 後台查，手動輸入 |
| 2 | IBV ≥ 300 | 數字 | 每季 | 去 MA 後台查，手動輸入 |
| 3 | 招募 ≥ 1 人 | 數字 | 每季 | 手動輸入 |
| 4 | 上完 B5 課程 | 打卡 | 每季 | 當季需完成，每季重新計算 |
| 5 | 上完 NUOT 課程 | 打卡 | 每季 | 當季需完成，每季重新計算 |
| 6 | 上過 ECCT 課程 | 打卡 | 每年 | 當年度上過即可，不用每季 |
| 7 | 購買 3 張大會票 | 數字 | 每季 | 手動輸入已購買張數 |

> 注意：條件 6（ECCT）是年度條件，Q1 打勾後 Q2~Q4 自動延續。其餘都是每季歸零。

**UI — 在「更多」選單中：**
```
┌─────────────────────────────────────┐
│  📊 MUFO 2026 Q2        剩餘 48 天  │
│                                     │
│  ── 數字目標 ──                      │
│  零售 BV  ████████░░░  1200 / 1500  │
│  IBV      ██████░░░░░   180 / 300   │
│  招募     ░░░░░░░░░░░     0 / 1     │
│  大會票   ██████░░░░░     2 / 3     │
│                                     │
│  ── 課程條件 ──                      │
│  ☑ B5 課程（本季）                   │
│  ☐ NUOT 課程（本季）                 │
│  ☑ ECCT 課程（本年度）  ← 2026 已完成│
│                                     │
│  📈 照目前節奏預估：                  │
│     零售 BV → 1600 ✅                │
│     IBV → 240 ⚠️ 需加速             │
│                                     │
│  達標進度：5 / 7 項                   │
│                                     │
│  [更新數據]       上次更新：4/10      │
└─────────────────────────────────────┘
```

**季度自動判斷：** Q1=1-3月 / Q2=4-6月 / Q3=7-9月 / Q4=10-12月

**進入新季度時的自動邏輯：**
- 數字類目標（BV、IBV、招募、大會票）→ 歸零
- 每季課程打卡（B5、NUOT）→ 歸零
- 年度課程打卡（ECCT）→ 沿用該年度的打卡狀態

**預估邏輯（僅適用數字類）：**
- 本季已過天數 / 本季總天數 = 進度比例
- 目前數字 / 進度比例 = 預估季末數字
- 預估 ≥ 目標 → ✅ / 預估 < 目標 → ⚠️

**更新數據 Modal：**
- 零售 BV（數字輸入）
- IBV（數字輸入）
- 招募人數（數字輸入）
- 大會票購買張數（數字輸入）
- B5 課程（toggle：已完成 / 未完成）
- NUOT 課程（toggle：已完成 / 未完成）
- ECCT 課程（toggle：已完成 / 未完成）← 年度條件特別標註
- 儲存 → 寫入 mufo 文件 + 推入 history 陣列

**達標判定：** 7 項全部達成 = MUFO 達標（觸發成就系統）

**每週提醒：** 如果距離上次更新 > 7 天，顯示提醒 banner

---

### 模組七：挑戰獎自訂目標

**檔案：** `js/modules/challenges.js`

**UI — 在「更多」選單中：**
- 挑戰列表（進行中 / 已完成 / 已過期）
- 每個挑戰卡片：名稱、截止日倒數、整體進度 %
- 點進去 → 各條件的進度條

**新增挑戰 Modal：**
- 挑戰名稱
- 截止日期
- 動態新增多個目標條件：
  - 類型下拉：數字類 / 行動類 / 團隊類
  - 描述
  - 目標值 + 單位（數字類）
- 儲存 → 寫入 challenges collection

**到期自動判斷：** 超過截止日 → status 改為 "expired" 或 "completed"

---

### 模組八：成就與里程碑

**檔案：** `js/modules/achievements.js`

**成就定義表：**

| key | 名稱 | 觸發條件 |
|-----|------|---------|
| `first_312` | 第一次 312 達標 | 首次 daily312 completed=true |
| `first_chat` | 踏出第一步 | 首次記錄聊天 |
| `first_meet` | 面對面 | 首次記錄見面 |
| `first_sale` | 第一筆零售 | 首筆優惠顧客購物記錄 |
| `first_step4` | 進入深水區 | 首個名單 recruitStep 到 4 |
| `first_signed` | 收穫！ | 首個名單 status="signed" |
| `first_mufo` | 季度達標 | 首季 MUFO 全達標 |
| `streak_7` | 一週連勝 | streak.current ≥ 7 |
| `streak_30` | 月度鐵人 | streak.current ≥ 30 |
| `pool_50` | 水庫半滿 | 名單池累計 50 人 |
| `pool_100` | 百人名單 | 名單池累計 100 人 |
| `prospects_10` | 十人同行 | 同時 10 個 active 首選名單 |

**觸發機制：**
- 每次資料寫入後，`achievements.js` export 一個 `checkAchievements()` 函式
- 被各模組在資料儲存後呼叫
- 新成就解鎖 → 寫入 achievements.unlocked → 彈出慶祝 Modal（confetti + 成就名稱 + 描述）

**成就頁面（在「更多」中）：**
- 已解鎖：彩色卡片 + 解鎖日期
- 未解鎖：灰色鎖定 + 條件提示

---

### 模組九：週報自動摘要

**檔案：** `js/modules/weekly.js`

**UI — 在「更多」選單中：**
```
┌─────────────────────────────────────┐
│  📊 本週摘要  4/7 ~ 4/13            │
│                                     │
│  312 達標      5 / 7 天              │
│  新增名單      8 人                  │
│  聯繫人數      15 人                 │
│  會面次數      4 次                  │
│  名單池        82 人                 │
│  首選有進展    3 人                  │
│  情緒          😊×8  😐×5  😰×2     │
│                                     │
│  MUFO 進度：零售 BV 80%             │
│                                     │
│  [← 上週]  [複製文字分享]  [下週 →]  │
└─────────────────────────────────────┘
```

**資料來源：**
- `daily312`：最近 7 天的紀錄 → 312 達標天數、聯繫人數、會面次數、情緒統計
- `pool`：count → 名單池人數
- `prospects`：本週 stepHistory 有變動的人數
- `mufo`：當季進度

**「複製文字分享」：** 生成純文字摘要 → `navigator.clipboard.writeText()` → Toast「已複製」

---

### 模組十：新手引導 Onboarding

**檔案：** `js/modules/onboarding.js`

**七天引導腳本：**

| Day | 引導訊息 | 完成條件 |
|-----|---------|---------|
| 1 | 先建立名單池，想 5 個你認識的人 | `pool` count ≥ 5 |
| 2 | 從昨天的人裡，選 2~3 人加入首選名單 | `prospects` count ≥ 2 |
| 3 | 開始第一個 312：先聯繫一個人 | 今日 chatCount ≥ 1 |
| 4 | 試著完成完整的 312 | 今日 completed = true |
| 5 | 幫首選名單填 FORMHD | 至少 1 人有 ≥ 3 格 FORMHD |
| 6 | 更新你的 MUFO 數據 | mufo 當季 updatedAt 存在 |
| 7 | 看看你的第一份週報！ | 進入週報頁面 |

**UI：**
- 每天打開 App → 312 首頁頂端顯示引導任務卡（藍底白字）
- 完成 → 卡片變綠 + ✓
- Day 7 完成 → `profile.onboardingDay = 0` → 引導結束 → 慶祝動畫
- 引導期間，Tab 上未解鎖的功能不隱藏但會有引導提示

---

## 五、UI 導覽架構

```
底部 Tab Bar（固定 4 個）:
┌──────┬──────┬──────┬──────┐
│  📊  │  👥  │  📋  │  ⋯   │
│ 312  │ 首選 │ 名單池│ 更多 │
└──────┴──────┴──────┴──────┘

各 Tab 內容：
├── 312（首頁，預設）
│   └── 今日進度 + 建議聯繫 + 連續天數
│
├── 首選名單
│   ├── 列表頁（搜尋 + 篩選）
│   └── 詳情頁（滑入面板）
│       ├── 六步驟進度條
│       ├── 基本資料
│       ├── FORMHD
│       ├── 會面記錄
│       └── 購物記錄（VIP 才顯示）
│
├── 名單池
│   └── 列表頁（搜尋 + 篩選 + 新增）
│
└── 更多
    ├── 約會行程（月曆/週曆）
    ├── MUFO 季度追蹤
    ├── 挑戰獎
    ├── 自用產品記錄
    ├── 週報摘要
    ├── 成就
    └── 設定
        ├── 個人資訊（姓名）
        ├── 邀請夥伴（🔒 僅管理者可見）
        ├── 匯入舊資料
        ├── 匯出備份（JSON）
        └── 登出
```

### 邀請夥伴功能（僅管理者）

**位置：** 設定 → 邀請夥伴

**UI：**
```
┌─────────────────────────────────────┐
│  👥 邀請夥伴            🔒 管理者功能 │
│                                     │
│  已邀請 3 人                         │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 王小明  wang@gmail.com          ││
│  │ 2026/4/10 加入     [移除]       ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 李小華  lee@gmail.com           ││
│  │ 2026/4/12 加入     [移除]       ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 輸入夥伴的 Gmail：              ││
│  │ [                    @gmail.com]││
│  │ 顯示名稱：[          ]          ││
│  │              [送出邀請]          ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**操作：**
- 輸入夥伴的 Gmail + 名稱 → 點送出
- 寫入 `allowedUsers/{email}`：`{ role: "member", name, addedAt, addedBy }`
- 夥伴列表即時顯示
- 可移除（刪除 `allowedUsers/{email}`，該夥伴下次登入會被擋）
- 移除只是擋登入，不會刪除夥伴已建立的資料

---

## 六、設計規範

**延續現有設計語言：**

```css
:root {
  /* 主色 */
  --primary: #1B5E3B;
  --primary-light: #3A9E6F;
  --primary-bg: #D6EEDF;

  /* 背景 */
  --bg: #F6F4EF;
  --surface: #FFFFFF;
  --surface-2: #EEEAE2;
  --border: #E0DBD1;

  /* 文字 */
  --text: #1A1A1A;
  --text-2: #555555;
  --text-3: #999999;

  /* 狀態色 */
  --danger: #B83030;
  --warning: #D4800A;
  --info: #1A6FA8;
  --purple: #6B3FA0;

  /* 圓角 */
  --radius: 12px;
  --radius-sm: 8px;
  --radius-pill: 20px;

  /* 陰影 */
  --shadow: 0 2px 10px rgba(0,0,0,0.06);
}
```

**字體：** Noto Sans TC（內文）+ DM Serif Display（標題）

**手機優先：** `max-width: 480px; margin: 0 auto;`

**互動回饋：**
- 按鈕 `:active` → `transform: scale(0.97)`
- 操作成功 → Toast 通知（底部浮現 2 秒）
- 刪除 → 二次確認對話框
- 載入中 → skeleton 或 spinner

---

## 七、Claude Code 操作指南

### 開發環境建議

```bash
# Clone 現有 repo
git clone https://github.com/titan1855/ma-crm.git
cd ma-crm

# 清理舊檔案（保留 .git）
# 舊版檔案：index__30_.html, ma-crm.html 等可以移到 _archive/ 備份

# 建立新檔案結構
mkdir -p css js/modules icons
```

### 開發順序（逐模組）

```
Phase 1 — 基礎建設
  ① 模組 0：專案骨架 + Firebase 登入 + 離線支援
  → 驗收：能登入、能在 Firestore 讀寫、離線可開啟

Phase 2 — 核心名單功能
  ② 模組二：名單池
  ③ 模組一：首選名單（含 FORMHD、會面記錄、購物記錄）
  ④ 模組三：招募六步驟（整合在首選名單詳情頁）
  → 驗收：能新增名單池 → 選入首選 → 記錄會面 → 推進六步驟

Phase 3 — 每日驅動
  ⑤ 模組四：每日 312 打卡
  → 驗收：312 首頁正常、推薦聯繫人、打卡計數、連續天數

Phase 4 — 追蹤系統
  ⑥ 模組五：自用產品記錄
  ⑦ 模組六：MUFO 季度追蹤
  ⑧ 模組七：挑戰獎
  → 驗收：各追蹤功能獨立運作

Phase 5 — 綜合功能
  ⑨ 模組九：週報摘要
  ⑩ 模組八：成就系統
  ⑪ 模組十：新手引導 Onboarding
  → 驗收：週報能彙整所有數據、成就能觸發、Onboarding 流程完整

Phase 6 — 收尾
  ⑫ 約會行程（整合在「更多」）
  ⑬ 設定頁（個人資訊、匯出、登出）
  ⑭ 舊資料遷移（migration.js）
  ⑮ PWA 優化（sw.js、manifest.json、icons）
```

### 每個模組的開發 checklist

```
□ 建立 JS 檔案，export init() 和 render()
□ 在 router.js 註冊路由
□ HTML 結構（動態渲染到 #app-content 或 Modal）
□ CSS 樣式（加到 style.css，用模組前綴避免衝突，如 .pool-card, .m312-progress）
□ Firestore CRUD 操作
□ 即時同步（onSnapshot 或手動 refresh）
□ 離線可用確認
□ 手機上測試：觸控回饋、捲動流暢、Modal 開關
□ 邊界情況：空狀態、載入中、錯誤處理
```

### 部署到 GitHub Pages

```bash
# Claude Code 的部署流程：

# 1. 在 repo 根目錄開發
cd ma-crm

# 2. 開發完成後 commit + push
git add .
git commit -m "完成模組 X：功能描述"
git push origin main

# 3. GitHub Pages 自動部署
# 確認 repo Settings → Pages → Source = main branch / root
# 部署後幾分鐘內生效：https://titan1855.github.io/ma-crm/

# 檔案結構在 repo 中：
ma-crm/
├── index.html
├── manifest.json
├── sw.js
├── css/style.css
├── js/app.js
├── js/firebase-config.js
├── js/auth.js
├── js/router.js
├── js/db.js
├── js/utils.js
├── js/migration.js
├── js/modules/*.js
└── icons/icon-192.png, icon-512.png
```

> ⚠️ 首次部署前，使用者需到 GitHub repo → Settings → Pages → Source 選「main branch」並儲存。
> 這步只做一次，之後 push 就自動部署。

### 維護時的注意事項

**如果使用者在 Claude.ai 對話中請求修改：**
- 使用者會描述需求（例如「MUFO 的進度條改成藍色」）
- 回應時只提供需要修改的檔案的相關片段
- 明確指出是哪個檔案、哪個函式、改什麼
- 使用者可以手動貼到 GitHub 檔案編輯器，或交給 Claude Code 處理

**如果使用 Claude Code：**
- 直接在本機 repo 目錄中操作
- 改完用 `python3 -m http.server 8000` 本地測試
- 確認沒問題 → `git add . && git commit -m "修改描述" && git push`
- GitHub Pages 自動部署，幾分鐘後生效

---

## 八、未來擴展備註

- **自訂 Domain：** GitHub Pages 支援自訂 domain，之後想用自己的 domain 可以在 repo Settings → Pages → Custom domain 設定，並在 DNS 加 CNAME 記錄
- **推播通知：** 需要 Firebase Cloud Messaging + Service Worker push event，第一版不做
- **Leader 視角：** 資料結構已預留擴展空間，未來加安全規則 + 讀取介面即可
- **LINE 通知：** 需要後端（可用 Firebase Cloud Functions）當中介串 LINE Messaging API
- **資料匯出：** 設定頁加入「匯出 JSON」功能，方便備份
- **通用化：** 未來去掉 MA 專屬術語，可變成通用直銷 CRM

---

*文件版本：v3*
*建立日期：2026年4月13日*
*狀態：前置作業已全部完成，可交給 Claude Code 開始開發*
*部署網址：https://titan1855.github.io/ma-crm/*
*GitHub Repo：https://github.com/titan1855/ma-crm*
