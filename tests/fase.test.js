/* Testes da fase do jogo (Quina / Cartela Cheia) que o Painel manda ao Verificador. Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logica.js');

test('a fase vem nas mensagens de pedra (draw, undo, resetar) e no comando mudar_fase', () => {
  ['draw', 'undo', 'resetar', 'mudar_fase'].forEach(t => {
    assert.strictEqual(L.faseDaMensagem({ tipo: t, payload: { fase: 1 } }), 1, t);
    assert.strictEqual(L.faseDaMensagem({ tipo: t, payload: { fase: 2 } }), 2, t);
  });
});

test('fase como texto também é entendida (mensagens do Firebase)', () => {
  assert.strictEqual(L.faseDaMensagem({ tipo: 'draw', payload: { fase: '2' } }), 2);
});

test('mensagem sem fase, com fase inválida ou de outro tipo não mexe na fase', () => {
  assert.strictEqual(L.faseDaMensagem({ tipo: 'draw', payload: { num: 5 } }), null);
  assert.strictEqual(L.faseDaMensagem({ tipo: 'draw', payload: { fase: 3 } }), null);
  assert.strictEqual(L.faseDaMensagem({ tipo: 'draw', payload: { fase: 0 } }), null);
  assert.strictEqual(L.faseDaMensagem({ tipo: 'draw', payload: { fase: 'x' } }), null);
  assert.strictEqual(L.faseDaMensagem({ tipo: 'alerta_sirene', payload: { fase: 2 } }), null);
  assert.strictEqual(L.faseDaMensagem({ tipo: 'trocar_tela', payload: { fase: 2 } }), null);
  assert.strictEqual(L.faseDaMensagem({ tipo: 'draw' }), null);
  assert.strictEqual(L.faseDaMensagem(null), null);
  assert.strictEqual(L.faseDaMensagem(undefined), null);
});

test('fase 1: quina e cartela cheia alertam; fase 2: só a cartela cheia', () => {
  assert.strictEqual(L.alertaPermitido(1, 'quina'), true);
  assert.strictEqual(L.alertaPermitido(1, 'cheia'), true);
  assert.strictEqual(L.alertaPermitido(2, 'quina'), false);
  assert.strictEqual(L.alertaPermitido(2, 'cheia'), true);
});

test('a cartela cheia nunca é bloqueada, qualquer que seja a fase recebida', () => {
  [1, 2, '1', '2', undefined, null].forEach(f => assert.strictEqual(L.alertaPermitido(f, 'cheia'), true));
});
