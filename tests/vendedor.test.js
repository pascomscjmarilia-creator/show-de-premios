/* Testes do painel do vendedor (backend.gs): consultar, vender e listar vendas, com planilha simulada.
   Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Sheet {
  constructor(nome, cab) { this.nome = nome; this.m = cab ? [cab.slice()] : []; this.congelado = 0; }
  getName() { return this.nome; }
  getLastRow() { return this.m.length; }
  getLastColumn() { return this.m.reduce((n, r) => Math.max(n, r.length), 0); }
  appendRow(l) { this.m.push(l.slice()); }
  setFrozenRows(n) { this.congelado = n; }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.m[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      getDisplayValues() { return this.getValues().map(l => l.map(String)); },
      setValues(v) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { while (sh.m.length < r + i) sh.m.push([]); sh.m[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
      setValue(v) { while (sh.m.length < r) sh.m.push([]); sh.m[r - 1][c - 1] = v; return this; },
      setNumberFormat() { return this; }
    };
  }
}

function montar() {
  const cab = ['id_cartela', 'comprador_nome', 'comprador_telefone', 'paga', 'data_venda', 'numeros_json', 'grade_json', 'data_cadastro', 'sorteada', 'serie', 'posicao'];
  const cartelas = new Sheet('Cartelas', cab);
  const abas = { Cartelas: cartelas };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => abas[n] || null, insertSheet: n => { abas[n] = new Sheet(n); return abas[n]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 1, JSON: 2 } },
    Utilities: { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-11-01' : '01/11/2026 10:00:00') },
    Date, JSON, Math, Object, Number, String, Array
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/backend.gs'), 'utf8')
    + '\n;this.F={venderSerie_,situacaoSeries_,minhasVendas_,liberarSerie_,gerarCartela_,verificarToken_};', ctx);
  /* 6 séries de 4 cartelas (10001–10024) e uma cartela solta (10025) */
  for (let i = 0; i < 25; i++) {
    const c = ctx.F.gerarCartela_(), serie = i < 24 ? Math.floor(i / 4) + 1 : '', pos = i < 24 ? (i % 4) + 1 : '';
    cartelas.appendRow([10001 + i, '', '', false, '', JSON.stringify(c.numeros), JSON.stringify(c.grade), '2026-08-10', false, serie, pos]);
  }
  return { F: ctx.F, cartelas, abas };
}
const clone = o => JSON.parse(JSON.stringify(o));
const venda = (extra) => Object.assign({ serie: '2', nome: 'Ana Paula Ribeiro', telefone: '14991112233', vendedor: 'Carlos', paga: 'true' }, extra || {});
const col = (cartelas, n) => cartelas.m[0].indexOf(n);

test('situacao: livre, vendida, parcial e inexistente (sem dados pessoais)', () => {
  const { F, cartelas } = montar();
  F.venderSerie_(venda({ serie: '2' }));
  cartelas.m[1][col(cartelas, 'comprador_nome')] = 'Só uma cartela'; /* série 1 parcial */
  const r = clone(F.situacaoSeries_({ serie: '1, 2, 3, 99' })).series;
  assert.deepStrictEqual(r.map(x => x.situacao || 'inexistente'), ['parcial', 'vendida', 'livre', 'inexistente']);
  assert.deepStrictEqual(r[2].cartelas, [10009, 10010, 10011, 10012]);
  assert.ok(!JSON.stringify(r).includes('Ana'), 'não deve vazar o nome do comprador');
});

test('vender: grava as 4 cartelas com nome, celular formatado, pagamento, data e vendedor', () => {
  const { F, cartelas } = montar();
  const r = clone(F.venderSerie_(venda({ nome: '  Ana   Paula  Ribeiro ' })));
  assert.deepStrictEqual(r.series, [2]);
  assert.deepStrictEqual(r.cartelas, [10005, 10006, 10007, 10008]);
  assert.strictEqual(r.telefone, '(14) 99111-2233');
  [10005, 10006, 10007, 10008].forEach(id => {
    const l = cartelas.m[id - 10000];
    assert.strictEqual(l[col(cartelas, 'comprador_nome')], 'Ana Paula Ribeiro');
    assert.strictEqual(l[col(cartelas, 'comprador_telefone')], '(14) 99111-2233');
    assert.strictEqual(l[col(cartelas, 'paga')], true);
    assert.strictEqual(l[col(cartelas, 'data_venda')], '2026-11-01');
    assert.strictEqual(l[col(cartelas, 'vendedor')], 'Carlos');
  });
  assert.strictEqual(cartelas.m[9][col(cartelas, 'comprador_nome')], '', 'série vizinha não pode mudar');
});

test('vender: telefone fixo de 10 dígitos também é aceito e formatado', () => {
  const { F } = montar();
  assert.strictEqual(F.venderSerie_(venda({ telefone: '(14) 3433-1122' })).telefone, '(14) 3433-1122');
});

test('vender: recusa série já vendida e não altera nada (nem o comprador antigo)', () => {
  const { F, cartelas } = montar();
  F.venderSerie_(venda());
  const antes = JSON.stringify(cartelas.m);
  assert.throws(() => F.venderSerie_(venda({ nome: 'Outra Pessoa', vendedor: 'Marta' })), /já vendida.*2/);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
});

