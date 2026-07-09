/* Мобильный бургер-навбар.
   — Определяет тип устройства (мобильный/планшет/десктоп) по user-agent
     и ширине экрана, добавляет класс на <html> для использования в CSS.
   — Поддерживает портретную и горизонтальную ориентацию:
     в landscape на мобильном меню компактнее (меньше padding, без overflow body).
   — Закрывает меню при клике на ссылку, оверлей, Escape, ресайз > 768px. */
(function () {
  'use strict';

  /* ── Определение типа устройства ── */
  var html = document.documentElement;

  function detectDevice() {
    var ua = navigator.userAgent || '';
    var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    var isTabletUA  = /iPad|Android(?!.*Mobile)/i.test(ua);
    var w = window.innerWidth;

    if (isMobileUA && !isTabletUA && w < 768) {
      html.classList.remove('device-tablet', 'device-desktop');
      html.classList.add('device-mobile');
    } else if (isTabletUA || (isMobileUA && w >= 768)) {
      html.classList.remove('device-mobile', 'device-desktop');
      html.classList.add('device-tablet');
    } else {
      html.classList.remove('device-mobile', 'device-tablet');
      html.classList.add('device-desktop');
    }
  }

  function detectOrientation() {
    var isLandscape = window.innerWidth > window.innerHeight;
    html.classList.toggle('orient-landscape', isLandscape);
    html.classList.toggle('orient-portrait', !isLandscape);
  }

  detectDevice();
  detectOrientation();

  window.addEventListener('resize', function () {
    detectDevice();
    detectOrientation();
  });

  /* ── Бургер-меню ── */
  document.addEventListener('DOMContentLoaded', function () {
    var navBurger    = document.getElementById('nav-burger');
    var navMenu      = document.getElementById('nav-menu');
    var navOverlay   = document.getElementById('nav-overlay');
    var navClose     = document.getElementById('nav-mobile-close');

    if (!navBurger || !navMenu) return;

    function isLandscapeMobile() {
      return html.classList.contains('device-mobile') &&
             html.classList.contains('orient-landscape');
    }

    function closeNavMenu() {
      navBurger.classList.remove('open');
      navMenu.classList.remove('open');
      if (navOverlay) navOverlay.classList.remove('open');
      navBurger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    function toggleNavMenu() {
      var willOpen = !navMenu.classList.contains('open');
      navBurger.classList.toggle('open', willOpen);
      navMenu.classList.toggle('open', willOpen);
      if (navOverlay) navOverlay.classList.toggle('open', willOpen);
      navBurger.setAttribute('aria-expanded', String(willOpen));
      if (willOpen && !isLandscapeMobile()) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }

    navBurger.addEventListener('click', toggleNavMenu);
    if (navClose) navClose.addEventListener('click', closeNavMenu);
    if (navOverlay) navOverlay.addEventListener('click', closeNavMenu);

    navMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeNavMenu);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) {
        closeNavMenu();
      }
      // При повороте экрана — обновляем блокировку overflow если меню открыто
      if (navMenu.classList.contains('open')) {
        document.body.style.overflow = isLandscapeMobile() ? '' : 'hidden';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNavMenu();
    });
  });
})();
