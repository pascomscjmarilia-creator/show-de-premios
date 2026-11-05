/* Testes do brasão no centro do QR Code: o selo cobre módulos, e a correção de erros (Reed-Solomon) tem de absorvê-los.
 * Usa um corretor RS de verdade (Berlekamp-Massey + Chien + Forney) escrito aqui, com tabelas próprias do GF(256).
 * Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const QR = require('../qrgen.js');
const T = QR._teste;

/* ── GF(256) próprio ── */
const EXPT = new Array(512), LOGT = new Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { EXPT[i] = x; LOGT[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXPT[i] = EXPT[i - 255]; })();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXPT[LOGT[a] + LOGT[b]];
const gdiv = (a, b) => { if (b === 0) throw new Error('divisão por zero'); return a === 0 ? 0 : EXPT[(LOGT[a] + 255 - LOGT[b]) % 255]; };

function corrigirRS(palavras, ec) {
  const r = palavras.slice(), n = r.length, S = [];
  for (let k = 0; k < ec; k++) { let s = 0; for (const c of r) s = gmul(s, EXPT[k]) ^ c; S.push(s); }
  if (S.every(x => x === 0)) return { palavras: r, erros: 0 };
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let i = 0; i < ec; i++) {
    let d = S[i]; for (let j = 1; j <= L; j++) d ^= gmul(C[j] || 0, S[i - j]);
    if (d === 0) { m++; continue; }
    const Tm = C.slice(), coef = gdiv(d, b);
    while (C.length < B.length + m) C.push(0);
    for (let j = 0; j < B.length; j++) C[j + m] ^= gmul(coef, B[j]);
    if (2 * L <= i) { L = i + 1 - L; B = Tm; b = d; m = 1; } else m++;
  }
  while (C.length > 1 && C[C.length - 1] === 0) C.pop();
  if (L > ec / 2 || C.length - 1 !== L) throw new Error('erros demais para corrigir');
  const pos = [];
  for (let p = 0; p < n; p++) {
    const i = n - 1 - p; let v = 0;
    for (let j = 0; j < C.length; j++) v ^= gmul(C[j], EXPT[(255 * 4 - i * j) % 255]);
    if (v === 0) pos.push(p);
  }
  if (pos.length !== L) throw new Error('localizador inconsistente');
  const omega = new Array(ec).fill(0);
  for (let i = 0; i < ec; i++) for (let j = 0; j < C.length && i + j < ec; j++) omega[i + j] ^= gmul(S[i], C[j]);
  pos.forEach(p => {
    const i = n - 1 - p, xinv = EXPT[(255 - i % 255) % 255], X = EXPT[i % 255];
    let om = 0, xp = 1; for (let j = 0; j < ec; j++) { om ^= gmul(omega[j], xp); xp = gmul(xp, xinv); }
    let der = 0; xp = 1; for (let j = 1; j < C.length; j += 2) { der ^= gmul(C[j], xp); xp = gmul(xp, gmul(xinv, xinv)); }
    r[p] ^= gmul(X, gdiv(om, der));
  });
  for (let k = 0; k < ec; k++) { let s = 0; for (const c of r) s = gmul(s, EXPT[k]) ^ c; if (s !== 0) throw new Error('correção não fechou'); }
  return { palavras: r, erros: pos.length };
}

test('corretor RS (do teste) conserta até ec/2 erros aleatórios e recusa mais que isso', () => {
  const dados = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], ec = 10;
  const cw = dados.concat(T.bytesCorrecao(dados, ec));
  let sem = 777; const rnd = () => (sem = (sem * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 200; t++) {
    const ruim = cw.slice(), qtd = 1 + Math.floor(rnd() * 5), usados = new Set();
    while (usados.size < qtd) usados.add(Math.floor(rnd() * cw.length));
    usados.forEach(p => { ruim[p] ^= 1 + Math.floor(rnd() * 255); });
    const r = corrigirRS(ruim, ec);
    assert.deepStrictEqual(r.palavras, cw); assert.strictEqual(r.erros, qtd);
  }
  const demais = cw.slice(); [0, 3, 5, 8, 11, 14].forEach(p => { demais[p] ^= 0x5a; });
  assert.throws(() => corrigirRS(demais, ec));
});

