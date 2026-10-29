/* Testes das regras do cadastro de prêmios e das regras do banco. Rodar: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../premios-lib.js');

test('ids novos são válidos e diferentes', () => {
  const a = P.novoId(), b = P.novoId();
  assert.ok(P.idValido(a) && P.idValido(b));
  assert.notStrictEqual(a, b);
});
test('id inválido: vazio, com ponto/barra, longo demais', () => {
  assert.strictEqual(P.idValido(''), false);
  assert.strictEqual(P.idValido('a.b'), false);
  assert.strictEqual(P.idValido('a/b'), false);
  assert.strictEqual(P.idValido('x'.repeat(41)), false);
  assert.strictEqual(P.idValido('ok_id-1'), true);
});
test('tamanho: reduz mantendo proporção e não aumenta', () => {
  assert.deepStrictEqual(P.tamanhoAjustado(4000, 3000, 1280), { w: 1280, h: 960 });
  assert.deepStrictEqual(P.tamanhoAjustado(3000, 4000, 1280), { w: 960, h: 1280 });
  assert.deepStrictEqual(P.tamanhoAjustado(800, 600, 1280), { w: 800, h: 600 });
  assert.deepStrictEqual(P.tamanhoAjustado(0, 600, 1280), { w: 0, h: 0 });
});
test('textos: exige nome, apara espaços, limita tamanhos', () => {
  assert.strictEqual(P.validarTextos('  ', 'x').ok, false);
  assert.strictEqual(P.validarTextos('a'.repeat(81), '').ok, false);
  assert.strictEqual(P.validarTextos('Cesta', 'b'.repeat(241)).ok, false);
  const r = P.validarTextos('  TV   32  polegadas ', '  nova  ');
  assert.deepStrictEqual([r.ok, r.nome, r.descricao], [true, 'TV 32 polegadas', 'nova']);
});
test('lista ordenada por ordem e ignora registros quebrados', () => {
  const l = P.listar({ b: { nome: 'B', ordem: 2 }, a: { nome: 'A', ordem: 1, thumb: 't' }, x: null, y: { ordem: 3 }, z: 'lixo' });
  assert.deepStrictEqual(l.map(p => p.id), ['a', 'b']);
  assert.strictEqual(l[0].thumb, 't');
  assert.deepStrictEqual(P.listar(null), []);
});
test('próxima ordem', () => {
  assert.strictEqual(P.proximaOrdem([]), 1);
  assert.strictEqual(P.proximaOrdem([{ ordem: 3 }, { ordem: 7 }]), 8);
});
test('trocar ordem: sobe, desce, limites e ordens repetidas', () => {
  const l = [{ id: 'a', ordem: 1 }, { id: 'b', ordem: 2 }, { id: 'c', ordem: 3 }];
  assert.deepStrictEqual(P.trocarOrdem(l, 'b', -1), { b: 1, a: 2 });
  assert.deepStrictEqual(P.trocarOrdem(l, 'b', 1), { b: 3, c: 2 });
  assert.strictEqual(P.trocarOrdem(l, 'a', -1), null);
  assert.strictEqual(P.trocarOrdem(l, 'c', 1), null);
  assert.strictEqual(P.trocarOrdem(l, 'zzz', 1), null);
  const iguais = [{ id: 'a', ordem: 1 }, { id: 'b', ordem: 1 }, { id: 'c', ordem: 1 }];
  assert.deepStrictEqual(P.trocarOrdem(iguais, 'c', -1), { a: 1, b: 3, c: 2 });
});

/* ── Regras do Firebase: JSON válido e os limites combinam com o que a tela grava ── */
const regras = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps-script/firebase-rules.json'), 'utf8'));
test('regras: só o ramo bingo é acessível e a raiz continua fechada', () => {
  assert.strictEqual(regras.rules['.read'], false);
  assert.strictEqual(regras.rules['.write'], false);
  assert.deepStrictEqual(Object.keys(regras.rules.bingo).sort(), ['premios', 'premiosImg', 'ultimaMensagem']);
});
test('regras: exigem login e os limites cobrem os tamanhos da tela', () => {
  const pr = regras.rules.bingo.premios, im = regras.rules.bingo.premiosImg.$id;
  assert.strictEqual(pr['.read'], 'auth != null');
  assert.strictEqual(pr.$id['.write'], 'auth != null');
  assert.strictEqual(im['.read'], 'auth != null');
  assert.strictEqual(im['.write'], 'auth != null');
  assert.strictEqual(pr.$id.$outro['.validate'], false);
  const limiteImg = Number(/length <= (\d+)/.exec(im['.validate'])[1]);
  const limiteThumb = Number(/length <= (\d+)/.exec(pr.$id.thumb['.validate'])[1]);
  assert.ok(P.MAX_IMG + 100 <= limiteImg, 'foto maior que a regra do banco');
  assert.ok(P.MAX_THUMB + 100 <= limiteThumb, 'miniatura maior que a regra do banco');
});