test('vender várias séries: tudo ou nada', () => {
  const { F, cartelas } = montar();
  F.venderSerie_(venda({ serie: '3' }));
  const antes = JSON.stringify(cartelas.m);
  assert.throws(() => F.venderSerie_(venda({ serie: '1-4' })), /já vendida.*3/);
  assert.throws(() => F.venderSerie_(venda({ serie: '5, 99' })), /não encontrada.*99/);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
  const ok = clone(F.venderSerie_(venda({ serie: '4-6' })));
  assert.deepStrictEqual(ok.series, [4, 5, 6]);
  assert.strictEqual(ok.cartelas.length, 12);
});

test('vender: valida nome, celular, vendedor e pagamento', () => {
  const { F, cartelas } = montar();
  const antes = JSON.stringify(cartelas.m);
  assert.throws(() => F.venderSerie_(venda({ nome: '   ' })), /nome do comprador/);
  assert.throws(() => F.venderSerie_(venda({ nome: 'x'.repeat(81) })), /até 80/);
  assert.throws(() => F.venderSerie_(venda({ telefone: '991112233' })), /Celular inválido/);
  assert.throws(() => F.venderSerie_(venda({ telefone: '' })), /Celular inválido/);
  assert.throws(() => F.venderSerie_(venda({ telefone: '149911122334' })), /Celular inválido/);
  assert.throws(() => F.venderSerie_(venda({ vendedor: '' })), /vendedor/);
  assert.throws(() => F.venderSerie_(venda({ paga: undefined })), /pagamento/);
  assert.throws(() => F.venderSerie_(venda({ paga: 'talvez' })), /pagamento/);
  assert.throws(() => F.venderSerie_(venda({ serie: 'abc' })), /inválida/);
  assert.throws(() => F.venderSerie_(venda({ serie: '1-30' })), /até 20/);
  assert.strictEqual(JSON.stringify(cartelas.m), antes, 'nenhum erro pode gravar nada');
});

test('vender: pagamento pendente fica como "a receber"', () => {
  const { F, cartelas } = montar();
  F.venderSerie_(venda({ paga: 'false' }));
  assert.strictEqual(cartelas.m[5][col(cartelas, 'paga')], false);
});

test('duas vendas da mesma série seguidas: só a primeira vale', () => {
  const { F, cartelas } = montar();
  F.venderSerie_(venda({ nome: 'Primeiro', vendedor: 'Carlos' }));
  assert.throws(() => F.venderSerie_(venda({ nome: 'Segundo', vendedor: 'Marta' })), /já vendida/);
  assert.strictEqual(cartelas.m[5][col(cartelas, 'comprador_nome')], 'Primeiro');
  assert.strictEqual(cartelas.m[5][col(cartelas, 'vendedor')], 'Carlos');
});

test('log: cada venda vira uma linha em Vendas_log, criada sozinha', () => {
  const { F, abas } = montar();
  F.venderSerie_(venda({ serie: '1' }));
  F.venderSerie_(venda({ serie: '5-6', nome: 'Marta', vendedor: 'Ana', paga: 'false' }));
  const log = abas.Vendas_log.m;
  assert.deepStrictEqual(clone(log[0]), ['data_hora', 'series', 'cartelas', 'comprador', 'telefone', 'vendedor', 'pago', 'registrado_por']);
  assert.strictEqual(log.length, 3);
  assert.deepStrictEqual(clone([log[1][1], log[1][5], log[1][6]]), ['1', 'Carlos', 'sim']);
  assert.deepStrictEqual(clone([log[2][1], log[2][3], log[2][6]]), ['5, 6', 'Marta', 'não']);
});

test('minhasVendas: só as do vendedor (sem acento/maiúscula), com totais, mais recentes primeiro', () => {
  const { F } = montar();
  F.venderSerie_(venda({ serie: '1', vendedor: 'José Santos' }));
  F.venderSerie_(venda({ serie: '2', vendedor: 'José Santos', paga: 'false', nome: 'Beto' }));
  F.venderSerie_(venda({ serie: '3', vendedor: 'Marta' }));
  const r = clone(F.minhasVendas_({ vendedor: ' JOSE  santos ' }));
  assert.deepStrictEqual([r.total, r.pagas, r.aReceber], [2, 1, 1]);
  assert.deepStrictEqual(r.series.map(s => s.serie), [2, 1]);
  assert.strictEqual(r.series[0].comprador, 'Beto');
  assert.throws(() => F.minhasVendas_({ vendedor: '  ' }), /vendedor/);
  assert.strictEqual(clone(F.minhasVendas_({ vendedor: 'Ninguém' })).total, 0);
});

test('desfazer: liberarSerie volta a série para livre e ela pode ser vendida de novo', () => {
  const { F } = montar();
  F.venderSerie_(venda());
  F.liberarSerie_({ serie: '2' });
  assert.strictEqual(clone(F.situacaoSeries_({ serie: '2' })).series[0].situacao, 'livre');
  assert.ok(F.venderSerie_(venda({ nome: 'Novo comprador' })).series);
});

test('planilha sem séries: erro claro', () => {
  const { F, cartelas } = montar();
  const i = col(cartelas, 'serie'); cartelas.m.forEach(l => { l.splice(i, 2); });
  assert.throws(() => F.venderSerie_(venda()), /séries/);
});
