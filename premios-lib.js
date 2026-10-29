/* premios-lib.js — regras puras do cadastro de prêmios (sem DOM; testado em tests/). */
(function (raiz) {
  'use strict';

  var MAX_IMG = 360000;   /* caracteres da foto principal (a regra do banco aceita até 400000) */
  var MAX_THUMB = 38000;  /* miniatura da lista (a regra aceita até 40000) */

  function novoId() {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return ('p' + t + r).replace(/[^A-Za-z0-9]/g, '').slice(0, 30);
  }
  function idValido(id) { return /^[A-Za-z0-9_-]{1,40}$/.test(String(id)); }

  /* Cabe a imagem w x h num quadrado de lado "max", sem aumentar e mantendo a proporção. */
  function tamanhoAjustado(w, h, max) {
    w = Number(w) || 0; h = Number(h) || 0;
    if (!w || !h) return { w: 0, h: 0 };
    var f = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
  }

  /* Valida o que o operador digitou. Devolve { ok, erro, nome, descricao }. */
  function validarTextos(nome, descricao) {
    nome = String(nome == null ? '' : nome).trim().replace(/\s+/g, ' ');
    descricao = String(descricao == null ? '' : descricao).trim();
    if (!nome) return { ok: false, erro: 'Digite o nome do prêmio.' };
    if (nome.length > 80) return { ok: false, erro: 'O nome pode ter até 80 letras.' };
    if (descricao.length > 240) return { ok: false, erro: 'A descrição pode ter até 240 letras.' };
    return { ok: true, nome: nome, descricao: descricao };
  }

  /* Transforma o objeto {id: meta} do banco numa lista ordenada. */
  function listar(obj) {
    var lista = [];
    Object.keys(obj || {}).forEach(function (id) {
      var m = obj[id];
      if (!m || typeof m !== 'object' || !m.nome) return;
      lista.push({ id: id, nome: String(m.nome), descricao: String(m.descricao || ''), ordem: Number(m.ordem) || 0, thumb: m.thumb || '', criado: Number(m.criado) || 0 });
    });
    lista.sort(function (a, b) { return a.ordem - b.ordem || a.criado - b.criado; });
    return lista;
  }

  function proximaOrdem(lista) {
    return lista.reduce(function (m, p) { return Math.max(m, p.ordem); }, 0) + 1;
  }

  /* Trocar a posição com o vizinho (dir = -1 sobe, +1 desce). Devolve { id: novaOrdem } ou null. */
  function trocarOrdem(lista, id, dir) {
    var i = lista.findIndex(function (p) { return p.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return null;
    var a = lista[i], b = lista[j], r = {};
    /* se as ordens forem iguais (dados antigos), renumera de 1 em diante */
    if (a.ordem === b.ordem) {
      lista.forEach(function (p, k) { r[p.id] = k + 1; });
      var t = r[a.id]; r[a.id] = r[b.id]; r[b.id] = t;
      return r;
    }
    r[a.id] = b.ordem; r[b.id] = a.ordem;
    return r;
  }

  var API = { MAX_IMG: MAX_IMG, MAX_THUMB: MAX_THUMB, novoId: novoId, idValido: idValido, tamanhoAjustado: tamanhoAjustado, validarTextos: validarTextos, listar: listar, proximaOrdem: proximaOrdem, trocarOrdem: trocarOrdem };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Premios = API;
})(typeof window !== 'undefined' ? window : this);
