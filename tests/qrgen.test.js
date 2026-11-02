/* Testes do gerador de QR Code próprio (qrgen.js).
 * Não há leitor de QR disponível nos testes, então a validação é feita de quatro formas independentes:
 *  1) valores conhecidos da especificação (Reed-Solomon, informação de formato e de versão, capacidades);
 *  2) estrutura (localizadores, temporização, módulo escuro);
 *  3) um DECODIFICADOR escrito à parte (aritmética e leitura da matriz próprias) que lê o desenho,
 *     confere que todos os códigos de correção fecham e devolve o texto original;
 *  4) a leitura com um celular de verdade (passo manual, descrito no guia).
 * Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const QR = require('../qrgen.js');
const T = QR._teste;

/* ───────── 1) valores conhecidos da especificação ───────── */
test('Reed-Solomon: exemplo clássico "HELLO WORLD" (versão 1-M) gera os 10 bytes de correção esperados', () => {
  const dados = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepStrictEqual(T.bytesCorrecao(dados, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('informação de formato (nível M, máscaras 0 a 7) igual à tabela da especificação', () => {
  const tabela = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  tabela.forEach((bits, m) => assert.strictEqual(T.bitsFormato(m).toString(2).padStart(15, '0'), bits, 'máscara ' + m));
});

test('informação de versão (versões 7 a 10) igual à tabela da especificação', () => {
  const tabela = { 7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011' };
  Object.keys(tabela).forEach(v => assert.strictEqual(T.bitsVersao(Number(v)).toString(2).padStart(18, '0'), tabela[v], 'versão ' + v));
});

test('tabelas: total de palavras-código e dados por versão (nível M) batem com a especificação', () => {
  const totais = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 };
  const dados = { 1: 16, 2: 28, 3: 44, 4: 64, 5: 86, 6: 108, 7: 124, 8: 154, 9: 182, 10: 216 };
  for (let v = 1; v <= 10; v++) {
    const [ec, n1, d1, n2, d2] = T.BLOCOS_M[v];
    assert.strictEqual(n1 * (d1 + ec) + n2 * (d2 + ec), totais[v], 'total v' + v);
    assert.strictEqual(T.totalDados(v), dados[v], 'dados v' + v);
  }
});

test('capacidade em bytes por versão (nível M, modo byte) igual à especificação', () => {
  const cap = { 1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180, 10: 213 };
  Object.keys(cap).forEach(v => assert.strictEqual(QR.capacidadeBytes(Number(v)), cap[v], 'v' + v));
});

test('posições dos centros de alinhamento conferem (versão 2: 6,18 … versão 10: 6,28,50)', () => {
  assert.deepStrictEqual(T.ALINHAMENTO[2], [6, 18]);
  assert.deepStrictEqual(T.ALINHAMENTO[7], [6, 22, 38]);
  assert.deepStrictEqual(T.ALINHAMENTO[10], [6, 28, 50]);
});

/* ───────── 2) estrutura ───────── */
function exato(m, r0, c0, desenho) { desenho.forEach((linha, i) => [...linha].forEach((ch, j) => assert.strictEqual(m[r0 + i][c0 + j], ch === '#', `(${r0 + i},${c0 + j})`))); }
const LOCALIZADOR = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'];

test('estrutura: tamanho, 3 localizadores, separadores claros, temporização e módulo escuro', () => {
  const q = QR.matriz('https://pascomscjmarilia-creator.github.io/show-de-premios/comprador.html?s=7&c=k3f9a1b2c4d5');
  const n = q.tamanho, m = q.modulos;
  assert.strictEqual(n, 17 + 4 * q.versao);
  exato(m, 0, 0, LOCALIZADOR); exato(m, 0, n - 7, LOCALIZADOR); exato(m, n - 7, 0, LOCALIZADOR);
  for (let i = 0; i < 8; i++) {
    assert.strictEqual(m[7][i], false); assert.strictEqual(m[i][7], false);
    assert.strictEqual(m[7][n - 1 - i], false); assert.strictEqual(m[i][n - 8], false);
    assert.strictEqual(m[n - 8][i], false); assert.strictEqual(m[n - 1 - i][7], false);
  }
  for (let i = 8; i < n - 8; i++) { assert.strictEqual(m[6][i], i % 2 === 0, 'linha 6 col ' + i); assert.strictEqual(m[i][6], i % 2 === 0, 'col 6 lin ' + i); }
  assert.strictEqual(m[n - 8][8], true, 'módulo escuro');
});

test('estrutura: padrões de alinhamento (5x5) aparecem onde devem', () => {
  const q = QR.matriz('x'.repeat(100)); /* versão 7: centros 6,22,38 */
  const m = q.modulos, cs = T.ALINHAMENTO[q.versao];
  const alin = ['#####', '#...#', '#.#.#', '#...#', '#####'];
  cs.forEach(r => cs.forEach(c => {
    const sobreLocalizador = (r === 6 && c === 6) || (r === 6 && c === cs[cs.length - 1]) || (c === 6 && r === cs[cs.length - 1]);
    if (!sobreLocalizador) exato(m, r - 2, c - 2, alin);
  }));
});

/* ───────── 3) decodificador independente ───────── */
/* aritmética própria do GF(256) (multiplicação "camponesa", sem tabelas) */
function gfMul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a <<= 1; if (a & 0x100) a ^= 0x11d; b >>= 1; } return r; }
function gfPot(a, n) { let r = 1; for (let i = 0; i < n; i++) r = gfMul(r, a); return r; }
/* o polinômio (palavras-código, maior potência primeiro) tem de anular-se nas raízes α^0 … α^(ec-1) */
function sindromesZero(palavras, ec) {
  for (let k = 0; k < ec; k++) {
    const x = gfPot(2, k); let s = 0;
    palavras.forEach(c => { s = gfMul(s, x) ^ c; });
    if (s !== 0) return false;
  }
  return true;
}
const FORMATO_M = { '101010000010010': 0, '101000100100101': 1, '101111001111100': 2, '101101101001011': 3, '100010111111001': 4, '100000011001110': 5, '100111110010111': 6, '100101010100000': 7 };
const MASCARA_SPEC = [(i, j) => (i + j) % 2 === 0, (i, j) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => (i * j) % 2 + (i * j) % 3 === 0,
  (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0, (i, j) => ((i + j) % 2 + (i * j) % 3) % 2 === 0];
const CENTROS = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const BLOCOS = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]] };

