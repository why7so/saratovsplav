// ─── КОНФИГ ────────────────────────────────────────────────
const EMAILJS_PUBLIC_KEY  = "PvM9tEMi9dgxAUU2w";
const EMAILJS_SERVICE_ID  = "service_mq1ehin";
const EMAILJS_TEMPLATE_ID = "template_b2x6gav";

const SUPABASE_URL = 'https://bwadwksnzcltbswktibs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3YWR3a3NuemNsdGJzd2t0aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzgyOTMsImV4cCI6MjA5NjYxNDI5M30.wROwUSWmffVTr5wdTVeQX4g1wnvv8NtJA-iZgHSz3sc';
// ───────────────────────────────────────────────────────────

emailjs.init(EMAILJS_PUBLIC_KEY);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentMeta = null;

// Pending registration data
let pendingReg = null;   // { name, surname, email, pass }
let otpCode    = null;   // generated 6-digit string
let otpExpiry  = null;   // timestamp ms
let resendInterval = null;

// ─── ВОЗВРАТ НА СТРАНИЦУ, С КОТОРОЙ ПРИШЛИ ──────────────────
const RETURN_TO_KEY = 'sb_auth_return_to';

(function captureReturnTo() {
  try {
    const ref = document.referrer;
    if (!ref) return;
    const refUrl = new URL(ref);
    if (refUrl.origin !== window.location.origin) return;
    if (/(^|\/)auth\.html$/.test(refUrl.pathname)) return;
    sessionStorage.setItem(RETURN_TO_KEY, refUrl.pathname + refUrl.search + refUrl.hash);
  } catch (e) {}
})();

function getReturnTo() {
  try {
    var saved = sessionStorage.getItem(RETURN_TO_KEY);
    if (saved) return saved;
  } catch (e) {}
  // fallback: пробуем document.referrer в момент вызова
  try {
    var ref = document.referrer;
    if (ref) {
      var refUrl = new URL(ref);
      if (refUrl.origin === window.location.origin && !/(^|\/)auth\.html$/.test(refUrl.pathname)) {
        return refUrl.pathname + refUrl.search + refUrl.hash;
      }
    }
  } catch (e) {}
  return 'index.html';
}

// ─── HELPERS ───────────────────────────────────────────────
function initials(a, b) {
  return ((a||'')[0]||'').toUpperCase() + ((b||'')[0]||'').toUpperCase();
}
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text; el.className = 'msg-box ' + type;
}
function clearMsg(id) {
  const el = document.getElementById(id);
  el.textContent = ''; el.className = 'msg-box';
}
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── TABS ──────────────────────────────────────────────────
function switchTab(t) {
  if (switchTab._busy) return;
  document.querySelectorAll('.auth-tab').forEach((el, i) => {
    el.classList.toggle('active', (i===0 && t==='login') || (i===1 && t==='register'));
  });

  const showId = t === 'login' ? 'panel-login' : 'panel-register';
  const hideId = t === 'login' ? 'panel-register' : 'panel-login';
  const showEl = document.getElementById(showId);
  const hideEl = document.getElementById(hideId);

  if (showEl.classList.contains('active')) {
  } else {
    switchTab._busy = true;
    hideEl.classList.remove('active');
    hideEl.classList.add('leaving');
    showEl.classList.add('active');

    setTimeout(() => {
      hideEl.classList.remove('leaving');
      switchTab._busy = false;
    }, 300);
  }

  document.getElementById('card-title').textContent = t === 'login' ? 'Войти' : 'Создать аккаунт';
  var cs = document.getElementById('card-sub');
  if (cs) cs.textContent = t === 'login'
    ? 'Оставьте отзыв о вашем сплаве'
    : 'Быстрая регистрация — только для отзывов';
}

