/* ============================================================
   SOLE & CO  |  sidepanel.js
   ============================================================ */
'use strict';

/* ── CONFIG ──────────────────────────────────────────────── */
const SUPABASE_URL = 'https://awnfcflnunsfyuifzvdy.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3bmZjZmxudW5zZnl1aWZ6dmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTg5NTcsImV4cCI6MjA4NzE3NDk1N30.' +
  'eMmertoyKxUyrarIOQNapZ3rphqKfeAqSbPpWuRiaaU';

/* ── DOM REFS ────────────────────────────────────────────── */
const phoneInput  = document.getElementById('sc-phone-input');
const clearBtn    = document.getElementById('sc-clear-btn');
const pasteBtn    = document.getElementById('sc-paste-btn');
const ordersBtn   = document.getElementById('sc-orders-btn');
const cargoBtn    = document.getElementById('sc-cargo-btn');
const body        = document.getElementById('sc-body');

/* ══════════════════════════════════════════════════════════
   PHONE UTILS
══════════════════════════════════════════════════════════ */
function cleanPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length >= 12) return '0' + digits.slice(2);
  if (digits.length === 10 && digits.startsWith('5'))  return '0' + digits;
  if (digits.length === 11 && digits.startsWith('05')) return digits;
  return digits;
}

function getLast10(phone) {
  const d = phone.replace(/\D/g, '');
  return d.slice(-10);
}

function currentPhone() {
  return cleanPhone(phoneInput.value.trim());
}

/* ── Input events ────────────────────────────────────────── */
// Ekranda gösterilen sonuçların HANGİ numaraya ait olduğunu takip eder.
// Panel artık hızlı açılsın diye kapatılınca sıfırlanmıyor — bu yüzden
// numara değiştiğinde eski müşterinin sonuçları ekranda kalıp kafa
// karıştırmasın diye, numara her değiştiğinde burayı temizliyoruz.
let lastQueriedPhone = null;

function setPhoneValue(phone) {
  phoneInput.value = phone;
  clearBtn.style.display = phone ? 'flex' : 'none';
  if (phone !== lastQueriedPhone) showSplash();
}

phoneInput.addEventListener('input', () => {
  clearBtn.style.display = phoneInput.value ? 'flex' : 'none';
  if (phoneInput.value !== lastQueriedPhone) showSplash();
});

clearBtn.addEventListener('click', () => {
  setPhoneValue('');
  phoneInput.focus();
});

/* ══════════════════════════════════════════════════════════
   WA AUTO-DETECT (Android AccessibilityService → push callback)
   WhatsAppAccessibilityService sohbet başlığını okuyup
   OverlayService üzerinden bu fonksiyonu otomatik çağırır —
   ayrı bir buton yok, WhatsApp'ta sohbet açtığın an numara
   kendiliğinden gelir (algılanabiliyorsa).
══════════════════════════════════════════════════════════ */
window.AndroidOnHeaderText = function (raw) {
  const digits = (raw || '').replace(/\D/g, '');
  const looksLikePhone = digits.length >= 10 && /^[0-9+()\s-]+$/.test(raw || '');

  if (looksLikePhone) {
    const phone = cleanPhone(raw);
    setPhoneValue(phone);
    toast(`✅ WhatsApp'tan alındı: ${phone}`);
  } else {
    // Rehbere kayıtlı kişi — başlıkta isim var, numara yok.
    toast(`👤 Sohbet: ${raw} — numara için rehbere kayıtlı olmayan bir sohbet açın ya da elle girin`, 'warn');
  }
};

/* Uzun-bas → yapıştır menüsü küçük overlay penceresinde güvenilir
   çalışmadığı için ayrı bir buton üzerinden panoyu native tarafta okuyup
   input'a basıyoruz. */
function pasteFromClipboard(showToast = true) {
  if (!window.AndroidBridge) return null;
  const text = window.AndroidBridge.getClipboardText();
  if (!text) {
    if (showToast) toast('📋 Pano boş', 'warn');
    return null;
  }
  const cleaned = cleanPhone(text);
  setPhoneValue(cleaned);
  if (showToast) toast(`📋 Yapıştırıldı: ${cleaned}`);
  return cleaned;
}

pasteBtn.addEventListener('click', () => pasteFromClipboard());

