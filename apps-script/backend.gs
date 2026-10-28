/**
 * Show de Prêmios — Apps Script ÚNICO (planilha "Patrocinadores_Show_de_Premio").
 * Atende: painel, cadastro, verificador, datashow e patrocinadores.
 * Substitui o script antigo (cartelas, patrocinadores) e o videos.gs.
 * Convive com o Auth.gs (login): este arquivo tem o único doGet e chama handleRequest() do Auth.gs.
 *
 * Como publicar:
 *  1. Abra a planilha → Extensões → Apps Script → apague o código que estiver lá e cole este arquivo.
 *  2. Implantar → Nova implantação → App da Web
 *     Executar como: Eu · Quem tem acesso: Qualquer pessoa.
 *  3. Copie a URL terminada em /exec e envie para atualizar as telas.
 *  4. Ao editar depois: Implantar → Gerenciar implantações → Editar → Nova versão (a URL não muda).
 *
 * Abas usadas (os cabeçalhos são lidos pelo nome, a ordem das colunas não importa):
 *   Cartelas:        id_cartela, comprador_nome, comprador_telefone, paga, data_venda,
 *                    numeros_json, grade_json, data_cadastro, sorteada
 *   Lista_Patrocinio: Número, Nome do Patrocinador, Telefone, Link, Mensagem, Ativo
 *   Videos:          id, titulo, url_youtube, ativo
 */
/* Mude a VERSAO a cada edição. Ela aparece no cadastro, no verificador e no painel
 * ("API: ..."), então dá para conferir se a nova versão foi mesmo publicada.
 * Changelog:
 *   2.1.1 (2026-10-28) — ação pública "_info": nome da planilha ligada e nº de linhas por aba (sem dados).
 *   2.1.0 (2026-10-28) — token de acesso (assinado) para ações que gravam ou mostram dados
 *                        pessoais. Desligado por padrão: ligue EXIGIR_TOKEN depois de testar.
 *   2.0.1 (2026-10-26) — doGet único: repassa ?action= (login) para o Auth.gs.
 *   2.0.0 (2026-10-26) — script único na planilha nova: cartelas, patrocinadores e vídeos. */
var VERSAO = '2.1.1 (28/10/2026)';

/* ── Proteção de acesso ───────────────────────────────────────────────
 * false = tudo aberto como antes (modo de transição).
 * true  = as ações em PROTEGIDAS só respondem com um token válido, obtido no login.
 * O token é assinado com um segredo guardado nas "Propriedades do script" (criado sozinho). */
var EXIGIR_TOKEN = false;
var PROTEGIDAS = {
  listarCartelas: 1, buscarCartela: 1, atualizarCartela: 1, cadastrarCartela: 1,
  cadastrarCartelasEmLote: 1, marcarSorteada: 1, resetarSorteios: 1,
  adicionarVideo: 1, removerVideo: 1
};
var TOKEN_HORAS_ADMIN = 12; /* administradores não têm prazo de acesso: o token vale 12 h */
var ABA_CARTELAS = 'Cartelas';
var ABA_PATROCINIO = 'Lista_Patrocinio';
var ABA_VIDEOS = 'Videos';

/* ───────────── entrada ───────────── */
function doGet(e) {
  var p = (e && e.parameter) || {};
  /* Login e administração de usuários (parâmetro "action") ficam no Auth.gs.
     Este é o ÚNICO doGet do projeto: apague o doGet do Auth.gs (mantenha doPost e handleRequest). */
  if (p.action) return handleRequest(e);
  var out;
  try {
    if (EXIGIR_TOKEN && PROTEGIDAS[p.acao] && !verificarToken_(p.token)) {
      return responder_({
        sucesso: false,
        dados: { mensagem: 'Não autorizado. Faça login novamente.', naoAutorizado: true }
      }, p.callback);
    }
    switch (p.acao) {
      case 'listarCartelas':          out = ok(listarCartelas_(p)); break;
      case 'buscarCartela':           out = ok(buscarCartela_(p.id)); break;
      case 'atualizarCartela':        out = ok(atualizarCartela_(p)); break;
      case 'cadastrarCartela':        out = ok(cadastrarCartela_(p)); break;
      case 'cadastrarCartelasEmLote': out = ok(cadastrarLote_(p.quantidade)); break;
      case 'marcarSorteada':          out = ok(marcarSorteada_(p.id)); break;
      case 'resetarSorteios':         out = ok(resetarSorteios_()); break;
      case '_info':                   out = ok(info_()); break;
      case 'listarPatrocinios':       out = listarPatrocinios_(); break;
      case 'listarVideos':            out = ok({ videos: listarVideos_() }); break;
      case 'adicionarVideo':          out = ok(adicionarVideo_(p.titulo, p.videoId)); break;
      case 'removerVideo':            out = ok(removerVideo_(p.videoId)); break;
      default:                        out = { sucesso: true, versao: VERSAO + (EXIGIR_TOKEN ? ' · protegido' : ' · aberto') };
    }
  } catch (err) {
    out = erro(String(err && err.message || err));
  }
  return responder_(out, p.callback);
}

