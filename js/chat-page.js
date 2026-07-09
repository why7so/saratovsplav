document.addEventListener('DOMContentLoaded', function() {
  var CHAT_URL = 'https://bwadwksnzcltbswktibs.supabase.co/functions/v1/chat';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
  var msgs = document.getElementById('chat-messages');
  var inp = document.getElementById('chat-input');
  var sendBtn = document.getElementById('send-btn');
  var quickEl = document.getElementById('quick-replies');
  var busy = false;

  // На некоторых мобильных браузерах появление клавиатуры не сразу
  // сжимает 100dvh — подскролливаем к последнему сообщению вручную.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      msgs.scrollTop = msgs.scrollHeight;
    });
  }

  function linkify(text) {
    return text.replace(/https?:\/\/[^\s]+/g, function(m) {
      var url = m.replace(/[.,)!?>]+$/, '');
      return '<a href="' + url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">' + url + '</a>';
    });
  }

  function addMsg(text, type) {
    var d = document.createElement('div');
    d.className = 'msg msg-' + type;
    if (type === 'bot') { d.innerHTML = linkify(text); }
    else { d.textContent = text; }
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    var d = document.createElement('div');
    d.className = 'msg-typing';
    d.id = 'typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('typing');
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
      addMsg('Сервис недоступен. Напишите в Telegram: @cplavsmariei', 'bot');
    })
    .finally(function() {
      busy = false;
      sendBtn.disabled = false;
      inp.focus();
    });
  }

  sendBtn.addEventListener('click', sendMessage);
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