/* ══════════════════════════════════════════════════════════
   ÜRÜN GÖRSELİ ÖNBELLEĞİ — kalıcı (disk)
   İlk erişimde AndroidBridge üzerinden telefonun kalıcı deposundan
   (SharedPreferences) okunur; sonrasında yeni bir şey öğrenildiğinde
   tekrar diske yazılır. window._productImageCache sadece bu WebView
   oturumu içindeki hızlı erişim için bir ön-bellek — asıl kalıcılık
   Kotlin tarafında.
══════════════════════════════════════════════════════════ */
function getImageCache() {
  if (!window._productImageCache) {
    let seeded = {};
    try {
      if (window.AndroidBridge) seeded = JSON.parse(window.AndroidBridge.getCachedImages() || '{}');
    } catch (e) { seeded = {}; }
    window._productImageCache = seeded;
  }
  return window._productImageCache;
}

function persistImageCache(cache) {
  if (!window.AndroidBridge) return;
  try { window.AndroidBridge.saveCachedImages(JSON.stringify(cache)); } catch (e) { /* sessizce geç */ }
}

const refreshImagesBtn = document.getElementById('sc-refresh-images-btn');
refreshImagesBtn.addEventListener('click', () => {
  window._productImageCache = {};
  if (window.AndroidBridge) {
    try { window.AndroidBridge.clearCachedImages(); } catch (e) { /* sessizce geç */ }
  }
  toast('🔄 Görsel önbelleği temizlendi — bir sonraki aramada güncel gelecek');
});

/**
 * Numara kutusu boşken "Siparişi Getir" / "Kargo Takip"e basılırsa,
 * önce yapıştır butonuna basmaya gerek kalmadan panoyu otomatik dener.
 * Panoda da bir şey yoksa null döner, çağıran taraf uyarı gösterir.
 */
function ensurePhoneFilled() {
  if (currentPhone()) return currentPhone();
  return pasteFromClipboard(false);
}

/* ══════════════════════════════════════════════════════════
   SUPABASE HELPERS
══════════════════════════════════════════════════════════ */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function fetchOrders(phone) {
  const last10 = getLast10(phone);
  const f0 = `0${last10}`;
  const f1 = `+90${last10}`;
  const f2 = last10;

  const orders = await sbFetch(
    `orders?or=(customer_phone.eq.${encodeURIComponent(f0)},customer_phone.eq.${encodeURIComponent(f1)},customer_phone.eq.${encodeURIComponent(f2)})&order=created_at.desc&select=id,customer_name,customer_phone,created_at,status,items,ip_address`
  );

  if (!orders.length) return [];

  // fetch product images — önbellekli: aynı ürün görseli tekrar tekrar
  // indirilmesin diye telefonun kalıcı deposunda (SharedPreferences) tutuluyor.
  // Uygulamayı tamamen kapatıp açsan bile bu liste kaybolmaz — sadece
  // header'daki "Görselleri Güncelle"ye bastığında temizlenir.
  const ids = [...new Set(
    orders.flatMap(o => (Array.isArray(o.items) ? o.items.map(i => i.product_id) : []))
      .filter(Boolean)
  )];

  const cache = getImageCache();
  const missing = ids.filter(id => !(id in cache));

  if (missing.length) {
    const prods = await sbFetch(`products?id=in.(${missing.join(',')})&select=id,image_url`);
    prods.forEach(p => { cache[p.id] = p.image_url; });
    // Karşılığı bulunamayan id'leri de işaretle ki tekrar sorgulanmasın
    missing.forEach(id => { if (!(id in cache)) cache[id] = null; });
    persistImageCache(cache);
  }

  orders.forEach(o => {
    if (Array.isArray(o.items))
      o.items = o.items.map(i => ({ ...i, image_url: (i.product_id && cache[i.product_id]) || null }));
  });

  // Şüpheli sipariş kontrolü artık BURADA beklenmiyor — o iki ekstra sorgu
  // sonucu göstermeyi geciktiriyordu. Sonuç hemen render edilir, rozet
  // arkadan (patchSuspectBadges ile) birkaç yüz ms sonra karta eklenir.
  return orders;
}

