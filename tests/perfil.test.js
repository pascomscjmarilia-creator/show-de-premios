/* Testes do perfil de vendedor (backend.gs): quem é vendedor só usa as ações de venda; desfazer só a própria venda recente.
   Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Sheet {
  constructor(nome, cab) { this.nome = nome; this.m = cab ? [cab.slice()] : []; }
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
      setNumberFormat() { return this; }
    };
  }
}

const TOKENS = {
  vend: { c: '11122233344', a: 0 },   /* CPF listado na aba Vendedores */
  equipe: { c: '55566677788', a: 0 }, /* operador comum */
  admin: { c: '11122233344', a: 1 }   /* mesmo CPF, mas administrador */
};

function montar(comAbaVendedores = true) {
  const cab = ['id_cartela', 'comprador_nome', 'comprador_telefone', 'paga', 'data_venda', 'numeros_json', 'grade_json', 'data_cadastro', 'sorteada', 'serie', 'posicao'];
  const cartelas = new Sheet('Cartelas', cab);
  const abas = { Cartelas: cartelas };
  if (comAbaVendedores) { abas.Vendedores = new Sheet('Vendedores', ['cpf', 'nome']); abas.Vendedores.appendRow(['111.222.333-44', 'Carlos']); }
  const relogio = { agora: '01/11/2026 10:00:00' };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => abas[n] || null, insertSheet: n => { abas[n] = new Sheet(n); return abas[n]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 1, JSON: 2 } },
    Utilities: { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-11-01' : relogio.agora) },
    Date, JSON, Math, Object, Number, String, Array
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/backend.gs'), 'utf8') + '\n;this.F={doGet,gerarCartela_};', ctx);
  ctx.verificarToken_ = (t) => TOKENS[t] || null; /* sem segredo de verdade nos testes */
  for (let i = 0; i < 24; i++) {
    const c = ctx.F.gerarCartela_();
    cartelas.appendRow([10001 + i, '', '', false, '', JSON.stringify(c.numeros), JSON.stringify(c.grade), '2026-08-10', false, Math.floor(i / 4) + 1, (i % 4) + 1]);
  }
  const chamar = (token, acao, extra) => JSON.parse(ctx.F.doGet({ parameter: Object.assign({ acao, token }, extra || {}) }).t);
  return { chamar, abas, cartelas, relogio };
}
const vendaP = (extra) => Object.assign({ serie: '2', nome: 'Ana Paula', telefone: '14991112233', vendedor: 'Carlos', paga: 'true' }, extra || {});

test('vendedor: ações de gestão são recusadas, sem tocar na planilha', () => {
  const { chamar, abas } = montar();
  const bloqueadas = [['listarCartelas'], ['listarVendas'], ['listarSeries'], ['buscarSerie', { serie: '1' }], ['atualizarSerie', { serie: '1', nome: 'x' }],
    ['liberarSerie', { serie: '1' }], ['registrarGanhador', { fase: 'sorteio', serie: '1' }], ['listarGanhadores'], ['marcarSerieSorteada', { serie: '1' }],
    ['resetarSorteios'], ['organizarSeries'], ['cadastrarCartelasEmLote', { quantidade: 4 }], ['adicionarVideo', { titulo: 'x', videoId: 'abc' }]];
  const antes = JSON.stringify(abas.Cartelas.m);
  bloqueadas.forEach(([acao, extra]) => {
    const r = chamar('vend', acao, extra);
    assert.strictEqual(r.sucesso, false, acao);
    assert.strictEqual(r.dados.perfilRestrito, true, acao);
  });
  assert.strictEqual(JSON.stringify(abas.Cartelas.m), antes);
});

test('vendedor: as ações de venda funcionam', () => {
  const { chamar } = montar();
  assert.strictEqual(chamar('vend', 'situacaoSeries', { serie: '2' }).sucesso, true);
  assert.strictEqual(chamar('vend', 'venderSerie', vendaP()).sucesso, true);
  assert.strictEqual(chamar('vend', 'minhasVendas', { vendedor: 'Carlos' }).dados.total, 1);
  assert.strictEqual(chamar('vend', 'meuPerfil').dados.perfil, 'vendedor');
});

test('operador comum (CPF fora da lista) continua com acesso total', () => {
  const { chamar } = montar();
  assert.strictEqual(chamar('equipe', 'listarVendas').sucesso, true);
  assert.strictEqual(chamar('equipe', 'listarGanhadores').sucesso, true);
  assert.strictEqual(chamar('equipe', 'meuPerfil').dados.perfil, 'equipe');
});

