/* Testes do cadastro pelo comprador via QR Code (backend.gs): código secreto por série e ações públicas.
   Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Sheet {
  constructor(nome, cab) { this.nome = nome; this.m = cab ? [cab.slice()] : []; this.formatos = {}; }
  getLastRow() { return this.m.length; }
  getLastColumn() { return this.m.reduce((n, r) => Math.max(n, r.length), 0); }
  appendRow(l) { this.m.push(l.slice()); }
  setFrozenRows() {}
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.m[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      getDisplayValues() { return this.getValues().map(l => l.map(String)); },
      setValues(v) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { while (sh.m.length < r + i) sh.m.push([]); sh.m[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
      setValue(v) { while (sh.m.length < r) sh.m.push([]); sh.m[r - 1][c - 1] = v; return this; },
      setNumberFormat(f) { sh.formatos[c] = f; return this; }
    };
  }
}
const TOKENS = { equipe: { c: '55566677788', a: 0 }, vend: { c: '11122233344', a: 0 } };

function montar(opcoes) {
  opcoes = opcoes || {};
  const cab = ['id_cartela', 'comprador_nome', 'comprador_telefone', 'paga', 'data_venda', 'numeros_json', 'grade_json', 'data_cadastro', 'sorteada', 'serie', 'posicao'];
  const cartelas = new Sheet('Cartelas', cab);
  const abas = { Cartelas: cartelas, Vendedores: new Sheet('Vendedores', ['cpf', 'nome']) };
  abas.Vendedores.appendRow(['111.222.333-44', 'Carlos']);
  let uuid = 0;
  const cache = {};
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => abas[n] || null, insertSheet: n => { abas[n] = new Sheet(n); return abas[n]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 1, JSON: 2 } },
    Utilities: {
      formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-11-01' : '01/11/2026 10:00:00'),
      getUuid: () => { uuid++; return (uuid + 'a1b2c3d4-e5f6-4789-8abc-' + String(uuid).padStart(12, '0')).slice(0, 36); }
    },
    Date, JSON, Math, Object, Number, String, Array, RegExp
  };
  if (!opcoes.semCache) ctx.CacheService = { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/backend.gs'), 'utf8') + '\n;this.F={doGet,gerarCartela_};', ctx);
  ctx.verificarToken_ = (t) => TOKENS[t] || null;
  for (let i = 0; i < 24; i++) {
    const c = ctx.F.gerarCartela_();
    cartelas.appendRow([10001 + i, '', '', false, '', JSON.stringify(c.numeros), JSON.stringify(c.grade), '2026-08-10', false, Math.floor(i / 4) + 1, (i % 4) + 1]);
  }
  const chamar = (acao, extra, token) => JSON.parse(ctx.F.doGet({ parameter: Object.assign({ acao: acao }, token ? { token: token } : {}, extra || {}) }).t);
  const codigos = () => { const r = chamar('listarCodigosQR', {}, 'equipe'); const o = {}; r.dados.series.forEach(s => { o[s.serie] = s.codigo; }); return o; };
  return { chamar, codigos, abas, cartelas, cache };
}
const col = (c, n) => c.m[0].indexOf(n);
const cad = (cod, extra) => Object.assign({ serie: '2', codigo: cod, nome: 'Beatriz Lima', telefone: '14988887777', aceite: 'sim' }, extra || {});

test('listarCodigosQR: cria um código por série, igual nas 4 cartelas, começando com letra, e é estável', () => {
  const { chamar, codigos, cartelas } = montar();
  const a = codigos(), b = codigos();
  assert.deepStrictEqual(a, b, 'chamar de novo não pode mudar os códigos');
  const lista = Object.values(a);
  assert.strictEqual(lista.length, 6);
  assert.strictEqual(new Set(lista).size, 6, 'códigos repetidos');
  lista.forEach(c => assert.match(c, /^[a-z][a-z0-9]{11}$/));
  const j = col(cartelas, 'codigo_qr');
  for (let s = 1; s <= 6; s++) for (let k = 0; k < 4; k++) assert.strictEqual(cartelas.m[(s - 1) * 4 + k + 1][j], a[s]);
  assert.strictEqual(cartelas.formatos[j + 1], '@', 'a coluna deve ser texto');
  assert.deepStrictEqual(Object.keys(JSON.parse(JSON.stringify(chamar('listarCodigosQR', { serie: '2-3' }, 'equipe').dados.series.map(s => s.serie)))), ['0', '1']);
});

test('listarCodigosQR: completa uma série com cartela sem código usando o código que já existe', () => {
  const { chamar, codigos, cartelas } = montar();
  const a = codigos();
  const j = col(cartelas, 'codigo_qr');
  cartelas.m[3][j] = ''; /* uma das 4 cartelas da série 1 ficou sem código */
  assert.strictEqual(chamar('listarCodigosQR', { serie: '1' }, 'equipe').dados.series[0].codigo, a[1]);
  assert.strictEqual(cartelas.m[3][j], a[1]);
});

