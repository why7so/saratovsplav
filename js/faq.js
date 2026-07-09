/* =============================================
   faq.js — логика страницы FAQ
   ============================================= */

const SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Аккордеон ────────────────────────────────────────────────
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');

    // Закрываем все открытые в той же категории
    const siblings = item.closest('.faq-category').querySelectorAll('.faq-item');
    siblings.forEach(s => {
      s.classList.remove('open');
      s.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });

    // Открываем текущий, если он был закрыт
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// ── Подсветка активного раздела в сайдбаре (IntersectionObserver) ──
const categories = document.querySelectorAll('.faq-category');
const navLinks   = document.querySelectorAll('.faq-nav ul a');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const id = entry.target.id;
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === '#' + id);
    });
  });
}, {
  rootMargin: '-30% 0px -60% 0px',
  threshold: 0
});

categories.forEach(cat => observer.observe(cat));
