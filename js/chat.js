document.addEventListener('DOMContentLoaded', function() {
  var CHAT_URL = 'https://bwadwksnzcltbswktibs.supabase.co/functions/v1/chat';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
  var msgs = document.getElementById('cp-messages');
  var inp = document.getElementById('cp-input');
  var sendBtn = document.getElementById('cp-send');
  var quickEl = document.getElementById('cp-quick');
  var fab = document.getElementById('chat-fab');
  var panel = document.getElementById('chat-panel');
  var busy = false;

  var isMobile = window.matchMedia('(max-width: 480px)').matches;
  function refreshIsMobile() {
    isMobile = window.matchMedia('(max-width: 480px)').matches;
  }

  /* На мобильных подстраиваем высоту окна чата под видимую область,
     чтобы клавиатура не перекрывала поле ввода и кнопку отправки.
     CSS-transition на height/max-height делает переход плавным;
     здесь только небольшой debounce, чтобы серия промежуточных
     resize-событий во время анимации клавиатуры не дёргала размер. */
  var viewportResizeTimer = null;
  function adjustPanelForViewport() {
    if (!isMobile || !panel.classList.contains('open')) return;
    if (!window.visualViewport) return;
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer = setTimeout(function () {
      var vh = window.visualViewport.height;
      panel.style.height = Math.min(vh * 0.9, vh - 16) + 'px';
      panel.style.maxHeight = panel.style.height;
    }, 60);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', adjustPanelForViewport);
  }

  /* Блокируем скролл страницы под открытым чатом — ТОЛЬКО на мобильном.
     На ПК страница должна скроллиться как обычно, даже когда чат открыт.
     Используем overflow:hidden на html и body (а не position:fixed на body) —
     это не пересчитывает ширину контента и не сдвигает fixed-элементы. */
  var savedScrollY = 0;
  function lockBodyScroll() {
    if (!isMobile) return;
    savedScrollY = window.scrollY || document.documentElement.scrollTop;
    document.documentElement.classList.add('chat-scroll-lock');
    document.body.classList.add('chat-scroll-lock');
  }
  function unlockBodyScroll() {
    if (!isMobile) return;
    document.documentElement.classList.remove('chat-scroll-lock');
    document.body.classList.remove('chat-scroll-lock');
    window.scrollTo(0, savedScrollY);
  }

  /* iOS Safari не всегда блокирует bounce-скролл фона через overflow:hidden —
     дополнительно глушим touchmove вне области сообщений чата.
     capture:true — перехватываем событие максимально рано, до того как
     Safari успеет решить, что это скролл страницы. */
  function handleTouchMove(e) {
    if (!msgs.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function lockTouchMove() {
    if (!isMobile) return;
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
  }
  function unlockTouchMove() {
    document.removeEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
  }

  function linkify(text) {
    return text.replace(/https?:\/\/[^\s]+/g, function(m) {
      var url = m.replace(/[.,)!?>]+$/, '');
      return '<a href="' + url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">' + url + '</a>';
    });
  }

  function addMsg(text, type) {
    var d = document.createElement('div');
    d.className = 'cp-msg ' + type;
    if (type === 'bot') { d.innerHTML = linkify(text); }
    else { d.textContent = text; }
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    var d = document.createElement('div');
    d.className = 'cp-typing';
    d.id = 'cp-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('cp-typing');
    if (el) el.remove();
  }

  function sendMessage() {
    var text = inp.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    inp.value = '';
    quickEl.style.display = 'none';
    addMsg(text, 'user');
    showTyping();
    fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY },
      body: JSON.stringify({ message: text })
    })
    .then(function(res) {
      hideTyping();
      if (!res.ok) throw new Error('API error');
      return res.json();
    })
    .then(function(data) {
      addMsg(data.reply || 'Не удалось получить ответ', 'bot');
    })
    .catch(function() {
      hideTyping();
      addMsg('Сервис недоступен. Позвоните: +7 (903) 456-78-90', 'bot');
    })
    .finally(function() {
      busy = false;
      sendBtn.disabled = false;
      if (!isMobile) inp.focus();
    });
  }

  fab.addEventListener('click', function() {
    refreshIsMobile();
    fab.classList.toggle('open');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      lockBodyScroll();
      lockTouchMove();
      adjustPanelForViewport();
      // На мобильных не открываем клавиатуру автоматически —
      // пусть человек сам коснётся поля, когда будет готов писать.
      if (!isMobile) inp.focus();
    } else {
      unlockBodyScroll();
      unlockTouchMove();
      panel.style.height = '';
      panel.style.maxHeight = '';
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  inp.addEventListener('focus', function() {
    if (!isMobile) return;
    // Даём клавиатуре время выехать, затем подстраиваем размер и скроллим вниз
    setTimeout(function() {
      adjustPanelForViewport();
      msgs.scrollTop = msgs.scrollHeight;
    }, 300);
  });

  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  quickEl.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-msg]');
    if (!btn) return;
    inp.value = btn.getAttribute('data-msg');
    sendMessage();
  });
});
