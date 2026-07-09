const SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentMeta = null;
let selectedStars = 5;

function initials(a, b) {
  return ((a||'')[0]||'').toUpperCase() + ((b||'')[0]||'').toUpperCase();
}
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text; el.className = 'msg-box ' + type;
}

function setStar(n) {
  selectedStars = n;
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.toggle('active', +b.dataset.v <= n);
  });
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = 'profile.html';
}

// ─── SUBMIT REVIEW ─────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeSubmissionId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

// Иногда первый запрос к Supabase на мобильной сети (особенно после
// "холодного" открытия страницы) обрывается с сетевой ошибкой — второй
// запрос почти всегда проходит нормально. Поэтому один раз тихо
// повторяем сами, не заставляя человека нажимать кнопку заново.
// upsert по submission_id (один и тот же на обеих попытках) гарантирует,
// что даже если первая попытка на самом деле дошла до сервера, а клиент
// просто не получил ответ, повтор не создаст дубликат отзыва.
async function insertReviewWithRetry(payload) {
  let res = await sb.from('reviews').upsert(payload, { onConflict: 'submission_id' });
  if (res.error) {
    console.warn('review insert failed, retrying once:', res.error.message);
    await sleep(700);
    res = await sb.from('reviews').upsert(payload, { onConflict: 'submission_id' });
  }
  return res;
}

async function submitReview() {
  if (!currentUser) return;
  const tour = document.getElementById('rev-tour').value;
  const text = document.getElementById('rev-text').value.trim();
  if (!tour) return showMsg('rev-msg', 'Выберите сплав.', 'error');
  if (text.length < 15) return showMsg('rev-msg', 'Напишите чуть подробнее (минимум 15 символов).', 'error');

  const btn = document.querySelector('#review-block .btn-submit');
  btn.disabled = true; btn.textContent = 'Публикуем…';

  const { error } = await insertReviewWithRetry({
    user_id: currentUser.id,
    user_name: currentMeta.name || '',
    user_surname: currentMeta.surname || '',
    tour, body: text, stars: selectedStars,
    submission_id: makeSubmissionId()
  });

  if (error) {
    btn.disabled = false; btn.textContent = 'Опубликовать отзыв';
    return showMsg('rev-msg', 'Ошибка: ' + error.message, 'error');
  }

  showMsg('rev-msg', 'Отзыв опубликован! Спасибо — он появится на главной странице.', 'success');
  document.getElementById('rev-text').value = '';
  document.getElementById('rev-tour').value = '';
  setStar(5);
  btn.textContent = 'Отзыв опубликован ✓';
  setTimeout(() => { window.location.href = 'index.html#reviews'; }, 2000);
}

// ─── CHECK SESSION / SHOW FORM ──────────────────────────────
async function applyUserMeta(user) {
  const meta = user.user_metadata || {};
  const isGoogle = user.app_metadata?.provider === 'google';

  let name, surname, login;

  if (isGoogle) {
    const full = meta.full_name || meta.name || '';
    const parts = full.trim().split(' ');
    name    = parts[0] || '';
    surname = parts.slice(1).join(' ') || '';
    login   = '';
  } else {
    name    = meta.name    || '';
    surname = meta.surname || '';
    login   = meta.login   || '';
  }

  let profileFound = false;
  let avatarUrl = null;
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('login, name, surname, avatar_url')
      .eq('id', user.id)
      .single();
    if (profile) {
      profileFound = true;
      if (profile.login)   login   = profile.login;
      if (profile.name)    name    = profile.name;
      if (profile.surname) surname = profile.surname;
      avatarUrl = profile.avatar_url || null;
    }
  } catch {}

  // Авто-восстановление отсутствующей строки профиля (см. auth.html) —
  // подстраховка для аккаунтов, у которых profiles не была создана при регистрации.
  if (!profileFound && !isGoogle && login) {
    try {
      await sb.from('profiles').insert({ id: user.id, login, email: user.email, name, surname });
    } catch (e) {
      console.error('profile auto-repair failed:', e);
    }
  }

  currentUser = user;
  currentMeta = { name, surname, login };

  const uav = document.getElementById('uav');
  if (avatarUrl) {
    uav.innerHTML = '<img src="' + avatarUrl + '" alt="">';
  } else {
    uav.textContent = initials(name, surname) || user.email[0].toUpperCase();
  }
  document.getElementById('u-name').textContent = [name, surname].filter(Boolean).join(' ') || 'Участник';
  document.getElementById('u-email').textContent = user.email;

  document.getElementById('checking-state').style.display = 'none';
  document.getElementById('review-block').style.display = 'block';
}

// ─── СПИСОК СПЛАВОВ (из таблицы schedule) ──────────────────────
function fmtTourDate(dateStr, dateEndStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '';
  const startLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (!dateEndStr || dateEndStr === dateStr) return startLabel;
  const e = new Date(dateEndStr + 'T00:00:00');
  if (isNaN(e) || e.getTime() === d.getTime()) return startLabel;
  if (e.getMonth() === d.getMonth() && e.getFullYear() === d.getFullYear()) {
    return d.getDate() + '–' + e.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  return startLabel + ' – ' + e.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

(async function loadTourOptions() {
  const tourSelect = document.getElementById('rev-tour');
  if (!tourSelect) return;

  try {
    // Для отзыва актуальны любые сплавы, которые уже были — берём все,
    // от самых недавних к самым давним.
    const { data, error } = await sb
      .from('schedule')
      .select('*')
      .order('trip_date', { ascending: false });

    if (error) throw new Error(error.message);

    const rows = data || [];
    if (!rows.length) return; // оставляем только заглушку «— Выберите сплав —»

    rows.forEach(row => {
      const dateLabel = fmtTourDate(row.trip_date, row.trip_date_end);
      const label = row.river + ' (' + row.days + ' дн., ' + row.format + ')' +
        (dateLabel ? ', ' + dateLabel : '');
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      tourSelect.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to load schedule for review tour select:', e);
    // Если не удалось загрузить — select останется с заглушкой
  }
})();

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await applyUserMeta(data.session.user);
  } else {
    // Не залогинен — отправляем на страницу входа.
    // sessionStorage здесь не используется (в артефактах он не нужен,
    // а тут это обычная статика — но просто помечаем через query-параметр,
    // чтобы после входа auth.html понимал, что нужно вернуться сюда).
    window.location.href = 'profile.html';
  }
})();

// ─── EVENT DELEGATION ─────────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'logout')         logout();
  else if (action === 'set-star')  setStar(parseInt(btn.dataset.v, 10));
  else if (action === 'submit-review') submitReview();
});