/* ───────────── token de acesso ─────────────
 * Formato: base64url(JSON{c:cpf, a:admin, e:expiraEm}) + '.' + base64url(HMAC-SHA256).
 * gerarToken_ é chamado pelo login (Auth.gs); verificarToken_ confere nas ações protegidas. */
function segredoToken_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function assinar_(texto) {
  return b64url_(Utilities.computeHmacSha256Signature(texto, segredoToken_()));
}

/* expiraEm em milissegundos; sem valor (administrador) = agora + TOKEN_HORAS_ADMIN horas. */
function gerarToken_(cpf, isAdmin, expiraEm) {
  var exp = expiraEm || (Date.now() + TOKEN_HORAS_ADMIN * 3600 * 1000);
  var corpo = b64url_(Utilities.newBlob(JSON.stringify({ c: String(cpf), a: isAdmin ? 1 : 0, e: exp })).getBytes());
  return corpo + '.' + assinar_(corpo);
}

/* Devolve { c, a, e } se o token for autêntico e não tiver expirado; senão null. */
function verificarToken_(token) {
  try {
    var partes = String(token || '').split('.');
    if (partes.length !== 2) return null;
    var esperado = assinar_(partes[0]), dado = partes[1], dif = esperado.length ^ dado.length;
    for (var i = 0; i < esperado.length && i < dado.length; i++) dif |= esperado.charCodeAt(i) ^ dado.charCodeAt(i);
    if (dif !== 0) return null;
    var bytes = Utilities.base64DecodeWebSafe(partes[0] + '===='.slice(partes[0].length % 4 || 4));
    var info = JSON.parse(Utilities.newBlob(bytes).getDataAsString());
    return (info && info.e > Date.now()) ? info : null;
  } catch (err) { return null; }
}

function ok(dados) { return { sucesso: true, dados: dados }; }
function erro(msg) { return { sucesso: false, dados: { mensagem: msg } }; }

/* JSONP quando vier ?callback= (como as telas chamam); JSON puro nos demais casos. */
function responder_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[A-Za-z0-9_$.]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────── utilitários de planilha ───────────── */
function aba_(nome) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada na planilha.');
  return sh;
}

/* { colunas: {nome: índice 0-based}, linhas: matriz de valores (sem cabeçalho) } */
function ler_(sh) {
  var ult = sh.getLastRow(), larg = sh.getLastColumn();
  if (larg < 1) return { colunas: {}, linhas: [] };
  var tudo = sh.getRange(1, 1, Math.max(ult, 1), larg).getValues();
  var colunas = {};
  tudo[0].forEach(function (h, i) { colunas[String(h).trim()] = i; });
  return { colunas: colunas, linhas: tudo.slice(1) };
}

function col_(d, nome) {
  if (!(nome in d.colunas)) throw new Error('Coluna "' + nome + '" não existe no cabeçalho.');
  return d.colunas[nome];
}

function simNao_(v) {
  var s = String(v).trim().toUpperCase();
  return !(s === 'NAO' || s === 'NÃO' || s === 'FALSE' || s === '0');
}
function bool_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
function dataTxt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd');
  return String(v || '');
}
function json_(v, padrao) { try { return JSON.parse(v); } catch (e) { return padrao; } }

function comLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* Diagnóstico: qual planilha está ligada a este script e quantas linhas (sem o cabeçalho) cada aba tem. */
function info_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    planilha: ss.getName(),
    abas: ss.getSheets().map(function (s) {
      return { nome: s.getName(), linhas: Math.max(0, s.getLastRow() - 1) };
    })
  };
}

/* ───────────── cartelas ───────────── */
function cartelaDeLinha_(d, l) {
  var c = d.colunas;
  return {
    id: Number(l[c.id_cartela]),
    comprador: String(l[c.comprador_nome] || ''),
    telefone: String(l[c.comprador_telefone] || ''),
    paga: bool_(l[c.paga]),
    dataVenda: dataTxt_(l[c.data_venda]),
    numeros: json_(l[c.numeros_json], []),
    grade: json_(l[c.grade_json], []),
    sorteada: bool_(l[c.sorteada])
  };
}

