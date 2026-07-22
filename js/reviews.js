(function () {
  'use strict';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function starsStr(n) {
    n = Math.min(5, Math.max(0, parseInt(n, 10) || 5));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function initials(a, b) {
    return (esc((a || '')[0] || '')).toUpperCase() +
           (esc((b || '')[0] || '')).toUpperCase();
  }

  // Из полного названия сплава ("Выходной на Медведице (2 дня)") оставляем
  // только реку — так короче и понятнее в карточке отзыва.
  function riverTag(tour) {
    var t = (tour || '').toLowerCase();
    var hasMedveditsa = t.indexOf('медвед') !== -1;
    var hasHoper = t.indexOf('хопер') !== -1 || t.indexOf('хопёр') !== -1;
    if (hasMedveditsa && hasHoper) return 'Медведица и Хопёр';
    if (hasMedveditsa) return 'Медведица';
    if (hasHoper) return 'Хопёр';
    return tour || '';
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  var currentUserId = null;
  var avatarMap = {};

  function renderCards(data) {
    var grid = document.getElementById('reviews-grid');

    // Отзывов нет вообще ни одного — тематическое приглашение оставить первый
    if (!allData.length) {
      grid.innerHTML =
        '<div class="empty-state">' +
          '<svg class="empty-state-icon" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M2 15c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/>' +
            '<path d="M2 19c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/>' +
            '<path d="M12 3v9M8 8l4-5 4 5"/>' +
          '</svg>' +
          '<p class="empty-state-title">На воде пока тихо</p>' +
          '<p>Отзывов ещё нет — будьте первым, кто расскажет о своём сплаве.</p>' +
          '<a href="review.html" class="btn-primary" style="margin-top:1.4rem;">Оставить первый отзыв</a>' +
        '</div>';
      return;
    }

    if (!data || !data.length) {
      grid.innerHTML = '<div class="empty-state"><p>По этому фильтру отзывов пока нет.</p></div>';
      return;
    }
    grid.innerHTML = data.map(function (rv) {
      var isOwn = currentUserId && rv.user_id === currentUserId;
      return '<div class="review-card' + (isOwn ? ' own' : '') + '" data-id="' + esc(rv.id) + '">' +
        '<div class="review-quote">\u201c</div>' +
        (rv.tour ? '<p class="review-tour-tag">' + esc(riverTag(rv.tour)) + '</p>' : '') +
        '<p class="review-text">' + esc(rv.body) + '</p>' +
        '<div class="review-author">' +
          (avatarMap[rv.user_id]
            ? '<div class="author-avatar"><img src="' + esc(avatarMap[rv.user_id]) + '" alt=""></div>'
            : '<div class="author-avatar">' + initials(rv.user_name, rv.user_surname) + '</div>') +
          '<div>' +
            '<p class="author-name">' + esc(rv.user_name) + ' ' + esc(rv.user_surname) + '</p>' +
            '<p class="author-date">' + fmtDate(rv.created_at) + '</p>' +
            '<p class="stars">' + starsStr(rv.stars) + '</p>' +
          '</div>' +
        '</div>' +
        (isOwn ? '<div class="review-own-bar"><button class="btn-delete-review" data-delete-id="' + esc(rv.id) + '">Удалить отзыв</button></div>' : '') +
      '</div>';
    }).join('');
  }

  var allData = [];
  var currentFilter = 'all';
  var currentSort = 'new';

  function applyFilterAndSort() {
    var filtered = allData.filter(function (rv) {
      if (currentFilter === 'all') return true;
      if (currentFilter === '5') return parseInt(rv.stars) === 5;
      if (currentFilter === '4') return parseInt(rv.stars) === 4;
      if (currentFilter === '3') return parseInt(rv.stars) === 3;
      if (currentFilter === '1-2') return parseInt(rv.stars) <= 2;
      return true;
    });

    filtered.sort(function (a, b) {
      if (currentSort === 'new')          return new Date(b.created_at) - new Date(a.created_at);
      if (currentSort === 'old')          return new Date(a.created_at) - new Date(b.created_at);
      if (currentSort === 'rating-desc')  return ((b.likes||0)-(b.dislikes||0)) - ((a.likes||0)-(a.dislikes||0));
      if (currentSort === 'rating-asc')   return ((a.likes||0)-(a.dislikes||0)) - ((b.likes||0)-(b.dislikes||0));
      if (currentSort === 'stars-desc')   return (b.stars||0) - (a.stars||0);
      if (currentSort === 'stars-asc')    return (a.stars||0) - (b.stars||0);
      return 0;
    });

    renderCards(filtered);
  }

  // Свои выпадашки вместо системных <select> — открытие/закрытие,
  // выбор пункта, закрытие по клику вне и по Escape.
  function initDropdown(ddId, onSelect) {
    var dd      = document.getElementById(ddId);
    var trigger = dd.querySelector('.dd-trigger');
    var valueEl = dd.querySelector('.dd-value');
    var options = dd.querySelectorAll('.dd-option');

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !dd.classList.contains('open');
      document.querySelectorAll('.dd.open').forEach(function (d) { d.classList.remove('open'); });
      if (willOpen) dd.classList.add('open');
    });

    options.forEach(function (opt) {
      opt.addEventListener('click', function () {
        options.forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        valueEl.textContent = opt.textContent;
        dd.classList.remove('open');
        onSelect(opt.dataset.value);
      });
    });
  }

  initDropdown('star-filter-dd', function (value) {
    currentFilter = value;
    applyFilterAndSort();
  });

  initDropdown('sort-dd', function (value) {
    currentSort = value;
    applyFilterAndSort();
  });

  // Закрыть любую открытую выпадашку по клику вне неё или по Escape
  document.addEventListener('click', function () {
    document.querySelectorAll('.dd.open').forEach(function (d) { d.classList.remove('open'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.dd.open').forEach(function (d) { d.classList.remove('open'); });
    }
  });

  // ─── Delete review ───────────────────────────────────────
  var pendingDeleteId = null;
  var overlay = document.getElementById('confirm-overlay');
  var cancelBtn = document.getElementById('confirm-cancel');
  var confirmBtn = document.getElementById('confirm-delete');

  document.getElementById('reviews-grid').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-delete-id]');
    if (!btn) return;
    pendingDeleteId = btn.dataset.deleteId;
    overlay.classList.add('open');
  });

  cancelBtn.addEventListener('click', function () {
    pendingDeleteId = null;
    overlay.classList.remove('open');
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      pendingDeleteId = null;
      overlay.classList.remove('open');
    }
  });

  confirmBtn.addEventListener('click', async function () {
    if (!pendingDeleteId) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Удаляем…';

    try {
      var sbClient = window.__sb;
      var result = await sbClient.from('reviews').delete().eq('id', pendingDeleteId);

      if (result.error) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Удалить';
        alert('Не удалось удалить отзыв: ' + result.error.message);
        return;
      }

      // Убираем из локальных данных и перерисовываем
      allData = allData.filter(function (rv) { return rv.id !== pendingDeleteId; });
      document.getElementById('total-count').textContent = allData.length;
      applyFilterAndSort();
      writeReviewsCache(allData, avatarMap);

      overlay.classList.remove('open');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Удалить';
      pendingDeleteId = null;
    } catch (e) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Удалить';
      alert('Не удалось удалить отзыв. Попробуйте позже.');
    }
  });

  var REVIEWS_CACHE_KEY = 'sb_reviews_cache_v1';

  function readReviewsCache() {
    try {
      var raw = localStorage.getItem(REVIEWS_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeReviewsCache(data, avatars) {
    try {
      localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify({ data: data, avatars: avatars }));
    } catch (e) { /* приватный режим/квота — просто без кэша */ }
  }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }

  // Load data
  (async function () {
    // 1) Если есть кэш с прошлого визита — рисуем сразу же, не дожидаясь
    //    сети. Свежие данные подтянутся следом и тихо заменят собой кэш.
    var cached = readReviewsCache();
    var paintedFromCache = false;
    if (cached && cached.data) {
      allData = cached.data;
      avatarMap = cached.avatars || {};
      document.getElementById('total-count').textContent = allData.length;
      applyFilterAndSort();
      paintedFromCache = true;
    }

    try {
      var SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
      var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
      var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      window.__sb = sb; // используется обработчиком удаления ниже

      // Узнаём, залогинен ли пользователь — чтобы пометить его отзывы
      // и показать кнопку "Удалить" только на них.
      try {
        var sessionResult = await withTimeout(sb.auth.getSession(), 8000);
        if (sessionResult.data && sessionResult.data.session) {
          currentUserId = sessionResult.data.session.user.id;
        }
      } catch (e) {
        // не залогинен — это нормально, просто не показываем кнопки удаления
      }

      var result = await withTimeout(sb.from('reviews').select('*'), 8000);

      if (result.error || !result.data) throw new Error(result.error ? result.error.message : 'no data');

      allData = result.data;

      // Отдельным пакетным запросом подтягиваем фото авторов отзывов
      // (в самой таблице reviews фото не хранится — только имя/фамилия).
      try {
        var authorIds = Array.from(new Set(allData.map(function (rv) { return rv.user_id; }).filter(Boolean)));
        if (authorIds.length) {
          var avRes = await withTimeout(sb.from('public_profiles').select('id, avatar_url').in('id', authorIds), 8000);
          if (avRes.data) {
            avRes.data.forEach(function (p) {
              if (p.avatar_url) avatarMap[p.id] = p.avatar_url;
            });
          }
        }
      } catch (e) {
        // Не критично — просто покажем инициалы вместо фото
      }

      document.getElementById('total-count').textContent = allData.length;
      applyFilterAndSort();
      writeReviewsCache(allData, avatarMap);
    } catch (e) {
      console.error('reviews load failed:', e);
      // Если уже показали кэш — тихо оставляем как есть, не пугаем ошибкой
      if (!paintedFromCache) {
        document.getElementById('reviews-grid').innerHTML =
          '<div class="empty-state">' +
            '<p>Не получилось загрузить отзывы. Проверьте интернет-соединение.</p>' +
            '<button class="btn-primary" style="margin-top:1.2rem;border:none;cursor:pointer;" onclick="location.reload()">Повторить</button>' +
          '</div>';
      }
    }
  }());
}());
