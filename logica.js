/* logica.js — regras de conferência da cartela (quina e cartela cheia).
   Usado pelo Verificador e pelos testes (node --test tests/). Sem DOM, sem efeitos. */
(function (raiz) {
  'use strict';

  var IDX = [0, 1, 2, 3, 4];

  /* grade: matriz 5x5 (casa livre = null). pedras: Set de números sorteados.
     mod: { linha, diagonal, cantos } (true = vale como quina).
     Devolve as 25 casas marcadas, se há quina (e qual padrão) e se está cheia. */
  function avaliarCartela(grade, pedras, mod) {
    var marcadas = [];
    for (var r = 0; r < 5; r++)
      for (var c = 0; c < 5; c++) {
        var val = grade[r] ? grade[r][c] : undefined;
        marcadas.push(val === null || val === undefined || pedras.has(Number(val)));
      }

    var m = function (r, c) { return marcadas[r * 5 + c]; };
    var temCheia = marcadas.every(Boolean);
    var temQuina = false, padrao = '';

    if (mod.linha) {
      for (var r2 = 0; r2 < 5 && !temQuina; r2++)
        if (IDX.every(function (c) { return m(r2, c); })) { temQuina = true; padrao = 'Linha ' + (r2 + 1) + ' (horizontal)'; }
      for (var c2 = 0; c2 < 5 && !temQuina; c2++)
        if (IDX.every(function (r) { return m(r, c2); })) { temQuina = true; padrao = 'Coluna ' + 'BINGO'.charAt(c2) + ' (vertical)'; }
    }
    if (!temQuina && mod.diagonal) {
      if (IDX.every(function (i) { return m(i, i); })) { temQuina = true; padrao = 'Diagonal'; }
      else if (IDX.every(function (i) { return m(i, 4 - i); })) { temQuina = true; padrao = 'Diagonal'; }
    }
    if (!temQuina && mod.cantos)
      if (m(0, 0) && m(0, 4) && m(4, 0) && m(4, 4)) { temQuina = true; padrao = '4 cantos'; }

    return { marcadas: marcadas, temQuina: temQuina, temCheia: temCheia, padrao: padrao };
  }

  /* Fase do jogo definida pelo Painel: 1 = Quina (e cartela cheia), 2 = só Cartela Cheia.
     Devolve a fase que a mensagem traz (1 ou 2) ou null se a mensagem não fala de fase. */
  var TIPOS_COM_FASE = ['draw', 'undo', 'resetar', 'mudar_fase'];
  function faseDaMensagem(d) {
    if (!d || !d.payload || TIPOS_COM_FASE.indexOf(d.tipo) < 0) return null;
    var f = parseInt(d.payload.fase, 10);
    return (f === 1 || f === 2) ? f : null;
  }

  /* Que alerta vale em cada fase? Cartela cheia sempre; quina só na fase 1. */
  function alertaPermitido(fase, tipo) {
    return tipo === 'cheia' || Number(fase) === 1;
  }

  var API = { avaliarCartela: avaliarCartela, faseDaMensagem: faseDaMensagem, alertaPermitido: alertaPermitido };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Logica = API;
})(typeof window !== 'undefined' ? window : this);
