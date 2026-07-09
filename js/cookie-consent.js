/* Баннер согласия на cookies / localStorage.
   — Компактный вид (карточка снизу-слева, не полная полоса).
   — Три кнопки: «Принять все», «Настроить», «Только необходимые».
   — «Настроить» открывает модальное окно с переключателями категорий.
   — Выбор сохраняется в localStorage и РЕАЛЬНО влияет на поведение сайта:
     js/site-tracker.js читает его и включает/выключает сбор аналитики,
     а не просто "красиво спрашивает и ничего не делает с ответом".
   — Согласие версионируется и имеет срок действия (12 месяцев) — если
     категории/текст поменяются или срок истечёт, баннер спросит снова.
   — В любой момент решение можно изменить: после выбора внизу экрана
     остаётся маленькая ссылка «Cookies», открывающая те же настройки.
   — Все стили инжектируются инлайн, не зависят от CSS хост-страницы. */
(function () {
  'use strict';

  var STORAGE_KEY = 'splav_cookie_consent';

  // Увеличивайте CONSENT_VERSION, если поменяете набор категорий или их
  // описание, — старое согласие перестанет засчитываться и баннер покажется
  // заново (это и есть "полный функционал" с юридической стороны: нельзя
  // молча продолжать считать старое согласие действующим для новых практик).
  var CONSENT_VERSION = 2;

  // Через 12 месяцев просим подтвердить выбор заново — общепринятая практика
  // для cookie-согласий (аналогично рекомендациям по GDPR), даже если для
  // 152-ФЗ формально нет фиксированного срока.
  var CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

  function getConsent() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
    if (!raw || typeof raw !== 'object') return null;
    if (raw.version !== CONSENT_VERSION) return null;
    if (!raw.ts || (Date.now() - raw.ts) > CONSENT_TTL_MS) return null;
    return raw;
  }

  function setConsent(categories) {
    var val = {
      necessary: true,               // необходимые cookies нельзя отключить — согласие не требуется
      analytics: !!categories.analytics,
      all: !!categories.analytics,
      version: CONSENT_VERSION,
      ts: Date.now()
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch (e) {}
    // Оповещаем остальной сайт (например, site-tracker.js) о новом выборе —
    // чтобы аналитика включалась/выключалась сразу, без перезагрузки страницы.
    try {
      document.dispatchEvent(new CustomEvent('splav:consent-changed', { detail: val }));
    } catch (e) {}
    return val;
  }

  function hasAnalyticsConsent() {
    var c = getConsent();
    return !!(c && c.analytics);
  }

  // Небольшой публичный API — на случай, если другому скрипту (сейчас или
  // в будущем) понадобится проверить согласие или открыть настройки.
  window.splavConsent = {
    get: getConsent,
    hasAnalytics: hasAnalyticsConsent,
    openSettings: function () { showModal(); }
  };

  function injectStyles() {
    if (document.getElementById('cookie-consent-styles')) return;
    var s = document.createElement('style');
    s.id = 'cookie-consent-styles';
    s.textContent = [
      /* ── Карточка баннера ── */
      '#ck-banner {',
      '  position: fixed; bottom: 1.5rem; left: 1.5rem; z-index: 9998;',
      '  max-width: 380px; width: calc(100vw - 3rem);',
      '  background: #1a2f2c; color: #f5f0e8;',
      '  border-radius: 12px;',
      '  padding: 1.25rem 1.4rem 1.1rem;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.28);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;',
      '  transform: translateY(calc(100% + 2.5rem)); opacity: 0;',
      '  transition: transform 0.38s cubic-bezier(.22,.68,0,1.2), opacity 0.3s ease;',
      '}',
      '#ck-banner.ck-show { transform: translateY(0); opacity: 1; }',

      '#ck-banner p {',
      '  margin: 0 0 0.9rem; font-size: 0.83rem; line-height: 1.55; color: #ddd8cf;',
      '}',
      '#ck-banner a { color: #a8d8e8; text-decoration: underline; }',
      '#ck-banner a:hover { color: #c4e8f4; }',

      '#ck-banner .ck-actions {',
      '  display: flex; flex-direction: column; gap: 0.5rem;',
      '}',
      '#ck-banner .ck-row {',
      '  display: flex; gap: 0.5rem;',
      '}',
      '#ck-banner button {',
      '  font-family: inherit; font-size: 0.8rem; font-weight: 600;',
      '  padding: 0.55rem 1rem; border-radius: 6px; cursor: pointer;',
      '  border: 1.5px solid transparent;',
      '  transition: background 0.18s, border-color 0.18s, color 0.18s;',
      '  white-space: nowrap; flex: 1;',
      '}',
      '#ck-banner .ck-accept {',
      '  background: #4a9db5; color: #fff; border-color: #4a9db5;',
      '}',
      '#ck-banner .ck-accept:hover { background: #3d8fa6; border-color: #3d8fa6; }',
      '#ck-banner .ck-settings {',
      '  background: transparent; color: #f5f0e8; border-color: rgba(245,240,232,0.3);',
      '}',
      '#ck-banner .ck-settings:hover { background: rgba(255,255,255,0.07); }',
      '#ck-banner .ck-necessary {',
      '  background: transparent; color: #9b9589; border: none; font-size: 0.75rem;',
      '  font-weight: 400; text-align: center; padding: 0.25rem; text-decoration: underline;',
      '  text-underline-offset: 2px; cursor: pointer;',
      '}',
      '#ck-banner .ck-necessary:hover { color: #c4bfb8; }',

      /* ── Модальное окно настройки ── */
      '#ck-modal-overlay {',
      '  position: fixed; inset: 0; z-index: 9999;',
      '  background: rgba(10,20,18,0.6);',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 1rem;',
      '  opacity: 0; transition: opacity 0.25s;',
      '}',
      '#ck-modal-overlay.ck-show { opacity: 1; }',
      '#ck-modal {',
      '  background: #fff; border-radius: 14px;',
      '  padding: 1.8rem; max-width: 440px; width: 100%;',
      '  box-shadow: 0 20px 60px rgba(0,0,0,0.25);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;',
      '  max-height: calc(100vh - 2rem); overflow-y: auto;',
      '}',
      '#ck-modal h3 {',
      '  margin: 0 0 0.4rem; font-size: 1.05rem; color: #1a2f2c;',
      '}',
      '#ck-modal .ck-modal-sub {',
      '  font-size: 0.8rem; color: #6b6560; margin: 0 0 1.4rem; line-height: 1.5;',
      '}',
      '#ck-modal .ck-modal-sub a { color: #4a9db5; }',
      '.ck-category {',
      '  display: flex; align-items: flex-start; gap: 1rem;',
      '  padding: 1rem 0; border-top: 1px solid #f0ece6;',
      '}',
      '.ck-category:first-of-type { border-top: none; padding-top: 0; }',
      '.ck-category-text { flex: 1; }',
      '.ck-category-title {',
      '  font-size: 0.88rem; font-weight: 600; color: #1a2f2c; margin-bottom: 0.2rem;',
      '}',
      '.ck-category-desc { font-size: 0.78rem; color: #6b6560; line-height: 1.45; }',

      /* Переключатель toggle */
      '.ck-toggle { flex-shrink: 0; margin-top: 2px; }',
      '.ck-toggle input { display: none; }',
      '.ck-toggle label {',
      '  display: block; width: 40px; height: 22px;',
      '  background: #d0cbc4; border-radius: 11px; cursor: pointer;',
      '  position: relative; transition: background 0.2s;',
      '}',
      '.ck-toggle label::after {',
      '  content: ""; position: absolute;',
      '  top: 3px; left: 3px; width: 16px; height: 16px;',
      '  background: #fff; border-radius: 50%;',
      '  transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);',
      '}',
      '.ck-toggle input:checked + label { background: #4a9db5; }',
      '.ck-toggle input:checked + label::after { transform: translateX(18px); }',
      '.ck-toggle input:disabled + label { opacity: 0.5; cursor: default; }',

      '.ck-modal-btns {',
      '  display: flex; gap: 0.6rem; margin-top: 1.5rem; flex-wrap: wrap;',
      '}',
      '.ck-modal-btns button {',
      '  font-family: inherit; font-size: 0.83rem; font-weight: 600;',
      '  padding: 0.65rem 1.2rem; border-radius: 8px; cursor: pointer;',
      '  border: 1.5px solid transparent; flex: 1; min-width: 120px;',
      '  transition: background 0.18s, border-color 0.18s;',
      '}',
      '.ck-modal-save {',
      '  background: #4a9db5; color: #fff; border-color: #4a9db5;',
      '}',
      '.ck-modal-save:hover { background: #3d8fa6; }',
      '.ck-modal-accept-all {',
      '  background: transparent; color: #1a2f2c; border-color: #d0cbc4;',
      '}',
      '.ck-modal-accept-all:hover { background: #f5f0e8; }',

      /* ── Постоянная ссылка "Cookies" для изменения решения позже ── */
      '#ck-reopen {',
      '  position: fixed; bottom: 1rem; left: 1rem; z-index: 9997;',
      '  display: flex; align-items: center; gap: 0.35rem;',
      '  background: rgba(26,47,44,0.82); color: #f5f0e8;',
      '  border: none; border-radius: 20px;',
      '  padding: 0.45rem 0.9rem 0.45rem 0.7rem;',
      '  font-family: inherit; font-size: 0.72rem; font-weight: 600;',
      '  cursor: pointer; opacity: 0.55;',
      '  transition: opacity 0.2s, background 0.2s;',
      '}',
      '#ck-reopen:hover { opacity: 1; background: #1a2f2c; }',
      '#ck-reopen svg { width: 13px; height: 13px; flex-shrink: 0; }',

      '@media (max-width: 480px) {',
      '  #ck-banner { bottom: 1rem; left: 1rem; width: calc(100vw - 2rem); }',
      '  #ck-modal { padding: 1.4rem; }',
      '  #ck-reopen { bottom: 0.75rem; left: 0.75rem; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── Показ баннера ── */
  function showBanner() {
    injectStyles();
    hideReopenLink();

    var banner = document.createElement('div');
    banner.id = 'ck-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Согласие на использование cookies');
    banner.innerHTML =
      '<p>Мы используем cookies и localStorage для корректной работы сайта.' +
      ' Вы можете принять все или выбрать необходимые. Решение можно изменить' +
      ' в любой момент. <a href="privacy.html">Подробнее</a></p>' +
      '<div class="ck-actions">' +
        '<div class="ck-row">' +
          '<button type="button" class="ck-accept">Принять все</button>' +
          '<button type="button" class="ck-settings">Настроить</button>' +
        '</div>' +
        '<button type="button" class="ck-necessary">Только необходимые</button>' +
      '</div>';

    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('ck-show');
      });
    });

    function hideBanner() {
      banner.classList.remove('ck-show');
      setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
        showReopenLink();
      }, 420);
    }

    banner.querySelector('.ck-accept').addEventListener('click', function () {
      setConsent({ analytics: true });
      hideBanner();
    });

    banner.querySelector('.ck-necessary').addEventListener('click', function () {
      setConsent({ analytics: false });
      hideBanner();
    });

    banner.querySelector('.ck-settings').addEventListener('click', function () {
      showModal(hideBanner);
    });
  }

  /* ── Модальное окно настройки ── */
  function showModal(onClose) {
    injectStyles();

    // Предзаполняем переключатель текущим сохранённым выбором, если он есть —
    // при повторном открытии через ссылку "Cookies" человек должен видеть
    // своё прежнее решение, а не сброшенную форму.
    var existing = getConsent();
    var analyticsChecked = existing ? !!existing.analytics : false;

    var overlay = document.createElement('div');
    overlay.id = 'ck-modal-overlay';

    overlay.innerHTML =
      '<div id="ck-modal" role="dialog" aria-modal="true" aria-label="Настройка cookies">' +
        '<h3>Настройка cookies</h3>' +
        '<p class="ck-modal-sub">Выберите, какие cookies вы разрешаете.' +
        ' Подробности — в <a href="privacy.html">Политике конфиденциальности</a>.</p>' +

        '<div class="ck-category">' +
          '<div class="ck-category-text">' +
            '<div class="ck-category-title">Необходимые</div>' +
            '<div class="ck-category-desc">Обеспечивают авторизацию и базовую работу сайта.' +
            ' Без них сайт не работает. Нельзя отключить.</div>' +
          '</div>' +
          '<div class="ck-toggle">' +
            '<input type="checkbox" id="ck-toggle-necessary" checked disabled>' +
            '<label for="ck-toggle-necessary"></label>' +
          '</div>' +
        '</div>' +

        '<div class="ck-category">' +
          '<div class="ck-category-text">' +
            '<div class="ck-category-title">Аналитика</div>' +
            '<div class="ck-category-desc">Анонимный ID посетителя и статистика просмотренных' +
            ' страниц — помогают понять, как люди пользуются сайтом. Не содержат имени' +
            ' или email и не передаются рекламным сетям. Можно отключить в любой момент —' +
            ' сбор прекратится сразу же.</div>' +
          '</div>' +
          '<div class="ck-toggle">' +
            '<input type="checkbox" id="ck-toggle-analytics"' + (analyticsChecked ? ' checked' : '') + '>' +
            '<label for="ck-toggle-analytics"></label>' +
          '</div>' +
        '</div>' +

        '<div class="ck-modal-btns">' +
          '<button type="button" class="ck-modal-save">Сохранить выбор</button>' +
          '<button type="button" class="ck-modal-accept-all">Принять все</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('ck-show');
      });
    });

    function hideModal() {
      overlay.classList.remove('ck-show');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 280);
    }

    // Закрытие по клику на оверлей (вне карточки) — расцениваем как отказ
    // от изменений, ничего не сохраняем.
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideModal();
    });

    // Закрытие по Escape
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        hideModal();
        document.removeEventListener('keydown', escHandler);
      }
    });

    overlay.querySelector('.ck-modal-save').addEventListener('click', function () {
      var analytics = overlay.querySelector('#ck-toggle-analytics').checked;
      setConsent({ analytics: analytics });
      hideModal();
      showReopenLink();
      if (onClose) onClose();
    });

    overlay.querySelector('.ck-modal-accept-all').addEventListener('click', function () {
      setConsent({ analytics: true });
      hideModal();
      showReopenLink();
      if (onClose) onClose();
    });
  }

  /* ── Постоянная маленькая ссылка для изменения решения позже ──
     Требование "полного функционала" с юридической стороны — согласие
     должно быть так же легко отозвать/изменить, как и дать. */
  function showReopenLink() {
    if (document.getElementById('ck-reopen')) return;
    injectStyles();
    var btn = document.createElement('button');
    btn.id = 'ck-reopen';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Изменить настройки cookies');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="0.8" fill="currentColor"/>' +
        '<circle cx="15" cy="10" r="0.8" fill="currentColor"/><circle cx="10" cy="15" r="0.8" fill="currentColor"/>' +
      '</svg> Cookies';
    document.body.appendChild(btn);
    btn.addEventListener('click', function () { showModal(); });
  }

  function hideReopenLink() {
    var el = document.getElementById('ck-reopen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!getConsent()) {
      showBanner();
    } else {
      showReopenLink();
    }
  });
})();