// ─── SET LOGGED IN ─────────────────────────────────────────
function setLoggedIn(user, meta) {
  currentUser = user; currentMeta = meta || {};
  document.getElementById('auth-block').style.display = 'none';
  document.getElementById('otp-screen').style.display = 'none';
  var lp = document.getElementById('logged-panel');
  if (lp) lp.style.display = 'block';
  document.getElementById('card-title').textContent = 'Вы вошли';
  var cs = document.getElementById('card-sub');
  if (cs) cs.textContent = '';
  var el;
  el = document.getElementById('uav'); if (el) el.textContent = (currentMeta.name || currentMeta.surname) ? initials(currentMeta.name, currentMeta.surname) : user.email[0].toUpperCase();
  el = document.getElementById('u-name'); if (el) el.textContent = [currentMeta.name || '', currentMeta.surname || ''].filter(Boolean).join(' ') || 'Участник';
  el = document.getElementById('u-login'); if (el) el.textContent = currentMeta.login ? '@' + currentMeta.login : '';
  el = document.getElementById('u-email'); if (el) el.textContent = user.email;

  const returnTo = getReturnTo();
  const isReview = /(^|\/)review\.html/.test(returnTo);
  const delay = (document.referrer && document.referrer.includes('review.html')) || isReview ? 0 : 900;
  setTimeout(() => {
    try { sessionStorage.removeItem(RETURN_TO_KEY); } catch (e) {}
    window.location.href = returnTo;
  }, delay);
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null; currentMeta = null;
  document.getElementById('auth-block').style.display = 'block';
  var lp = document.getElementById('logged-panel');
  if (lp) lp.style.display = 'none';
  document.getElementById('card-title').textContent = 'Войти';
  var cs = document.getElementById('card-sub');
  if (cs) cs.textContent = 'Оставьте отзыв о вашем сплаве';
  clearMsg('login-msg'); clearMsg('reg-msg');
}

// ─── VK ID SDK CALLBACK ─────────────────────────────────────
window.__vkLoginSuccess = async function(data) {
  try {
    var vkUser = data.user || data;
    var vkId = vkUser.user_id || vkUser.id || data.user_id || data.id || '';
    var firstName = vkUser.first_name || '';
    var lastName = vkUser.last_name || '';
    var email = vkUser.email || data.email || '';

    if (!vkId) {
      console.error('VK login: не удалось получить user_id из ответа VK', data);
      showMsg('login-msg', 'Не удалось войти через VK.', 'error');
      return;
    }
    if (!email) email = 'vk_' + vkId + '@vk.auth';

    var password = 'vk_' + vkId + '_splav';

    var result = await sb.auth.signInWithPassword({ email: email, password: password });

    if (result.error) {
      var regResult = await sb.auth.signUp({
        email: email, password: password,
        options: {
          data: { name: firstName, surname: lastName, login: '', vk_id: String(vkId) },
          emailRedirectTo: null
        }
      });
      if (regResult.error) { console.error('VK register error:', regResult.error); showMsg('login-msg', 'Не удалось войти через VK.', 'error'); return; }
      if (regResult.data && regResult.data.user) {
        await sb.from('profiles').insert({ id: regResult.data.user.id, login: '', email: email, name: firstName, surname: lastName });
      }
    }

    var returnTo = getReturnTo();
    try { sessionStorage.removeItem(RETURN_TO_KEY); } catch (e) {}
    window.location.href = returnTo;
  } catch (e) {
    console.error('VK login failed:', e);
    showMsg('login-msg', 'Не удалось войти через VK.', 'error');
  }
};

window.__vkLoginError = function(error) {
  showMsg('login-msg', 'Не удалось войти через VK.', 'error');
};

// ─── LOGIN ─────────────────────────────────────────────────
async function doLogin() {
  let identifier = document.getElementById('login-email').value.trim().toLowerCase();
  const pass     = document.getElementById('login-pass').value;
  if (!identifier || !pass) return showMsg('login-msg', 'Заполните все поля.', 'error');

  const btn = document.querySelector('#panel-login .btn-submit');
  btn.disabled = true; btn.textContent = 'Входим…';

  let email = identifier;
  if (!identifier.includes('@')) {
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('email')
      .eq('login', identifier)
      .single();
    if (pErr || !profile) {
      btn.disabled = false; btn.textContent = 'Войти';
      return showMsg('login-msg', 'Пользователь с таким логином не найден.', 'error');
    }
    email = profile.email;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Войти';

  if (error) return showMsg('login-msg', 'Неверный email или пароль.', 'error');
  clearMsg('login-msg');
  await applyUserMeta(data.user);
}

// ─── REGISTER: step 1 — send code ─────────────────────────
async function doRegister() {
  const name    = document.getElementById('reg-name').value.trim();
  const surname = document.getElementById('reg-surname').value.trim();
  const login   = document.getElementById('reg-login').value.trim().toLowerCase();
  const email   = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass    = document.getElementById('reg-pass').value;
  const consentPd         = document.getElementById('reg-consent-pd').checked;
  const consentMarketing  = document.getElementById('reg-consent-marketing').checked;

  if (!name || !surname) return showMsg('reg-msg', 'Введите имя и фамилию.', 'error');
  if (!login) return showMsg('reg-msg', 'Введите логин.', 'error');
  if (!/^[a-z0-9_]{3,20}$/.test(login)) return showMsg('reg-msg', 'Логин: 3–20 символов, только a-z, 0-9, _', 'error');
  if (!email.includes('@')) return showMsg('reg-msg', 'Введите корректный email.', 'error');
  if (pass.length < 6) return showMsg('reg-msg', 'Пароль — минимум 6 символов.', 'error');
  if (!consentPd) return showMsg('reg-msg', 'Необходимо согласие с Политикой обработки персональных данных.', 'error');

  const btn = document.querySelector('#panel-register .btn-submit');
  btn.disabled = true; btn.textContent = 'Проверяем логин…';

  const { data: existing } = await sb.from('profiles').select('login').eq('login', login).single();
  if (existing) {
    btn.disabled = false; btn.textContent = 'Получить код';
    return showMsg('reg-msg', 'Этот логин уже занят.', 'error');
  }

  btn.textContent = 'Отправляем код…';
  const code = generateCode();

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: email,
      to_name:  name,
      otp_code: code
    });
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Получить код';
    console.error('EmailJS error:', e);
    const detail = e?.text || e?.message || JSON.stringify(e);
    return showMsg('reg-msg', 'Ошибка: ' + detail, 'error');
  }

  btn.disabled = false; btn.textContent = 'Получить код';

  pendingReg = { name, surname, login, email, pass, consentPd, consentMarketing };
  otpCode    = code;
  otpExpiry  = Date.now() + 10 * 60 * 1000;

  showOtpScreen(email);
}

