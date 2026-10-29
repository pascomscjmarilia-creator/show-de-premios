/* Testes da conferência de cartelas. Rodar: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { avaliarCartela } = require('../logica.js');

/* Cartela padrão: B 1-15, I 16-30, N 31-45 (centro livre), G 46-60, O 61-75.
   grade[linha][coluna] */
const GRADE = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, null, 48, 63],
  [4, 19, 33, 49, 64],
  [5, 20, 34, 50, 65]
];
const TUDO = { linha: true, diagonal: true, cantos: true };
const NADA = { linha: false, diagonal: false, cantos: false };
const av = (pedras, mod) => avaliarCartela(GRADE, new Set(pedras), mod || TUDO);

test('sem pedras: sem quina, sem cheia, só o centro livre marcado', () => {
  const r = av([]);
  assert.strictEqual(r.temQuina, false);
  assert.strictEqual(r.temCheia, false);
  assert.strictEqual(r.marcadas.filter(Boolean).length, 1);
  assert.strictEqual(r.marcadas[12], true);
});

test('linha horizontal completa (4 pedras + centro livre na linha 3)', () => {
  const r = av([3, 18, 48, 63]);
  assert.strictEqual(r.temQuina, true);
  assert.strictEqual(r.padrao, 'Linha 3 (horizontal)');
});

test('linha horizontal comum', () => {
  const r = av([1, 16, 31, 46, 61]);
  assert.strictEqual(r.padrao, 'Linha 1 (horizontal)');
});

test('coluna completa (vertical) e nome da letra', () => {
  const r = av([16, 17, 18, 19, 20]);
  assert.strictEqual(r.temQuina, true);
  assert.strictEqual(r.padrao, 'Coluna I (vertical)');
});

test('coluna N usa o centro livre', () => {
  const r = av([31, 32, 33, 34]);
  assert.strictEqual(r.padrao, 'Coluna N (vertical)');
});

test('diagonal principal e secundária (com centro livre)', () => {
  assert.strictEqual(av([1, 17, 49, 65]).padrao, 'Diagonal');
  assert.strictEqual(av([61, 47, 19, 5]).padrao, 'Diagonal');
});

test('4 cantos', () => {
  const r = av([1, 61, 5, 65]);
  assert.strictEqual(r.temQuina, true);
  assert.strictEqual(r.padrao, '4 cantos');
});

test('3 cantos não é quina', () => {
  assert.strictEqual(av([1, 61, 5]).temQuina, false);
});

test('4 pedras de uma linha sem completar não é quina', () => {
  assert.strictEqual(av([1, 16, 31, 46]).temQuina, false);
});

test('modalidade desligada não conta', () => {
  assert.strictEqual(av([1, 61, 5, 65], { linha: true, diagonal: true, cantos: false }).temQuina, false);
  assert.strictEqual(av([1, 17, 49, 65], { linha: true, diagonal: false, cantos: true }).temQuina, false);
  assert.strictEqual(av([1, 16, 31, 46, 61], { linha: false, diagonal: true, cantos: true }).temQuina, false);
  assert.strictEqual(av([1, 16, 31, 46, 61], NADA).temQuina, false);
});

test('prioridade do padrão: linha antes de coluna, diagonal e cantos', () => {
  /* Linha 1 + coluna B completas: reporta a linha */
  assert.strictEqual(av([1, 16, 31, 46, 61, 2, 3, 4, 5]).padrao, 'Linha 1 (horizontal)');
});

test('cartela cheia: todas as 24 pedras', () => {
  const todas = [];
  GRADE.forEach(l => l.forEach(v => { if (v !== null) todas.push(v); }));
  const r = av(todas);
  assert.strictEqual(r.temCheia, true);
  assert.strictEqual(r.temQuina, true);
});

test('cartela cheia só vale com todas: faltando uma, não é cheia', () => {
  const todas = [];
  GRADE.forEach(l => l.forEach(v => { if (v !== null) todas.push(v); }));
  todas.pop();
  assert.strictEqual(av(todas).temCheia, false);
});

test('cartela cheia vale mesmo com modalidades desligadas', () => {
  const todas = [];
  GRADE.forEach(l => l.forEach(v => { if (v !== null) todas.push(v); }));
  const r = av(todas, NADA);
  assert.strictEqual(r.temCheia, true);
  assert.strictEqual(r.temQuina, false);
});

test('números vindos como texto (JSON/planilha) também casam', () => {
  const g = GRADE.map(l => l.map(v => (v === null ? null : String(v))));
  const r = avaliarCartela(g, new Set([1, 61, 5, 65]), TUDO);
  assert.strictEqual(r.padrao, '4 cantos');
});

test('grade incompleta não quebra e sempre devolve 25 casas', () => {
  const r = avaliarCartela([GRADE[0], GRADE[1]], new Set([1, 2]), TUDO);
  assert.strictEqual(r.marcadas.length, 25);
  /* linhas ausentes contam como livres (mesmo comportamento de sempre do Verificador) */
});

test('pedra repetida/fora da cartela não altera', () => {
  const a = av([1, 61, 5, 65]);
  const b = av([1, 61, 5, 65, 75, 74, 1]);
  assert.deepStrictEqual(a.marcadas, b.marcadas);
});

/* ── Gerador de cartelas do backend (backend.gs) ── */
const ctx = { Date, JSON, Math, Object, Number, String, Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/backend.gs'), 'utf8') + '\n;this.G=gerarCartela_;', ctx);

test('gerador: 500 cartelas válidas (faixas B-I-N-G-O, sem repetir, centro livre)', () => {
  const faixas = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  for (let k = 0; k < 500; k++) {
    const c = ctx.G();
    const g = c.grade;
    assert.strictEqual(g.length, 5);
    const vistos = new Set();
    for (let col = 0; col < 5; col++)
      for (let lin = 0; lin < 5; lin++) {
        const v = g[lin][col];
        if (lin === 2 && col === 2) { assert.ok(v === null || v === 0 || v === 'FREE' || v === '', 'centro livre, veio ' + v); continue; }
        assert.ok(v >= faixas[col][0] && v <= faixas[col][1], 'coluna ' + col + ' fora da faixa: ' + v);
        assert.ok(!vistos.has(v), 'número repetido ' + v);
        vistos.add(v);
      }
    assert.strictEqual(vistos.size, 24);
  }
});
