/* =============================================
   СПЛАВ — admin.js
   Логика админ-панели (mng-river-7x2.html):
   заявки, отзывы (активные/удалённые), поиск пользователей.
   Вынесено из инлайн-<script>, чтобы страница могла работать
   под строгим CSP (script-src без 'unsafe-inline').
   ============================================= */

const SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allBookings = [];
let allReviewsActive = [];
let allReviewsDeleted = [];
let currentBookingFilter = 'all';

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateOnly(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtPrice(price) {
  if (price === null || price === undefined || price === '') return '—';
  const n = Number(price);
  if (isNaN(n)) return '—';
  return n.toLocaleString('ru-RU') + ' ₽';
}
function starsStr(n) {
  n = Number(n) || 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function showToast(text, type) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.classList.remove('show'), 3200);
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

// ───────────────────────── URL-РОУТИНГ РАЗДЕЛОВ ─────────────────────────
// Каждый раздел админки получает свой адрес вида:
//   mng-river-7x2.html/bookings   (красивый путь — основной вариант)
//   mng-river-7x2.html?view=bookings  (фолбэк через query, работает всегда)
// Прямой заход или обновление страницы по "красивому" пути на GitHub Pages
// упадёт в 404.html — тот распознаёт путь /mng-river-7x2.html/... и тихо
// переписывает его в ?view=..., так что оба формата всегда приводят сюда.

const VALID_VIEWS = ['activity', 'bookings', 'reviews', 'schedule', 'users'];
const DEFAULT_VIEW = 'activity';

function getViewFromURL() {
  // 1) Красивый путь: .../mng-river-7x2.html/<view>
  // Берём ПОСЛЕДНИЙ сегмент пути и проверяем, что это один из известных
  // разделов — так функция остаётся устойчивой, даже если в пути случайно
  // накопился мусор (например, из-за старого бага с задвоением сегментов).
  const segments = window.location.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && VALID_VIEWS.includes(lastSegment.toLowerCase())) {
    return lastSegment.toLowerCase();
  }

  // 2) Query-параметр: ?view=<view> (используется как fallback из 404.html,
  // а также если кто-то поделился такой ссылкой напрямую)
  const params = new URLSearchParams(window.location.search);
  const queryView = params.get('view');
  if (queryView && VALID_VIEWS.includes(queryView.toLowerCase())) return queryView.toLowerCase();

  return DEFAULT_VIEW;
}

function urlForView(view) {
  // Строим АБСОЛЮТНЫЙ путь от корня сайта. Если использовать относительный
  // путь вида 'mng-river-7x2.html/users', браузер резолвит его относительно
  // ТЕКУЩЕГО адреса — и если мы уже находимся на .../mng-river-7x2.html/bookings,
  // новый путь превращается в .../mng-river-7x2.html/bookings/mng-river-7x2.html/users,
  // а при каждом следующем клике сегмент 'mng-river-7x2.html' задваивается снова.
  // Поэтому берём путь строго до ПЕРВОГО 'mng-river-7x2.html' включительно —
  // .*? (нежадный) вместо .* гарантирует самое раннее совпадение, что также
  // самоисцеляет уже задвоенные адреса (.../mng-river-7x2.html/mng-river-7x2.html/...),
  // если кто-то успел на них перейти до этого исправления.
  const basePath = window.location.pathname.replace(
    /(.*?mng-river-7x2\.html).*/i,
    '$1'
  );
  return basePath + '/' + view;
}

// ───────────────────────── ACCESS GATE ─────────────────────────
(async function () {
  const { data: sessionData } = await sb.auth.getSession();
  const session = sessionData && sessionData.session;

  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  // Проверяем флаг is_admin в profiles. Сама проверка здесь — лишь для
  // того, чтобы не показывать интерфейс не-админу; настоящая защита
  // данных обеспечивается RLS-политиками в Supabase, так что даже если
  // эту проверку обойти через консоль браузера, реальные запросы
  // на чтение/изменение всё равно будут отклонены базой.
  const { data: profile, error } = await sb
    .from('profiles')
    .select('login, name, surname, email, is_admin')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || !profile.is_admin) {
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('denied').classList.add('show');
    return;
  }

  document.getElementById('sidebar-user').textContent =
    [profile.name, profile.surname].filter(Boolean).join(' ') || profile.email;

  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.add('show');

  // Всегда грузим заявки — от них зависит бейдж "новые" в сайдбаре,
  // независимо от того, какой раздел открыт по умолчанию.
  loadBookings();
  loadReviewsActive();

  const initialView = getViewFromURL();
  switchView(initialView, { updateUrl: false });
  if (initialView === 'activity') loadActivityStats();
  if (initialView === 'schedule') loadScheduleFromDB();
})();

// ═══════════════════════════════════════════════════════════════
//  АКТИВНОСТЬ — посещаемость сайта (раздел в сайдбаре)
// ═══════════════════════════════════════════════════════════════

document.getElementById('activity-refresh').addEventListener('click', loadActivityStats);