/* mapa das casas que NÃO levam dados (descrito pela especificação, à parte do gerador) */
function ehFuncao(n, v, r, c) {
  if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 8) || (r >= n - 8 && c <= 8)) return true; /* localizadores + separadores + formato */
  if (r === 6 || c === 6) return true;                                                      /* temporização */
  if (v >= 7 && ((r <= 5 && c >= n - 11 && c <= n - 9) || (c <= 5 && r >= n - 11 && r <= n - 9))) return true; /* versão */
  const cs = CENTROS[v];
  for (const a of cs) for (const b of cs) {
    const noLocalizador = (a === 6 && b === 6) || (a === 6 && b === cs[cs.length - 1]) || (b === 6 && a === cs[cs.length - 1]);
    if (!noLocalizador && Math.abs(r - a) <= 2 && Math.abs(c - b) <= 2) return true;      /* alinhamento */
  }
  return false;
}

function decodificar(m) {
  const n = m.length, v = (n - 17) / 4;
  assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, 'tamanho inválido ' + n);
  const bit = (r, c) => (m[r][c] ? '1' : '0');
  /* formato: cópia 1 em volta do localizador superior esquerdo, do bit 14 ao 0 (figura da especificação) */
  let f1 = '';
  for (let c = 0; c <= 5; c++) f1 += bit(8, c);
  f1 += bit(8, 7) + bit(8, 8) + bit(7, 8);
  for (let r = 5; r >= 0; r--) f1 += bit(r, 8);
  /* cópia 2: bits 14..8 na coluna 8 de baixo para cima, bits 7..0 na linha 8 da esquerda para a direita (à direita) */
  let f2 = '';
  for (let r = n - 1; r >= n - 7; r--) f2 += bit(r, 8);
  for (let c = n - 8; c <= n - 1; c++) f2 += bit(8, c);
  assert.strictEqual(f1, f2, 'as duas cópias da informação de formato têm de ser iguais');
  assert.ok(f1 in FORMATO_M, 'formato desconhecido ' + f1);
  const mascara = FORMATO_M[f1];
  /* versão (v >= 7): as duas cópias iguais e coerentes com o tamanho */
  if (v >= 7) {
    let a = 0, b = 0;
    for (let i = 17; i >= 0; i--) { a = (a << 1) | (m[Math.floor(i / 3)][(i % 3) + n - 11] ? 1 : 0); b = (b << 1) | (m[(i % 3) + n - 11][Math.floor(i / 3)] ? 1 : 0); }
    assert.strictEqual(a, b); assert.strictEqual(a >> 12, v);
  }
  /* leitura dos dados em zigue-zague */
  const bits = []; let sobe = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let i = 0; i < n; i++) {
      const r = sobe ? n - 1 - i : i;
      for (const col of [c, c - 1]) if (!ehFuncao(n, v, r, col)) bits.push((m[r][col] !== MASCARA_SPEC[mascara](r, col)) ? 1 : 0);
    }
    sobe = !sobe;
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const [ec, grupos] = BLOCOS[v], tamanhos = [];
  grupos.forEach(([qtd, d]) => { for (let i = 0; i < qtd; i++) tamanhos.push(d); });
  const totalCw = tamanhos.reduce((a, b) => a + b, 0) + ec * tamanhos.length;
  assert.strictEqual(cw.length, totalCw, 'quantidade de palavras-código lidas');
  /* desintercala */
  const dados = tamanhos.map(() => []), cor = tamanhos.map(() => []);
  let p = 0; const maior = Math.max(...tamanhos);
  for (let i = 0; i < maior; i++) tamanhos.forEach((t, b) => { if (i < t) dados[b].push(cw[p++]); });
  for (let i = 0; i < ec; i++) tamanhos.forEach((t, b) => { cor[b].push(cw[p++]); });
  dados.forEach((d, b) => assert.ok(sindromesZero(d.concat(cor[b]), ec), 'bloco ' + b + ': correção de erros não fecha'));
  /* lê o fluxo de dados */
  const fluxo = [].concat(...dados).map(x => x.toString(2).padStart(8, '0')).join('');
  assert.strictEqual(fluxo.slice(0, 4), '0100', 'modo byte');
  const bitsContagem = v <= 9 ? 8 : 16, qtd = parseInt(fluxo.slice(4, 4 + bitsContagem), 2);
  const bytes = [];
  for (let i = 0; i < qtd; i++) bytes.push(parseInt(fluxo.slice(4 + bitsContagem + i * 8, 12 + bitsContagem + i * 8), 2));
  return { texto: Buffer.from(bytes).toString('utf8'), versao: v, mascara: mascara };
}

