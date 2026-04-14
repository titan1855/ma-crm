/**
 * testimonials.js — 模組十一：產品見證
 * 記錄產品使用見證，支援問題/產品分類、全文搜尋、照片壓縮存 Base64
 */
import { navigate } from '../router.js';
import {
  userCollection, userSubDoc, userRootDoc,
  addDoc, deleteDoc, getProfile,
  onSnapshot, query, orderBy, serverTimestamp, updateDoc
} from '../db.js';
import { toast, emptyState, debounce } from '../utils.js';

const DEFAULT_ISSUES   = ['過敏', '睡眠', '腸胃', '皮膚', '心血管', '減重'];
const DEFAULT_PRODUCTS = ['OPC-3', '魚油', '益生菌', '蘆薈汁', '益生消化酵素'];

let _unsubscribe   = null;
let _allItems      = [];
let _issueFilter   = null;
let _productFilter = null;
let _searchQuery   = '';
let _customTags    = { issues: [], products: [] };

// ═══════════════════════════════════════════════════════════
//  進入點
// ═══════════════════════════════════════════════════════════

export function render(content) {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _issueFilter = _productFilter = null;
  _searchQuery = '';

  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">💬 產品見證</span>
    </div>
    <div style="text-align:center;padding:2rem;color:var(--tx3)">載入中…</div>
  `;
  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  _loadAndRender(content);
}

async function _loadAndRender(content) {
  try {
    const profile = await getProfile();
    _customTags = { issues: [], products: [], ...(profile?.customTags ?? {}) };

    const q = query(userCollection('testimonials'), orderBy('createdAt', 'desc'));
    _unsubscribe = onSnapshot(q,
      snap => {
        if (!content.isConnected) return;
        _allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _renderPage(content);
      },
      err => {
        console.error('[testimonials] snapshot error', err);
        toast('見證載入失敗', 'error');
      }
    );
  } catch (err) {
    console.error('[testimonials] load error', err);
    toast('載入失敗', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  頁面渲染
// ═══════════════════════════════════════════════════════════

function _allIssues()   { return [...DEFAULT_ISSUES,   ...(_customTags.issues   ?? [])]; }
function _allProducts() { return [...DEFAULT_PRODUCTS, ...(_customTags.products ?? [])]; }

function _renderPage(content) {
  let items = _allItems;
  if (_issueFilter)   items = items.filter(x => (x.issues   ?? []).includes(_issueFilter));
  if (_productFilter) items = items.filter(x => (x.products ?? []).includes(_productFilter));
  if (_searchQuery)   items = items.filter(x =>
    (x.content  ?? '').toLowerCase().includes(_searchQuery) ||
    (x.source   ?? '').toLowerCase().includes(_searchQuery)
  );

  const issueChips   = _buildFilterChips(_allIssues(),   'issue',   _issueFilter);
  const productChips = _buildFilterChips(_allProducts(), 'product', _productFilter);

  const listHtml = _allItems.length === 0
    ? emptyState('💬', '尚無見證記錄\n點右上角 ＋ 開始新增')
    : items.length === 0
      ? emptyState('🔍', '找不到符合的見證')
      : items.map(_buildCard).join('');

  content.innerHTML = `
    <div class="sub-page-header">
      <button class="sub-page-back">← 返回</button>
      <span class="sub-page-title">💬 產品見證&ensp;<span style="font-size:.78rem;font-weight:400;color:var(--tx3)">${_allItems.length} 筆</span></span>
      <button class="fab-btn test-add-btn" title="新增見證" style="position:static;margin-left:auto;flex-shrink:0">＋</button>
    </div>
    <input class="search-input test-search" type="search" placeholder="搜尋見證內容…" style="margin-bottom:.5rem" value="${_esc(_searchQuery)}" autocomplete="off">
    <div class="test-filter-group">
      <div class="test-filter-label">改善問題</div>
      <div class="filter-chips test-chips" data-group="issue">${issueChips}</div>
    </div>
    <div class="test-filter-group">
      <div class="test-filter-label">使用產品</div>
      <div class="filter-chips test-chips" data-group="product">${productChips}</div>
    </div>
    <div class="test-list" style="margin-top:.5rem">${listHtml}</div>
  `;

  content.querySelector('.sub-page-back').addEventListener('click', () => navigate('more'));
  content.querySelector('.test-add-btn').addEventListener('click', () => _openAddModal(content));
  content.querySelector('.test-search').addEventListener('input',
    debounce(e => { _searchQuery = e.target.value.trim().toLowerCase(); _renderPage(content); }, 250)
  );
  content.querySelectorAll('.test-chips').forEach(row => {
    row.addEventListener('click', e => {
      const chip = e.target.closest('.test-chip');
      if (!chip) return;
      const tag = chip.dataset.tag || null;
      if (row.dataset.group === 'issue')   _issueFilter   = tag;
      if (row.dataset.group === 'product') _productFilter = tag;
      _renderPage(content);
    });
  });
  content.querySelector('.test-list').addEventListener('click', e => {
    const card = e.target.closest('.test-card');
    if (!card) return;
    const item = _allItems.find(x => x.id === card.dataset.id);
    if (item) _openDetailModal(item);
  });
}

function _buildFilterChips(tags, group, current) {
  return [
    `<button class="chip test-chip${!current ? ' active' : ''}" data-tag="">全部</button>`,
    ...tags.map(t =>
      `<button class="chip test-chip${current === t ? ' active' : ''}" data-tag="${_esc(t)}">${_esc(t)}</button>`
    ),
  ].join('');
}

function _buildCard(item) {
  const issueTags   = (item.issues   ?? []).map(t => `<span class="test-tag test-tag-issue">${_esc(t)}</span>`).join('');
  const productTags = (item.products ?? []).map(t => `<span class="test-tag test-tag-product">${_esc(t)}</span>`).join('');
  const d = item.createdAt?.toDate?.();
  const dateStr = d ? `${d.getMonth()+1}/${d.getDate()}` : '';
  const meta = [
    (item.photos ?? []).length ? `📷 ${item.photos.length}張` : '',
    item.source   ? `👤 ${_esc(item.source)}`   : '',
    item.duration ? `⏱ ${_esc(item.duration)}` : '',
    dateStr,
  ].filter(Boolean).join('&emsp;');
  const preview = (item.content ?? '').length > 70
    ? _esc(item.content.slice(0, 70)) + '…'
    : _esc(item.content ?? '');
  return `
    <div class="card test-card" data-id="${item.id}">
      <div class="test-tags-row">${issueTags}${productTags}</div>
      <div class="test-content">${preview}</div>
      ${meta ? `<div class="test-meta">${meta}</div>` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  詳情 Modal
// ═══════════════════════════════════════════════════════════

function _openDetailModal(item) {
  const issueTags   = (item.issues   ?? []).map(t => `<span class="test-tag test-tag-issue">${_esc(t)}</span>`).join('');
  const productTags = (item.products ?? []).map(t => `<span class="test-tag test-tag-product">${_esc(t)}</span>`).join('');
  const photosHtml  = (item.photos   ?? []).map(b64 =>
    `<img src="${b64}" class="test-photo-thumb" style="width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer">`
  ).join('');
  const d = item.createdAt?.toDate?.();
  const dateStr = d ? `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}` : '';

  const el = _createModal(`
    <div class="test-tags-row" style="margin-bottom:.75rem">${issueTags}${productTags}</div>
    <p style="font-size:.9rem;line-height:1.75;white-space:pre-wrap;word-break:break-word;margin-bottom:.5rem">${_esc(item.content ?? '')}</p>
    <div style="display:flex;flex-direction:column;gap:.2rem;margin-bottom:.5rem">
      ${item.source   ? `<span style="font-size:.8rem;color:var(--tx3)">👤 ${_esc(item.source)}</span>`   : ''}
      ${item.duration ? `<span style="font-size:.8rem;color:var(--tx3)">⏱ ${_esc(item.duration)}</span>` : ''}
      ${dateStr       ? `<span style="font-size:.8rem;color:var(--tx3)">${dateStr}</span>`                 : ''}
    </div>
    ${photosHtml ? `<div class="test-photo-row">${photosHtml}</div>` : ''}
    <div class="form-actions" style="margin-top:1rem">
      <button class="btn btn-ghost test-det-close">關閉</button>
      <button class="btn btn-danger test-det-delete">刪除</button>
    </div>
  `);

  el.querySelector('.test-det-close').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  // Lightbox
  el.querySelectorAll('.test-photo-thumb').forEach(img => {
    img.addEventListener('click', () => {
      const lb = document.createElement('div');
      lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
      lb.innerHTML = `<img src="${img.src}" style="max-width:92vw;max-height:92vh;border-radius:8px">`;
      lb.addEventListener('click', () => lb.remove());
      document.body.appendChild(lb);
    });
  });

  // Delete
  el.querySelector('.test-det-delete').onclick = async () => {
    if (!confirm('確定要刪除這筆見證？此操作無法復原。')) return;
    try {
      await deleteDoc(userSubDoc('testimonials', item.id));
      toast('見證已刪除', 'info');
      _closeModal(el);
    } catch (err) {
      console.error('[testimonials] delete error', err);
      toast('刪除失敗', 'error');
    }
  };
}

// ═══════════════════════════════════════════════════════════
//  新增 Modal
// ═══════════════════════════════════════════════════════════

function _openAddModal(pageContent) {
  const selectedIssues   = new Set();
  const selectedProducts = new Set();
  const photos = [];

  const issueChips   = _allIssues().map(t =>
    `<button type="button" class="chip test-mc test-mc-issue" data-tag="${_esc(t)}">${_esc(t)}</button>`
  ).join('') + `<button type="button" class="chip test-mc test-mc-custom" data-type="issues" style="opacity:.75">＋</button>`;

  const productChips = _allProducts().map(t =>
    `<button type="button" class="chip test-mc test-mc-product" data-tag="${_esc(t)}">${_esc(t)}</button>`
  ).join('') + `<button type="button" class="chip test-mc test-mc-custom" data-type="products" style="opacity:.75">＋</button>`;

  const el = _createModal(`
    <div class="modal-title">新增見證</div>

    <div class="form-group">
      <label class="form-label">改善問題 <span style="color:var(--dg)">*</span></label>
      <div class="filter-chips test-mc-issues">${issueChips}</div>
    </div>

    <div class="form-group">
      <label class="form-label">使用產品 <span style="color:var(--dg)">*</span></label>
      <div class="filter-chips test-mc-products">${productChips}</div>
    </div>

    <div class="form-group">
      <label class="form-label">見證內容 <span style="color:var(--dg)">*</span></label>
      <textarea class="form-textarea" id="test-content" style="min-height:100px" placeholder="改善過程、前後差異…"></textarea>
    </div>

    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">來源（選填）</label>
        <input class="form-input" id="test-source" placeholder="自己 / 顧客名字">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">見效時間（選填）</label>
        <input class="form-input" id="test-duration" placeholder="例：2週、1個月">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">照片（選填，最多 5 張）</label>
      <input type="file" accept="image/*" id="test-photo-input" multiple style="display:none">
      <div class="test-photo-previews" id="test-photo-previews"></div>
      <button type="button" class="btn btn-ghost" id="test-photo-add-btn" style="width:100%;padding:.6rem;margin-top:.25rem">📷 選擇照片</button>
    </div>

    <div class="form-actions">
      <button class="btn btn-ghost test-cancel">取消</button>
      <button class="btn btn-primary test-save">儲存</button>
    </div>
  `);

  el.querySelector('.test-cancel').onclick = () => _closeModal(el);
  el.addEventListener('click', e => { if (e.target === el) _closeModal(el); });

  // Issue chip toggle
  el.querySelector('.test-mc-issues').addEventListener('click', e => {
    const chip = e.target.closest('.test-mc-issue');
    if (chip) {
      chip.classList.toggle('active');
      chip.classList.contains('active') ? selectedIssues.add(chip.dataset.tag) : selectedIssues.delete(chip.dataset.tag);
      return;
    }
    if (e.target.closest('.test-mc-custom[data-type="issues"]')) {
      _addCustomTagInModal(el, 'issues', selectedIssues, pageContent);
    }
  });

  // Product chip toggle
  el.querySelector('.test-mc-products').addEventListener('click', e => {
    const chip = e.target.closest('.test-mc-product');
    if (chip) {
      chip.classList.toggle('active');
      chip.classList.contains('active') ? selectedProducts.add(chip.dataset.tag) : selectedProducts.delete(chip.dataset.tag);
      return;
    }
    if (e.target.closest('.test-mc-custom[data-type="products"]')) {
      _addCustomTagInModal(el, 'products', selectedProducts, pageContent);
    }
  });

  // Photo picker
  el.querySelector('#test-photo-add-btn').addEventListener('click', () => {
    if (photos.length >= 5) { toast('最多 5 張照片', 'warning'); return; }
    el.querySelector('#test-photo-input').click();
  });

  el.querySelector('#test-photo-input').addEventListener('change', async e => {
    const addBtn = el.querySelector('#test-photo-add-btn');
    const files  = [...e.target.files].slice(0, 5 - photos.length);
    e.target.value = '';
    if (!files.length) return;
    addBtn.disabled = true; addBtn.textContent = '壓縮中…';
    for (const f of files) {
      if (photos.length >= 5) break;
      try { photos.push(await _compressImage(f)); }
      catch (err) { console.warn('[testimonials] compress fail', err); }
    }
    _renderPhotoPreviews(el, photos);
    addBtn.disabled = false;
    addBtn.textContent = photos.length < 5 ? '📷 選擇照片' : '已達上限 5 張';
  });

  // Save
  el.querySelector('.test-save').onclick = async () => {
    if (!selectedIssues.size)   { toast('請選擇改善問題', 'warning'); return; }
    if (!selectedProducts.size) { toast('請選擇使用產品', 'warning'); return; }
    const contentVal = el.querySelector('#test-content').value.trim();
    if (!contentVal) { toast('請填寫見證內容', 'warning'); el.querySelector('#test-content').focus(); return; }

    const btn = el.querySelector('.test-save');
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      await addDoc(userCollection('testimonials'), {
        issues:    [...selectedIssues],
        products:  [...selectedProducts],
        content:   contentVal,
        source:    el.querySelector('#test-source').value.trim(),
        duration:  el.querySelector('#test-duration').value.trim(),
        photos:    [...photos],
        createdAt: serverTimestamp(),
      });
      toast('見證已新增', 'success');
      _closeModal(el);
    } catch (err) {
      console.error('[testimonials] save error', err);
      toast('儲存失敗，請重試', 'error');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

function _renderPhotoPreviews(el, photos) {
  const container = el.querySelector('#test-photo-previews');
  if (!container) return;
  container.innerHTML = photos.map((b64, i) => `
    <div style="position:relative;display:inline-block;margin:.2rem">
      <img src="${b64}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;vertical-align:top">
      <button type="button" class="test-photo-remove" data-idx="${i}"
        style="position:absolute;top:-6px;right:-6px;background:var(--dg);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:20px;padding:0;text-align:center">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.test-photo-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      photos.splice(Number(btn.dataset.idx), 1);
      _renderPhotoPreviews(el, photos);
      const addBtn = el.querySelector('#test-photo-add-btn');
      if (addBtn) addBtn.textContent = photos.length < 5 ? '📷 選擇照片' : '已達上限 5 張';
    });
  });
}

async function _addCustomTagInModal(el, type, selectedSet, pageContent) {
  const chipsSelector = type === 'issues' ? '.test-mc-issues' : '.test-mc-products';
  const chipsContainer = el.querySelector(chipsSelector);
  if (chipsContainer.querySelector('.test-custom-input-wrap')) return; // 已開啟

  const customBtn = chipsContainer.querySelector(`.test-mc-custom[data-type="${type}"]`);
  customBtn.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'test-custom-input-wrap';
  wrap.style.cssText = 'display:flex;align-items:center;gap:.3rem;margin:.3rem 0 0;width:100%';
  wrap.innerHTML = `
    <input class="form-input test-custom-input" placeholder="${type === 'issues' ? '新問題標籤' : '新產品名稱'}" style="flex:1;padding:.35rem .5rem;height:auto;font-size:.82rem">
    <button type="button" class="btn btn-primary test-custom-confirm" style="padding:.35rem .6rem;font-size:.82rem">確認</button>
    <button type="button" class="btn btn-ghost test-custom-cancel2" style="padding:.35rem .6rem;font-size:.82rem">✕</button>
  `;
  chipsContainer.appendChild(wrap);
  wrap.querySelector('.test-custom-input').focus();

  const cancel = () => { wrap.remove(); customBtn.style.display = ''; };

  const confirm = async () => {
    const tag = wrap.querySelector('.test-custom-input').value.trim();
    if (!tag) { cancel(); return; }

    // 加入 customTags（若不在預設或已有清單中）
    const existing = type === 'issues' ? DEFAULT_ISSUES : DEFAULT_PRODUCTS;
    if (!existing.includes(tag) && !(_customTags[type] ?? []).includes(tag)) {
      if (!_customTags[type]) _customTags[type] = [];
      _customTags[type].push(tag);
      try {
        await updateDoc(userRootDoc(), { [`customTags.${type}`]: _customTags[type] });
      } catch (err) {
        console.error('[testimonials] save custom tag error', err);
      }
      _renderPage(pageContent); // 更新篩選器 chips
    }

    // 新增並自動選取這個 chip
    const newChip = document.createElement('button');
    newChip.type = 'button';
    newChip.className = `chip test-mc ${type === 'issues' ? 'test-mc-issue' : 'test-mc-product'} active`;
    newChip.dataset.tag = tag;
    newChip.textContent = tag;
    chipsContainer.insertBefore(newChip, wrap);
    selectedSet.add(tag);

    cancel();
  };

  wrap.querySelector('.test-custom-confirm').addEventListener('click', confirm);
  wrap.querySelector('.test-custom-cancel2').addEventListener('click', cancel);
  wrap.querySelector('.test-custom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cancel();
  });
}

// ═══════════════════════════════════════════════════════════
//  照片壓縮
// ═══════════════════════════════════════════════════════════

function _compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 800;
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════
//  共用工具
// ═══════════════════════════════════════════════════════════

function _createModal(innerHtml) {
  const container = document.getElementById('modal-container');
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="modal-box" style="max-height:88vh;overflow-y:auto">${innerHtml}</div>`;
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  return el;
}

function _closeModal(el) {
  el.classList.remove('show');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