async function loadActivityStats() {
  const kpiViews   = document.getElementById('kpi-pageviews');
  const kpiUnique  = document.getElementById('kpi-unique');
  const kpiOnline  = document.getElementById('kpi-online');
  const tbody      = document.getElementById('activity-pages-tbody');

  kpiViews.textContent = '—';
  kpiUnique.textContent = '—';
  kpiOnline.textContent = '—';
  tbody.innerHTML = '<tr class="empty-row"><td colspan="2">Загружаем…</td></tr>';

  try {
    // 1) Просмотров всего — точный count без скачивания строк (head:true).
    const totalRes = await sb.from('site_visits').select('id', { count: 'exact', head: true });
    if (totalRes.error) throw totalRes.error;
    const totalViews = totalRes.count || 0;

    // 2) Уникальные посетители и разбивка по страницам — тащим только
    //    нужные две колонки (без head), считаем на клиенте через Set.
    //    Supabase возвращает максимум 1000 строк за запрос по умолчанию,
    //    поэтому листаем страницами, пока не выгрузим всё.
    const visitorIds = new Set();
    const pageCounts = {};
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const chunk = await sb
        .from('site_visits')
        .select('visitor_id, page')
        .range(from, from + PAGE_SIZE - 1);
      if (chunk.error) throw chunk.error;
      const rows = chunk.data || [];
      rows.forEach(r => {
        visitorIds.add(r.visitor_id);
        pageCounts[r.page] = (pageCounts[r.page] || 0) + 1;
      });
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // 3) Онлайн сейчас — last_seen в последние 5 минут, уникальные посетители.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const onlineRes = await sb
      .from('site_visits')
      .select('visitor_id')
      .gte('last_seen', fiveMinAgo);
    if (onlineRes.error) throw onlineRes.error;
    const onlineVisitors = new Set((onlineRes.data || []).map(r => r.visitor_id));

    kpiViews.textContent = totalViews.toLocaleString('ru-RU');
    kpiUnique.textContent = visitorIds.size.toLocaleString('ru-RU');
    kpiOnline.textContent = onlineVisitors.size.toLocaleString('ru-RU');

    const pageRows = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]);
    if (!pageRows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="2">Пока нет данных о посещениях.</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(([page, count]) =>
        '<tr>' +
          '<td class="cell-strong" data-label="Страница">' + esc(page) + '</td>' +
          '<td data-label="Просмотров">' + count.toLocaleString('ru-RU') + '</td>' +
        '</tr>'
      ).join('');
    }
  } catch (e) {
    console.error('Failed to load activity stats:', e);
    kpiViews.textContent = '—';
    kpiUnique.textContent = '—';
    kpiOnline.textContent = '—';
    tbody.innerHTML = '<tr class="empty-row"><td colspan="2">Не удалось загрузить статистику. Проверьте, что таблица site_visits создана в Supabase.</td></tr>';
  }
}
document.getElementById('nav-activity').addEventListener('click', () => {
  switchView('activity');
  loadActivityStats();
});
document.getElementById('nav-bookings').addEventListener('click', () => switchView('bookings'));
document.getElementById('nav-reviews').addEventListener('click', () => switchView('reviews'));
document.getElementById('nav-users').addEventListener('click', () => switchView('users'));

function switchView(view, opts) {
  opts = opts || {};
  const updateUrl = opts.updateUrl !== false; // по умолчанию true

  document.getElementById('nav-activity').classList.toggle('active', view === 'activity');
  document.getElementById('nav-bookings').classList.toggle('active', view === 'bookings');
  document.getElementById('nav-reviews').classList.toggle('active', view === 'reviews');
  document.getElementById('nav-users').classList.toggle('active', view === 'users');
  document.getElementById('nav-schedule').classList.toggle('active', view === 'schedule');
  document.getElementById('view-activity').classList.toggle('active', view === 'activity');
  document.getElementById('view-bookings').classList.toggle('active', view === 'bookings');
  document.getElementById('view-reviews').classList.toggle('active', view === 'reviews');
  document.getElementById('view-users').classList.toggle('active', view === 'users');
  document.getElementById('view-schedule').classList.toggle('active', view === 'schedule');

  if (updateUrl) {
    const url = urlForView(view);
    if (window.location.pathname !== url) {
      history.pushState({ view: view }, '', url);
    }
  }
}

// Кнопка "назад"/"вперёд" браузера — переключаем раздел без создания
// новой записи в истории (она там уже есть).
window.addEventListener('popstate', function () {
  const view = getViewFromURL();
  switchView(view, { updateUrl: false });
  if (view === 'activity') loadActivityStats();
  if (view === 'schedule') loadScheduleFromDB();
});

document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const which = tab.dataset.rtab;
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('panel-reviews-active').style.display = which === 'active' ? 'block' : 'none';
    document.getElementById('panel-reviews-deleted').style.display = which === 'deleted' ? 'block' : 'none';
    if (which === 'deleted' && allReviewsDeleted.length === 0) loadReviewsDeleted();
  });
});

document.querySelectorAll('#bookings-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentBookingFilter = btn.dataset.status;
    document.querySelectorAll('#bookings-filters .filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderBookings();
  });
});

// ───────────────────────── BOOKINGS ─────────────────────────
async function loadBookings() {
  const { data, error } = await sb.from('bookings').select('*').order('created_at', { ascending: false });
  if (error) {
    showToast('Не удалось загрузить заявки: ' + error.message, 'error');
    return;
  }
  allBookings = data || [];
  updateNewBadge();
  renderBookings();
}

function updateNewBadge() {
  const newCount = allBookings.filter(b => b.status === 'new').length;
  const badge = document.getElementById('badge-new');
  if (newCount > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = newCount;
  } else {
    badge.style.display = 'none';
  }
}

