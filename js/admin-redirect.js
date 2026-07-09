/* Fallback-редирект для "красивых" URL разделов админки на GitHub Pages.
   GitHub Pages не поддерживает серверный роутинг: прямой заход или
   обновление страницы по адресу вида /mng-river-7x2.html/users отдаёт
   404.html (единственный встроенный механизм GitHub Pages для несуществующих
   путей). Этот скрипт подключён в 404.html и, если путь похож на раздел
   админки, тихо и мгновенно переписывает его в понятный самой админке
   query-формат — так что оба варианта URL всегда приводят на нужный экран,
   без видимого мелькания страницы ошибки.

   Подключать этот скрипт нужно как можно раньше в <head> страницы 404.html,
   до вывода видимого контента страницы. */
(function () {
  'use strict';

  var VALID_VIEWS = ['activity', 'bookings', 'reviews', 'schedule', 'users'];
  var path = window.location.pathname;

  // Случай 1: путь вида .../mng-river-7x2.html/users — есть конкретный раздел.
  var match = path.match(/mng-river-7x2\.html\/([a-z]+)\/?$/i);
  if (match && VALID_VIEWS.indexOf(match[1].toLowerCase()) !== -1) {
    // replace(), а не href= — не оставляем саму 404-страницу в истории браузера,
    // чтобы кнопка "назад" не возвращала человека обратно на экран ошибки.
    window.location.replace('mng-river-7x2.html?view=' + match[1].toLowerCase());
    return;
  }

  // Случай 2: путь вида .../mng-river-7x2.html/ — слэш есть, а раздела после
  // него нет (например, обновили страницу сразу после первого захода, когда
  // URL ещё не успел обрасти конкретным разделом). Ведём на страницу без
  // query — admin.js сам откроет раздел по умолчанию (Активность).
  if (/mng-river-7x2\.html\/$/i.test(path)) {
    window.location.replace('mng-river-7x2.html');
  }
})();