test('listarCodigosQR exige login e é bloqueado para o vendedor', () => {
  const { chamar } = montar();
  assert.strictEqual(chamar('listarCodigosQR', {}).dados.naoAutorizado, true);
  assert.strictEqual(chamar('listarCodigosQR', {}, 'vend').dados.perfilRestrito, true);
});

test('consultarSerieQR: com o código certo mostra a série; não mostra nenhum dado pessoal', () => {
  const { chamar, codigos } = montar();
  const c = codigos();
  const r = chamar('consultarSerieQR', { serie: '2', codigo: c[2] });
  assert.strictEqual(r.sucesso, true);
  assert.deepStrictEqual([r.dados.serie, r.dados.situacao], [2, 'livre']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.dados.cartelas)), [10005, 10006, 10007, 10008]);
  assert.deepStrictEqual(Object.keys(r.dados).sort(), ['cartelas', 'serie', 'situacao']);
});

test('consultarSerieQR: código errado, de outra série, série inexistente ou lixo dão a MESMA resposta', () => {
  const { chamar, codigos } = montar();
  const c = codigos();
  const msgs = [
    chamar('consultarSerieQR', { serie: '2', codigo: 'aaaaaaaaaaaa' }),
    chamar('consultarSerieQR', { serie: '2', codigo: c[3] }),
    chamar('consultarSerieQR', { serie: '99', codigo: c[2] }),
    chamar('consultarSerieQR', { serie: '2', codigo: '' }),
    chamar('consultarSerieQR', { serie: '2' }),
    chamar('consultarSerieQR', { serie: 'abc', codigo: c[2] }),
    chamar('consultarSerieQR', { serie: '2', codigo: c[2] + 'x' }),
    chamar('consultarSerieQR', { serie: '2.5', codigo: c[2] })
  ].map(r => { assert.strictEqual(r.sucesso, false); return r.dados.mensagem; });
  assert.strictEqual(new Set(msgs).size, 1);
});

test('antes de existirem códigos, nenhum link funciona', () => {
  const { chamar } = montar();
  assert.strictEqual(chamar('consultarSerieQR', { serie: '2', codigo: 'aaaaaaaaaaaa' }).sucesso, false);
});

test('cadastrarPorQR: grava nome e celular nas 4 cartelas, como "a receber", sem login', () => {
  const { chamar, codigos, cartelas, abas } = montar();
  const c = codigos();
  const r = chamar('cadastrarPorQR', cad(c[2], { nome: '  Beatriz   Lima ' }));
  assert.strictEqual(r.sucesso, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.dados.cartelas)), [10005, 10006, 10007, 10008]);
  [10005, 10006, 10007, 10008].forEach(id => {
    const l = cartelas.m[id - 10000];
    assert.strictEqual(l[col(cartelas, 'comprador_nome')], 'Beatriz Lima');
    assert.strictEqual(l[col(cartelas, 'comprador_telefone')], '(14) 98888-7777');
    assert.strictEqual(l[col(cartelas, 'paga')], false);
    assert.strictEqual(l[col(cartelas, 'data_venda')], '2026-11-01');
    assert.strictEqual(l[col(cartelas, 'vendedor')], 'Cadastro pelo comprador (QR)');
  });
  assert.strictEqual(cartelas.m[9][col(cartelas, 'comprador_nome')], '', 'série vizinha não pode mudar');
  const log = abas.Vendas_log.m;
  assert.deepStrictEqual(JSON.parse(JSON.stringify([log[1][1], log[1][5], log[1][6], log[1][7]])), ['2', 'Cadastro pelo comprador (QR)', 'não', 'QR']);
  assert.strictEqual(chamar('consultarSerieQR', { serie: '2', codigo: c[2] }).dados.situacao, 'cadastrada');
});