function listarCartelas_(p) {
  var d = ler_(aba_(ABA_CARTELAS));
  var idc = col_(d, 'id_cartela');
  var linhas = d.linhas.filter(function (l) { return l[idc] !== ''; });
  var limite = Math.max(1, Math.min(1000, parseInt(p.limite, 10) || 500));
  var pagina = Math.max(1, parseInt(p.pagina, 10) || 1);
  var total = linhas.length;
  var totalPaginas = Math.max(1, Math.ceil(total / limite));
  var fatia = linhas.slice((pagina - 1) * limite, pagina * limite);
  return {
    cartelas: fatia.map(function (l) { return cartelaDeLinha_(d, l); }),
    totalCartelas: total,
    totalPaginas: totalPaginas,
    pagina: pagina,
    temProxima: pagina < totalPaginas
  };
}

/* Retorna {sh, d, linha(1-based na planilha)} ou lança erro. */
function achar_(id) {
  var sh = aba_(ABA_CARTELAS);
  var d = ler_(sh);
  var idc = col_(d, 'id_cartela');
  for (var i = 0; i < d.linhas.length; i++) {
    if (String(d.linhas[i][idc]) === String(id)) return { sh: sh, d: d, i: i, linha: i + 2 };
  }
  throw new Error('Cartela #' + id + ' não encontrada.');
}

function buscarCartela_(id) {
  var r = achar_(id);
  return { cartela: cartelaDeLinha_(r.d, r.d.linhas[r.i]) };
}

function atualizarCartela_(p) {
  return comLock_(function () {
    var r = achar_(p.id);
    var c = r.d.colunas;
    r.sh.getRange(r.linha, c.comprador_nome + 1).setValue(p.nome || '');
    r.sh.getRange(r.linha, c.comprador_telefone + 1).setNumberFormat('@').setValue(p.telefone || '');
    r.sh.getRange(r.linha, c.paga + 1).setValue(String(p.paga) === 'true');
    r.sh.getRange(r.linha, c.data_venda + 1).setNumberFormat('@').setValue(p.dataVenda || '');
    return { id: Number(p.id) };
  });
}

function marcarSorteada_(id) {
  return comLock_(function () {
    var r = achar_(id);
    var col = col_(r.d, 'sorteada') + 1;
    r.sh.getRange(r.linha, col).setValue(true);
    return { id: Number(id) };
  });
}

function resetarSorteios_() {
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    var d = ler_(sh);
    var col = col_(d, 'sorteada') + 1;
    var n = d.linhas.length;
    if (n > 0) {
      var falsos = [];
      for (var i = 0; i < n; i++) falsos.push([false]);
      sh.getRange(2, col, n, 1).setValues(falsos);
    }
    return { mensagem: n + ' cartelas voltaram a ficar disponíveis.' };
  });
}

function proximoId_(d) {
  var idc = col_(d, 'id_cartela');
  var max = 10000;
  d.linhas.forEach(function (l) { var v = Number(l[idc]); if (v > max) max = v; });
  return max + 1;
}

function linhaNova_(d, id, numeros, grade) {
  var linha = new Array(Object.keys(d.colunas).length);
  for (var i = 0; i < linha.length; i++) linha[i] = '';
  var c = d.colunas;
  linha[c.id_cartela] = id;
  linha[c.paga] = false;
  linha[c.numeros_json] = JSON.stringify(numeros);
  linha[c.grade_json] = JSON.stringify(grade);
  linha[c.data_cadastro] = new Date().toISOString();
  linha[c.sorteada] = false;
  return linha;
}

function cadastrarCartela_(p) {
  return comLock_(function () {
    var numeros = json_(p.numeros, null), grade = json_(p.grade, null);
    if (!numeros || numeros.length !== 24 || !grade || grade.length !== 5) {
      throw new Error('Cartela inválida: precisa de 24 números e grade 5x5.');
    }
    var sh = aba_(ABA_CARTELAS);
    var d = ler_(sh);
    var id = proximoId_(d);
    sh.appendRow(linhaNova_(d, id, numeros, grade));
    return { id: id };
  });
}