function renderBookings() {
  const tbody = document.getElementById('bookings-tbody');
  const filtered = currentBookingFilter === 'all'
    ? allBookings
    : allBookings.filter(b => b.status === currentBookingFilter);

  document.getElementById('bookings-count').textContent =
    filtered.length + (filtered.length === 1 ? ' заявка' : ' заявок');

  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Заявок по этому фильтру пока нет.</td></tr>';
    return;
  }

  const paymentBadge = (b) => {
    if (!b.payment_status || b.payment_status === 'unpaid') return '<span class="cell-muted">—</span>';
    const map = {
      pending: ['#8a6d3b', 'Ожидает оплаты'],
      paid:    ['#2c4a2e', 'Оплачено'],
      failed:  ['#a03020', 'Не оплачено'],
      canceled:['#a03020', 'Отменено']
    };
    const [color, text] = map[b.payment_status] || ['#8a6d3b', b.payment_status];
    const amountStr = b.amount != null ? ' (' + Number(b.amount).toLocaleString('ru-RU') + ' ₽)' : '';
    return '<span style="color:' + color + '; font-weight:600;">' + esc(text) + '</span>' + esc(amountStr);
  };

  tbody.innerHTML = filtered.map(b => {
    const badgeClass = b.status === 'confirmed' ? 'badge-confirmed' : b.status === 'cancelled' ? 'badge-cancelled' : 'badge-new';
    const badgeText  = b.status === 'confirmed' ? 'Подтверждена' : b.status === 'cancelled' ? 'Отменена' : 'Новая';
    return '<tr data-id="' + esc(b.id) + '">' +
      '<td data-label="Дата заявки" class="cell-muted">' + fmtDate(b.created_at) + '</td>' +
      '<td data-label="Клиент"><span class="cell-strong">' + esc(b.name) + '</span><br><span class="cell-muted">' + esc(b.phone) + '</span></td>' +
      '<td data-label="Сплав" class="cell-wrap">' + esc(b.tour) + '</td>' +
      '<td data-label="Когда едут" class="cell-muted">' + fmtDateOnly(b.trip_date) + '</td>' +
      '<td data-label="Чел.">' + (b.people != null ? esc(b.people) : '—') + '</td>' +
      '<td data-label="Комментарий" class="cell-wrap cell-muted">' + (b.comment ? esc(b.comment) : '—') + '</td>' +
      '<td data-label="Оплата">' + paymentBadge(b) + '</td>' +
      '<td data-label="Статус">' +
        '<select class="status-select" data-id="' + esc(b.id) + '">' +
          '<option value="new"'        + (b.status === 'new' ? ' selected' : '')        + '>Новая</option>' +
          '<option value="confirmed"'  + (b.status === 'confirmed' ? ' selected' : '')  + '>Подтверждена</option>' +
          '<option value="cancelled"'  + (b.status === 'cancelled' ? ' selected' : '')  + '>Отменена</option>' +
        '</select>' +
        '<span class="badge ' + badgeClass + '" style="display:none;">' + badgeText + '</span>' +
      '</td>' +
      '<td data-label="Заметка"><textarea class="note-input" data-id="' + esc(b.id) + '" placeholder="Заметка для себя…">' + esc(b.admin_note || '') + '</textarea></td>' +
    '</tr>';
  }).join('');

  // Смена статуса
  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.id;
      const newStatus = sel.value;
      sel.disabled = true;
      const { error } = await sb.from('bookings').update({ status: newStatus }).eq('id', id);
      sel.disabled = false;
      if (error) {
        showToast('Не удалось изменить статус: ' + error.message, 'error');
        return;
      }
      const b = allBookings.find(x => x.id === id);
      if (b) b.status = newStatus;
      updateNewBadge();
      showToast('Статус обновлён', 'ok');
    });
  });

  // Сохранение заметки — по потере фокуса, чтобы не дёргать БД на каждую букву
  tbody.querySelectorAll('.note-input').forEach(area => {
    area.addEventListener('blur', async () => {
      const id = area.dataset.id;
      const b = allBookings.find(x => x.id === id);
      if (b && b.admin_note === area.value) return; // не изменилось
      const { error } = await sb.from('bookings').update({ admin_note: area.value }).eq('id', id);
      if (error) {
        showToast('Не удалось сохранить заметку: ' + error.message, 'error');
        return;
      }
      if (b) b.admin_note = area.value;
      showToast('Заметка сохранена', 'ok');
    });
  });
}

// ───────────────────────── REVIEWS: ACTIVE ─────────────────────────
async function loadReviewsActive() {
  const { data, error } = await sb.from('reviews').select('*').order('created_at', { ascending: false });
  const tbody = document.getElementById('reviews-active-tbody');
  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Не удалось загрузить отзывы.</td></tr>';
    showToast('Ошибка загрузки отзывов: ' + error.message, 'error');
    return;
  }
  allReviewsActive = data || [];
  document.getElementById('reviews-count').textContent =
    allReviewsActive.length + (allReviewsActive.length === 1 ? ' отзыв' : ' отзывов');
  renderReviewsActive();
}

