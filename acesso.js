/* acesso.js — Show de Prêmios — Versão 1.2
 * Guarda o token de acesso (emitido no login) e o envia nas chamadas ao Apps Script.
 * Se o servidor recusar ("naoAutorizado"), abre um pequeno login e repete a chamada.
 *
 * Usa a mesma sessão do Painel (localStorage "bingo_session_v1"): quem entrou no Painel
 * neste navegador já está autorizado no Cadastro e no Verificador.
 */
(function () {
  var LS_SESSAO = 'bingo_session_v1';
  var AUTH_URL = 'https://script.google.com/macros/s/AKfycbxi282C_QHoo5Xm7bqinACTWwzNh9x32aWikssVJ7REoIH1lnOSucgPHslkhHvf8PSP/exec';

  function lerSessao() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_SESSAO) || 'null');
      if (!s || !s.token) return null;
      if (s.expiresAt && Date.now() > s.expiresAt) return null;
      return s;
    } catch (e) { return null; }
  }
  function token() { var s = lerSessao(); return s ? s.token : ''; }

  function comToken(url) {
    var t = token();
    if (!t) return url;
    return url + (url.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(t);
  }

  /* A resposta do servidor diz que o token falta, é falso ou venceu? */
  function negado(data) {
    if (data && data.sucesso === false && data.dados && data.dados.perfilRestrito) { irParaVendedor(); return false; }
    return !!(data && data.sucesso === false && data.dados && data.dados.naoAutorizado);
  }

  /* ── Perfil: quem é vendedor só usa vendedor.html. O servidor também recusa as outras ações. ── */
  var LS_PERFIL = 'bingo_perfil_v1';
  function naTelaVendedor() { return /vendedor\.html$/i.test(location.pathname); }
  function irParaVendedor() {
    if (naTelaVendedor()) return;
    try { document.documentElement.style.visibility = 'hidden'; } catch (e) {}
    location.replace('vendedor.html');
  }
  function perfilGuardado() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_PERFIL) || 'null'), t = token();
      return (o && t && o.t === t.slice(-16)) ? o.p : '';
    } catch (e) { return ''; }
  }
  function guardarPerfil(p) { try { localStorage.setItem(LS_PERFIL, JSON.stringify({ t: token().slice(-16), p: p })); } catch (e) {} }
  /* Descobre o perfil (uma vez por sessão) e, se for vendedor, tira o usuário das outras telas. */
  function verificarPerfil(depois) {
    var t = token();
    if (!t) { if (depois) depois(''); return; }
    var antes = perfilGuardado();
    if (antes === 'vendedor') irParaVendedor();
    if (antes) { if (depois) depois(antes); return; }
    var id = '_perfil' + Date.now(), tag = document.createElement('script');
    window[id] = function (d) {
      try { delete window[id]; } catch (e) { window[id] = void 0; }
      tag.parentNode && tag.parentNode.removeChild(tag);
      var p = d && d.sucesso && d.dados && d.dados.perfil;
      if (p) { guardarPerfil(p); if (p === 'vendedor') irParaVendedor(); }
      if (depois) depois(p || '');
    };
    tag.onerror = function () { try { delete window[id]; } catch (e) { window[id] = void 0; } tag.parentNode && tag.parentNode.removeChild(tag); if (depois) depois(''); };
    tag.src = comToken(AUTH_URL + '?acao=meuPerfil') + '&callback=' + id + '&_=' + Date.now();
    document.head.appendChild(tag);
  }
  function sair() {
    esquecerSessao();
    try { localStorage.removeItem(LS_PERFIL); } catch (e) {}
    location.reload();
  }

  function esquecerSessao() { try { localStorage.removeItem(LS_SESSAO); localStorage.removeItem('bingo_perfil_v1'); } catch (e) {} }

  var aberto = false, fila = [];

  /* Mostra o login por cima da tela; ao entrar, chama todos os "depois" pendentes. */
  function pedirLogin(depois) {
    esquecerSessao();
    if (depois) fila.push(depois);
    if (aberto) return;
    aberto = true;

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(74,15,11,.98);display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif';
    ov.innerHTML =
      '<div style="background:#fff;color:#2a1512;border-radius:14px;padding:26px 28px;width:min(92vw,360px);box-shadow:0 10px 40px rgba(0,0,0,.5)">' +
        '<div style="font-size:20px;font-weight:700;color:#4a0f0b;margin-bottom:4px">🔐 Entrar para continuar</div>' +
        '<div style="font-size:13px;color:#555;margin-bottom:14px">Esta ação precisa de acesso. Use o mesmo CPF e senha do Painel.</div>' +
        '<input id="ac-cpf" inputmode="numeric" placeholder="CPF (só números)" style="width:100%;padding:10px;border:1px solid #bbb;border-radius:8px;font-size:15px;margin-bottom:8px">' +
        '<input id="ac-senha" type="password" placeholder="Senha" style="width:100%;padding:10px;border:1px solid #bbb;border-radius:8px;font-size:15px;margin-bottom:10px">' +
        '<div id="ac-msg" style="font-size:12px;min-height:16px;color:#c2410c;margin-bottom:8px"></div>' +
        '<button id="ac-ok" style="width:100%;padding:11px;border:0;border-radius:8px;background:#c1340e;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Entrar</button>' +
      '</div>';
    document.body.appendChild(ov);

    var cpf = ov.querySelector('#ac-cpf'), senha = ov.querySelector('#ac-senha'), msg = ov.querySelector('#ac-msg'), btn = ov.querySelector('#ac-ok');
    cpf.focus();

    function entrar() {
      var c = cpf.value.replace(/\D/g, ''), s = senha.value.trim();
      if (!c || !s) { msg.textContent = 'Informe CPF e senha.'; return; }
      btn.disabled = true; msg.style.color = '#555'; msg.textContent = 'Verificando…';
      fetch(AUTH_URL + '?action=login&cpf=' + c + '&password=' + encodeURIComponent(s))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          btn.disabled = false;
          if (!d.ok) { msg.style.color = '#c2410c'; msg.textContent = d.error || 'Acesso negado.'; return; }
          if (!d.token) { msg.style.color = '#c2410c'; msg.textContent = 'O servidor ainda não emite token (atualize o Auth.gs).'; return; }
          localStorage.setItem(LS_SESSAO, JSON.stringify({ nome: d.nome, isAdmin: d.isAdmin, expiresAt: d.expiresAt || null, token: d.token }));
          document.body.removeChild(ov);
          aberto = false;
          var pendentes = fila; fila = [];
          verificarPerfil();
          pendentes.forEach(function (f) { try { f(); } catch (e) {} });
        })
        .catch(function () { btn.disabled = false; msg.style.color = '#c2410c'; msg.textContent = 'Erro de conexão. Tente de novo.'; });
    }
    btn.onclick = entrar;
    senha.addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  }

  /* Telas internas (Cadastro, Verificador): sem sessão válida, pede o login já ao abrir. */
  function exigirLogin(depois) {
    if (token()) { verificarPerfil(); if (depois) depois(); return; }
    pedirLogin(depois);
  }

  window.Acesso = { token: token, comToken: comToken, negado: negado, pedirLogin: pedirLogin, exigirLogin: exigirLogin, verificarPerfil: verificarPerfil, sair: sair, authUrl: AUTH_URL };
})();