test('cadastrarPorQR: segunda tentativa na mesma série é recusada e não muda nada', () => {
  const { chamar, codigos, cartelas } = montar();
  const c = codigos();
  chamar('cadastrarPorQR', cad(c[2]));
  const antes = JSON.stringify(cartelas.m);
  const r = chamar('cadastrarPorQR', cad(c[2], { nome: 'Outra Pessoa', telefone: '14911112222' }));
  assert.strictEqual(r.sucesso, false);
  assert.match(r.dados.mensagem, /já foi cadastrada/);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
});

test('cadastrarPorQR: não sobrescreve série vendida por vendedor', () => {
  const { chamar, codigos, cartelas } = montar();
  const c = codigos();
  chamar('venderSerie', { serie: '2', nome: 'Ana', telefone: '14991112233', vendedor: 'Carlos', paga: 'true' }, 'equipe');
  const r = chamar('cadastrarPorQR', cad(c[2]));
  assert.strictEqual(r.sucesso, false);
  assert.strictEqual(cartelas.m[5][col(cartelas, 'comprador_nome')], 'Ana');
});

test('cadastrarPorQR: código errado não grava nada', () => {
  const { chamar, codigos, cartelas } = montar();
  const c = codigos();
  const antes = JSON.stringify(cartelas.m);
  assert.strictEqual(chamar('cadastrarPorQR', cad(c[3])).sucesso, false);
  assert.strictEqual(chamar('cadastrarPorQR', cad('aaaaaaaaaaaa')).sucesso, false);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
});

test('cadastrarPorQR: valida nome, celular, autorização e o campo-armadilha, sem gravar', () => {
  const { chamar, codigos, cartelas } = montar();
  const c = codigos();
  const antes = JSON.stringify(cartelas.m);
  const ruins = [
    cad(c[2], { nome: '' }), cad(c[2], { nome: 'Ab' }), cad(c[2], { nome: 'x'.repeat(81) }),
    cad(c[2], { nome: '=HYPERLINK("http://x","clique")' }), cad(c[2], { nome: '+55 Fulano' }), cad(c[2], { nome: '@cmd' }), cad(c[2], { nome: 'Ana 2' }),
    cad(c[2], { nome: '<b>Ana</b>' }), cad(c[2], { telefone: '9888' }), cad(c[2], { telefone: '' }), cad(c[2], { telefone: '149888877779' }),
    cad(c[2], { aceite: '' }), cad(c[2], { aceite: 'nao' }), cad(c[2], { site: 'http://spam' })
  ];
  ruins.forEach((p, i) => assert.strictEqual(chamar('cadastrarPorQR', p).sucesso, false, 'caso ' + i));
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
  assert.strictEqual(chamar('cadastrarPorQR', cad(c[2], { nome: "José D'Ávila-Souza Jr." })).sucesso, true);
});

test('o código secreto nunca aparece nas telas da equipe (listarVendas, buscarSerie, listarCartelas)', () => {
  const { chamar, codigos } = montar();
  const c = codigos();
  ['listarVendas', 'listarCartelas', 'listarSeries'].forEach(a => {
    const t = JSON.stringify(chamar(a, {}, 'equipe'));
    Object.values(c).forEach(cod => assert.ok(!t.includes(cod), a + ' vazou o código'));
  });
  assert.ok(!JSON.stringify(chamar('buscarSerie', { serie: '2' }, 'equipe')).includes(c[2]));
});