test('decodificador independente: o link real de uma série volta idêntico', () => {
  const url = 'https://pascomscjmarilia-creator.github.io/show-de-premios/comprador.html?s=7&c=k3f9a1b2c4d5';
  const q = QR.matriz(url), d = decodificar(q.modulos);
  assert.strictEqual(d.texto, url);
  assert.strictEqual(d.versao, q.versao);
  assert.strictEqual(d.mascara, q.mascara);
});

test('decodifica textos de todos os tamanhos possíveis (1 a 213 bytes), cobrindo as versões 1 a 10', () => {
  const versoes = new Set();
  for (let len = 1; len <= 213; len++) {
    let t = ''; for (let i = 0; i < len; i++) t += String.fromCharCode(33 + ((i * 7 + len * 13) % 90));
    const q = QR.matriz(t); versoes.add(q.versao);
    assert.strictEqual(decodificar(q.modulos).texto, t, 'comprimento ' + len);
  }
  assert.deepStrictEqual([...versoes].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('decodifica UTF-8 (acentos, emoji) e textos aleatórios', () => {
  ['Série 7 — cartela nº 10005 ✓', 'José d\'Ávila: ação & coração 🎁', 'ÀÉÎÕÜ çãõ'].forEach(t => assert.strictEqual(decodificar(QR.matriz(t).modulos).texto, t));
  let semente = 12345;
  const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let k = 0; k < 40; k++) {
    const len = 1 + Math.floor(rnd() * 150); let t = '';
    for (let i = 0; i < len; i++) t += String.fromCharCode(32 + Math.floor(rnd() * 95));
    assert.strictEqual(decodificar(QR.matriz(t).modulos).texto, t);
  }
});

test('cada uma das 8 máscaras produz um QR decodificável', () => {
  const url = 'https://exemplo.org/comprador.html?s=12&c=abcdefghij12';
  const bytes = T.utf8(url);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find(x => bytes.length <= QR.capacidadeBytes(x));
  const finais = T.intercalar(T.montarDados(bytes, v), v);
  for (let mascara = 0; mascara < 8; mascara++) {
    const m = T.construir(v, finais, mascara);
    const d = decodificar(m);
    assert.strictEqual(d.texto, url, 'máscara ' + mascara); assert.strictEqual(d.mascara, mascara);
  }
});

test('o decodificador de verdade percebe estrago: inverter um módulo de dados é detectado', () => {
  const q = QR.matriz('https://exemplo.org/comprador.html?s=12&c=abcdefghij12');
  const n = q.tamanho; let alterado = false;
  const m = q.modulos.map(l => l.slice());
  for (let r = n - 1; r >= 0 && !alterado; r--) for (let c = n - 1; c >= 0 && !alterado; c--) if (!ehFuncao(n, q.versao, r, c)) { m[r][c] = !m[r][c]; alterado = true; }
  assert.throws(() => decodificar(m), /correção de erros não fecha|quantidade/);
});

/* ───────── API ───────── */
test('texto longo demais dá erro claro', () => {
  assert.throws(() => QR.matriz('x'.repeat(214)), /longo demais/);
  assert.doesNotThrow(() => QR.matriz('x'.repeat(213)));
});

test('é determinístico: mesmo texto, mesmo desenho', () => {
  const a = QR.matriz('https://exemplo.org/?s=1&c=abcdefghij12'), b = QR.matriz('https://exemplo.org/?s=1&c=abcdefghij12');
  assert.deepStrictEqual(a.modulos, b.modulos);
});

test('SVG: reproduz exatamente a matriz (com margem de 4 módulos) e tem o tamanho pedido', () => {
  const t = 'https://exemplo.org/comprador.html?s=3&c=abcdefghij12', q = QR.matriz(t);
  const s = QR.svg(t, { modulo: 3, margem: 4 });
  assert.match(s, /^<svg /);
  const total = q.tamanho + 8;
  assert.ok(s.includes('viewBox="0 0 ' + total + ' ' + total + '"'));
  assert.ok(s.includes('width="' + total * 3 + '"'));
  const grade = Array.from({ length: total }, () => Array(total).fill(false));
  const caminho = /d="([^"]+)"/.exec(s)[1];
  for (const [, x, y, w] of caminho.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) grade[Number(y)][Number(x) + i] = true;
  for (let r = 0; r < total; r++) for (let c = 0; c < total; c++) {
    const esperado = r >= 4 && c >= 4 && r < 4 + q.tamanho && c < 4 + q.tamanho ? q.modulos[r - 4][c - 4] : false;
    assert.strictEqual(grade[r][c], esperado, `(${r},${c})`);
  }
  assert.ok(!/<script|onload|javascript:/i.test(s), 'o SVG não pode carregar nada ativo');
});
