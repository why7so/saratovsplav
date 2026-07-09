if ('VKIDSDK' in window) {
  const VKID = window.VKIDSDK;
  VKID.Config.init({
    app: 54669480,
    redirectUrl: 'https://bwadwksnzcltbswktibs.supabase.co/auth/v1/callback',
    responseMode: VKID.ConfigResponseMode.Callback,
    source: VKID.ConfigSource.LOWCODE,
    scope: 'email', // запрашиваем email пользователя
  });

  const oAuth = new VKID.OAuthList();
  oAuth.render({
    container: document.getElementById('vk-login-container'),
    oauthList: [
      'vkid'
    ]
  })
  .on(VKID.WidgetEvents.ERROR, vkidOnError)
  .on(VKID.OAuthListInternalEvents.LOGIN_SUCCESS, function (payload) {
    const code = payload.code;
    const deviceId = payload.device_id;
    VKID.Auth.exchangeCode(code, deviceId)
      .then(function (authData) {
        // exchangeCode отдаёт только токены, профиль нужно запросить отдельно
        return VKID.Auth.userInfo(authData.access_token).then(function (userData) {
          vkidOnSuccess(Object.assign({}, authData, userData));
        });
      })
      .catch(vkidOnError);
  });

  function vkidOnSuccess(data) {
    if (typeof window.__vkLoginSuccess === 'function') {
      window.__vkLoginSuccess(data);
    }
  }

  function vkidOnError(error) {
    console.error('VK ID error:', error);
    if (typeof window.__vkLoginError === 'function') {
      window.__vkLoginError(error);
    }
  }
}