function renderReviewsActive() {
  const tbody = document.getElementById('reviews-active-tbody');
  if (!allReviewsActive.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Отзывов пока нет.</td></tr>';
    return;
  }
  tbody.innerHTML = allReviewsActive.map(r => {
    return '<tr data-id="' + esc(r.id) + '">' +
      '<td data-label="Дата" class="cell-muted">' + fmtDate(r.created_at) + '</td>' +
      '<td data-label="Автор" class="cell-strong">' + esc(r.user_name) + ' ' + esc(r.user_surname) + '</td>' +
      '<td data-label="Сплав" class="cell-wrap">' + (r.tour ? esc(r.tour) : '—') + '</td>' +
      '<td data-label="Оценка"><span class="stars-mini">' + starsStr(r.stars) + '</span></td>' +
      '<td data-label="Текст" class="cell-wrap">' + esc(r.body) + '</td>' +
      '<td data-label=""><div class="row-actions"><button class="btn-mini danger" data-del-id="' + esc(r.id) + '">Удалить</button></div></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить этот отзыв? Он переместится в раздел «Удалённые».')) return;
      const id = btn.dataset.delId;
      btn.disabled = true; btn.textContent = 'Удаляем…';
      const { error } = await sb.from('reviews').delete().eq('id', id);
      if (error) {
        btn.disabled = false; btn.textContent = 'Удалить';
        showToast('Не удалось удалить: ' + error.message, 'error');
        return;
      }
      allReviewsActive = allReviewsActive.filter(r => r.id !== id);
      document.getElementById('reviews-count').textContent =
        allReviewsActive.length + (allReviewsActive.length === 1 ? ' отзыв' : ' отзывов');
      renderReviewsActive();
      allReviewsDeleted = []; // сбрасываем кэш — подгрузится заново при переходе на вкладку
      showToast('Отзыв удалён', 'ok');
    });
  });
}

// ───────────────────────── REVIEWS: DELETED ─────────────────────────
async function loadReviewsDeleted() {
  const tbody = document.getElementById('reviews-deleted-tbody');
  const { data, error } = await sb.from('deleted_reviews').select('*').order('deleted_at', { ascending: false });
  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Не удалось загрузить лог удалённых отзывов.</td></tr>';
    showToast('Ошибка загрузки лога: ' + error.message, 'error');
    return;
  }
  allReviewsDeleted = data || [];
  renderReviewsDeleted();
}

function renderReviewsDeleted() {
  const tbody = document.getElementById('reviews-deleted-tbody');
  if (!allReviewsDeleted.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Удалённых отзывов нет.</td></tr>';
    return;
  }
  tbody.innerHTML = allReviewsDeleted.map(r => {
    return '<tr data-log-id="' + esc(r.id) + '">' +
      '<td data-label="Удалён" class="cell-muted">' + fmtDate(r.deleted_at) + '</td>' +
      '<td data-label="Автор" class="cell-strong">' + esc(r.user_name) + ' ' + esc(r.user_surname) + '</td>' +
      '<td data-label="Сплав" class="cell-wrap">' + (r.tour ? esc(r.tour) : '—') + '</td>' +
      '<td data-label="Оценка"><span class="stars-mini">' + starsStr(r.stars) + '</span></td>' +
      '<td data-label="Текст" class="cell-wrap">' + esc(r.body) + '</td>' +
      '<td data-label=""><div class="row-actions"><button class="btn-mini success" data-restore-log="' + esc(r.id) + '">Восстановить</button></div></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-restore-log]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const logId = btn.dataset.restoreLog;
      const entry = allReviewsDeleted.find(r => r.id === logId);
      if (!entry) return;

      btn.disabled = true; btn.textContent = 'Восстанавливаем…';

      const { error: insertError } = await sb.from('reviews').insert({
        id: entry.review_id,
        user_id: entry.user_id,
        user_name: entry.user_name,
        user_surname: entry.user_surname,
        tour: entry.tour,
        body: entry.body,
        stars: entry.stars,
        created_at: entry.created_at
      });

      if (insertError) {
        btn.disabled = false; btn.textContent = 'Восстановить';
        showToast('Не удалось восстановить: ' + insertError.message, 'error');
        return;
      }

      // Убираем запись из лога, чтобы не оставлять дубликат истории
      await sb.from('deleted_reviews').delete().eq('id', logId);

      allReviewsDeleted = allReviewsDeleted.filter(r => r.id !== logId);
      renderReviewsDeleted();
      allReviewsActive = []; // сбрасываем кэш активных — подгрузим заново при следующем заходе
      showToast('Отзыв восстановлен', 'ok');
    });
  });
}
// ───────────────────────── USERS SEARCH ─────────────────────────
let userSearchTimer = null;
const userSearchInput = document.getElementById('user-search-input');

userSearchInput.addEventListener('input', () => {
  clearTimeout(userSearchTimer);
  const q = userSearchInput.value.trim();
  if (q.length < 2) {
    document.getElementById('users-result-panel').style.display = 'none';
    return;
  }
  userSearchTimer = setTimeout(() => searchUsers(q), 350);
});