/* ── leitura da matriz (mesmas regras da especificação do outro teste, copiadas aqui) ── */
const FORMATO_M = { '101010000010010': 0, '101000100100101': 1, '101111001111100': 2, '101101101001011': 3, '100010111111001': 4, '100000011001110': 5, '100111110010111': 6, '100101010100000': 7 };
const MASCARA_SPEC = [(i, j) => (i + j) % 2 === 0, (i, j) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => (i * j) % 2 + (i * j) % 3 === 0,
  (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0, (i, j) => ((i + j) % 2 + (i * j) % 3) % 2 === 0];
const CENTROS = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const BLOCOS = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]] };
function ehFuncao(n, v, r, c) {
  if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 8) || (r >= n - 8 && c <= 8)) return true;
  if (r === 6 || c === 6) return true;
  if (v >= 7 && ((r <= 5 && c >= n - 11 && c <= n - 9) || (c <= 5 && r >= n - 11 && r <= n - 9))) return true;
  const cs = CENTROS[v];
  for (const a of cs) for (const b of cs) {
    const noLocalizador = (a === 6 && b === 6) || (a === 6 && b === cs[cs.length - 1]) || (b === 6 && a === cs[cs.length - 1]);
    if (!noLocalizador && Math.abs(r - a) <= 2 && Math.abs(c - b) <= 2) return true;
  }
  return false;
}

/* lê o QR corrigindo cada bloco antes de montar o texto */
function decodificarCorrigindo(m, v) {
  const n = m.length;
  let f = ''; for (let c = 0; c <= 5; c++) f += m[8][c] ? '1' : '0';
  f += (m[8][7] ? '1' : '0') + (m[8][8] ? '1' : '0') + (m[7][8] ? '1' : '0'); for (let r = 5; r >= 0; r--) f += m[r][8] ? '1' : '0';
  const mascara = FORMATO_M[f];
  const bits = []; let sobe = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let i = 0; i < n; i++) { const r = sobe ? n - 1 - i : i; for (const col of [c, c - 1]) if (!ehFuncao(n, v, r, col)) bits.push((m[r][col] !== MASCARA_SPEC[mascara](r, col)) ? 1 : 0); }
    sobe = !sobe;
  }
  const cw = []; for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const [ec, grupos] = BLOCOS[v], tamanhos = []; grupos.forEach(([q, d]) => { for (let i = 0; i < q; i++) tamanhos.push(d); });
  const dados = tamanhos.map(() => []), cor = tamanhos.map(() => []); let p = 0; const maior = Math.max(...tamanhos);
  for (let i = 0; i < maior; i++) tamanhos.forEach((t, b) => { if (i < t) dados[b].push(cw[p++]); });
  for (let i = 0; i < ec; i++) tamanhos.forEach((t, b) => { cor[b].push(cw[p++]); });
  let corrigidas = 0;
  const dadosOk = dados.map((d, b) => { const r = corrigirRS(d.concat(cor[b]), ec); corrigidas += r.erros; return r.palavras.slice(0, d.length); });
  const fluxo = [].concat(...dadosOk).map(x => x.toString(2).padStart(8, '0')).join('');
  const bc = v <= 9 ? 8 : 16, qtd = parseInt(fluxo.slice(4, 4 + bc), 2), bytes = [];
  for (let i = 0; i < qtd; i++) bytes.push(parseInt(fluxo.slice(4 + bc + i * 8, 12 + bc + i * 8), 2));
  return { texto: Buffer.from(bytes).toString('utf8'), corrigidas: corrigidas };
}

const LOGO = { href: 'imagens/brasao.png', proporcao: 120 / 213 };
function brancoNoSelo(q, l) { const m = q.modulos.map(x => x.slice()); for (let r = l.linha; r < l.linha + l.altura; r++) for (let c = l.coluna; c < l.coluna + l.largura; c++) m[r][c] = false; return m; }
const URL_SERIE = 'https://pascomscjmarilia-creator.github.io/show-de-premios/comprador.html?s=7&c=k3f9a1b2c4d5';

test('com o brasão no centro o QR continua lendo: o texto volta idêntico depois da correção de erros', () => {
  const r = QR.svgComLogo(URL_SERIE, { logo: LOGO }), q = QR.matriz(URL_SERIE);
  assert.strictEqual(r.logo.aplicado, true);
  const lido = decodificarCorrigindo(brancoNoSelo(q, r.logo), q.versao);
  assert.strictEqual(lido.texto, URL_SERIE);
  assert.ok(lido.corrigidas > 0, 'o selo tem de ter causado erros que o corretor consertou');
});

