(function () {
  'use strict';

  /* ── Утилита экранирования XSS ── */
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /* ── Галерея ── */
  var galleryLightbox = document.getElementById('gallery-lightbox');
  var lightboxClose   = document.getElementById('lightbox-close');
  var galleryOpenBtn  = document.getElementById('gallery-open-btn');

  function openGallery() {
    galleryLightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lightboxClose.focus();
  }

  function closeGallery() {
    galleryLightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (galleryOpenBtn) {
    galleryOpenBtn.addEventListener('click', openGallery);
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeGallery);
  }

  if (galleryLightbox) {
    galleryLightbox.addEventListener('click', function (e) {
      if (e.target === galleryLightbox) closeGallery();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeGallery();
  });

  /* ── Валидация формы ── */
  var submitBtn = document.getElementById('form-submit');

  function setError(rowId, show) {
    var row = document.getElementById(rowId);
    if (!row) return;
    if (show) {
      row.classList.add('has-error');
    } else {
      row.classList.remove('has-error');
    }
  }

  function validatePhone(val) {
    return /^[\d\s\+\(\)\-]{7,20}$/.test(val.trim());
  }

  function validateDate(val) {
    if (!val) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(val) >= today;
  }

  /* ── Supabase + EmailJS клиенты для формы заявки ── */
  var SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
  var sbBooking = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ── Заполняем select «Сплав» данными из таблицы schedule ── */
  function fmtTourPrice(price) {
    var n = Number(price);
    if (price === null || price === undefined || isNaN(n)) return '';
    return ' — ' + n.toLocaleString('ru-RU') + ' ₽';
  }

  function fmtTourDate(dateStr, dateEndStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return '';
    var startLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (!dateEndStr || dateEndStr === dateStr) return startLabel;
    var e = new Date(dateEndStr + 'T00:00:00');
    if (isNaN(e) || e.getTime() === d.getTime()) return startLabel;
    if (e.getMonth() === d.getMonth() && e.getFullYear() === d.getFullYear()) {
      return d.getDate() + '–' + e.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }
    return startLabel + ' – ' + e.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  (async function loadTourOptions() {
    var tourSelect = document.getElementById('field-tour');
    if (!tourSelect) return;

    try {
      var todayStr = new Date();
      todayStr.setHours(0, 0, 0, 0);
      var todayISO = todayStr.getFullYear() + '-' +
        String(todayStr.getMonth() + 1).padStart(2, '0') + '-' +
        String(todayStr.getDate()).padStart(2, '0');

      var result = await sbBooking
        .from('schedule')
        .select('*')
        .gte('trip_date', todayISO)
        .order('trip_date', { ascending: true });

      if (result.error) throw new Error(result.error.message);

      var rows = result.data || [];
      if (!rows.length) return; // оставляем только заглушку «— Выберите сплав —»

      rows.forEach(function (row) {
        var dateLabel = fmtTourDate(row.trip_date, row.trip_date_end);
        var label = row.river + ' (' + row.days + ' дн., ' + row.format + ')' +
          (dateLabel ? ', ' + dateLabel : '') +
          fmtTourPrice(row.price);
        var opt = document.createElement('option');
        opt.value = row.river + ' — ' + dateLabel + fmtTourPrice(row.price);
        opt.textContent = label;
        opt.dataset.tripDate = row.trip_date || '';
        opt.dataset.scheduleId = row.id != null ? row.id : '';
        opt.dataset.price = (row.price !== null && row.price !== undefined) ? row.price : '';
        tourSelect.appendChild(opt);
      });

      // При выборе сплава — подставляем дату заезда в поле «Желаемая дата»
      tourSelect.addEventListener('change', function () {
        var selected = tourSelect.options[tourSelect.selectedIndex];
        var dateField = document.getElementById('field-date');
        if (dateField && selected && selected.dataset.tripDate) {
          dateField.value = selected.dataset.tripDate;
        }
      });
    } catch (e) {
      console.error('Failed to load schedule for tour select:', e);
      // Если не удалось загрузить — select останется с заглушкой
    }
  })();

  var EMAILJS_PUBLIC_KEY  = 'PvM9tEMi9dgxAUU2w';
  var EMAILJS_SERVICE_ID  = 'service_mq1ehin';
  var EMAILJS_BOOKING_TEMPLATE_ID = 'template_uwcopf6';
  if (window.emailjs) emailjs.init(EMAILJS_PUBLIC_KEY);

  /* ── Результат оплаты (редирект от ЮKassa обратно на сайт) ── */
  (function handlePaymentRedirect() {
    var params = new URLSearchParams(window.location.search);
    var payment = params.get('payment');
    var bookingId = params.get('booking');
    if (payment !== 'return' || !bookingId) return;

    var bookingSection = document.getElementById('booking');

    function showBanner(kind, text) {
      if (!bookingSection) return;
      var banner = document.createElement('div');
      banner.style.cssText = 'margin-bottom:1.5rem; padding:1rem 1.3rem; border-radius:10px; font-size:0.92rem; font-weight:500;';
      if (kind === 'success') {
        banner.style.background = 'var(--forest)';
        banner.style.color = '#fff';
      } else if (kind === 'fail') {
        banner.style.background = '#fdece9';
        banner.style.color = '#a03020';
      } else {
        banner.style.background = '#fff6e0';
        banner.style.color = '#8a6d3b';
      }
      banner.textContent = text;
      bookingSection.parentNode.insertBefore(banner, bookingSection);
      bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Убираем ?payment=...&booking=... из адресной строки сразу,
    // чтобы баннер не всплывал повторно при обновлении страницы.
    params.delete('payment');
    params.delete('booking');
    var newSearch = params.toString();
    var newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);

    showBanner('pending', 'Проверяем статус оплаты…');

    sbBooking.functions.invoke('payment-status', { body: { booking_id: bookingId } })
      .then(function (result) {
        if (bookingSection && bookingSection.previousElementSibling) {
          bookingSection.previousElementSibling.remove();
        }
        var status = result.data && result.data.status;
        if (status === 'paid') {
          showBanner('success', 'Оплата прошла успешно! Мы получили вашу заявку и скоро свяжемся с вами.');
        } else if (status === 'failed') {
          showBanner('fail', 'Оплата не прошла. Попробуйте ещё раз или свяжитесь с нами напрямую.');
        } else {
          showBanner('pending', 'Платёж обрабатывается. Мы свяжемся с вами, как только он подтвердится.');
        }
      })
      .catch(function () {
        if (bookingSection && bookingSection.previousElementSibling) {
          bookingSection.previousElementSibling.remove();
        }
        showBanner('pending', 'Не удалось проверить статус оплаты. Мы свяжемся с вами, чтобы уточнить.');
      });
  })();

  if (submitBtn) {
    submitBtn.addEventListener('click', async function () {
      var name    = document.getElementById('field-name').value.trim();
      var phone   = document.getElementById('field-phone').value.trim();
      var tour    = document.getElementById('field-tour').value;
      var date    = document.getElementById('field-date').value;
      var people  = parseInt(document.getElementById('field-people').value, 10);
      var commentEl = document.getElementById('field-comment');
      var comment = commentEl ? commentEl.value.trim() : '';

      var ok = true;

      setError('row-name',   !name);                          if (!name)                        ok = false;
      setError('row-phone',  !validatePhone(phone));          if (!validatePhone(phone))         ok = false;
      setError('row-tour',   !tour);                          if (!tour)                         ok = false;
      setError('row-date',   date && !validateDate(date));    if (date && !validateDate(date))   ok = false;
      setError('row-people', people && (people < 1 || people > 50));
      if (people && (people < 1 || people > 50)) ok = false;

      if (!ok) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправляем…';

      var tourSelectEl = document.getElementById('field-tour');
      var selectedOpt  = tourSelectEl.options[tourSelectEl.selectedIndex];
      var scheduleId   = selectedOpt && selectedOpt.dataset.scheduleId ? selectedOpt.dataset.scheduleId : null;
      var priceRaw     = selectedOpt && selectedOpt.dataset.price ? selectedOpt.dataset.price : '';
      var price        = priceRaw !== '' ? Number(priceRaw) : null;

      // Письмо — это уведомление "для красоты"; если оно не дойдёт
      // (сбой EmailJS, нет сети до их API и т.п.), заявка всё равно
      // должна считаться принятой.
      function sendBookingEmail(extra) {
        if (!window.emailjs) return;
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_BOOKING_TEMPLATE_ID, Object.assign({
          client_name: name,
          client_phone: phone,
          tour: tour,
          trip_date: date || 'не указана',
          people: people || 'не указано',
          comment: comment || '—'
        }, extra || {})).catch(function (mailErr) {
          console.error('Booking email notification failed:', mailErr);
        });
      }

      // Если у выбранного тура известна цена — полная предоплата через ЮKassa.
      if (price && price > 0) {
        try {
          var payResult = await sbBooking.functions.invoke('create-payment', {
            body: {
              name: name,
              phone: phone,
              tour: tour,
              trip_date: date || null,
              people: people || null,
              comment: comment || null,
              schedule_id: scheduleId,
              amount: price
            }
          });

          if (payResult.error) {
            throw new Error(payResult.error.message || 'Не удалось создать платёж');
          }
          var payData = payResult.data;
          if (!payData || !payData.paymentUrl) {
            throw new Error((payData && payData.error) || 'Сервер не вернул ссылку на оплату');
          }

          sendBookingEmail({ payment: 'Ожидает оплаты, ' + price.toLocaleString('ru-RU') + ' ₽' });

          submitBtn.textContent = 'Переходим к оплате…';
          window.location.href = payData.paymentUrl;
          return; // уходим на страницу оплаты ЮKassa
        } catch (e) {
          console.error('Payment init failed:', e);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Отправить заявку';
          alert('Не удалось перейти к оплате. Попробуйте позже или позвоните нам напрямую.');
          return;
        }
      }

      // Цена не указана (в расписании этому туру не проставили price) —
      // работаем по-старому: просто заявка без предоплаты.
      try {
        var insertResult = await sbBooking.from('bookings').insert({
          name: name,
          phone: phone,
          tour: tour,
          trip_date: date || null,
          people: people || null,
          comment: comment || null,
          schedule_id: scheduleId
        });

        if (insertResult.error) {
          throw new Error(insertResult.error.message);
        }

        sendBookingEmail();

        submitBtn.textContent = 'Заявка отправлена ✓';
        submitBtn.style.background = 'var(--forest)';
      } catch (e) {
        console.error('Booking insert failed:', e);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить заявку';
        alert('Не удалось отправить заявку. Попробуйте позже или позвоните нам напрямую.');
      }
    });
  }

  /* ── Supabase: отзывы ── */
  (async function () {
    try {
      var sb = sbBooking; // тот же клиент, что и для формы заявки выше

      var result = await sb
        .from('reviews')
        .select('*')
        .eq('stars', 5);
      console.log('result:', result);

      if (result.error || !result.data || !result.data.length) return;

      // Сортируем по рейтингу (лайки − дизлайки), берём топ-3
      result.data.sort(function (a, b) {
        var ratingA = (a.likes || 0) - (a.dislikes || 0);
        var ratingB = (b.likes || 0) - (b.dislikes || 0);
        if (ratingB !== ratingA) return ratingB - ratingA;
        // При равном рейтинге — сначала новые
        return new Date(b.created_at) - new Date(a.created_at);
      });
      result.data = result.data.slice(0, 3);

      // Фото авторов в самой таблице reviews не хранится — подтягиваем
      // отдельным запросом через public_profiles (id + avatar_url, без email).
      var avatarMap = {};
      try {
        var authorIds = Array.from(new Set(result.data.map(function (rv) { return rv.user_id; }).filter(Boolean)));
        if (authorIds.length) {
          var avRes = await sb.from('public_profiles').select('id, avatar_url').in('id', authorIds);
          if (avRes.data) {
            avRes.data.forEach(function (p) { if (p.avatar_url) avatarMap[p.id] = p.avatar_url; });
          }
        }
      } catch (e) {
        // Не критично — просто покажем инициалы вместо фото
      }

      var grid = document.getElementById('user-reviews-grid');
      var wrap = document.getElementById('user-reviews-wrap');

      function starsStr(n) {
        n = Math.min(5, Math.max(0, parseInt(n, 10) || 5));
        return '★'.repeat(n) + '☆'.repeat(5 - n);
      }
      function initials(a, b) {
        return (esc((a || '')[0] || '')).toUpperCase() +
               (esc((b || '')[0] || '')).toUpperCase();
      }
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
        return new Date(iso).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      }

      var html = result.data.map(function (rv) {
        return '<div class="review-card">' +
          '<div class="review-quote">\u201c</div>' +
          (rv.tour ? '<p style="font-family:\'Unbounded\',sans-serif;font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--river-light);margin-bottom:0.7rem;">' + esc(riverTag(rv.tour)) + '</p>' : '') +
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
        '</div>';
      }).join('');

      grid.innerHTML = html;
      wrap.style.display = 'block';
    } catch (e) {
      // Тихо игнорируем ошибки загрузки отзывов
    }
  }());

  /* ── Активный пункт меню при прокрутке + анимированный индикатор ── */
  (function () {
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav-desktop-menu a[data-nav]'));
    var indicator = document.getElementById('nav-indicator');
    if (!navLinks.length || !indicator) return;

    var sections = navLinks
      .map(function (a) {
        var el = document.getElementById(a.dataset.nav);
        return el ? { id: a.dataset.nav, el: el, link: a } : null;
      })
      .filter(Boolean);

    /* ── Позиционирование индикатора ── */
    function positionIndicator(link) {
      var rect = link.getBoundingClientRect();
      var navRect = link.closest('nav').getBoundingClientRect();
      return {
        left: rect.left - navRect.left,
        width: rect.width
      };
    }

    /* ── Анимация: растяжение → сжатие на目标 ── */
    var animFrame = null;

    function animateIndicator(fromPos, toPos) {
      if (animFrame) cancelAnimationFrame(animFrame);

      var startTime = null;
      var duration = 450;
      var movingRight = toPos.left > fromPos.left;

      function step(ts) {
        if (!startTime) startTime = ts;
        var t = Math.min((ts - startTime) / duration, 1);

        var left, width;

        if (t < 0.45) {
          // Фаза 1: передний край летит к цели, задний край остаётся — растяжение «назад»
          var p = t / 0.45;
          var ease = 1 - Math.pow(1 - p, 3);

          if (movingRight) {
            // Движение вправо: левый край (задний) на месте, правый (передний) устремляется вперёд
            left = fromPos.left;
            width = fromPos.width + (toPos.left + toPos.width - fromPos.left) * ease - fromPos.width * ease;
            // Упрощённо: левый фиксирован, правый = from.left + from.width → to.left + to.width
            var rightEdge = (fromPos.left + fromPos.width) + ((toPos.left + toPos.width) - (fromPos.left + fromPos.width)) * ease;
            width = rightEdge - left;
          } else {
            // Движение влево: правый край (задний) на месте, левый (передний) устремляется вперёд
            var rightEdge = fromPos.left + fromPos.width;
            left = fromPos.left + (toPos.left - fromPos.left) * ease;
            width = rightEdge - left;
          }
        } else {
          // Фаза 2: задний край догоняет передний, сжатие до целевой ширины
          var p = (t - 0.45) / 0.55;
          var ease = 1 - Math.pow(1 - p, 3);

          if (movingRight) {
            // Левый край догоняет: from.left → to.left
            left = fromPos.left + (toPos.left - fromPos.left) * ease;
            var rightEdge = toPos.left + toPos.width;
            width = rightEdge - left;
          } else {
            // Правый край догоняет: (from.left + from.width) → (to.left + to.width)
            var rightEdge = (fromPos.left + fromPos.width) + ((toPos.left + toPos.width) - (fromPos.left + fromPos.width)) * ease;
            left = toPos.left;
            width = rightEdge - left;
          }
        }

        indicator.style.left = left + 'px';
        indicator.style.width = width + 'px';

        if (t < 1) {
          animFrame = requestAnimationFrame(step);
        }
      }

      animFrame = requestAnimationFrame(step);
    }

    /* ── Установка активного состояния ── */
    var currentId = null;
    var scrollingTo = null; // id секции, куда прокручиваем — блокирует observer

    function setActive(id, skipAnimate) {
      if (id === currentId) return;
      currentId = id;

      var activeLink = null;
      navLinks.forEach(function (a) {
        var isActive = a.dataset.nav === id;
        a.classList.toggle('active', isActive);
        if (isActive) activeLink = a;
      });

      if (activeLink) {
        if (!indicator.dataset.init || skipAnimate) {
          var pos = positionIndicator(activeLink);
          indicator.style.left = pos.left + 'px';
          indicator.style.width = pos.width + 'px';
          indicator.dataset.init = '1';
        } else {
          var fromPos = { left: parseFloat(indicator.style.left) || 0, width: parseFloat(indicator.style.width) || 0 };
          var toPos = positionIndicator(activeLink);
          animateIndicator(fromPos, toPos);
        }
      }
    }

    if (!sections.length) return;

    /* ── Клик по ссылке — сразу прыгаем к цели, observer не двигает индикатор ── */
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        var targetId = this.dataset.nav;
        if (!targetId) return;
        scrollingTo = targetId;
        setActive(targetId);
        // Снимаем блокировку через 800мс — к этому моменту прокрутка завершится
        setTimeout(function () { scrollingTo = null; }, 800);
      });
    });

    /* ── Observer: реагирует только при обычной прокрутке, не при клике ── */
    var observer = new IntersectionObserver(function (entries) {
      if (scrollingTo) return; // прокрутка по клику — не трогаем индикатор
      var visible = entries.filter(function (en) { return en.isIntersecting; });
      if (!visible.length) return;
      visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      var topMost = visible[0].target.id;
      setActive(topMost);
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (s) { observer.observe(s.el); });

    // Пока страница ещё не прокручена — активна "Главная"
    // Ждём загрузки шрифтов, чтобы индикатор встал по реальным размерам текста
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setActive('home'); });
    } else {
      setActive('home');
    }
  }());

}());