// ─── OTP SCREEN ────────────────────────────────────────────
function showOtpScreen(email) {
  document.getElementById('auth-block').style.display = 'none';
  document.getElementById('otp-screen').style.display = 'block';
  document.getElementById('card-title').textContent = 'Введите код';
  var cs = document.getElementById('card-sub');
  if (cs) cs.textContent = '';
  document.getElementById('otp-email-label').textContent = email;
  clearMsg('otp-msg');
  clearOtpInputs();
  document.querySelector('#otp-inputs input').focus();
  startResendTimer(60);
}

function backToRegister() {
  document.getElementById('otp-screen').style.display = 'none';
  document.getElementById('auth-block').style.display = 'block';
  switchTab('register');
  clearInterval(resendInterval);
}

function clearOtpInputs() {
  document.querySelectorAll('#otp-inputs input').forEach(i => {
    i.value = ''; i.classList.remove('filled');
  });
}

function getOtpValue() {
  return [...document.querySelectorAll('#otp-inputs input')].map(i => i.value).join('');
}

// OTP input navigation
document.addEventListener('DOMContentLoaded', () => {
  const consentPd = document.getElementById('reg-consent-pd');
  const submitBtn = document.getElementById('reg-submit-btn');
  if (consentPd && submitBtn) {
    consentPd.addEventListener('change', () => {
      submitBtn.disabled = !consentPd.checked;
    });
  }

  const inputs = document.querySelectorAll('#otp-inputs input');
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[0] : '';
      e.target.classList.toggle('filled', !!e.target.value);
      if (val && idx < inputs.length - 1) inputs[idx + 1].focus();
      if (getOtpValue().length === 6) verifyOtp();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) {
        inputs[idx - 1].focus(); inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      [...text].forEach((ch, i) => {
        if (inputs[i]) { inputs[i].value = ch; inputs[i].classList.add('filled'); }
      });
      if (text.length === 6) verifyOtp();
      else if (inputs[text.length]) inputs[text.length].focus();
    });
  });
});

