/* Testes do registro e da lista de ganhadores (backend.gs) com uma planilha simulada.
   Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function novaPlanilha(linhasIniciais) {
  const abas = {};
  const aba = (dados) => {
    const t = { dados: dados, congelado: 0 };
    t.getLastRow = () => t.dados.length;
    t.getLastColumn = () => t.dados.reduce((m, l) => Math.max(m, l.length), 0);
    t.appendRow = (l) => { t.dados.push(l.slice()); };
    t.setFrozenRows = (n) => { t.congelado = n; };
    t.getRange = (r, c, nr, nc) => ({
      getValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const l = t.dados[r - 1 + i] || []; const x = []; for (let j = 0; j < (nc || 1); j++) x.push(l[c - 1 + j] === undefined ? '' : l[c - 1 + j]); o.push(x); } return o; },
      getDisplayValues() { return this.getValues().map(l => l.map(String)); },
      setValue: (v) => { while (t.dados.length < r) t.dados.push([]); t.dados[r - 1][c - 1] = v; }
    });
    return t;
  };
  return {
    abas,
    getSheetByName: (n) => abas[n] || null,
    insertSheet: (n) => { abas[n] = aba([]); return abas[n]; },
    _criar: (n, d) => { abas[n] = aba(d); return abas[n]; }
  };
}

function carregar(ss) {
  const ctx = {
    Date, JSON, Math, Object, Number, String, Array, console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '29/10/2026 20:15:00' }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/backend.gs'), 'utf8') +
    '\n;this.reg=registrarGanhador_;this.lista=listarGanhadores_;', ctx);
  return ctx;
}

test('lista vazia quando ainda não há aba Ganhadores', () => {
  const c = carregar(novaPlanilha());
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.lista())), { total: 0, ganhadores: [] });
});

test('quina: grava, cria a aba com cabeçalho e não duplica na mesma rodada/fase', () => {
  const ss = novaPlanilha(); const c = carregar(ss);
  const p = { cartela: '10005', rodada: '2', fase: 'quina', padrao: '4 cantos', serie: '2', comprador: 'Ana', telefone: '(14) 99111-2233' };
  assert.strictEqual(c.reg(p).registrado, true);
  assert.strictEqual(c.reg(p).duplicado, true);
  const t = ss.abas.Ganhadores.dados;
  assert.strictEqual(t.length, 2);
  assert.strictEqual(t[0][9], 'premio');
  assert.strictEqual(t[1][2], 'quina');
});

test('mesma cartela em outra fase ou outra rodada é outro registro', () => {
  const ss = novaPlanilha(); const c = carregar(ss);
  const base = { cartela: '10005', rodada: '2', fase: 'quina' };
  c.reg(base);
  assert.strictEqual(c.reg(Object.assign({}, base, { fase: 'cheia' })).registrado, true);
  assert.strictEqual(c.reg(Object.assign({}, base, { rodada: '3' })).registrado, true);
});

test('sorteio de série: exige a série, guarda cartelas e prêmio, não usa o dedupe das quinas', () => {
  const ss = novaPlanilha(); const c = carregar(ss);
  assert.throws(() => c.reg({ fase: 'sorteio' }), /série/);
  const p = { fase: 'sorteio', serie: '7', cartela: '10025 · 10026 · 10027 · 10028', comprador: 'Marta', telefone: '(14) 99444-5566', premio: 'Cesta de café' };
  assert.strictEqual(c.reg(p).registrado, true);
  const l = JSON.parse(JSON.stringify(c.lista()));
  assert.strictEqual(l.total, 1);
  assert.strictEqual(l.ganhadores[0].fase, 'sorteio');
  assert.strictEqual(l.ganhadores[0].serie, 7);
  assert.strictEqual(l.ganhadores[0].premio, 'Cesta de café');
  assert.strictEqual(l.ganhadores[0].cartela, '10025 · 10026 · 10027 · 10028');
});

test('quina exige cartela', () => {
  assert.throws(() => carregar(novaPlanilha()).reg({ fase: 'quina' }), /cartela/);
});

test('lista: mais recentes primeiro, com número da linha', () => {
  const ss = novaPlanilha(); const c = carregar(ss);
  c.reg({ cartela: '1', rodada: '1', fase: 'quina', comprador: 'A' });
  c.reg({ cartela: '2', rodada: '1', fase: 'cheia', comprador: 'B' });
  const l = JSON.parse(JSON.stringify(c.lista())).ganhadores;
  assert.deepStrictEqual(l.map(x => x.comprador), ['B', 'A']);
  assert.deepStrictEqual(l.map(x => x.linha), [3, 2]);
});

test('aba antiga (9 colunas, sem "premio") ganha a coluna e continua lendo', () => {
  const ss = novaPlanilha();
  ss._criar('Ganhadores', [
    ['data_hora', 'rodada', 'fase', 'padrao', 'serie', 'cartela', 'comprador', 'telefone', 'registrado_por'],
    ['28/10/2026 19:00:00', 1, 'quina', 'Linha 1 (horizontal)', 1, 10001, 'Carlos', '', '***1234']
  ]);
  const c = carregar(ss);
  let l = JSON.parse(JSON.stringify(c.lista())).ganhadores;
  assert.strictEqual(l[0].comprador, 'Carlos');
  assert.strictEqual(l[0].premio, '');
  c.reg({ fase: 'sorteio', serie: '3', cartela: '10009', comprador: 'Duda', premio: 'Rádio' });
  assert.strictEqual(ss.abas.Ganhadores.dados[0][9], 'premio');
  l = JSON.parse(JSON.stringify(c.lista())).ganhadores;
  assert.strictEqual(l.length, 2);
  assert.strictEqual(l[0].premio, 'Rádio');
});