async function searchUsers(q) {
  const escaped = q.replace(/[%,]/g, ''); // на всякий случай убираем спецсимволы PostgREST-фильтра
  const orFilter = [
    'name.ilike.%' + escaped + '%',
    'surname.ilike.%' + escaped + '%',
    'login.ilike.%' + escaped + '%',
    'email.ilike.%' + escaped + '%'
  ].join(',');

  const { data, error } = await sb
    .from('profiles')
    .select('id, name, surname, login, email, is_admin, created_at')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(50);

  const panel = document.getElementById('users-result-panel');
  const tbody = document.getElementById('users-tbody');

  if (error) {
    showToast('Ошибка поиска: ' + error.message, 'error');
    return;
  }

  panel.style.display = 'block';

  if (!data || !data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Никого не нашли по этому запросу.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    return '<tr>' +
      '<td data-label="Имя" class="cell-strong">' + esc([u.name, u.surname].filter(Boolean).join(' ') || '—') + '</td>' +
      '<td data-label="Логин" class="cell-muted">' + (u.login ? esc(u.login) : '—') + '</td>' +
      '<td data-label="Email" class="cell-muted">' + esc(u.email || '—') + '</td>' +
      '<td data-label="Админ">' + (u.is_admin ? '<span class="badge badge-confirmed">Да</span>' : '<span class="cell-muted">—</span>') + '</td>' +
      '<td data-label="Регистрация" class="cell-muted">' + fmtDate(u.created_at) + '</td>' +
      '<td data-label="ID"><code style="font-size:0.74rem; user-select:all;">' + esc(u.id) + '</code></td>' +
    '</tr>';
  }).join('');
}

// ─── EVENT DELEGATION — заменяет onclick="logout()" на data-action ────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'logout') logout();
});

// ═══════════════════════════════════════════════════════════════
//  РАСПИСАНИЕ — парсинг Excel и синхронизация с Supabase
// ═══════════════════════════════════════════════════════════════

// SheetJS подключается в HTML через CDN (cdn.jsdelivr.net/npm/xlsx)
// Глобальная переменная XLSX доступна после загрузки скрипта.

let parsedScheduleRows = []; // строки из последнего загруженного файла

// ── Переключение вьюхи ────────────────────────────────────────
document.getElementById('nav-schedule').addEventListener('click', () => {
  switchView('schedule');
  loadScheduleFromDB();
});

// ── Загрузка файла ────────────────────────────────────────────
document.getElementById('schedule-file-input').addEventListener('change', function () {
  const file = this.files && this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    parseExcel(e.target.result, file.name);
  };
  reader.readAsArrayBuffer(file);
  // сбрасываем input чтобы можно было загрузить тот же файл повторно
  this.value = '';
});

// ── Гибкий парсинг дат ─────────────────────────────────────────
// Формат дат в реальных файлах организаторов очень разный:
// Excel-дата, "20.07.2026", "2026-07-20", "20 июля", "11-12 мая",
// "30-1 июня" (диапазон через границу месяца) и т.п.
// Возвращает { start: Date, end: Date } (end === start для однодневной даты), либо null.
const RU_MONTHS = {
  'январ':0, 'феврал':1, 'март':2, 'апрел':3, 'ма':4, 'июн':5,
  'июл':6, 'август':7, 'сентябр':8, 'октябр':9, 'ноябр':10, 'декабр':11
};
function ruMonthIndex(word) {
  const w = word.toLowerCase();
  for (const key in RU_MONTHS) {
    if (w.indexOf(key) === 0) return RU_MONTHS[key];
  }
  return -1;
}
function parseFlexibleDate(raw, defaultYear) {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return isNaN(raw) ? null : { start: raw, end: raw };

  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    const date = new Date(d.y, d.m - 1, d.d);
    return { start: date, end: date };
  }

  const str = String(raw).trim();
  if (!str) return null;

  // "20.07.2026" / "20.07.26" / "20/07/2026"
  let m = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
  if (m) {
    let [, dd, mo, yy] = m;
    yy = yy.length === 2 ? '20' + yy : yy;
    const d = new Date(+yy, +mo - 1, +dd);
    if (!isNaN(d)) return { start: d, end: d };
  }

  // "2026-07-20" (ISO)
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d)) return { start: d, end: d };
  }

  // "11-12 мая", "30-1 июня 2026", "1-3 августа", "20 июля"
  m = str.match(/^(\d{1,2})\s*[-–—]?\s*(\d{1,2})?\s+([а-яё]+)\.?\s*(\d{4})?$/i);
  if (m) {
    const [, d1, d2, monthWord, yearStr] = m;
    const monthIdx = ruMonthIndex(monthWord);
    if (monthIdx !== -1) {
      const year = yearStr ? +yearStr : (defaultYear || new Date().getFullYear());
      const startDay = +d1;
      const endDay = d2 ? +d2 : +d1;
      // Если диапазон вида "30-1" — первый день относится к предыдущему месяцу
      let startMonth = monthIdx;
      let endMonth = monthIdx;
      if (endDay && startDay > endDay) {
        startMonth = monthIdx - 1;
      }
      const start = new Date(year, startMonth, startDay);
      const end   = new Date(year, endMonth, endDay);
      if (!isNaN(start) && !isNaN(end)) return { start, end };
    }
  }

  // Последняя попытка — отдать на откуп встроенному парсеру
  const fallback = new Date(str);
  return isNaN(fallback) ? null : { start: fallback, end: fallback };
}

