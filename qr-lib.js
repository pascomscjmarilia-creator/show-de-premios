/* qr-lib.js — monta e lê o link do QR Code de cada série (sem DOM; testado em tests/). */
(function (raiz) {
  'use strict';

  /* base: endereço da página do comprador, ex.: https://.../show-de-premios/comprador.html */
  function linkComprador(base, serie, codigo) {
    var s = Number(serie), c = String(codigo == null ? '' : codigo).trim().toLowerCase();
    if (!(s >= 1) || s !== Math.floor(s) || !/^[a-z0-9]{12}$/.test(c)) throw new Error('Série ou código inválido.');
    return String(base).split('?')[0].split('#')[0] + '?s=' + s + '&c=' + c;
  }

  /* search: location.search da página do comprador. Devolve { serie, codigo } ou null. */
  function lerLink(search) {
    var m = String(search || '').replace(/^\?/, '').split('&'), o = {};
    m.forEach(function (p) { var i = p.indexOf('='); if (i > 0) o[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1)); });
    var s = Number(o.s), c = String(o.c || '').trim().toLowerCase();
    if (!(s >= 1) || s !== Math.floor(s) || !/^[a-z0-9]{12}$/.test(c)) return null;
    return { serie: s, codigo: c };
  }

  /* Máscara de celular brasileiro enquanto digita: (14) 99999-0000 */
  function mascaraTelefone(txt) {
    var v = String(txt == null ? '' : txt).replace(/\D/g, '').substring(0, 11);
    if (v.length > 10) return '(' + v.substring(0, 2) + ') ' + v.substring(2, 7) + '-' + v.substring(7);
    if (v.length > 6) return '(' + v.substring(0, 2) + ') ' + v.substring(2, 6) + '-' + v.substring(6);
    if (v.length > 2) return '(' + v.substring(0, 2) + ') ' + v.substring(2);
    return v;
  }

  var API = { linkComprador: linkComprador, lerLink: lerLink, mascaraTelefone: mascaraTelefone };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.QRLink = API;
})(typeof window !== 'undefined' ? window : this);
