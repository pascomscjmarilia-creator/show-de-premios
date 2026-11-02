/* Testes do link do QR Code e da máscara de celular. Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const L = require('../qr-lib.js');

const BASE = 'https://pascomscjmarilia-creator.github.io/show-de-premios/comprador.html';

test('monta o link da série com o código', () => {
  assert.strictEqual(L.linkComprador(BASE, 7, 'k3f9a1b2c4d5'), BASE + '?s=7&c=k3f9a1b2c4d5');
});
test('a base não pode arrastar parâmetros nem âncora', () => {
  assert.strictEqual(L.linkComprador(BASE + '?x=1#a', '12', 'K3F9A1B2C4D5'), BASE + '?s=12&c=k3f9a1b2c4d5');
});
test('recusa série ou código inválido ao montar', () => {
  ['', 'abc', 0, -1, 1.5].forEach(s => assert.throws(() => L.linkComprador(BASE, s, 'k3f9a1b2c4d5'), /inválido/));
  ['', 'curto', 'k3f9a1b2c4d5x', 'k3f9a1b2c4d!', null].forEach(c => assert.throws(() => L.linkComprador(BASE, 7, c), /inválido/));
});
test('lê o link de volta (ida e volta)', () => {
  const url = new URL(L.linkComprador(BASE, 49, 'abcdefghij12'));
  assert.deepStrictEqual(L.lerLink(url.search), { serie: 49, codigo: 'abcdefghij12' });
});
test('lê com ou sem ?, em qualquer ordem, ignorando parâmetros extras', () => {
  assert.deepStrictEqual(L.lerLink('c=abcdefghij12&s=3&utm=x'), { serie: 3, codigo: 'abcdefghij12' });
});
test('link quebrado vira null', () => {
  ['', '?', '?s=3', '?c=abcdefghij12', '?s=0&c=abcdefghij12', '?s=abc&c=abcdefghij12', '?s=3&c=curto', '?s=3.5&c=abcdefghij12', '?s=3&c=abcdefghij1%00'].forEach(q => assert.strictEqual(L.lerLink(q), null, q));
  assert.strictEqual(L.lerLink(undefined), null);
});
test('máscara de celular', () => {
  assert.strictEqual(L.mascaraTelefone('14991112233'), '(14) 99111-2233');
  assert.strictEqual(L.mascaraTelefone('1434331122'), '(14) 3433-1122');
  assert.strictEqual(L.mascaraTelefone('149'), '(14) 9');
  assert.strictEqual(L.mascaraTelefone('1'), '1');
  assert.strictEqual(L.mascaraTelefone('(14) 99111-2233 ramal 5'), '(14) 99111-2233');
  assert.strictEqual(L.mascaraTelefone(null), '');
});
