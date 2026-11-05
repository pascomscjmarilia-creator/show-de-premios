/* qrgen.js — Gerador de QR Code próprio do Show de Prêmios (sem dependências).
 *
 * Implementa o QR Code "Model 2" no modo BYTE (texto UTF-8), correção de erros nível M (~15%),
 * versões 1 a 10 (até 213 bytes) — de sobra para o link de cada série.
 * Testado em tests/qrgen.test.js contra valores da especificação e contra um decodificador independente.
 *
 *   QRGen.matriz('texto')  -> { tamanho, modulos[linha][coluna] (true = escuro), versao, mascara }
 *   QRGen.svg('texto', { modulo: 4, margem: 4 })  -> string <svg> pronta para inserir na página
 *   QRGen.svg('texto', { logo: { href: 'imagens/brasao.png', proporcao: 120 / 213 } })  -> com o brasão no centro
 *   QRGen.svgComLogo(...) devolve também { logo: { aplicado, altura, largura, palavrasPorBloco, limite } }
 *
 * O logo cobre módulos do QR: isso é "erro" que a correção (Reed-Solomon) absorve. O gerador calcula quantas
 * palavras-código o logo atinge em cada bloco e só aceita um tamanho que use, no máximo, METADE da capacidade
 * de correção de cada bloco (margem para impressão ruim, sombra, desgaste).
 */