/* Gera 5 colunas (B 1-15, I 16-30, N 31-45, G 46-60, O 61-75); centro vazio. */
function gerarCartela_() {
  var cols = [];
  for (var c = 0; c < 5; c++) {
    var pool = [];
    for (var n = c * 15 + 1; n <= c * 15 + 15; n++) pool.push(n);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    cols.push(pool.slice(0, c === 2 ? 4 : 5));
  }
  var grade = [], numeros = [];
  for (var r = 0; r < 5; r++) {
    var linha = [];
    for (var cc = 0; cc < 5; cc++) {
      var v;
      if (cc === 2) v = r === 2 ? null : cols[2][r < 2 ? r : r - 1];
      else v = cols[cc][r];
      linha.push(v);
      if (v !== null) numeros.push(v);
    }
    grade.push(linha);
  }
  numeros.sort(function (a, b) { return a - b; });
  return { numeros: numeros, grade: grade };
}

function cadastrarLote_(quantidade) {
  var qtd = parseInt(quantidade, 10);
  if (!qtd || qtd < 1 || qtd > 20000) throw new Error('Quantidade inválida (1 a 20000).');
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    var d = ler_(sh);
    var usadas = {};
    d.linhas.forEach(function (l) { usadas[String(l[d.colunas.numeros_json])] = true; });
    var primeiro = proximoId_(d), id = primeiro, linhas = [], tentativas = 0;
    while (linhas.length < qtd) {
      if (++tentativas > qtd * 20) throw new Error('Não foi possível gerar cartelas únicas.');
      var c = gerarCartela_();
      var chave = JSON.stringify(c.numeros);
      if (usadas[chave]) continue;
      usadas[chave] = true;
      linhas.push(linhaNova_(d, id++, c.numeros, c.grade));
    }
    sh.getRange(sh.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
    return { total: linhas.length, primeiroId: primeiro, ultimoId: id - 1 };
  });
}

/* ───────────── patrocinadores ───────────── */
function listarPatrocinios_() {
  var d = ler_(aba_(ABA_PATROCINIO));
  var c = d.colunas;
  var lista = [];
  d.linhas.forEach(function (l) {
    var num = l[col_(d, 'Número')];
    var nome = String(l[col_(d, 'Nome do Patrocinador')] || '').trim();
    if (num === '' || !nome) return;
    if (c['Ativo'] !== undefined && !simNao_(l[c['Ativo']])) return;
    var tel = String(l[col_(d, 'Telefone')] || '');
    var msg = String(l[col_(d, 'Mensagem')] || '');
    lista.push({
      id: Number(num), num: Number(num),
      nome: nome, name: nome,
      telefone: tel, phone: tel,
      mensagem: msg, msg: msg,
      link: String(l[col_(d, 'Link')] || '')
    });
  });
  /* Formatos aceitos por cada tela: dados.patrocinadores e patrocinios no topo. */
  return { sucesso: true, patrocinios: lista, dados: { patrocinadores: lista } };
}

/* ───────────── vídeos ───────────── */
function listarVideos_() {
  var d = ler_(aba_(ABA_VIDEOS));
  var vistos = {}, lista = [];
  d.linhas.forEach(function (l) {
    var id = extrairId_(l[col_(d, 'url_youtube')]);
    if (!id || vistos[id] || !simNao_(l[col_(d, 'ativo')])) return;
    vistos[id] = true;
    lista.push({ titulo: String(l[col_(d, 'titulo')] || id), videoId: id });
  });
  return lista;
}

function adicionarVideo_(titulo, videoId) {
  var id = extrairId_(videoId);
  if (!id) throw new Error('videoId inválido');
  return comLock_(function () {
    var sh = aba_(ABA_VIDEOS);
    var d = ler_(sh);
    var max = 0;
    d.linhas.forEach(function (l) {
      if (extrairId_(l[col_(d, 'url_youtube')]) === id) throw new Error('Este vídeo já está na lista.');
      var n = Number(l[col_(d, 'id')]); if (n > max) max = n;
    });
    var linha = new Array(Object.keys(d.colunas).length);
    for (var i = 0; i < linha.length; i++) linha[i] = '';
    linha[d.colunas.id] = max + 1;
    linha[d.colunas.titulo] = titulo || id;
    linha[d.colunas.url_youtube] = 'https://youtu.be/' + id;
    linha[d.colunas.ativo] = 'SIM';
    sh.appendRow(linha);
    return { videoId: id };
  });
}

function removerVideo_(videoId) {
  var id = extrairId_(videoId);
  return comLock_(function () {
    var sh = aba_(ABA_VIDEOS);
    var d = ler_(sh);
    for (var i = d.linhas.length - 1; i >= 0; i--) {
      if (extrairId_(d.linhas[i][col_(d, 'url_youtube')]) === id) sh.deleteRow(i + 2);
    }
    return { videoId: id };
  });
}

/* Aceita o ID puro (11 caracteres) ou um link do YouTube. */
function extrairId_(v) {
  var s = String(v || '').trim();
  var m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
}