/* ══════════════════════════════════════════════════════════
   ŞÜPHELİ SİPARİŞ TESPİTİ
   Web admin panelindeki sistemin aynısı: order_ip_counts /
   order_phone_counts tabloları bir trigger ile otomatik
   güncelleniyor (trg_sync_order_counts). order_count > 1 ise
   o IP/telefon birden fazla siparişte geçmiş demektir.
══════════════════════════════════════════════════════════ */
async function attachSuspectFlags(orders) {
  const ips = [...new Set(orders.map(o => o.ip_address).filter(v => v && v !== 'bilinmiyor'))];
  const phones = [...new Set(orders.map(o => o.customer_phone).filter(Boolean))];

  const [ipRows, phoneRows] = await Promise.all([
    ips.length
      ? sbFetch(`order_ip_counts?ip_address=in.(${ips.map(v => encodeURIComponent(v)).join(',')})&order_count=gt.1&select=ip_address,order_count`)
      : Promise.resolve([]),
    phones.length
      ? sbFetch(`order_phone_counts?customer_phone=in.(${phones.map(v => encodeURIComponent(v)).join(',')})&order_count=gt.1&select=customer_phone,order_count`)
      : Promise.resolve([]),
  ]).catch(() => [[], []]);

  const ipMap = Object.fromEntries((ipRows || []).map(r => [r.ip_address, r.order_count]));
  const phoneMap = Object.fromEntries((phoneRows || []).map(r => [r.customer_phone, r.order_count]));

  orders.forEach(o => {
    const parts = [];
    const ipCount = o.ip_address && ipMap[o.ip_address];
    const phoneCount = o.customer_phone && phoneMap[o.customer_phone];
    if (ipCount) parts.push(`Aynı IP (${ipCount} sipariş)`);
    if (phoneCount) parts.push(`Aynı tel. (${phoneCount} sipariş)`);
    o._suspectReason = parts.join(' · ') || null;
  });
}

/**
 * attachSuspectFlags sonucunu, siparişler EKRANDA ZATEN GÖRÜNÜRKEN ilgili
 * kartlara ekler — sayfayı yeniden çizmez, sadece şüpheli olanların üstüne
 * rozet basar. Böylece "Siparişi Getir" hâlâ eskisi kadar hızlı açılır.
 */
function patchSuspectBadges(orders) {
  orders.forEach(o => {
    if (!o._suspectReason) return;
    const card = body.querySelector(`.sc-card[data-order-id="${o.id}"]`);
    if (!card || card.querySelector('.sc-suspect-badge')) return;
    card.classList.add('sc-card--suspect');
    const badge = document.createElement('div');
    badge.className = 'sc-suspect-badge';
    badge.textContent = `⚠️ Şüpheli · ${o._suspectReason}`;
    card.insertBefore(badge, card.firstChild);
  });
}