(function (raiz) {
  'use strict';

  /* ── Campo de Galois GF(256), polinômio x^8 + x^4 + x^3 + x^2 + 1 (0x11D) ── */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* Polinômio gerador de Reed-Solomon de grau n (coeficientes do maior para o menor, o 1º é 1). */
  function geradorRS(n) {
    var g = [1], i, j;
    for (i = 0; i < n; i++) {
      var prox = new Array(g.length + 1);
      for (j = 0; j < prox.length; j++) prox[j] = 0;
      for (j = 0; j < g.length; j++) { prox[j] ^= g[j]; prox[j + 1] ^= mul(g[j], EXP[i]); }
      g = prox;
    }
    return g;
  }
  /* Resto da divisão de (dados · x^n) pelo gerador: são os n bytes de correção. */
  function bytesCorrecao(dados, n) {
    var g = geradorRS(n), r = [], i, j;
    for (i = 0; i < n; i++) r.push(0);
    for (i = 0; i < dados.length; i++) {
      var f = dados[i] ^ r[0];
      r.shift(); r.push(0);
      if (f !== 0) for (j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f);
    }
    return r;
  }

  /* ── Tabelas (nível M): [bytes de correção por bloco, nº blocos grupo 1, dados/bloco g1, nº blocos g2, dados/bloco g2] ── */
  var BLOCOS_M = {
    1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44]
  };
  var ALINHAMENTO = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };
  var MAX_VERSAO = 10;

  function totalDados(v) { var b = BLOCOS_M[v]; return b[1] * b[2] + b[3] * b[4]; }
  function capacidadeBytes(v) { return Math.floor((totalDados(v) * 8 - 4 - (v <= 9 ? 8 : 16)) / 8); }

  /* ── Texto → bytes UTF-8 ── */
  function utf8(txt) {
    var out = [], i, c;
    txt = String(txt);
    for (i = 0; i < txt.length; i++) {
      c = txt.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < txt.length) { c = 0x10000 + ((c - 0xd800) << 10) + (txt.charCodeAt(++i) - 0xdc00); }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /* ── Bits de dados → bytes de dados (com preenchimento) ── */
  function montarDados(bytes, v) {
    var bits = [], i;
    function pôr(valor, n) { for (var k = n - 1; k >= 0; k--) bits.push((valor >> k) & 1); }
    pôr(4, 4);                              /* modo BYTE = 0100 */
    pôr(bytes.length, v <= 9 ? 8 : 16);     /* quantidade de caracteres */
    for (i = 0; i < bytes.length; i++) pôr(bytes[i], 8);
    var cap = totalDados(v) * 8;
    pôr(0, Math.min(4, cap - bits.length)); /* terminador */
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; cw.push(b); }
    var alt = [0xec, 0x11], n = 0;
    while (cw.length < totalDados(v)) cw.push(alt[n++ % 2]);
    return cw;
  }

  /* ── Divide em blocos, calcula a correção e intercala ── */
  function intercalar(cw, v) {
    var t = BLOCOS_M[v], ec = t[0], blocos = [], pos = 0, i, j;
    function pegar(qtd, tam) { for (var q = 0; q < qtd; q++) { var d = cw.slice(pos, pos + tam); pos += tam; blocos.push({ dados: d, ec: bytesCorrecao(d, ec) }); } }
    pegar(t[1], t[2]); pegar(t[3], t[4]);
    var out = [], maior = Math.max(t[2], t[4]);
    for (i = 0; i < maior; i++) for (j = 0; j < blocos.length; j++) if (i < blocos[j].dados.length) out.push(blocos[j].dados[i]);
    for (i = 0; i < ec; i++) for (j = 0; j < blocos.length; j++) out.push(blocos[j].ec[i]);
    return out;
  }

  /* ── Informação de formato (nível M = 00) e de versão: códigos BCH ── */
  function digitoBCH(d) { var n = 0; while (d !== 0) { n++; d >>>= 1; } return n; }
  var G15 = 0x537, G15_MASCARA = 0x5412, G18 = 0x1f25;
  function bitsFormato(mascara) {
    var dados = (0 << 3) | mascara, d = dados << 10;
    while (digitoBCH(d) - digitoBCH(G15) >= 0) d ^= G15 << (digitoBCH(d) - digitoBCH(G15));
    return ((dados << 10) | d) ^ G15_MASCARA;
  }
  function bitsVersao(v) {
    var d = v << 12;
    while (digitoBCH(d) - digitoBCH(G18) >= 0) d ^= G18 << (digitoBCH(d) - digitoBCH(G18));
    return (v << 12) | d;
  }

  /* ── Máscaras ── */
  var MASCARAS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r * c) % 3) + ((r + c) % 2)) % 2 === 0; }
  ];

  /* ── Monta a matriz para uma máscara ── */
  function construir(v, dadosFinais, mascara) {
    var n = 17 + 4 * v, m = [], r, c, i;
    for (r = 0; r < n; r++) { m.push([]); for (c = 0; c < n; c++) m[r].push(null); }

    function localizador(lin, col) {
      for (var a = -1; a <= 7; a++) {
        if (lin + a <= -1 || n <= lin + a) continue;
        for (var b = -1; b <= 7; b++) {
          if (col + b <= -1 || n <= col + b) continue;
          m[lin + a][col + b] = (a >= 0 && a <= 6 && (b === 0 || b === 6)) || (b >= 0 && b <= 6 && (a === 0 || a === 6)) || (a >= 2 && a <= 4 && b >= 2 && b <= 4);
        }
      }
    }
    localizador(0, 0); localizador(n - 7, 0); localizador(0, n - 7);

    var cs = ALINHAMENTO[v];
    for (i = 0; i < cs.length; i++) for (var j = 0; j < cs.length; j++) {
      var lin = cs[i], col = cs[j];
      if (m[lin][col] !== null) continue; /* cai em cima de um localizador */
      for (var a = -2; a <= 2; a++) for (var b = -2; b <= 2; b++) m[lin + a][col + b] = (a === -2 || a === 2 || b === -2 || b === 2 || (a === 0 && b === 0));
    }
    for (i = 8; i < n - 8; i++) {
      if (m[i][6] === null) m[i][6] = (i % 2 === 0);
      if (m[6][i] === null) m[6][i] = (i % 2 === 0);
    }

    var funcao = [];
    for (r = 0; r < n; r++) { funcao.push([]); for (c = 0; c < n; c++) funcao[r].push(m[r][c] !== null); }
    var f = bitsFormato(mascara);
    for (i = 0; i < 15; i++) {
      var bit = ((f >> i) & 1) === 1;
      if (i < 6) m[i][8] = bit; else if (i < 8) m[i + 1][8] = bit; else m[n - 15 + i][8] = bit;
      if (i < 8) m[8][n - i - 1] = bit; else if (i < 9) m[8][15 - i - 1 + 1] = bit; else m[8][15 - i - 1] = bit;
    }
    m[n - 8][8] = true; /* módulo escuro fixo */

    if (v >= 7) {
      var vb = bitsVersao(v);
      for (i = 0; i < 18; i++) {
        var bv = ((vb >> i) & 1) === 1;
        m[Math.floor(i / 3)][(i % 3) + n - 8 - 3] = bv;
        m[(i % 3) + n - 8 - 3][Math.floor(i / 3)] = bv;
      }
    }

    /* dados em zigue-zague, de baixo para cima, de 2 em 2 colunas, da direita para a esquerda */
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (m[r][c] !== null) funcao[r][c] = true; /* inclui formato, versão e módulo escuro */
    var palavras = [];
    for (r = 0; r < n; r++) { palavras.push([]); for (c = 0; c < n; c++) palavras[r].push(-1); }
    var inc = -1, lin2 = n - 1, bitIdx = 7, byteIdx = 0, mf = MASCARAS[mascara];
    for (var col2 = n - 1; col2 > 0; col2 -= 2) {
      if (col2 === 6) col2--;
      while (true) {
        for (var k = 0; k < 2; k++) {
          if (m[lin2][col2 - k] === null) {
            var escuro = false;
            if (byteIdx < dadosFinais.length) escuro = ((dadosFinais[byteIdx] >>> bitIdx) & 1) === 1;
            if (mf(lin2, col2 - k)) escuro = !escuro;
            m[lin2][col2 - k] = escuro;
            palavras[lin2][col2 - k] = byteIdx;
            bitIdx--;
            if (bitIdx === -1) { byteIdx++; bitIdx = 7; }
          }
        }
        lin2 += inc;
        if (lin2 < 0 || n <= lin2) { lin2 -= inc; inc = -inc; break; }
      }
    }
    Object.defineProperty(m, 'palavras', { value: palavras });
    Object.defineProperty(m, 'funcao', { value: funcao });
    return m;
  }

  /* ── Penalidade (escolhe a máscara que deixa o desenho mais "legível") ── */
  function penalidade(m) {
    var n = m.length, p = 0, r, c, k, escuros = 0;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (m[r][c]) escuros++;
    for (var eixo = 0; eixo < 2; eixo++) {
      for (r = 0; r < n; r++) {
        var corrida = 1;
        for (c = 1; c < n; c++) {
          var a = eixo ? m[c][r] : m[r][c], b = eixo ? m[c - 1][r] : m[r][c - 1];
          if (a === b) { corrida++; if (c === n - 1 && corrida >= 5) p += 3 + corrida - 5; }
          else { if (corrida >= 5) p += 3 + corrida - 5; corrida = 1; }
        }
      }
    }
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) { var x = m[r][c]; if (x === m[r][c + 1] && x === m[r + 1][c] && x === m[r + 1][c + 1]) p += 3; }
    var pa = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pb = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (r = 0; r < n; r++) for (c = 0; c <= n - 11; c++) {
      var okA = true, okB = true, okC = true, okD = true;
      for (k = 0; k < 11; k++) {
        var h = m[r][c + k] ? 1 : 0, vv = m[c + k][r] ? 1 : 0;
        if (h !== pa[k]) okA = false; if (h !== pb[k]) okB = false;
        if (vv !== pa[k]) okC = false; if (vv !== pb[k]) okD = false;
      }
      if (okA) p += 40; if (okB) p += 40; if (okC) p += 40; if (okD) p += 40;
    }
    var pct = escuros * 100 / (n * n), base = Math.floor(pct / 5) * 5;
    p += Math.min(Math.abs(base - 50), Math.abs(base + 5 - 50)) / 5 * 10;
    return p;
  }

  /* Para cada posição da sequência intercalada (dados e depois correção), a que bloco pertence. */
  function blocoDeCadaPalavra(v) {
    var t = BLOCOS_M[v], tamanhos = [], i, j;
    for (i = 0; i < t[1]; i++) tamanhos.push(t[2]);
    for (i = 0; i < t[3]; i++) tamanhos.push(t[4]);
    var out = [], maior = Math.max(t[2], t[4]);
    for (i = 0; i < maior; i++) for (j = 0; j < tamanhos.length; j++) if (i < tamanhos[j]) out.push(j);
    for (i = 0; i < t[0]; i++) for (j = 0; j < tamanhos.length; j++) out.push(j);
    return { bloco: out, blocos: tamanhos.length, correcao: t[0] };
  }

  /* Quantas palavras-código de cada bloco um retângulo de módulos (lin, col, alt, larg) destrói.
   * Devolve null se o retângulo encosta em padrões de função (localizadores, alinhamento, formato...). */
  function danoDoRetangulo(m, lin, col, alt, larg, v) {
    var info = blocoDeCadaPalavra(v), vistos = {}, porBloco = [], i, r, c;
    for (i = 0; i < info.blocos; i++) porBloco.push(0);
    for (r = lin; r < lin + alt; r++) for (c = col; c < col + larg; c++) {
      if (r < 0 || c < 0 || r >= m.length || c >= m.length || m.funcao[r][c]) return null;
      var w = m.palavras[r][c];
      if (w >= 0 && !vistos[w]) { vistos[w] = 1; porBloco[info.bloco[w]]++; }
    }
    return { porBloco: porBloco, maximo: Math.max.apply(null, porBloco), limite: Math.floor(info.correcao / 2) };
  }

  /* Escolhe o MAIOR selo (brasão + 1 módulo de margem branca) que cabe com folga de correção. */
  function escolherLogo(q, proporcao) {
    var n = q.tamanho, melhor = null, alt, larg, lin, col, dano;
    for (alt = Math.floor(n * 0.36); alt >= 7; alt--) {
      larg = Math.max(5, Math.round((alt - 2) * proporcao) + 2);
      lin = Math.floor((n - alt) / 2); col = Math.floor((n - larg) / 2);
      dano = danoDoRetangulo(q.modulos, lin, col, alt, larg, q.versao);
      if (dano && dano.maximo <= Math.floor(dano.limite * 0.5)) { melhor = { lin: lin, col: col, alt: alt, larg: larg, dano: dano }; break; }
    }
    return melhor;
  }

  /* ── API ── */
  function matriz(texto) {
    var bytes = utf8(texto), v = 0, i;
    for (i = 1; i <= MAX_VERSAO; i++) if (bytes.length <= capacidadeBytes(i)) { v = i; break; }
    if (!v) throw new Error('Texto longo demais para o QR Code (máximo ' + capacidadeBytes(MAX_VERSAO) + ' bytes).');
    var finais = intercalar(montarDados(bytes, v), v), melhor = null, melhorM = 0, melhorP = Infinity;
    for (i = 0; i < 8; i++) {
      var m = construir(v, finais, i), p = penalidade(m);
      if (p < melhorP) { melhorP = p; melhor = m; melhorM = i; }
    }
    return { tamanho: melhor.length, modulos: melhor, versao: v, mascara: melhorM };
  }

  function hrefSeguro(h) { return /^[A-Za-z0-9_.\/-]{1,120}$/.test(h) || /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+\/=]+$/.test(h); }

  /* SVG compacto: um retângulo por sequência horizontal de módulos escuros. Com "logo", reserva o centro. */
  function svgComLogo(texto, opcoes) {
    opcoes = opcoes || {};
    var q = matriz(texto), mod = opcoes.modulo || 4, margem = opcoes.margem === undefined ? 4 : opcoes.margem;
    var logo = null, info = { aplicado: false };
    if (opcoes.logo && opcoes.logo.href) {
      if (!hrefSeguro(opcoes.logo.href)) throw new Error('Endereço de imagem inválido para o logo.');
      logo = escolherLogo(q, opcoes.logo.proporcao > 0 ? opcoes.logo.proporcao : 0.56);
      if (logo) info = { aplicado: true, altura: logo.alt, largura: logo.larg, linha: logo.lin, coluna: logo.col, palavrasPorBloco: logo.dano.porBloco, maximoPorBloco: logo.dano.maximo, limite: logo.dano.limite };
    }
    var total = q.tamanho + margem * 2, d = '', r, c;
    for (r = 0; r < q.tamanho; r++) {
      c = 0;
      while (c < q.tamanho) {
        var dentro = logo && r >= logo.lin && r < logo.lin + logo.alt && c >= logo.col && c < logo.col + logo.larg;
        if (q.modulos[r][c] && !dentro) { var ini = c; while (c < q.tamanho && q.modulos[r][c] && !(logo && r >= logo.lin && r < logo.lin + logo.alt && c >= logo.col && c < logo.col + logo.larg)) c++; d += 'M' + (ini + margem) + ' ' + (r + margem) + 'h' + (c - ini) + 'v1h-' + (c - ini) + 'z'; }
        else c++;
      }
    }
    var lado = total * mod;
    var extra = '';
    if (logo) {
      var x = logo.col + margem, y = logo.lin + margem;
      extra = '<rect x="' + x + '" y="' + y + '" width="' + logo.larg + '" height="' + logo.alt + '" rx="0.8" fill="#fff"/>'
        + '<image href="' + opcoes.logo.href + '" x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (logo.larg - 2) + '" height="' + (logo.alt - 2) + '" preserveAspectRatio="xMidYMid meet"/>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + lado + '" height="' + lado + '" shape-rendering="crispEdges" role="img" aria-label="QR Code">'
      + '<rect width="' + total + '" height="' + total + '" fill="#fff"/><path d="' + d + '" fill="#000"/>' + extra + '</svg>';
    return { svg: svg, logo: info, versao: q.versao, tamanho: q.tamanho };
  }
  function svg(texto, opcoes) { return svgComLogo(texto, opcoes).svg; }

  var API = {
    matriz: matriz, svg: svg, svgComLogo: svgComLogo, capacidadeBytes: capacidadeBytes,
    /* expostos só para os testes */
    _teste: { bytesCorrecao: bytesCorrecao, bitsFormato: bitsFormato, bitsVersao: bitsVersao, utf8: utf8, montarDados: montarDados, intercalar: intercalar, BLOCOS_M: BLOCOS_M, ALINHAMENTO: ALINHAMENTO, MASCARAS: MASCARAS, totalDados: totalDados, construir: construir, penalidade: penalidade, escolherLogo: escolherLogo, danoDoRetangulo: danoDoRetangulo, blocoDeCadaPalavra: blocoDeCadaPalavra }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.QRGen = API;
})(typeof window !== 'undefined' ? window : this);
