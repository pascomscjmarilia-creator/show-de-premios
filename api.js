/* api.js — comunicação com o Apps Script, feita para funcionar bem no celular.
 *
 * Problema que resolve: o carregamento por <script> (JSONP) leva os cookies da conta Google do aparelho. Quando o
 * celular está logado em várias contas, o Google pode devolver uma página de erro em vez dos dados, e a tela mostrava
 * "sem resposta do servidor". Aqui a chamada é feita primeiro com fetch SEM cookies; só se falhar, tenta o JSONP.
 *
 *   Api.chamar(url, function (erro, dados) { ... })   // url sem "callback"; tenta até 3 vezes
 */
(function (raiz) {
  'use strict';

  var TENTATIVAS = 3, ESPERA_MS = 20000;

  function acaoDe(url) { var m = /[?&]acao=([A-Za-z_]+)/.exec(String(url)); return m ? m[1] : '?'; }

  /* 1) fetch sem cookies (o Apps Script aceita CORS nas respostas de texto) */
  function viaFetch(url, cb) {
    if (typeof fetch !== 'function') { cb(new Error('sem fetch')); return; }
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var fim = false, timer = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } finish(new Error('tempo esgotado')); }, ESPERA_MS);
    function finish(err, dados) { if (fim) return; fim = true; clearTimeout(timer); cb(err, dados); }
    var opcoes = { credentials: 'omit', redirect: 'follow' };
    if (ctl) opcoes.signal = ctl.signal;
    fetch(url, opcoes).then(function (r) { return r.text(); }).then(function (txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { finish(new Error('resposta inválida')); return; }
      finish(null, d);
    }, function (e) { finish(e); });
  }

  /* 2) JSONP por <script> (plano B) */
  function viaScript(url, cb) {
    if (typeof document === 'undefined') { cb(new Error('sem document')); return; }
    var id = '_api' + Date.now() + (Math.random() * 9999 | 0), tag = document.createElement('script'), fim = false, timer = null;
    function limpar() { clearTimeout(timer); try { delete window[id]; } catch (e) { window[id] = void 0; } if (tag.parentNode) tag.parentNode.removeChild(tag); }
    function falhou() { if (fim) return; fim = true; limpar(); cb(new Error('falha de rede')); }
    window[id] = function (d) { if (fim) return; fim = true; limpar(); cb(null, d); };
    tag.onerror = falhou; timer = setTimeout(falhou, ESPERA_MS);
    tag.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + id + '&_=' + Date.now();
    document.head.appendChild(tag);
  }

  var transportes = { fetch: viaFetch, script: viaScript }; /* substituíveis nos testes */

  function chamar(url, cb, tentativa) {
    tentativa = tentativa || 1;
    transportes.fetch(url, function (e1, d1) {
      if (!e1) { cb(null, d1); return; }
      transportes.script(url, function (e2, d2) {
        if (!e2) { cb(null, d2); return; }
        if (tentativa < TENTATIVAS) { setTimeout(function () { chamar(url, cb, tentativa + 1); }, API._espera * tentativa); return; }
        var erro = new Error('O servidor não respondeu (' + acaoDe(url) + '). Confira o sinal do celular e tente de novo.');
        erro.acao = acaoDe(url);
        cb(erro);
      });
    });
  }

  var API = { chamar: chamar, acaoDe: acaoDe, _espera: 1200, _transportes: transportes, _tentativas: TENTATIVAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Api = API;
})(typeof window !== 'undefined' ? window : this);