// ── Форматирование диапазона дат для отображения ───────────────
const RU_MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function fmtDateRange(startISO, endISO) {
  if (!startISO) return '—';
  const start = new Date(startISO + 'T00:00:00');
  if (isNaN(start)) return '—';
  if (!endISO || endISO === startISO) {
    return start.getDate() + ' ' + RU_MONTH_NAMES[start.getMonth()] + ' ' + start.getFullYear();
  }
  const end = new Date(endISO + 'T00:00:00');
  if (isNaN(end) || end.getTime() === start.getTime()) {
    return start.getDate() + ' ' + RU_MONTH_NAMES[start.getMonth()] + ' ' + start.getFullYear();
  }
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return start.getDate() + '–' + end.getDate() + ' ' + RU_MONTH_NAMES[start.getMonth()] + ' ' + start.getFullYear();
  }
  if (start.getFullYear() === end.getFullYear()) {
    return start.getDate() + ' ' + RU_MONTH_NAMES[start.getMonth()] + ' – ' +
      end.getDate() + ' ' + RU_MONTH_NAMES[end.getMonth()] + ' ' + start.getFullYear();
  }
  return start.getDate() + ' ' + RU_MONTH_NAMES[start.getMonth()] + ' ' + start.getFullYear() + ' – ' +
    end.getDate() + ' ' + RU_MONTH_NAMES[end.getMonth()] + ' ' + end.getFullYear();
}

// ── Парсинг ───────────────────────────────────────────────────
function parseExcel(buffer, fileName) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (err) {
    showToast('Не удалось прочитать файл: ' + err.message, 'error');
    return;
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (!raw.length) {
    showToast('Файл пуст', 'error');
    return;
  }

  // Определяем строку заголовков (первая непустая строка)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    if (raw[i].some(cell => String(cell).trim() !== '')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = raw[headerRowIdx].map(h => String(h).trim().toLowerCase());

  // Гибкий маппинг — ищем колонки по ключевым словам
  function findCol(keywords) {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const colDate   = findCol(['дата', 'date', 'день старта', 'начало']);
  const colRiver  = findCol(['река', 'river', 'маршрут']);
  const colDays   = findCol(['дней', 'дни', 'кол', 'days', 'продолж']);
  const colFormat = findCol(['формат', 'format', 'тип', 'вид']);
  const colPrice  = findCol(['цена', 'price', 'стоимост', 'руб']);
  const colNote   = findCol(['примечание', 'note', 'комментарий', 'заметка', 'доп']);

  const missing = [];
  if (colDate   === -1) missing.push('Дата');
  if (colRiver  === -1) missing.push('Река');
  if (colDays   === -1) missing.push('Кол-во дней');
  if (colFormat === -1) missing.push('Формат');

  if (missing.length) {
    showScheduleErrors(['Не найдены колонки: ' + missing.join(', ') +
      '. Ожидаются заголовки: Дата / Река / Кол-во дней / Формат']);
    return;
  }

  const errors = [];
  const rows = [];
  const defaultYearInput = document.getElementById('schedule-default-year');
  const defaultYear = defaultYearInput && defaultYearInput.value ? parseInt(defaultYearInput.value, 10) : undefined;

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    // пропускаем полностью пустые строки
    if (row.every(cell => String(cell).trim() === '')) continue;

    const rowNum = i + 1;
    const rawDate   = row[colDate];
    const rawRiver  = String(row[colRiver]  || '').trim();
    const rawDays   = row[colDays];
    const rawFormat = String(row[colFormat] || '').trim();
    const rawPrice  = colPrice !== -1 ? row[colPrice] : '';
    const rawNote   = colNote !== -1 ? String(row[colNote] || '').trim() : '';

    // Парсинг даты — гибкий, не блокирует строку при нестандартном формате
    const parsedRange = parseFlexibleDate(rawDate, defaultYear);
    const dateResolved = !!parsedRange;

    const days      = parseInt(rawDays, 10);
    const daysValid = !isNaN(days) && days > 0;

    // Цена необязательна. Если указана — должна быть положительным числом.
    // Чистим пробелы, неразрывные пробелы и значок ₽/руб, если есть.
    let price = null;
    let priceValid = true;
    if (rawPrice !== '' && rawPrice !== null && rawPrice !== undefined) {
      const cleanedPrice = String(rawPrice).replace(/[\s\u00A0]/g, '').replace(/[₽]|руб\.?/gi, '');
      if (cleanedPrice !== '') {
        const parsedPrice = Number(cleanedPrice.replace(',', '.'));
        if (!isNaN(parsedPrice) && parsedPrice >= 0) {
          price = parsedPrice;
        } else {
          priceValid = false;
        }
      }
    }

    // Дата больше не блокирует строку — если распознать не удалось,
    // сохраняем как есть (trip_date = null) и просто предупреждаем.
    const rowErrors = [];
    if (!rawRiver)       rowErrors.push('пустая река');
    if (!daysValid)      rowErrors.push('неверное кол-во дней «' + rawDays + '»');
    if (!rawFormat)      rowErrors.push('пустой формат');
    if (!priceValid)      rowErrors.push('неверная цена «' + rawPrice + '»');

    if (!dateResolved && rawDate) {
      errors.push('Строка ' + rowNum + ': дата «' + rawDate + '» не распознана, сохранена как есть — проверьте вручную');
    }

    if (rowErrors.length) {
      errors.push('Строка ' + rowNum + ': ' + rowErrors.join(', '));
      rows.push({ _error: true, rawDate, rawRiver, rawDays, rawFormat, rowNum });
    } else {
      // Форматируем даты как YYYY-MM-DD для Supabase, если удалось их распознать
      const toISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      let tripDate = null;
      let tripDateEnd = null;
      if (dateResolved) {
        tripDate = toISO(parsedRange.start);
        tripDateEnd = toISO(parsedRange.end);
      }
      rows.push({
        _error: false,
        _dateUnresolved: !dateResolved,
        rawDate,
        trip_date: tripDate,
        trip_date_end: tripDateEnd,
        river: rawRiver,
        days: days,
        format: rawFormat,
        price: price,
        note: rawNote
      });
    }
  }

  parsedScheduleRows = rows;

  const validCount = rows.filter(r => !r._error).length;

  // Инфо о файле
  const fileInfo = document.getElementById('schedule-file-info');
  document.getElementById('schedule-file-name').textContent = fileName;
  document.getElementById('schedule-row-count').textContent =
    validCount + ' корректных строк' + (errors.length ? ', ' + errors.length + ' с ошибками' : '');
  fileInfo.style.display = 'flex';

  if (errors.length) showScheduleErrors(errors);
  else hideScheduleErrors();

  renderSchedulePreview(rows);

  const saveBtn = document.getElementById('btn-save-schedule');
  const clearBtn = document.getElementById('btn-clear-schedule');
  saveBtn.style.display = validCount > 0 ? 'inline-flex' : 'none';
  saveBtn.disabled = validCount === 0;
  clearBtn.style.display = 'inline-flex';

  document.getElementById('schedule-sub').textContent =
    'Предпросмотр: ' + rows.length + ' строк (' + validCount + ' корректных)';
}