async function cancelOrder(orderId) {
  await sbFetch(`orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

async function confirmOrder(orderId) {
  await sbFetch(`orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
}

/* ══════════════════════════════════════════════════════════
   STATUS MAP
══════════════════════════════════════════════════════════ */
const STATUS = {
  pending:    { label: 'Bekliyor',      color: '#d97706', bg: '#fef3c7' },
  confirmed:  { label: 'Onaylandı',     color: '#059669', bg: '#d1fae5' },
  processing: { label: 'Hazırlanıyor',  color: '#7c3aed', bg: '#ede9fe' },
  shipped:    { label: 'Kargoda',       color: '#2563eb', bg: '#dbeafe' },
  delivered:  { label: 'Teslim Edildi', color: '#7c3aed', bg: '#ede9fe' },
  cancelled:  { label: 'İptal',         color: '#dc2626', bg: '#fee2e2' },
  iptal:      { label: 'İptal',         color: '#dc2626', bg: '#fee2e2' },
};
const getStatus = s => STATUS[s] || { label: s || 'Bilinmiyor', color: '#6b7280', bg: '#f3f4f6' };

/* ══════════════════════════════════════════════════════════
   RENDER — ORDER CARDS
══════════════════════════════════════════════════════════ */
function renderOrders(orders) {
  if (!orders.length) {
    body.innerHTML = `<div class="sc-empty"><div class="sc-empty-icon">🔍</div><div>Bu numara için sipariş bulunamadı.</div></div>`;
    return;
  }

  const countEl = document.createElement('div');
  countEl.className = 'sc-section-label';
  countEl.textContent = `${orders.length} Sipariş`;
  body.innerHTML = '';
  body.appendChild(countEl);

  orders.forEach(order => {
    const el = document.createElement('div');
    el.innerHTML = orderCardHTML(order);
    body.appendChild(el.firstElementChild);
  });
}

function orderCardHTML(order) {
  const st = getStatus(order.status);
  const isCancelled = order.status === 'cancelled' || order.status === 'iptal';
  const date = order.created_at
    ? new Date(order.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const items = Array.isArray(order.items) ? order.items : [];
  const total = items.reduce((s, i) => s + Number(i.price || 0), 0);

  const itemsHTML = items.map(item => `
    <div class="sc-item">
      <div class="sc-item-img-wrap">
        ${item.image_url
          ? `<img class="sc-item-img" src="${item.image_url}" alt="${escHtml(item.product_name || '')}" loading="lazy">`
          : `<div class="sc-item-img sc-item-img--empty">📦</div>`}
        ${item.image_url
          ? `<button class="sc-copy-img-btn" data-url="${escHtml(item.image_url)}">
               <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                 <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
               </svg>İndir
             </button>`
          : ''}
      </div>
      <div class="sc-item-info">
        <div class="sc-item-name">${escHtml(item.product_name || 'Ürün')}</div>
        <div class="sc-item-meta">
          <span class="sc-chip">No: ${item.size ?? '—'}</span>
          <span class="sc-chip sc-chip--price">₺${Number(item.price || 0).toLocaleString('tr-TR')}</span>
        </div>
      </div>
    </div>`).join('');

  return `
    <div class="sc-card${isCancelled ? ' sc-card--cancelled' : ''}${order._suspectReason ? ' sc-card--suspect' : ''}" data-order-id="${order.id}">
      ${order._suspectReason ? `<div class="sc-suspect-badge">⚠️ Şüpheli · ${escHtml(order._suspectReason)}</div>` : ''}
      <div class="sc-card-head">
        <div class="sc-card-meta">
          <span class="sc-order-id">#${String(order.id).slice(0, 8).toUpperCase()}</span>
          <span class="sc-order-date">${date}</span>
        </div>
        <span class="sc-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
      </div>
      ${order.customer_name ? `<div class="sc-customer-name">👤 ${escHtml(order.customer_name)}</div>` : ''}
      <div class="sc-items">${itemsHTML || '<div class="sc-no-items">Ürün bilgisi yok</div>'}</div>
      <div class="sc-card-foot">
        <span class="sc-total">Toplam: <strong>₺${total.toLocaleString('tr-TR')}</strong></span>
        <div class="sc-card-actions">
          ${isCancelled
            ? `<span class="sc-cancelled-pill">🚫 İptal Edildi</span>`
            : order.status === 'confirmed'
              ? `<span class="sc-confirmed-pill">✅ Onaylandı</span>
                 <button class="sc-cancel-btn" data-order-id="${order.id}">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                     <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                   </svg>İptal Et
                 </button>`
              : `<button class="sc-confirm-btn" data-order-id="${order.id}">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                     <polyline points="20 6 9 17 4 12"/>
                   </svg>Onayla
                 </button>
                 <button class="sc-cancel-btn" data-order-id="${order.id}">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                     <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                   </svg>İptal Et
                 </button>`
          }
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   RENDER — CARGO CARDS
══════════════════════════════════════════════════════════ */
function renderCargo(records, phone) {
  if (!records.length) {
    body.innerHTML = `<div class="sc-empty"><div class="sc-empty-icon">📦</div><div>Bu numara için kargo kaydı bulunamadı.<br><small style="color:#8696a0">${phone}</small></div></div>`;
    return;
  }

  const countEl = document.createElement('div');
  countEl.className = 'sc-section-label';
  countEl.textContent = `${records.length} Kargo Kaydı`;
  body.innerHTML = '';
  body.appendChild(countEl);

  records.forEach(k => {
    const el = document.createElement('div');
    el.innerHTML = cargoCardHTML(k);
    body.appendChild(el.firstElementChild);
  });
}

/**
 * Yeşilkar Kargo API'sinin `statu_no` alanında döndürdüğü iki haneli durum
 * kodlarının Türkçe karşılığı. `sonuc` alanı API'nin kendi yazdığı okunabilir
 * metin (onu olduğu gibi gösteriyoruz) — bu tablo sadece `sonuc` boş gelirse
 * yedek, ASIL amacı ise renklendirme/şube-bekliyor tespitini metne göre
 * tahmin etmek yerine kesin KODA göre yapabilmek.
 */
const CARGO_STATUS_MAP = {
  '00': 'Kabul Bekliyor',
  '01': 'Kabul Edildi',
  '10': 'Teslim Edildi',
  '20': 'İade - İade Süreci Başlatıldı',
  '21': 'İade - Göndericiye İade Edildi',
  '22': 'İade - Kurye İade Sürecini Başlattı',
  '23': 'İade - İade Çıkış Şubesine Ulaştı',
  '24': 'İade - Şubeden İade Süreci Başlatıldı',
  '30': 'Teslim Edilemedi - Teslimat Şubesinde Bekliyor',
  '40': 'Transfer Sürecinde',
  '41': 'Teslimat Şubesinde Bekliyor',
  '42': 'Kurye Dağıtımda',
  '50': 'Teslim Edilemedi - Teslimat Şubesinde Bekliyor',
  '60': 'Teslim Edilemedi - Teslimat Şubesinde Bekliyor',
};

// Bu kodlarda kargo bir şubede bekliyor demektir (teslim alınması gerekiyor).
const CARGO_BRANCH_WAITING_CODES = ['30', '41', '50', '60'];
const CARGO_RETURN_CODES         = ['20', '21', '22', '23', '24'];
const CARGO_TRANSIT_CODES        = ['40', '42'];
const CARGO_DELIVERED_CODES      = ['10'];

function cargoStatusCode(k) {
  return (k.statu_no != null ? k.statu_no : '').toString().trim();
}

/** Ekranda gösterilecek metin: API'nin kendi yazdığı `sonuc` varsa onu kullan,
 *  yoksa kod tablosundan üret. */
function cargoStatusLabel(k) {
  return k.sonuc || CARGO_STATUS_MAP[cargoStatusCode(k)] || '—';
}

/** Renklendirme artık metin tahmini değil, doğrudan `statu_no` koduna göre —
 *  çok daha güvenilir (ör. "Teslim Edilemedi" metninde "teslim" geçmesi gibi
 *  yanlış eşleşme riski yok). */
function statusStyle(k) {
  const code = cargoStatusCode(k);
  if (CARGO_DELIVERED_CODES.includes(code)) return 'background:#d1fae5;color:#065f46';
  if (CARGO_RETURN_CODES.includes(code)) return 'background:#fee2e2;color:#991b1b';
  if (CARGO_BRANCH_WAITING_CODES.includes(code)) return 'background:#dbeafe;color:#1e40af';
  if (CARGO_TRANSIT_CODES.includes(code)) return 'background:#fef3c7;color:#92400e';
  return 'background:#f3f4f6;color:#374151'; // 00/01 kabul bekliyor/edildi ya da bilinmeyen kod
}

function buildMsgTemplate(k) {
  const ad    = [k.aliciadi, k.alicisoyad].filter(Boolean).join(' ') || 'Müşteri';
  const sip   = k.cikisno || '—';
  const sube  = k.onsonuc || '—';
  const sonuc = cargoStatusLabel(k);

  // şubede bekliyorsa şube mesajı, değilse genel durum mesajı — doğrudan statu_no koduna göre
  const isAtBranch = sube !== '—' && CARGO_BRANCH_WAITING_CODES.includes(cargoStatusCode(k));

  if (isAtBranch) {
    return (
      `Merhaba ${ad},\n\n` +
      `Siparişiniz (${sip}) Aras Kargo *${sube}* şubesine ulaşmıştır.\n\n` +
      `Kargonuz şubede beklemektedir.\n` +
      `Gecikme yaşamamak için lütfen en kısa sürede şubeden teslim alınız.\n\n` +
      `Google'da Aras Kargo *${sube}* şube ismini aratarak konumunu görebilirsiniz.\n\n` +
      `İyi günler dileriz 🙏`
    );
  }

  return (
    `Merhaba ${ad},\n\n` +
    `Siparişinizin kargo takip numarası: *${sip}*\n\n` +
    `Güncel durum: *${sonuc}*\n\n` +
    `Aras Kargo resmi sitesinden takip edebilirsiniz: https://www.araskargo.com.tr\n\n` +
    `İyi günler dileriz 🙏`
  );
}

