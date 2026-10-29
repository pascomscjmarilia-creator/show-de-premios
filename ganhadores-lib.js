/* ganhadores-lib.js — filtro, busca, contagem e CSV da tela de ganhadores. Sem DOM (testado em tests/). */
(function (raiz) {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* minúsculas e sem acento, para a busca achar "José" digitando "jose" */
  function norm(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function soDigitos(t) { return String(t == null ? '' : t).replace(/\D/g, ''); }

  function rotuloFase(f) { return f === 'cheia' ? 'Cartela cheia' : f === 'sorteio' ? 'Sorteio de série' : 'Quina'; }
  function classe(f) { return f === 'cheia' ? 'cheia' : f === 'sorteio' ? 'sorteio' : 'quina'; }

  /* opcoes: { fase: 'todos'|'quina'|'cheia'|'sorteio', rodada: 0..4, busca: texto } */
  function filtrar(lista, opcoes) {
    var fase = (opcoes && opcoes.fase) || 'todos';
    var rodada = Number(opcoes && opcoes.rodada) || 0;
    var busca = norm(opcoes && opcoes.busca).trim();
    var digitos = soDigitos(opcoes && opcoes.busca);
    return lista.filter(function (g) {
      if (fase !== 'todos' && g.fase !== fase) return false;
      if (rodada && g.rodada !== rodada) return false;
      if (!busca) return true;
      var texto = norm([g.comprador, g.premio, g.padrao, 'serie ' + g.serie, g.serie, g.cartela, g.telefone, rotuloFase(g.fase)].join(' | '));
      if (texto.indexOf(busca) >= 0) return true;
      /* telefone digitado sem máscara (14991112233) */
      return digitos.length >= 4 && soDigitos(g.telefone).indexOf(digitos) >= 0;
    });
  }

  function contar(lista) {
    var q = { total: lista.length, quina: 0, cheia: 0, sorteio: 0 };
    lista.forEach(function (g) { if (q[g.fase] !== undefined) q[g.fase]++; });
    return q;
  }

  function tituloApresentacao(fase, rodada) {
    var base = fase === 'quina' ? 'Quinas' : fase === 'cheia' ? 'Cartelas cheias' : fase === 'sorteio' ? 'Sorteio de séries' : 'Ganhadores';
    return base + (rodada ? ' — ' + rodada + 'ª rodada' : '');
  }

  function celulaCsv(v) {
    var s = String(v == null ? '' : v);
    /* evita que a planilha trate o texto como fórmula */
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function paraCsv(lista) {
    var cab = ['Data e hora', 'Tipo', 'Padrão', 'Rodada', 'Série', 'Cartela(s)', 'Ganhador', 'Telefone', 'Prêmio'];
    var linhas = [cab].concat(lista.map(function (g) {
      return [g.dataHora, rotuloFase(g.fase), g.padrao, g.rodada || '', g.serie || '', g.cartela, g.comprador, g.telefone, g.premio];
    }));
    return linhas.map(function (l) { return l.map(celulaCsv).join(';'); }).join('\r\n');
  }

  var API = { esc: esc, norm: norm, rotuloFase: rotuloFase, classe: classe, filtrar: filtrar, contar: contar, tituloApresentacao: tituloApresentacao, paraCsv: paraCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Ganhadores = API;
})(typeof window !== 'undefined' ? window : this);
