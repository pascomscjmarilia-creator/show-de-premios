/* Testes da busca, filtros e CSV da tela de ganhadores. Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const G = require('../ganhadores-lib.js');

const L = [
  { fase: 'quina',   rodada: 1, serie: 1, cartela: '10001', comprador: 'José Augusto', telefone: '(14) 99555-6677', padrao: 'Linha 2 (horizontal)', premio: '' },
  { fase: 'cheia',   rodada: 1, serie: 1, cartela: '10001', comprador: 'José Augusto', telefone: '(14) 99555-6677', padrao: '', premio: '' },
  { fase: 'quina',   rodada: 2, serie: 6, cartela: '10022', comprador: 'Marta Oliveira', telefone: '(14) 99444-5566', padrao: '4 cantos', premio: '' },
  { fase: 'sorteio', rodada: 0, serie: 12, cartela: '10045 · 10046 · 10047 · 10048', comprador: 'Ana Paula', telefone: '(14) 99111-2233', padrao: '', premio: 'Cesta de café' }
];

test('sem filtro devolve tudo', () => assert.strictEqual(G.filtrar(L, {}).length, 4));
test('filtra por tipo', () => {
  assert.strictEqual(G.filtrar(L, { fase: 'quina' }).length, 2);
  assert.strictEqual(G.filtrar(L, { fase: 'cheia' }).length, 1);
  assert.strictEqual(G.filtrar(L, { fase: 'sorteio' }).length, 1);
});
test('filtra por rodada', () => {
  assert.strictEqual(G.filtrar(L, { rodada: 1 }).length, 2);
  assert.strictEqual(G.filtrar(L, { rodada: 2 }).length, 1);
});
test('busca ignora acento e maiúscula', () => {
  assert.strictEqual(G.filtrar(L, { busca: 'jose' }).length, 2);
  assert.strictEqual(G.filtrar(L, { busca: 'MARTA' }).length, 1);
});
test('busca por série, cartela e prêmio', () => {
  assert.strictEqual(G.filtrar(L, { busca: 'serie 12' }).length, 1);
  assert.strictEqual(G.filtrar(L, { busca: '10047' }).length, 1);
  assert.strictEqual(G.filtrar(L, { busca: 'cesta' }).length, 1);
});
test('busca por telefone com ou sem máscara', () => {
  assert.strictEqual(G.filtrar(L, { busca: '99444-5566' }).length, 1);
  assert.strictEqual(G.filtrar(L, { busca: '14994445566' }).length, 1);
  assert.strictEqual(G.filtrar(L, { busca: '55-6677' }).length, 2);
});
test('filtros combinam', () => {
  assert.strictEqual(G.filtrar(L, { fase: 'quina', rodada: 2, busca: 'marta' }).length, 1);
  assert.strictEqual(G.filtrar(L, { fase: 'cheia', rodada: 2 }).length, 0);
});
test('contagem por tipo', () => assert.deepStrictEqual(G.contar(L), { total: 4, quina: 2, cheia: 1, sorteio: 1 }));
test('esc protege HTML', () => assert.strictEqual(G.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;'));
test('título da apresentação', () => {
  assert.strictEqual(G.tituloApresentacao('todos', 0), 'Ganhadores');
  assert.strictEqual(G.tituloApresentacao('quina', 3), 'Quinas — 3ª rodada');
  assert.strictEqual(G.tituloApresentacao('sorteio', 0), 'Sorteio de séries');
});
test('CSV: cabeçalho, aspas e proteção contra fórmula', () => {
  const csv = G.paraCsv([{ fase: 'sorteio', rodada: 0, serie: 3, cartela: '1', comprador: '=CMD("x")', telefone: '', padrao: '', premio: 'TV "32"', dataHora: '29/10/2026 20:00:00' }]);
  const [cab, lin] = csv.split('\r\n');
  assert.ok(cab.startsWith('"Data e hora";"Tipo"'));
  assert.ok(lin.includes('"\'=CMD(""x"")"'));
  assert.ok(lin.includes('"TV ""32"""'));
  assert.ok(lin.includes('"Sorteio de série"'));
});
