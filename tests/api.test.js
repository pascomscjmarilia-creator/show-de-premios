/* Testes da camada de comunicação (api.js): fetch sem cookies primeiro, JSONP como plano B, 3 tentativas.
   Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const Api = require('../api.js');

function com(transportes, fn) {
  const orig = Object.assign({}, Api._transportes), esp = Api._espera;
  Object.assign(Api._transportes, transportes); Api._espera = 1;
  return Promise.resolve(fn()).finally(() => { Object.assign(Api._transportes, orig); Api._espera = esp; });
}
const chamar = (url) => new Promise(ok => Api.chamar(url, (e, d) => ok({ e, d })));

test('usa o fetch e não toca no JSONP quando o fetch funciona', async () => {
  let fetches = 0, scripts = 0;
  await com({ fetch: (u, cb) => { fetches++; cb(null, { sucesso: true, v: 1 }); }, script: (u, cb) => { scripts++; cb(null, {}); } }, async () => {
    const r = await chamar('https://x/exec?acao=_ping');
    assert.deepStrictEqual(r.d, { sucesso: true, v: 1 });
    assert.strictEqual(r.e, null);
    assert.deepStrictEqual([fetches, scripts], [1, 0]);
  });
});

test('se o fetch falha, tenta o JSONP e entrega a resposta', async () => {
  let scripts = 0;
  await com({ fetch: (u, cb) => cb(new Error('bloqueado')), script: (u, cb) => { scripts++; cb(null, { sucesso: true, via: 'script' }); } }, async () => {
    const r = await chamar('https://x/exec?acao=minhasVendas');
    assert.strictEqual(r.d.via, 'script'); assert.strictEqual(scripts, 1);
  });
});

test('falha passageira: na 2ª tentativa funciona', async () => {
  let n = 0;
  await com({ fetch: (u, cb) => { n++; n < 2 ? cb(new Error('rede')) : cb(null, { sucesso: true }); }, script: (u, cb) => cb(new Error('rede')) }, async () => {
    const r = await chamar('https://x/exec?acao=situacaoSeries');
    assert.strictEqual(r.d.sucesso, true); assert.strictEqual(n, 2);
  });
});

test('3 tentativas com os dois métodos e depois um erro que diz qual chamada falhou', async () => {
  let f = 0, s = 0;
  await com({ fetch: (u, cb) => { f++; cb(new Error('rede')); }, script: (u, cb) => { s++; cb(new Error('rede')); } }, async () => {
    const r = await chamar('https://x/exec?acao=consultarSerieQR&serie=2&codigo=abc');
    assert.ok(r.e instanceof Error);
    assert.match(r.e.message, /não respondeu \(consultarSerieQR\)/);
    assert.strictEqual(r.e.acao, 'consultarSerieQR');
    assert.deepStrictEqual([f, s], [3, 3]);
  });
});

test('resposta do servidor com sucesso:false NÃO é erro de rede (não repete)', async () => {
  let f = 0;
  await com({ fetch: (u, cb) => { f++; cb(null, { sucesso: false, dados: { mensagem: 'Link inválido.' } }); }, script: () => assert.fail('não deveria usar') }, async () => {
    const r = await chamar('https://x/exec?acao=consultarSerieQR');
    assert.strictEqual(r.d.dados.mensagem, 'Link inválido.'); assert.strictEqual(f, 1);
  });
});

test('o fetch real é pedido SEM cookies e seguindo redirecionamentos', async () => {
  const guardado = global.fetch; let opcoes = null;
  global.fetch = (url, o) => { opcoes = o; return Promise.resolve({ text: () => Promise.resolve('{"sucesso":true}') }); };
  try {
    const r = await new Promise(ok => Api._transportes.fetch('https://x/exec?acao=_ping', (e, d) => ok({ e, d })));
    assert.strictEqual(opcoes.credentials, 'omit');
    assert.strictEqual(opcoes.redirect, 'follow');
    assert.deepStrictEqual(r.d, { sucesso: true });
  } finally { global.fetch = guardado; }
});

test('o fetch real trata resposta que não é JSON (página de erro do Google) como falha', async () => {
  const guardado = global.fetch;
  global.fetch = () => Promise.resolve({ text: () => Promise.resolve('<html>Sorry, unable to open the file</html>') });
  try {
    const r = await new Promise(ok => Api._transportes.fetch('https://x/exec?acao=_ping', (e, d) => ok({ e, d })));
    assert.ok(r.e instanceof Error); assert.match(r.e.message, /inválida/);
  } finally { global.fetch = guardado; }
});

test('acaoDe lê o nome da ação', () => {
  assert.strictEqual(Api.acaoDe('https://x/exec?acao=venderSerie&serie=2'), 'venderSerie');
  assert.strictEqual(Api.acaoDe('https://x/exec?serie=2&acao=_ping'), '_ping');
  assert.strictEqual(Api.acaoDe('https://x/exec'), '?');
});