// ─── VERIFY OTP ────────────────────────────────────────────
async function verifyOtp() {
  const entered = getOtpValue();
  if (entered.length < 6) return;

  const btn = document.getElementById('otp-verify-btn');
  btn.disabled = true; btn.textContent = 'Проверяем…';

  if (Date.now() > otpExpiry) {
    btn.disabled = false; btn.textContent = 'Подтвердить';
    return showMsg('otp-msg', 'Код истёк. Запросите новый.', 'error');
  }

  if (entered !== otpCode) {
    btn.disabled = false; btn.textContent = 'Подтвердить';
    clearOtpInputs();
    document.querySelector('#otp-inputs input').focus();
    return showMsg('otp-msg', 'Неверный код. Попробуйте ещё раз.', 'error');
  }

  const { name, surname, login, email, pass, consentPd, consentMarketing } = pendingReg;
  const consentTimestamp = new Date().toISOString();
  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name, surname, login }, emailRedirectTo: null }
  });

  if (error) {
    btn.disabled = false; btn.textContent = 'Подтвердить';
    if (error.message.includes('already')) return showMsg('otp-msg', 'Этот email уже зарегистрирован.', 'error');
    return showMsg('otp-msg', error.message, 'error');
  }

  if (!data.session) {
    btn.disabled = false; btn.textContent = 'Подтвердить';
    return showMsg(
      'otp-msg',
      'Аккаунт создан, но вход не выполнен автоматически. ' +
      'Попробуйте войти через вкладку «Войти» — если не получится, ' +
      'напишите нам.',
      'error'
    );
  }

  let profErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error: e } = await sb.from('profiles').insert({
      id: data.user.id,
      login,
      email,
      name,
      surname,
      consent_personal_data: consentPd,
      consent_personal_data_at: consentTimestamp,
      consent_marketing: consentMarketing,
      consent_marketing_at: consentMarketing ? consentTimestamp : null
    });
    profErr = e;
    if (!profErr) break;
  }

  btn.disabled = false; btn.textContent = 'Подтвердить';

  if (profErr) {
    console.error('profiles insert error:', profErr);
    showMsg(
      'otp-msg',
      'Аккаунт создан, но не удалось сохранить профиль (' + profErr.message + '). ' +
      'Вход по логину может не работать — попробуйте позже или напишите нам.',
      'error'
    );
  }

  clearInterval(resendInterval);
  setLoggedIn(data.user, { name, surname, login });
}

// ─── RESEND ────────────────────────────────────────────────
async function resendCode() {
  const btn = document.getElementById('resend-btn');
  btn.disabled = true;

  const code = generateCode();
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: pendingReg.email,
      to_name:  pendingReg.name,
      otp_code: code
    });
    otpCode   = code;
    otpExpiry = Date.now() + 10 * 60 * 1000;
    clearOtpInputs();
    clearMsg('otp-msg');
    document.querySelector('#otp-inputs input').focus();
    startResendTimer(60);
  } catch {
    showMsg('otp-msg', 'Не удалось отправить письмо.', 'error');
    btn.disabled = false;
  }
}

function startResendTimer(seconds) {
  clearInterval(resendInterval);
  const btn = document.getElementById('resend-btn');
  const span = document.getElementById('resend-timer');
  let left = seconds;
  btn.disabled = true;
  span.textContent = left;
  resendInterval = setInterval(() => {
    left--;
    span.textContent = left;
    if (left <= 0) {
      clearInterval(resendInterval);
      btn.disabled = false;
      btn.innerHTML = 'Отправить повторно';
    }
  }, 1000);
}

// ─── RESTORE SESSION ───────────────────────────────────────
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    const user = data.session.user;
    await applyUserMeta(user);
  }
})();

async function applyUserMeta(user) {
  const meta = user.user_metadata || {};

  let name    = meta.name    || '';
  let surname = meta.surname || '';
  let login   = meta.login   || '';

  let profileFound = false;
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('login, name, surname')
      .eq('id', user.id)
      .single();
    if (profile) {
      profileFound = true;
      if (profile.login)   login   = profile.login;
      if (profile.name)    name    = profile.name;
      if (profile.surname) surname = profile.surname;
    }
  } catch {}

  if (!profileFound && login) {
    try {
      const { error: fixErr } = await sb.from('profiles').insert({
        id: user.id, login, email: user.email, name, surname
      });
      if (fixErr) console.error('profile auto-repair failed:', fixErr);
    } catch (e) {
      console.error('profile auto-repair failed:', e);
    }
  }

  setLoggedIn(user, { name, surname, login });
}

// ─── EVENT DELEGATION ──────────────────────────────────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const tab    = btn.dataset.tab;
  if (action === 'switch-tab')      switchTab(tab);
  else if (action === 'do-login')        doLogin();
  else if (action === 'do-register')     doRegister();
  else if (action === 'verify-otp')      verifyOtp();
  else if (action === 'resend-code')     resendCode();
  else if (action === 'back-to-register') backToRegister();
  else if (action === 'logout')          logout();
});

// Подмена кнопки Войти → Аккаунт если пользователь залогинен
(async function () {
  try {
    var sessionResult = await sb.auth.getSession();
    var navLoginLink = document.getElementById('nav-login-link');
    if (navLoginLink && sessionResult.data && sessionResult.data.session) {
      navLoginLink.textContent = 'Аккаунт';
      navLoginLink.href = 'auth.html';
    }
  } catch (e) { /* не залогинен */ }
}());