test('limite de tentativas: depois de 120 por minuto, pede para aguardar', () => {
  const { chamar, codigos } = montar();
  const c = codigos();
  let ultimo;
  for (let i = 0; i < 125; i++) ultimo = chamar('consultarSerieQR', { serie: '2', codigo: c[2] });
  assert.strictEqual(ultimo.sucesso, false);
  assert.match(ultimo.dados.mensagem, /Muitas tentativas/);
});

test('sem CacheService o sistema segue funcionando (sem limite)', () => {
  const { chamar, codigos } = montar({ semCache: true });
  const c = codigos();
  assert.strictEqual(chamar('consultarSerieQR', { serie: '2', codigo: c[2] }).sucesso, true);
});

test('venda pelo vendedor também recusa nome que começa com = + - @', () => {
  const { chamar } = montar();
  ['=SOMA(1)', '+1', '-1', '@x'].forEach(n => {
    const r = chamar('venderSerie', { serie: '1', nome: n, telefone: '14991112233', vendedor: 'Carlos', paga: 'true' }, 'equipe');
    assert.strictEqual(r.sucesso, false, n);
  });
  assert.strictEqual(chamar('venderSerie', { serie: '1', nome: 'Ana', telefone: '14991112233', vendedor: '=x', paga: 'true' }, 'equipe').sucesso, false);
});

test('gerar séries em lote: o código do QR já nasce com cada série nova', () => {
  const { chamar, cartelas } = montar();
  const r = chamar('cadastrarSeriesEmLote', { quantidade: 3 }, 'equipe');
  assert.strictEqual(r.sucesso, true);
  assert.strictEqual(r.dados.qrGerados, true);
  assert.deepStrictEqual([r.dados.primeiraSerie, r.dados.ultimaSerie], [7, 9]);
  const j = col(cartelas, 'codigo_qr');
  const porSerie = {};
  cartelas.m.slice(1).forEach(l => { (porSerie[l[col(cartelas, 'serie')]] = porSerie[l[col(cartelas, 'serie')]] || new Set()).add(l[j]); });
  [7, 8, 9].forEach(s => { assert.strictEqual(porSerie[s].size, 1, 'série ' + s); assert.match([...porSerie[s]][0], /^[a-z][a-z0-9]{11}$/); });
  /* as séries antigas (1 a 6) também ganham código no mesmo passo */
  [1, 2, 3, 4, 5, 6].forEach(s => assert.match([...porSerie[s]][0], /^[a-z][a-z0-9]{11}$/));
  assert.strictEqual(new Set(Object.values(porSerie).map(x => [...x][0])).size, 9);
});

test('organizar em séries: simular não grava; confirmar gera os códigos', () => {
  const { chamar, cartelas } = montar();
  for (let i = 0; i < 8; i++) cartelas.appendRow([10025 + i, '', '', false, '', '[]', '[]', '2026-08-10', false, '', '']);
  const sim = chamar('organizarSeries', {}, 'equipe');
  assert.strictEqual(sim.dados.simulacao, true);
  assert.strictEqual(sim.dados.qrGerados, undefined);
  assert.strictEqual(col(cartelas, 'codigo_qr'), -1, 'simulação não pode criar coluna');
  const ok = chamar('organizarSeries', { confirmar: 'sim' }, 'equipe');
  assert.strictEqual(ok.dados.qrGerados, true);
  const j = col(cartelas, 'codigo_qr');
  const codigos = {};
  cartelas.m.slice(1).forEach(l => { codigos[l[col(cartelas, 'serie')]] = l[j]; });
  assert.strictEqual(Object.keys(codigos).length, 8, 'séries 1 a 8');
  Object.values(codigos).forEach(c => assert.match(c, /^[a-z][a-z0-9]{11}$/));
});

test('um código já existente nunca é trocado ao gerar mais séries', () => {
  const { chamar, codigos } = montar();
  const antes = codigos();
  chamar('cadastrarSeriesEmLote', { quantidade: 2 }, 'equipe');
  const depois = codigos();
  Object.keys(antes).forEach(s => assert.strictEqual(depois[s], antes[s], 'série ' + s));
});
