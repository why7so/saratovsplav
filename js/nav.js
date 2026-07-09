/* ── Shared nav logic: login button swap + indicator recalc ── */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';

  function recalcIndicator() {
    var ind = document.getElementById('nav-indicator');
    var activeA = document.querySelector('#nav-desktop-menu a.active');
    if (ind && activeA) {
      var r = activeA.getBoundingClientRect();
      var nr = activeA.closest('nav').getBoundingClientRect();
      ind.style.left = (r.left - nr.left) + 'px';
      ind.style.width = r.width + 'px';
    }
  }

  async function checkSession() {
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') return;
      var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      var result = await sb.auth.getSession();
      if (result.data && result.data.session) {
        var navLoginLink = document.getElementById('nav-login-link');
        var mobileLoginLink = document.querySelector('.nav-mobile-links .nav-login');
        if (navLoginLink) { navLoginLink.textContent = 'Профиль'; navLoginLink.href = 'profile.html'; }
        if (mobileLoginLink) { mobileLoginLink.textContent = 'Профиль'; mobileLoginLink.href = 'profile.html'; }
        recalcIndicator();
      }
    } catch (e) { /* not logged in */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSession);
  } else {
    checkSession();
  }

  window.__navRecalcIndicator = recalcIndicator;
})();
