/* Анонимный трекинг посещений сайта.
   Подключается на каждой публичной странице (index, auth, faq, reviews,
   review, privacy, chat, 404). Пишет событие визита в таблицу Supabase
   site_visits и периодически обновляет last_seen, чтобы посетитель
   засчитывался как «онлайн» в админке, пока активен на странице.

   ВАЖНО: работает только при согласии на аналитические cookies
   (см. js/cookie-consent.js, ключ localStorage splav_cookie_consent).
   Без согласия этот скрипт не создаёт даже анонимный ID посетителя и не
   отправляет ничего в Supabase. Согласие проверяется:
     1) сразу при загрузке страницы (если решение уже сохранено раньше);
     2) живьём по событию 'splav:consent-changed' — если человек разрешит
        аналитику через баннер/настройки прямо на этой же странице, сбор
        стартует без перезагрузки; если запретит — немедленно прекращается.

   Не требует другого подключённого скрипта — сам создаёт клиент Supabase,
   используя тот же anon-key, что и остальной сайт. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';

  var VISITOR_KEY = 'splav_visitor_id';
  var CONSENT_KEY = 'splav_cookie_consent';   // тот же ключ, что и в js/cookie-consent.js
  var CONSENT_VERSION = 2;                     // должен совпадать с CONSENT_VERSION в js/cookie-consent.js
  var CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
  var PING_INTERVAL_MS = 60 * 1000; // обновляем last_seen раз в минуту

  // Читаем согласие напрямую из localStorage, а не через window.splavConsent —
  // на большинстве страниц site-tracker.js подключён ДО cookie-consent.js,
  // так что при первом запуске публичный API ещё не готов. Логика проверки
  // (версия + срок действия) продублирована и должна оставаться в синхроне
  // с getConsent() в js/cookie-consent.js.
  function hasAnalyticsConsent() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(CONSENT_KEY)); } catch (e) { return false; }
    if (!raw || typeof raw !== 'object') return false;
    if (raw.version !== CONSENT_VERSION) return false;
    if (!raw.ts || (Date.now() - raw.ts) > CONSENT_TTL_MS) return false;
    return raw.analytics === true;
  }

  function getVisitorId() {
    try {
      var id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage недоступен (приватный режим и т.п.) — используем
      // временный ID на время сессии, без сохранения.
      if (!window.__splavTempVisitorId) {
        window.__splavTempVisitorId = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      }
      return window.__splavTempVisitorId;
    }
  }

  // Supabase JS грузится через CDN на других страницах (booking/admin),
  // но трекер должен работать и там, где его ещё нет — подключаем сами,
  // если глобальная функция createClient отсутствует.
  function withSupabaseClient(callback) {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      callback(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
      return;
    }
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = function () {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        callback(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
      }
    };
    script.onerror = function () {
      // Сеть недоступна/CDN заблокирован — трекинг просто не сработает,
      // остальной сайт при этом не должен быть затронут.
    };
    document.head.appendChild(script);
  }

  var sbClient = null;
  var visitRecorded = false;
  var pingTimer = null;
  var visitorId = null;
  var page = null;

  // Запускает сбор (создаёт клиент, генерирует/читает visitor_id, пишет
  // событие визита) — но только если на момент вызова есть согласие.
  // Безопасно вызывать многократно: если клиент уже создан, повторный
  // вызов ничего не делает (визит на этой странице уже либо записан,
  // либо в процессе записи).
  function ensureTrackingStarted() {
    if (sbClient || !hasAnalyticsConsent()) return;

    withSupabaseClient(function (sb) {
      // Согласие могли отозвать, пока грузился Supabase SDK по сети —
      // перепроверяем перед тем, как реально что-то отправить.
      if (!hasAnalyticsConsent()) return;

      sbClient = sb;
      visitorId = getVisitorId();
      page = window.location.pathname.split('/').pop() || 'index.html';

      // ВАЖНО: не цепляем .select().single() после insert. Анонимной роли
      // сознательно не дан доступ на SELECT к site_visits (см. site_visits.sql —
      // читать может только authenticated), а .select() после insert просит
      // Supabase/PostgREST вернуть вставленную строку через RETURNING, который
      // фильтруется теми же RLS-политиками, что и обычный SELECT. Для анонима
      // это RETURNING не находит ни одной видимой строки, .single() требует
      // ровно одну и падает с ошибкой — из-за этого вставка либо откатывается,
      // либо просто не даёт нам id для дальнейших обновлений. Без .select()
      // достаточно только права на INSERT, которое анониму как раз дано.
      sb.from('site_visits')
        .insert({ visitor_id: visitorId, page: page })
        .then(function (res) {
          if (res && res.error) {
            console.error('[site-tracker] insert error:', res.error);
            return;
          }
          visitRecorded = true;
          console.log('[site-tracker] visit recorded, page=', page, 'visitor=', visitorId);
        })
        .catch(function (err) {
          console.error('[site-tracker] insert threw:', err);
        });

      if (!pingTimer) {
        pingTimer = setInterval(function () {
          if (document.hidden) return;
          ping();
        }, PING_INTERVAL_MS);
      }
    });
  }

  // Продлеваем last_seen без знания id строки: обновляем самую свежую
  // запись этого посетителя на этой странице (order по id — колонка
  // уникальна, PostgREST требует явный order на уникальной колонке при
  // limit в UPDATE). Это укладывается в существующую политику
  // "Anyone can update their own recent visit" (created_at < 30 минут)
  // и не требует прав на SELECT.
  // Проверка hasAnalyticsConsent() здесь — это и есть механизм немедленной
  // остановки сбора, если согласие отозвали: сама отправка просто перестаёт
  // происходить, дальнейшая логика ничего специально "выключать" не должна.
  function ping() {
    if (!sbClient || !visitRecorded || !hasAnalyticsConsent()) return;
    sbClient.from('site_visits')
      .update({ last_seen: new Date().toISOString() })
      .eq('visitor_id', visitorId)
      .eq('page', page)
      .order('id', { ascending: false })
      .limit(1)
      .then(function (res) {
        if (res && res.error) console.error('[site-tracker] ping error:', res.error);
      })
      .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureTrackingStarted();
  });

  // Сразу продлеваем при возврате на вкладку, не дожидаясь таймера.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) ping();
  });

  window.addEventListener('beforeunload', function () {
    if (pingTimer) clearInterval(pingTimer);
  });

  // Живая реакция на изменение согласия (баннер или настройки "Cookies"):
  // — разрешили аналитику прямо сейчас → стартуем сбор без перезагрузки;
  // — запретили → ничего специально останавливать не нужно: ping() и любой
  //   будущий вызов ensureTrackingStarted() сами проверяют hasAnalyticsConsent().
  document.addEventListener('splav:consent-changed', function () {
    ensureTrackingStarted();
  });
})();