test('séries de 1 a 1500 com códigos variados: o selo usa no máximo metade da correção e o texto sempre volta', () => {
  let sem = 4242; const rnd = () => (sem = (sem * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789'; let aplicados = 0;
  for (let s = 1; s <= 1500; s += (s < 120 ? 1 : 37)) {
    let c = String.fromCharCode(97 + Math.floor(rnd() * 26)); for (let i = 0; i < 11; i++) c += alfabeto[Math.floor(rnd() * 36)];
    const url = 'https://pascomscjmarilia-creator.github.io/show-de-premios/comprador.html?s=' + s + '&c=' + c;
    const r = QR.svgComLogo(url, { logo: LOGO }), q = QR.matriz(url);
    if (!r.logo.aplicado) continue;
    aplicados++;
    assert.ok(r.logo.maximoPorBloco <= Math.floor(r.logo.limite * 0.5), 'série ' + s);
    assert.strictEqual(decodificarCorrigindo(brancoNoSelo(q, r.logo), q.versao).texto, url, 'série ' + s);
  }
  assert.ok(aplicados > 100, 'o selo tem de caber nesses links');
});

test('mesmo com ainda MAIS erros do que o selo causa (até o limite do corretor), a leitura se mantém', () => {
  const r = QR.svgComLogo(URL_SERIE, { logo: LOGO }), q = QR.matriz(URL_SERIE);
  const m = brancoNoSelo(q, r.logo);
  /* estraga 2 módulos de dados em cada bloco além do selo (sujeira, risco de impressão) */
  let estragos = 0;
  for (let i = 0; i < q.tamanho && estragos < 6; i += 5) for (let j = q.tamanho - 1; j >= 0 && estragos < 6; j -= 7) {
    if (!ehFuncao(q.tamanho, q.versao, i, j) && !(i >= r.logo.linha && i < r.logo.linha + r.logo.altura && j >= r.logo.coluna && j < r.logo.coluna + r.logo.largura)) { m[i][j] = !m[i][j]; estragos++; }
  }
  assert.strictEqual(decodificarCorrigindo(m, q.versao).texto, URL_SERIE);
});

test('o selo nunca encosta em localizadores, alinhamento, temporização nem na informação de formato/versão, e fica centralizado', () => {
  for (let len = 20; len <= 190; len += 7) {
    const t = 'https://exemplo.org/' + 'x'.repeat(len), q = QR.matriz(t), r = QR.svgComLogo(t, { logo: LOGO });
    if (!r.logo.aplicado) continue;
    for (let i = r.logo.linha; i < r.logo.linha + r.logo.altura; i++) for (let j = r.logo.coluna; j < r.logo.coluna + r.logo.largura; j++) assert.strictEqual(ehFuncao(q.tamanho, q.versao, i, j), false, `len ${len} (${i},${j})`);
    assert.ok(Math.abs((r.logo.linha * 2 + r.logo.altura) - q.tamanho) <= 1);
    assert.ok(Math.abs((r.logo.coluna * 2 + r.logo.largura) - q.tamanho) <= 1);
  }
});

test('QR pequeno demais para ter folga: recusa o selo em vez de arriscar', () => {
  const r = QR.svgComLogo('abc', { logo: LOGO });
  assert.strictEqual(r.logo.aplicado, false);
  assert.ok(!r.svg.includes('<image'));
  assert.strictEqual(QR.svg('abc', { logo: LOGO }), QR.svg('abc'));
});

test('SVG com logo: selo branco e imagem no centro; fora do selo o desenho é exatamente o da matriz', () => {
  const r = QR.svgComLogo(URL_SERIE, { logo: LOGO, margem: 4 });
  assert.ok(r.svg.includes('<image href="imagens/brasao.png"'));
  assert.match(r.svg, /<rect x="\d+" y="\d+" width="\d+" height="\d+" rx="0.8" fill="#fff"\/>/);
  assert.ok(!/<script|onload|javascript:/i.test(r.svg));
  const q = QR.matriz(URL_SERIE), total = q.tamanho + 8, l = r.logo;
  const grade = Array.from({ length: total }, () => Array(total).fill(false));
  for (const [, x, y, w] of /d="([^"]+)"/.exec(r.svg)[1].matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) grade[Number(y)][Number(x) + i] = true;
  for (let i = 0; i < q.tamanho; i++) for (let j = 0; j < q.tamanho; j++) {
    const dentro = i >= l.linha && i < l.linha + l.altura && j >= l.coluna && j < l.coluna + l.largura;
    assert.strictEqual(grade[i + 4][j + 4], dentro ? false : q.modulos[i][j], `(${i},${j})`);
  }
});

test('endereço de imagem perigoso é recusado', () => {
  const t = 'https://exemplo.org/' + 'x'.repeat(60);
  ['javascript:alert(1)', 'x" onload="y', 'imagens/a b.png', 'http://x/y.png', '<svg>'].forEach(h => assert.throws(() => QR.svg(t, { logo: { href: h, proporcao: 0.5 } }), /inválido/, h));
  assert.doesNotThrow(() => QR.svg(t, { logo: { href: 'imagens/brasao.png', proporcao: 0.5 } }));
});