// ── Рендер таблицы предпросмотра ──────────────────────────────
function renderSchedulePreview(rows) {
  const panel = document.getElementById('schedule-preview-panel');
  const tbody = document.getElementById('schedule-tbody');

  if (!rows.length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  tbody.innerHTML = rows.map((r, i) => {
    if (r._error) {
      return '<tr class="row-error">' +
        '<td class="cell-muted" data-label="#">' + r.rowNum + '</td>' +
        '<td data-label="Дата"><span style="color:var(--accent)">⚠ ' + esc(String(r.rawDate || '—')) + '</span></td>' +
        '<td data-label="Река">' + esc(String(r.rawRiver || '—')) + '</td>' +
        '<td data-label="Кол-во дней">' + esc(String(r.rawDays  || '—')) + '</td>' +
        '<td data-label="Формат">' + esc(String(r.rawFormat|| '—')) + '</td>' +
        '<td data-label="Цена"></td>' +
        '<td data-label="Примечание"></td>' +
        '<td data-label=""></td>' +
      '</tr>';
    }
    return '<tr' + (r._dateUnresolved ? ' class="row-warn"' : '') + '>' +
      '<td class="cell-muted" data-label="#">' + (i + 1) + '</td>' +
      '<td class="cell-date" data-label="Дата">' +
        (r._dateUnresolved
          ? '<span style="color:var(--accent)" title="Дата не распознана, сохранена как есть">⚠ ' + esc(String(r.rawDate || '—')) + '</span>'
          : fmtDateRange(r.trip_date, r.trip_date_end)) +
      '</td>' +
      '<td class="cell-strong" data-label="Река">' + esc(r.river) + '</td>' +
      '<td data-label="Кол-во дней">' + esc(String(r.days)) + '</td>' +
      '<td data-label="Формат">' + esc(r.format) + '</td>' +
      '<td class="cell-strong" data-label="Цена">' + fmtPrice(r.price) + '</td>' +
      '<td class="cell-muted cell-wrap" data-label="Примечание">' + esc(r.note || '—') + '</td>' +
      '<td data-label=""><button class="row-del-btn" data-preview-idx="' + i + '">✕</button></td>' +
    '</tr>';
  }).join('');

  // Удаление строки из предпросмотра
  tbody.querySelectorAll('[data-preview-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.previewIdx, 10);
      parsedScheduleRows.splice(idx, 1);
      renderSchedulePreview(parsedScheduleRows);
      const validCount = parsedScheduleRows.filter(r => !r._error).length;
      document.getElementById('btn-save-schedule').disabled = validCount === 0;
      document.getElementById('schedule-row-count').textContent =
        validCount + ' корректных строк';
    });
  });
}

// ── Ошибки парсинга ───────────────────────────────────────────
function showScheduleErrors(errors) {
  const box  = document.getElementById('schedule-errors');
  const list = document.getElementById('schedule-errors-list');
  list.innerHTML = errors.map(e => '<li>' + esc(e) + '</li>').join('');
  box.style.display = 'block';
}
function hideScheduleErrors() {
  document.getElementById('schedule-errors').style.display = 'none';
}