test('administrador nunca é restrito, mesmo se o CPF estiver na lista', () => {
  const { chamar } = montar();
  assert.strictEqual(chamar('admin', 'listarVendas').sucesso, true);
  assert.strictEqual(chamar('admin', 'meuPerfil').dados.perfil, 'equipe');
});

test('sem token válido segue "não autorizado" (e não "perfil restrito")', () => {
  const { chamar } = montar();
  const r = chamar('falso', 'listarVendas');
  assert.strictEqual(r.dados.naoAutorizado, true);
  assert.strictEqual(r.dados.perfilRestrito, undefined);
});

test('sem a aba Vendedores ninguém é restrito; meuPerfil cria a aba pronta', () => {
  const { chamar, abas } = montar(false);
  assert.strictEqual(chamar('vend', 'listarVendas').sucesso, true);
  assert.strictEqual(abas.Vendedores, undefined);
  chamar('vend', 'meuPerfil');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(abas.Vendedores.m)), [['cpf', 'nome']]);
});

test('CPF na aba aceita com pontos, traço ou só números', () => {
  const { chamar, abas } = montar();
  abas.Vendedores.appendRow(['555.666.777-88', 'Marta']);
  assert.strictEqual(chamar('equipe', 'listarVendas').dados.perfilRestrito, true);
});

test('desfazer: o vendedor desfaz a própria venda recente; a série volta a ficar livre e o log registra', () => {
  const { chamar, abas } = montar();
  chamar('vend', 'venderSerie', vendaP());
  const r = chamar('vend', 'desfazerVenda', { serie: '2', vendedor: 'carlos' });
  assert.strictEqual(r.sucesso, true);
  assert.strictEqual(chamar('vend', 'situacaoSeries', { serie: '2' }).dados.series[0].situacao, 'livre');
  const log = abas.Vendas_log.m;
  assert.strictEqual(log[log.length - 1][6], 'desfeita');
  assert.strictEqual(chamar('vend', 'venderSerie', vendaP({ nome: 'Outro' })).sucesso, true);
});

test('desfazer: recusa venda de outro vendedor e série não vendida', () => {
  const { chamar, cartelas } = montar();
  chamar('vend', 'venderSerie', vendaP({ vendedor: 'Marta' }));
  const antes = JSON.stringify(cartelas.m);
  const r = chamar('vend', 'desfazerVenda', { serie: '2', vendedor: 'Carlos' });
  assert.strictEqual(r.sucesso, false);
  assert.match(r.dados.mensagem, /não é uma venda sua/);
  assert.strictEqual(chamar('vend', 'desfazerVenda', { serie: '3', vendedor: 'Carlos' }).sucesso, false);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
});

test('desfazer: recusa depois do prazo de 10 minutos', () => {
  const { chamar, relogio, cartelas } = montar();
  chamar('vend', 'venderSerie', vendaP());
  relogio.agora = '01/11/2026 10:11:00';
  const antes = JSON.stringify(cartelas.m);
  const r = chamar('vend', 'desfazerVenda', { serie: '2', vendedor: 'Carlos' });
  assert.strictEqual(r.sucesso, false);
  assert.match(r.dados.mensagem, /passou do prazo/);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
  relogio.agora = '01/11/2026 10:09:59';
  assert.strictEqual(chamar('vend', 'desfazerVenda', { serie: '2', vendedor: 'Carlos' }).sucesso, true);
});

test('desfazer: tudo ou nada com várias séries', () => {
  const { chamar, cartelas } = montar();
  chamar('vend', 'venderSerie', vendaP({ serie: '1' }));
  chamar('vend', 'venderSerie', vendaP({ serie: '2', vendedor: 'Marta' }));
  const antes = JSON.stringify(cartelas.m);
  assert.strictEqual(chamar('vend', 'desfazerVenda', { serie: '1, 2', vendedor: 'Carlos' }).sucesso, false);
  assert.strictEqual(JSON.stringify(cartelas.m), antes);
});

test('o vendedor não consegue usar liberarSerie para apagar venda alheia', () => {
  const { chamar } = montar();
  chamar('equipe', 'venderSerie', vendaP({ serie: '4', vendedor: 'Marta' }));
  assert.strictEqual(chamar('vend', 'liberarSerie', { serie: '4' }).dados.perfilRestrito, true);
  assert.strictEqual(chamar('vend', 'situacaoSeries', { serie: '4' }).dados.series[0].situacao, 'vendida');
});
