(function () {
  'use strict';

  var SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var currentUser = null;
  var currentProfile = null;

  function initials(name, surname) {
    var n = (name || '').trim(), s = (surname || '').trim();
    return ((n[0] || '') + (s[0] || '')).toUpperCase() || '?';
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'edit-msg ' + type;
  }

  function setAvatarImage(url) {
    var img      = document.getElementById('p-avatar-img');
    var initEl   = document.getElementById('p-avatar-initials');
    if (url) {
      img.src = url;
      img.style.display = 'block';
      initEl.style.display = 'none';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      initEl.style.display = 'block';
    }
  }

  /* ── Переключение вкладок ── */
  function switchTab(tab) {
    document.querySelectorAll('.sidebar-nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.tab === tab);
    });
    document.getElementById('panel-profile').classList.toggle('panel-hidden', tab !== 'profile');
    document.getElementById('panel-security').classList.toggle('panel-hidden', tab !== 'security');
    // Закрываем все открытые формы при переключении вкладки
    document.querySelectorAll('.edit-form.open').forEach(function (f) { f.classList.remove('open'); });
  }

  document.getElementById('tab-profile').addEventListener('click', function (e) {
    e.preventDefault(); switchTab('profile');
  });
  document.getElementById('tab-security').addEventListener('click', function (e) {
    e.preventDefault(); switchTab('security');
  });

  /* ── Заполнение данных профиля ── */
  function fillProfile(user, profile) {
    var name    = profile.name    || '';
    var surname = profile.surname || '';
    var login   = profile.login   || '';
    var email   = user.email      || '';
    var isGoogle = (user.app_metadata && user.app_metadata.provider === 'google')
                || (user.identities && user.identities.some(function (i) { return i.provider === 'google'; }));

    document.getElementById('p-avatar-initials').textContent = initials(name, surname);
    setAvatarImage(profile.avatar_url);
    document.getElementById('p-name').textContent   = [name, surname].filter(Boolean).join(' ') || 'Участник';
    document.getElementById('p-login').textContent  = login ? '@' + login : '';
    document.getElementById('p-email').textContent  = email;
    document.getElementById('p-login-row').textContent = login ? '@' + login : '—';

    var providerEl = document.getElementById('p-provider');
    if (isGoogle) {
      providerEl.innerHTML =
        '<div class="provider-icon google">' +
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
            '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
            '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
            '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
          '</svg>' +
        '</div>' +
        '<span>Google · ' + esc(email) + '</span>';
    } else {
      providerEl.innerHTML =
        '<div class="provider-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" stroke="none" fill="#1a4a5c"/><path d="M4 8l8 5 8-5" stroke="#fff"/></svg>' +
        '</div>' +
        '<span>Email · ' + esc(email) + '</span>';
    }

    // Если вошёл через Google — смена пароля недоступна
    if (isGoogle) {
      var passHint = document.getElementById('p-pass-hint');
      passHint.textContent = 'Вход через Google — пароль не используется';
      document.getElementById('btn-edit-password').style.display = 'none';
    }
  }

  /* ── Смена фото профиля ── */
  var btnChangeAvatar = document.getElementById('btn-change-avatar');
  var avatarFileInput = document.getElementById('avatar-file-input');
  var avatarMsg       = document.getElementById('avatar-msg');
  var MAX_AVATAR_MB   = 4;

  btnChangeAvatar.addEventListener('click', function () {
    avatarFileInput.click();
  });

  avatarFileInput.addEventListener('change', async function () {
    var file = avatarFileInput.files && avatarFileInput.files[0];
    if (!file) return;

    avatarMsg.className = 'avatar-msg';
    avatarMsg.textContent = '';

    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      avatarMsg.className = 'avatar-msg err';
      avatarMsg.textContent = 'Нужен файл PNG, JPEG или WebP.';
      avatarFileInput.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      avatarMsg.className = 'avatar-msg err';
      avatarMsg.textContent = 'Файл слишком большой (максимум ' + MAX_AVATAR_MB + ' МБ).';
      avatarFileInput.value = '';
      return;
    }

    // Мгновенный локальный предпросмотр, пока идёт загрузка
    var reader = new FileReader();
    reader.onload = function () { setAvatarImage(reader.result); };
    reader.readAsDataURL(file);

    btnChangeAvatar.disabled = true;
    avatarMsg.textContent = 'Загружаем фото…';

    var ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var path = currentUser.id + '/avatar.' + ext;

    var upload;
    try {
      // Safari/iOS иногда не может отправить File напрямую как тело
      // fetch-запроса ("Load failed") — читаем файл в ArrayBuffer,
      // это надёжно работает во всех браузерах.
      var fileBuffer = await file.arrayBuffer();
      upload = await sb.storage.from('avatars').upload(path, fileBuffer, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600'
      });
    } catch (e) {
      upload = { error: e };
    }

    if (upload.error) {
      avatarMsg.className = 'avatar-msg err';
      avatarMsg.textContent = 'Не удалось загрузить фото: ' + (upload.error.message || upload.error);
      setAvatarImage(currentProfile ? currentProfile.avatar_url : null);
      btnChangeAvatar.disabled = false;
      avatarFileInput.value = '';
      return;
    }

    var pub = sb.storage.from('avatars').getPublicUrl(path);
    // Добавляем метку времени, чтобы обойти кэш браузера при замене фото
    var publicUrl = pub.data.publicUrl + '?t=' + Date.now();

    var upd = await sb.from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', currentUser.id)
                .select('id, avatar_url');

    if (upd.error) {
      avatarMsg.className = 'avatar-msg err';
      avatarMsg.textContent = 'Фото загружено, но не удалось сохранить: ' + upd.error.message;
      btnChangeAvatar.disabled = false;
      avatarFileInput.value = '';
      return;
    }
    if (!upd.data || upd.data.length === 0) {
      // error нет, но ни одна строка не обновилась — обычно это RLS,
      // которая молча блокирует запись, не давая явной ошибки
      avatarMsg.className = 'avatar-msg err';
      avatarMsg.textContent = 'Фото загружено, но профиль не обновился (проверьте политики доступа RLS на таблице profiles для UPDATE).';
      console.error('avatar update matched 0 rows — check RLS UPDATE policy on profiles for id =', currentUser.id);
      btnChangeAvatar.disabled = false;
      avatarFileInput.value = '';
      return;
    }

    currentProfile.avatar_url = publicUrl;
    setAvatarImage(publicUrl);
    writeCache(currentUser, currentProfile);
    avatarMsg.textContent = 'Фото обновлено.';
    btnChangeAvatar.disabled = false;
    avatarFileInput.value = '';
    setTimeout(function () { avatarMsg.textContent = ''; }, 2500);
  });

  /* ── Редактирование профиля (имя/фамилия) ── */
  var btnEditProfile   = document.getElementById('btn-edit-profile');
  var formEditProfile  = document.getElementById('form-edit-profile');
  var btnSaveProfile   = document.getElementById('btn-save-profile');
  var btnCancelProfile = document.getElementById('btn-cancel-profile');
  var msgProfile       = document.getElementById('msg-profile');

  btnEditProfile.addEventListener('click', function () {
    document.getElementById('edit-name').value    = currentProfile ? (currentProfile.name || '')    : '';
    document.getElementById('edit-surname').value = currentProfile ? (currentProfile.surname || '') : '';
    formEditProfile.classList.add('open');
    document.getElementById('edit-name').focus();
    msgProfile.textContent = '';
  });

  btnCancelProfile.addEventListener('click', function () {
    formEditProfile.classList.remove('open');
  });

  btnSaveProfile.addEventListener('click', async function () {
    var name    = document.getElementById('edit-name').value.trim();
    var surname = document.getElementById('edit-surname').value.trim();
    if (!name || !surname) {
      showMsg(msgProfile, 'Введите имя и фамилию.', 'err'); return;
    }
    btnSaveProfile.disabled = true; btnSaveProfile.textContent = 'Сохраняем…';

    var upd = await sb.from('profiles').update({ name: name, surname: surname })
                .eq('id', currentUser.id);
    if (upd.error) {
      showMsg(msgProfile, 'Ошибка: ' + upd.error.message, 'err');
    } else {
      currentProfile.name = name; currentProfile.surname = surname;
      fillProfile(currentUser, currentProfile);
      writeCache(currentUser, currentProfile);
      showMsg(msgProfile, 'Сохранено!', 'ok');
      setTimeout(function () { formEditProfile.classList.remove('open'); }, 900);
    }
    btnSaveProfile.disabled = false; btnSaveProfile.textContent = 'Сохранить';
  });

  /* ── Смена пароля ── */
  var btnEditPassword   = document.getElementById('btn-edit-password');
  var formEditPassword  = document.getElementById('form-edit-password');
  var btnSavePassword   = document.getElementById('btn-save-password');
  var btnCancelPassword = document.getElementById('btn-cancel-password');
  var msgPassword       = document.getElementById('msg-password');

  btnEditPassword.addEventListener('click', function () {
    formEditPassword.classList.add('open');
    document.getElementById('edit-pass-new').focus();
    msgPassword.textContent = '';
  });

  btnCancelPassword.addEventListener('click', function () {
    formEditPassword.classList.remove('open');
    document.getElementById('edit-pass-new').value = '';
    document.getElementById('edit-pass-confirm').value = '';
  });

  btnSavePassword.addEventListener('click', async function () {
    var p1 = document.getElementById('edit-pass-new').value;
    var p2 = document.getElementById('edit-pass-confirm').value;
    if (p1.length < 6) {
      showMsg(msgPassword, 'Пароль — минимум 6 символов.', 'err'); return;
    }
    if (p1 !== p2) {
      showMsg(msgPassword, 'Пароли не совпадают.', 'err'); return;
    }
    btnSavePassword.disabled = true; btnSavePassword.textContent = 'Сохраняем…';

    var res = await sb.auth.updateUser({ password: p1 });
    if (res.error) {
      showMsg(msgPassword, 'Ошибка: ' + res.error.message, 'err');
    } else {
      showMsg(msgPassword, 'Пароль успешно изменён.', 'ok');
      document.getElementById('edit-pass-new').value = '';
      document.getElementById('edit-pass-confirm').value = '';
      setTimeout(function () { formEditPassword.classList.remove('open'); }, 1200);
    }
    btnSavePassword.disabled = false; btnSavePassword.textContent = 'Сохранить';
  });

  /* ── Выход ── */
  document.getElementById('btn-logout').addEventListener('click', async function () {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    await sb.auth.signOut();
    window.location.href = 'index.html';
  });

  /* ── Удаление аккаунта ── */
  var deleteOverlay      = document.getElementById('delete-modal-overlay');
  var deleteInput        = document.getElementById('delete-confirm-input');
  var deleteMsg          = document.getElementById('delete-modal-msg');
  var btnDeleteAccount   = document.getElementById('btn-delete-account');
  var btnDeleteCancel    = document.getElementById('btn-delete-cancel');
  var btnDeleteConfirm   = document.getElementById('btn-delete-confirm');
  var CONFIRM_WORD       = 'УДАЛИТЬ';

  function openDeleteModal() {
    deleteInput.value = '';
    deleteMsg.textContent = '';
    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.textContent = 'Удалить аккаунт';
    deleteOverlay.classList.add('open');
    setTimeout(function () { deleteInput.focus(); }, 50);
  }

  function closeDeleteModal() {
    deleteOverlay.classList.remove('open');
  }

  btnDeleteAccount.addEventListener('click', openDeleteModal);
  btnDeleteCancel.addEventListener('click', closeDeleteModal);

  // Закрытие по клику на затемнение (но не по клику внутри самого окна)
  deleteOverlay.addEventListener('click', function (e) {
    if (e.target === deleteOverlay) closeDeleteModal();
  });

  // Кнопка "Удалить" активна только когда введено правильное слово
  deleteInput.addEventListener('input', function () {
    btnDeleteConfirm.disabled = deleteInput.value.trim().toUpperCase() !== CONFIRM_WORD;
  });

  btnDeleteConfirm.addEventListener('click', async function () {
    if (deleteInput.value.trim().toUpperCase() !== CONFIRM_WORD) return;

    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.textContent = 'Удаляем…';
    deleteMsg.textContent = '';

    var res = await sb.rpc('delete_own_account');
    if (res.error) {
      deleteMsg.textContent = 'Не удалось удалить аккаунт: ' + res.error.message;
      btnDeleteConfirm.disabled = false;
      btnDeleteConfirm.textContent = 'Удалить аккаунт';
      return;
    }

    await sb.auth.signOut();
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    window.location.href = 'index.html?account_deleted=1';
  });

  /* ── Кэш профиля для мгновенной отрисовки при повторных заходах ── */
  var CACHE_KEY = 'sb_profile_cache_v1';

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(user, profile) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          app_metadata: user.app_metadata,
          identities: user.identities
        },
        profile: profile
      }));
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

  function showLoadingError() {
    var loadingEl = document.getElementById('profile-loading');
    document.getElementById('profile-loading-text').textContent =
      'Не получилось загрузить профиль. Проверьте интернет-соединение.';
    loadingEl.classList.add('err');
  }

  document.getElementById('btn-loading-retry').addEventListener('click', function () {
    window.location.reload();
  });

  /* ── Инициализация: проверка сессии ── */
  (async function init() {
    // 1) Если есть кэш с прошлого визита — рисуем страницу сразу же,
    //    не дожидаясь сети. Ощущается как мгновенная загрузка.
    var cached = readCache();
    var paintedFromCache = false;
    if (cached && cached.user && cached.profile) {
      currentUser    = cached.user;
      currentProfile = cached.profile;
      fillProfile(cached.user, cached.profile);
      document.getElementById('profile-loading').style.display = 'none';
      document.getElementById('profile-page').style.display    = 'flex';
      paintedFromCache = true;
    }

    try {
      // 2) Параллельно (или сразу, если кэша не было) — проверяем
      //    актуальную сессию и данные. Таймаут — чтобы плохая сеть
      //    не вешала страницу навсегда.
      var res = await withTimeout(sb.auth.getSession(), 8000);
      var session = res.data && res.data.session;

      if (!session) {
        window.location.href = 'auth.html';
        return;
      }

      currentUser = session.user;

      var profRes = await withTimeout(
        sb.from('profiles').select('*').eq('id', currentUser.id).single(),
        8000
      );
      currentProfile = (profRes.data) || { name: '', surname: '', login: '' };

      fillProfile(currentUser, currentProfile);
      writeCache(currentUser, currentProfile);

      document.getElementById('profile-loading').style.display = 'none';
      document.getElementById('profile-page').style.display    = 'flex';

    } catch (e) {
      console.error('profile init failed:', e);
      // Если уже показали кэш — тихо оставляем страницу как есть
      // (юзер и так видит свой профиль), просто не обновляем свежими
      // данными. Если кэша не было — показываем ошибку с кнопкой "Повторить".
      if (!paintedFromCache) {
        showLoadingError();
      }
    }
  })();

})();