// ── Сохранение в Supabase ─────────────────────────────────────
document.getElementById('btn-save-schedule').addEventListener('click', async () => {
  const valid = parsedScheduleRows.filter(r => !r._error).map(r => ({
    trip_date:     r.trip_date,
    trip_date_end: r.trip_date_end,
    river:     r.river,
    days:      r.days,
    format:    r.format,
    price:     r.price,
    note:      r.note || null
  }));

  if (!valid.length) return;

  const btn = document.getElementById('btn-save-schedule');
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';

  // Вставляем пачками по 100 строк
  const BATCH = 100;
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    const { error } = await sb.from('schedule').insert(batch);
    if (error) {
      failed += batch.length;
      showToast('Ошибка при сохранении пачки: ' + error.message, 'error');
    } else {
      saved += batch.length;
    }
  }

  btn.disabled = false;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Сохранить в базу';

  if (saved > 0) {
    showToast('Сохранено ' + saved + ' строк' + (failed ? ', ' + failed + ' с ошибками' : ''), failed ? 'error' : 'ok');
    parsedScheduleRows = [];
    renderSchedulePreview([]);
    document.getElementById('schedule-preview-panel').style.display = 'none';
    document.getElementById('schedule-file-info').style.display = 'none';
    document.getElementById('btn-save-schedule').style.display = 'none';
    document.getElementById('schedule-sub').textContent = 'Загрузите Excel-файл с колонками: Дата, Река, Кол-во дней, Формат, Цена (необязательно), Примечание (необязательно). Дата понимается в разных форматах.';
    hideScheduleErrors();
    loadScheduleFromDB();
  }
});

// ── Очистка базы ──────────────────────────────────────────────
document.getElementById('btn-clear-schedule').addEventListener('click', async () => {
  if (!confirm('Удалить всё расписание из базы? Это действие нельзя отменить.')) return;
  const { error } = await sb.from('schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    showToast('Не удалось очистить: ' + error.message, 'error');
    return;
  }
  showToast('Расписание очищено', 'ok');
  loadScheduleFromDB();
});

// ── Ручное добавление одного сплава ───────────────────────────
document.getElementById('btn-toggle-manual-add').addEventListener('click', () => {
  const panel = document.getElementById('manual-add-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('btn-manual-add-submit').addEventListener('click', async () => {
  const dateEl    = document.getElementById('manual-date');
  const dateEndEl = document.getElementById('manual-date-end');
  const riverEl  = document.getElementById('manual-river');
  const daysEl   = document.getElementById('manual-days');
  const formatEl = document.getElementById('manual-format');
  const priceEl  = document.getElementById('manual-price');
  const noteEl   = document.getElementById('manual-note');

  const river  = riverEl.value.trim();
  const days   = parseInt(daysEl.value, 10);
  const format = formatEl.value.trim();
  const price  = priceEl.value !== '' ? Number(priceEl.value) : null;
  const note   = noteEl.value.trim();

  const problems = [];
  if (!river)                          problems.push('укажите реку');
  if (!daysEl.value || isNaN(days) || days <= 0) problems.push('укажите корректное кол-во дней');
  if (!format)                         problems.push('укажите формат');
  if (price !== null && (isNaN(price) || price < 0)) problems.push('некорректная цена');
  if (dateEndEl.value && dateEl.value && dateEndEl.value < dateEl.value) problems.push('дата окончания раньше даты начала');

  if (problems.length) {
    showToast('Проверьте поля: ' + problems.join(', '), 'error');
    return;
  }

  const btn = document.getElementById('btn-manual-add-submit');
  btn.disabled = true;
  btn.textContent = 'Добавляем…';

  const { error } = await sb.from('schedule').insert({
    trip_date:     dateEl.value || null,
    trip_date_end: dateEndEl.value || dateEl.value || null,
    river:     river,
    days:      days,
    format:    format,
    price:     price,
    note:      note || null
  });

  btn.disabled = false;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Добавить в расписание';

  if (error) {
    showToast('Не удалось добавить: ' + error.message, 'error');
    return;
  }

  showToast('Сплав добавлен', 'ok');
  dateEl.value = '';
  dateEndEl.value = '';
  riverEl.value = '';
  daysEl.value = '';
  formatEl.value = '';
  priceEl.value = '';
  noteEl.value = '';
  loadScheduleFromDB();
});

// ── Загрузка текущего расписания из БД ───────────────────────
async function loadScheduleFromDB() {
  const tbody = document.getElementById('schedule-db-tbody');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Загружаем…</td></tr>';

  const { data, error } = await sb
    .from('schedule')
    .select('*')
    .order('trip_date', { ascending: true });

  if (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Не удалось загрузить расписание.</td></tr>';
    showToast('Ошибка загрузки расписания: ' + error.message, 'error');
    return;
  }

  if (!data || !data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">В базе пока нет расписания.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(row => {
    return '<tr>' +
      '<td class="cell-date" data-label="Дата">' + fmtDateRange(row.trip_date, row.trip_date_end) + '</td>' +
      '<td class="cell-strong" data-label="Река">' + esc(row.river) + '</td>' +
      '<td data-label="Кол-во дней">' + esc(String(row.days)) + '</td>' +
      '<td data-label="Формат">' + esc(row.format) + '</td>' +
      '<td class="cell-strong" data-label="Цена">' + fmtPrice(row.price) + '</td>' +
      '<td class="cell-muted cell-wrap" data-label="Примечание">' + esc(row.note || '—') + '</td>' +
      '<td class="cell-muted" data-label="Добавлено">' + fmtDate(row.created_at) + '</td>' +
      '<td data-label=""><button class="row-del-btn" data-db-id="' + esc(row.id) + '">✕</button></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-db-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить эту запись из расписания?')) return;
      btn.disabled = true;
      const { error } = await sb.from('schedule').delete().eq('id', btn.dataset.dbId);
      if (error) {
        btn.disabled = false;
        showToast('Не удалось удалить: ' + error.message, 'error');
        return;
      }
      btn.closest('tr').remove();
      showToast('Запись удалена', 'ok');
    });
  });
}