function cargoCardHTML(k) {
  const ad   = [k.aliciadi, k.alicisoyad].filter(Boolean).join(' ') || '—';
  const msg  = buildMsgTemplate(k);

  return `
    <div class="sc-cargo-card">
      <div class="sc-cargo-head">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
          <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
        Aras Kargo — ${escHtml(k.cikisno || '—')}
      </div>

      <!-- Butonlar en üstte — kaydırmadan erişilsin -->
      <div style="display:flex;gap:8px;margin:8px 0">
        <button class="sc-msg-copy-btn" data-msg="${escAttr(msg)}" style="flex:1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Mesajı Kopyala
        </button>
        <button class="sc-msg-insert-btn" data-msg="${escAttr(msg)}" style="flex:1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          WA'ya Yaz
        </button>
      </div>

      <div class="sc-cargo-row">
        <span class="sc-cargo-label">Alıcı</span>
        <span class="sc-cargo-val">${escHtml(ad)}</span>
      </div>
      <div class="sc-cargo-row">
        <span class="sc-cargo-label">Takip No</span>
        <span class="sc-cargo-val">${escHtml(k.cikisno || '—')}</span>
      </div>
      <div class="sc-cargo-row">
        <span class="sc-cargo-label">Şube</span>
        <span class="sc-cargo-val">${escHtml(k.onsonuc || '—')}</span>
      </div>
      <div class="sc-cargo-row">
        <span class="sc-cargo-label">Durum</span>
        <span class="sc-cargo-val">
          <span class="sc-cargo-val--status" style="${statusStyle(k)}">${escHtml(cargoStatusLabel(k))}</span>
        </span>
      </div>

      <!-- Mesaj Şablonu (önizleme) -->
      <div class="sc-msg-wrap">
        <div class="sc-msg-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          Müşteriye Gönderilecek Mesaj
        </div>
        <div class="sc-msg-text" data-msg="${escAttr(msg)}">${escHtml(msg)}</div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   MAIN ACTIONS
══════════════════════════════════════════════════════════ */
ordersBtn.addEventListener('click', async () => {
  ordersBtn.disabled = true;
  showLoading('Numara alınıyor…');

  const phone = ensurePhoneFilled();
  if (!phone || phone.length < 10) {
    showSplash();
    toast('📵 Geçerli bir telefon numarası gir ya da bir WA sohbeti aç', 'warn');
    phoneInput.focus();
    ordersBtn.disabled = false;
    return;
  }

  showLoading('Siparişler yükleniyor…');
  try {
    const orders = await fetchOrders(phone);
    lastQueriedPhone = phone;
    renderOrders(orders);
    // Şüpheli sipariş rozeti arkadan gelsin — ekranı bekletmesin
    if (orders.length) {
      attachSuspectFlags(orders).then(() => patchSuspectBadges(orders)).catch(() => {});
    }
  } catch (err) {
    showError(err.message);
  } finally {
    ordersBtn.disabled = false;
  }
});

cargoBtn.addEventListener('click', async () => {
  cargoBtn.disabled = true;
  showLoading('Numara alınıyor…');

  const phone = ensurePhoneFilled();
  if (!phone || phone.length < 10) {
    showSplash();
    toast('📵 Geçerli bir telefon numarası gir ya da bir WA sohbeti aç', 'warn');
    phoneInput.focus();
    cargoBtn.disabled = false;
    return;
  }

  showLoading('Kargo bilgisi aranıyor…');
  try {
    const records = await fetchCargoAndroid(phone);
    lastQueriedPhone = phone;
    renderCargo(records, phone);
  } catch (err) {
    showError(`Kargo API: ${err.message}`);
  } finally {
    cargoBtn.disabled = false;
  }
});

/* ══════════════════════════════════════════════════════════
   ANDROID BRIDGE HELPERS
   background.js'teki FETCH_CARGO proxy'sinin karşılığı: native
   tarafta HTTP çağrısı yapılır, sonuç bu callback'e düşer.
══════════════════════════════════════════════════════════ */
function fetchCargoAndroid(phone) {
  return new Promise((resolve, reject) => {
    if (!window.AndroidBridge) { reject(new Error('AndroidBridge yok')); return; }
    let settled = false;
    // Güvenlik ağı: Kotlin tarafı ne olursa olsun 15 sn içinde yanıt
    // vermezse düğme sonsuza kadar pasif kalmasın diye zaman aşımına düşür.
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.AndroidOnCargoResult = null;
      reject(new Error('Zaman aşımı — kargo API yanıt vermedi, tekrar dene'));
    }, 15000);
    window.AndroidOnCargoResult = (records) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      window.AndroidOnCargoResult = null;
      resolve(records || []);
    };
    window.AndroidBridge.fetchCargo(phone);
  });
}

/* ══════════════════════════════════════════════════════════
   EVENT DELEGATION — body
══════════════════════════════════════════════════════════ */
body.addEventListener('click', async (e) => {

  /* ── Copy cargo message ─────────────────────────────── */
  const msgBtn = e.target.closest('.sc-msg-copy-btn');
  if (msgBtn) {
    const msg = msgBtn.dataset.msg;
    window.AndroidBridge.copyText(msg);
    msgBtn.classList.add('copied');
    msgBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Kopyalandı!`;
    // Kopyaladıktan sonra WhatsApp'a hemen geçebilesin diye panel kendiliğinden
    // kapanıp baloncuk kenara küçülsün — "Kopyalandı!" yazısını görebilmen için
    // ufak bir gecikmeyle.
    setTimeout(() => { window.AndroidBridge && window.AndroidBridge.closePanel(); }, 500);
    return;
  }

  /* ── Insert cargo message directly into WhatsApp ────── */
  const insertBtn = e.target.closest('.sc-msg-insert-btn');
  if (insertBtn) {
    const msg = insertBtn.dataset.msg;
    const ok = window.AndroidBridge.insertToWhatsApp(msg);
    toast(ok ? '✍️ WhatsApp mesaj kutusuna yazıldı — kontrol edip gönder'
             : '⚠️ Yazılamadı — WhatsApp\'ta bir sohbet açık olmalı', ok ? 'success' : 'warn');
    if (ok) {
      setTimeout(() => { window.AndroidBridge && window.AndroidBridge.closePanel(); }, 500);
    }
    return;
  }

  /* ── Download product image ─────────────────────────────── */
  const imgBtn = e.target.closest('.sc-copy-img-btn');
  if (imgBtn) {
    imgBtn.disabled = true;
    const originalHtml = imgBtn.innerHTML;
    imgBtn.textContent = '…';
    window.AndroidOnImageCopied = (ok) => {
      window.AndroidOnImageCopied = null;
      imgBtn.disabled = false;
      imgBtn.innerHTML = originalHtml;
      toast(ok ? '⬇️ Galeriye indirildi (SoleCoPanel klasörü)' : '❌ İndirilemedi', ok ? 'success' : 'error');
    };
    window.AndroidBridge.downloadImage(imgBtn.dataset.url);
    return;
  }

  /* ── Confirm order (tek dokunuş — riskli değil) ─────── */
  const confirmBtn = e.target.closest('.sc-confirm-btn');
  if (confirmBtn) {
    const id = confirmBtn.dataset.orderId;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '⏳ Onaylanıyor…';
    try {
      await confirmOrder(id);
      const card = body.querySelector(`.sc-card[data-order-id="${id}"]`);
      if (card) {
        const badge = card.querySelector('.sc-badge');
        const st = getStatus('confirmed');
        if (badge) { badge.textContent = st.label; badge.style.color = st.color; badge.style.background = st.bg; }
        const actions = card.querySelector('.sc-card-actions');
        if (actions) {
          actions.innerHTML = `
            <span class="sc-confirmed-pill">✅ Onaylandı</span>
            <button class="sc-cancel-btn" data-order-id="${id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>İptal Et
            </button>`;
        }
      }
      toast('✅ Sipariş onaylandı.');
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Onayla`;
      toast(`❌ ${err.message}`, 'error');
    }
    return;
  }

  /* ── Cancel order — 1. adım: yanlışlıkla basmaya karşı
     "Emin misin?" onayına dönüştür, gerçek işlemi yapma ────── */
  const cancelBtn = e.target.closest('.sc-cancel-btn');
  if (cancelBtn) {
    const id = cancelBtn.dataset.orderId;
    const actions = cancelBtn.closest('.sc-card-actions');
    if (actions) {
      actions.innerHTML = `
        <span class="sc-cancel-confirm-label">Emin misin?</span>
        <button class="sc-cancel-abort-btn" data-order-id="${id}">Vazgeç</button>
        <button class="sc-cancel-confirm-btn" data-order-id="${id}">Evet, İptal Et</button>`;
    }
    return;
  }

  /* ── Cancel order — vazgeç: eski butona dön ─────────── */
  const abortBtn = e.target.closest('.sc-cancel-abort-btn');
  if (abortBtn) {
    const id = abortBtn.dataset.orderId;
    const actions = abortBtn.closest('.sc-card-actions');
    const card = body.querySelector(`.sc-card[data-order-id="${id}"]`);
    const isConfirmed = card && card.querySelector('.sc-confirmed-pill');
    if (actions) {
      actions.innerHTML = isConfirmed
        ? `<span class="sc-confirmed-pill">✅ Onaylandı</span>
           <button class="sc-cancel-btn" data-order-id="${id}">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
               <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
             </svg>İptal Et
           </button>`
        : `<button class="sc-confirm-btn" data-order-id="${id}">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
               <polyline points="20 6 9 17 4 12"/>
             </svg>Onayla
           </button>
           <button class="sc-cancel-btn" data-order-id="${id}">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
               <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
             </svg>İptal Et
           </button>`;
    }
    return;
  }

  /* ── Cancel order — 2. adım: gerçek iptal ────────────── */
  const cancelConfirmBtn = e.target.closest('.sc-cancel-confirm-btn');
  if (cancelConfirmBtn) {
    const id = cancelConfirmBtn.dataset.orderId;
    const actions = cancelConfirmBtn.closest('.sc-card-actions');
    if (actions) actions.innerHTML = `<span class="sc-loading-pill">⏳ İptal ediliyor…</span>`;
    try {
      await cancelOrder(id);
      const card = body.querySelector(`.sc-card[data-order-id="${id}"]`);
      if (card) {
        card.classList.add('sc-card--cancelled');
        const badge = card.querySelector('.sc-badge');
        const st = getStatus('cancelled');
        if (badge) { badge.textContent = st.label; badge.style.color = st.color; badge.style.background = st.bg; }
        const a2 = card.querySelector('.sc-card-actions');
        if (a2) a2.innerHTML = `<span class="sc-cancelled-pill">🚫 İptal Edildi</span>`;
      }
      toast('✅ Sipariş iptal edildi.');
    } catch (err) {
      if (actions) {
        actions.innerHTML = `
          <span class="sc-cancel-confirm-label">Emin misin?</span>
          <button class="sc-cancel-abort-btn" data-order-id="${id}">Vazgeç</button>
          <button class="sc-cancel-confirm-btn" data-order-id="${id}">Evet, İptal Et</button>`;
      }
      toast(`❌ ${err.message}`, 'error');
    }
    return;
  }
});

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function showLoading(text = 'Yükleniyor…') {
  body.innerHTML = `
    <div class="sc-loading">
      <div class="sc-spinner"></div>
      <div class="sc-loading-text">${text}</div>
    </div>`;
}

function showError(msg) {
  body.innerHTML = `<div class="sc-error"><div class="sc-error-icon">⚠️</div><div>${escHtml(msg)}</div></div>`;
}

function showSplash() {
  body.innerHTML = `
    <div class="sc-splash">
      <div class="sc-splash-icon">👟</div>
      <div class="sc-splash-text">Telefon gir veya WhatsApp'tan çek,<br/>ardından işlem seç.</div>
    </div>`;
}

/* Not: Android WebView'da görsel panoya doğrudan kopyalanamaz;
   imgBtn handler'ı yukarıda görsel bağlantısını (URL) kopyalıyor. */

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

let toastTimer = null;
function toast(msg, type = 'success') {
  let el = document.getElementById('sc-toast-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sc-toast-el';
    el.className = 'sc-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `sc-toast${type !== 'success' ? ' ' + type : ''}`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
