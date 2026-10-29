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
 *   2.5.0 (2026-10-29) — sorteio por série: marcarSerieSorteada (marca as 4 cartelas) e "sorteada" na lista de séries.
 *   2.4.0 (2026-10-29) — vendas por série: listar (uma linha por série), vender várias séries de uma vez,
 *                        liberar série, coluna vendedor.
 *   2.3.0 (2026-10-28) — registro de ganhadores por rodada e fase (aba "Ganhadores", criada sozinha).
 *   2.2.0 (2026-10-28) — séries: folha com 4 cartelas (colunas serie/posicao); vender por série,
 *                        gerar séries em lote, organizar cartelas existentes, listar para impressão.
 *   2.1.1 (2026-10-28) — ação pública "_info": nome da planilha ligada e nº de linhas por aba (sem dados).
 *   2.1.0 (2026-10-28) — token de acesso (assinado) para ações que gravam ou mostram dados
 *                        pessoais. Desligado por padrão: ligue EXIGIR_TOKEN depois de testar.
 *   2.0.1 (2026-10-26) — doGet único: repassa ?action= (login) para o Auth.gs.
 *   2.0.0 (2026-10-26) — script único na planilha nova: cartelas, patrocinadores e vídeos. */
var VERSAO = '2.5.0 (29/10/2026)';

/* ── Proteção de acesso ───────────────────────────────────────────────
 * false = tudo aberto como antes (modo de transição).
 * true  = as ações em PROTEGIDAS só respondem com um token válido, obtido no login.
 * O token é assinado com um segredo guardado nas "Propriedades do script" (criado sozinho). */
var EXIGIR_TOKEN = true;
var PROTEGIDAS = {
  listarCartelas: 1, buscarCartela: 1, atualizarCartela: 1, cadastrarCartela: 1,
  cadastrarCartelasEmLote: 1, marcarSorteada: 1, resetarSorteios: 1,
  adicionarVideo: 1, removerVideo: 1,
  buscarSerie: 1, atualizarSerie: 1, cadastrarSeriesEmLote: 1, organizarSeries: 1, listarSeries: 1,
  registrarGanhador: 1, listarVendas: 1, liberarSerie: 1, marcarSerieSorteada: 1
};
var TOKEN_HORAS_ADMIN = 12; /* administradores não têm prazo de acesso: o token vale 12 h */
var ABA_CARTELAS = 'Cartelas';
var ABA_PATROCINIO = 'Lista_Patrocinio';
var ABA_VIDEOS = 'Videos';
var ABA_GANHADORES = 'Ganhadores';

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
      case 'buscarSerie':             out = ok(buscarSerie_(p.serie)); break;
      case 'atualizarSerie':          out = ok(atualizarSerie_(p)); break;
      case 'cadastrarSeriesEmLote':   out = ok(cadastrarSeriesLote_(p.quantidade)); break;
      case 'organizarSeries':         out = ok(organizarSeries_(p)); break;
      case 'listarSeries':            out = ok(listarSeries_(p)); break;
      case 'registrarGanhador':       out = ok(registrarGanhador_(p)); break;
      case 'listarVendas':            out = ok(listarVendas_()); break;
      case 'liberarSerie':            out = ok(liberarSerie_(p)); break;
      case 'marcarSerieSorteada':     out = ok(marcarSerieSorteada_(p.serie)); break;
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
    sorteada: bool_(l[c.sorteada]),
    serie: c.serie === undefined ? null : (Number(l[c.serie]) || null),
    posicao: c.posicao === undefined ? null : (Number(l[c.posicao]) || null),
    vendedor: c.vendedor === undefined ? '' : String(l[c.vendedor] || '')
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
    gravarVenda_(r.sh, r.linha, r.d.colunas, p);
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

function linhaNova_(d, id, numeros, grade, serie, posicao) {
  var linha = new Array(Object.keys(d.colunas).length);
  for (var i = 0; i < linha.length; i++) linha[i] = '';
  var c = d.colunas;
  linha[c.id_cartela] = id;
  linha[c.paga] = false;
  linha[c.numeros_json] = JSON.stringify(numeros);
  linha[c.grade_json] = JSON.stringify(grade);
  linha[c.data_cadastro] = new Date().toISOString();
  linha[c.sorteada] = false;
  if (serie && c.serie !== undefined) linha[c.serie] = serie;
  if (posicao && c.posicao !== undefined) linha[c.posicao] = posicao;
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

/* ───────────── séries (uma folha impressa = 4 cartelas) ─────────────
 * Colunas "serie" e "posicao" (1 a 4) na aba Cartelas. Cada cartela mantém o próprio número.
 * A venda é feita pela série inteira; quina e cartela cheia continuam por cartela. */
var CARTELAS_POR_SERIE = 4;

/* Grava nome, telefone, pagamento e data da venda numa linha da aba Cartelas. */
function gravarVenda_(sh, linha, c, p) {
  sh.getRange(linha, c.comprador_nome + 1).setValue(p.nome || '');
  sh.getRange(linha, c.comprador_telefone + 1).setNumberFormat('@').setValue(p.telefone || '');
  sh.getRange(linha, c.paga + 1).setValue(String(p.paga) === 'true');
  sh.getRange(linha, c.data_venda + 1).setNumberFormat('@').setValue(p.dataVenda || '');
}

/* Cria as colunas serie e posicao no fim do cabeçalho, se ainda não existirem. */
function garantirColunasSerie_(sh) {
  var d = ler_(sh), col = sh.getLastColumn();
  ['serie', 'posicao'].forEach(function (nome) {
    if (!(nome in d.colunas)) { col++; sh.getRange(1, col).setValue(nome); }
  });
}

function exigirSerie_(d) {
  if (!('serie' in d.colunas) || !('posicao' in d.colunas)) {
    throw new Error('A aba Cartelas ainda não tem séries. Use "Organizar em séries" no Cadastro.');
  }
}

/* Cartelas de uma série, em ordem de posição. */
function buscarSerie_(serie) {
  var n = Number(serie);
  if (!n) throw new Error('Informe o número da série.');
  var d = ler_(aba_(ABA_CARTELAS));
  exigirSerie_(d);
  var cs = d.colunas.serie;
  var cartelas = d.linhas
    .filter(function (l) { return Number(l[cs]) === n; })
    .map(function (l) { return cartelaDeLinha_(d, l); })
    .sort(function (a, b) { return a.posicao - b.posicao; });
  if (!cartelas.length) throw new Error('Série ' + n + ' não encontrada.');
  var vendidas = cartelas.filter(function (c) { return c.comprador; }).length;
  return { serie: n, cartelas: cartelas, vendidas: vendidas, completa: cartelas.length === CARTELAS_POR_SERIE };
}

/* Cria uma coluna no fim do cabeçalho se ainda não existir (ex.: vendedor). */
function garantirColuna_(sh, nome) {
  var d = ler_(sh);
  if (!(nome in d.colunas)) sh.getRange(1, sh.getLastColumn() + 1).setValue(nome);
}

/* "7, 12, 15-18" ou "15 a 18" → [7, 12, 15, 16, 17, 18] (sem repetir). */
function parseSeries_(txt) {
  var t = String(txt || '').replace(/\s+a\s+/gi, '-').replace(/\s*-\s*/g, '-');
  var out = [], vistos = {};
  t.split(/[,;\s]+/).forEach(function (parte) {
    if (!parte) return;
    var m = parte.match(/^(\d+)-(\d+)$/);
    if (m) {
      var a = Number(m[1]), b = Number(m[2]);
      if (a < 1 || a > b || b - a > 500) throw new Error('Intervalo inválido: ' + parte);
      for (var i = a; i <= b; i++) if (!vistos[i]) { vistos[i] = 1; out.push(i); }
    } else if (/^\d+$/.test(parte) && Number(parte) > 0) {
      var n = Number(parte);
      if (!vistos[n]) { vistos[n] = 1; out.push(n); }
    } else {
      throw new Error('Série inválida: ' + parte);
    }
  });
  if (!out.length) throw new Error('Informe o número da série.');
  return out;
}

/* { serie: [índices das linhas em d.linhas] } só para as séries pedidas. */
function linhasPorSerie_(d, lista) {
  var quer = {}, mapa = {};
  lista.forEach(function (s) { quer[s] = 1; mapa[s] = []; });
  d.linhas.forEach(function (l, i) {
    var s = Number(l[d.colunas.serie]) || 0;
    if (quer[s]) mapa[s].push(i);
  });
  return mapa;
}

/* Grava (ou limpa) os dados de venda nas linhas indicadas, escrevendo coluna por coluna. */
function aplicarVenda_(sh, d, idx, p) {
  var c = d.colunas, n = d.linhas.length, alvo = {};
  idx.forEach(function (i) { alvo[i] = true; });
  function coluna(col, valor, texto, ehData) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      var v = alvo[i] ? valor : d.linhas[i][col];
      arr.push([ehData && v instanceof Date ? dataTxt_(v) : v]);
    }
    var r = sh.getRange(2, col + 1, n, 1);
    if (texto) r.setNumberFormat('@');
    r.setValues(arr);
  }
  coluna(c.comprador_nome, p.nome || '');
  coluna(c.comprador_telefone, p.telefone || '', true);
  coluna(c.paga, String(p.paga) === 'true');
  coluna(c.data_venda, p.dataVenda || '', true, true);
  if (c.vendedor !== undefined && p.vendedor !== undefined) coluna(c.vendedor, p.vendedor || '');
}

/* Vende (ou atualiza) uma ou várias séries de uma vez: "7", "7, 12", "15-18".
 * Com checar=sim, se alguma já tiver comprador devolve { confirmar: true, jaVendidas } sem gravar;
 * repita com sobrescrever=sim para gravar mesmo assim. */
function atualizarSerie_(p) {
  var lista = parseSeries_(p.serie);
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    if (p.vendedor !== undefined) garantirColuna_(sh, 'vendedor');
    var d = ler_(sh);
    exigirSerie_(d);
    var mapa = linhasPorSerie_(d, lista);
    var faltam = lista.filter(function (s) { return !mapa[s].length; });
    if (faltam.length) throw new Error('Série(s) não encontrada(s): ' + faltam.join(', '));
    if (String(p.checar) === 'sim' && String(p.sobrescrever) !== 'sim') {
      var ja = lista.filter(function (s) {
        return mapa[s].some(function (i) { return String(d.linhas[i][d.colunas.comprador_nome]).trim() !== ''; });
      });
      if (ja.length) return { confirmar: true, jaVendidas: ja };
    }
    var idx = [];
    lista.forEach(function (s) { idx = idx.concat(mapa[s]); });
    aplicarVenda_(sh, d, idx, p);
    return {
      series: lista, serie: lista[0],
      cartelas: idx.map(function (i) { return Number(d.linhas[i][d.colunas.id_cartela]); })
    };
  });
}

/* Libera a(s) série(s): apaga comprador, telefone, pagamento, data e vendedor. Não mexe no sorteio. */
function liberarSerie_(p) {
  var lista = parseSeries_(p.serie);
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    var d = ler_(sh);
    exigirSerie_(d);
    var mapa = linhasPorSerie_(d, lista);
    var faltam = lista.filter(function (s) { return !mapa[s].length; });
    if (faltam.length) throw new Error('Série(s) não encontrada(s): ' + faltam.join(', '));
    var idx = [];
    lista.forEach(function (s) { idx = idx.concat(mapa[s]); });
    aplicarVenda_(sh, d, idx, { nome: '', telefone: '', paga: 'false', dataVenda: '', vendedor: '' });
    return { series: lista, cartelas: idx.length };
  });
}

/* Sorteio de prêmios por série: marca as cartelas da série como sorteadas (uma série não sai duas vezes). */
function marcarSerieSorteada_(serie) {
  var n = Number(serie);
  if (!n) throw new Error('Informe o número da série.');
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    var d = ler_(sh);
    exigirSerie_(d);
    var mapa = linhasPorSerie_(d, [n]);
    if (!mapa[n].length) throw new Error('Série ' + n + ' não encontrada.');
    var col = col_(d, 'sorteada') + 1;
    mapa[n].forEach(function (i) { sh.getRange(i + 2, col).setValue(true); });
    return { serie: n, cartelas: mapa[n].map(function (i) { return Number(d.linhas[i][d.colunas.id_cartela]); }) };
  });
}

/* Uma linha por série, para a tela de vendas. */
function listarVendas_() {
  var d = ler_(aba_(ABA_CARTELAS));
  exigirSerie_(d);
  var c = d.colunas, mapa = {}, semSerie = 0;
  d.linhas.forEach(function (l) {
    if (l[c.id_cartela] === '') return;
    var s = Number(l[c.serie]) || 0;
    if (!s) { semSerie++; return; }
    (mapa[s] = mapa[s] || []).push(cartelaDeLinha_(d, l));
  });
  var vend = {};
  var series = Object.keys(mapa).map(Number).sort(function (a, b) { return a - b; }).map(function (s) {
    var cs = mapa[s].sort(function (a, b) { return a.posicao - b.posicao; });
    var comp = cs.filter(function (x) { return x.comprador; });
    var base = comp[0] || cs[0];
    var paga = comp.length > 0 && comp.every(function (x) { return x.paga; });
    var situacao = comp.length === 0 ? 'livre' : comp.length < cs.length ? 'parcial' : (paga ? 'paga' : 'pendente');
    if (comp.length && base.vendedor) vend[base.vendedor] = 1;
    return {
      serie: s, cartelas: cs.map(function (x) { return x.id; }), vendidas: comp.length, total: cs.length,
      comprador: comp.length ? base.comprador : '', telefone: comp.length ? base.telefone : '',
      paga: paga, dataVenda: comp.length ? base.dataVenda : '', vendedor: comp.length ? (base.vendedor || '') : '',
      situacao: situacao,
      sorteada: cs.some(function (x) { return x.sorteada; })
    };
  });
  return { series: series, semSerie: semSerie, vendedores: Object.keys(vend).sort() };
}


/* Dá série às cartelas que ainda não têm, em blocos de 4 por ordem de número.
 * Sem "confirmar=sim" só simula (não grava nada). Sobras (menos de 4) ficam sem série. */
function organizarSeries_(p) {
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    var confirmar = String(p.confirmar) === 'sim';
    if (confirmar) garantirColunasSerie_(sh);
    var d = ler_(sh);
    var ic = col_(d, 'id_cartela');
    var temColunas = ('serie' in d.colunas) && ('posicao' in d.colunas);
    var maxSerie = 0, livres = [];
    d.linhas.forEach(function (l, i) {
      if (l[ic] === '') return;
      var s = temColunas ? Number(l[d.colunas.serie]) || 0 : 0;
      if (s > maxSerie) maxSerie = s;
      if (!s) livres.push({ i: i, id: Number(l[ic]) });
    });
    livres.sort(function (a, b) { return a.id - b.id; });
    var blocos = Math.floor(livres.length / CARTELAS_POR_SERIE);
    var resumo = {
      simulacao: !confirmar, series: blocos, primeiraSerie: maxSerie + 1,
      ultimaSerie: maxSerie + blocos, cartelasSemSerie: livres.length - blocos * CARTELAS_POR_SERIE
    };
    if (!confirmar || !blocos) return resumo;

    var n = d.linhas.length, cs = d.colunas.serie, cp = d.colunas.posicao;
    var serieCol = [], posCol = [];
    for (var i = 0; i < n; i++) { serieCol.push([d.linhas[i][cs]]); posCol.push([d.linhas[i][cp]]); }
    for (var b = 0; b < blocos; b++) {
      for (var k = 0; k < CARTELAS_POR_SERIE; k++) {
        var x = livres[b * CARTELAS_POR_SERIE + k];
        serieCol[x.i] = [maxSerie + 1 + b];
        posCol[x.i] = [k + 1];
      }
    }
    sh.getRange(2, cs + 1, n, 1).setValues(serieCol);
    sh.getRange(2, cp + 1, n, 1).setValues(posCol);
    return resumo;
  });
}

/* Gera "quantidade" séries novas (4 cartelas cada, sem repetir números). */
function cadastrarSeriesLote_(quantidade) {
  var qtd = parseInt(quantidade, 10);
  if (!qtd || qtd < 1 || qtd > 5000) throw new Error('Quantidade inválida (1 a 5000 séries).');
  return comLock_(function () {
    var sh = aba_(ABA_CARTELAS);
    garantirColunasSerie_(sh);
    var d = ler_(sh);
    var usadas = {}, maxSerie = 0;
    d.linhas.forEach(function (l) {
      usadas[String(l[d.colunas.numeros_json])] = true;
      var s = Number(l[d.colunas.serie]) || 0;
      if (s > maxSerie) maxSerie = s;
    });
    var primeiroId = proximoId_(d), id = primeiroId, linhas = [], tentativas = 0;
    for (var s = 1; s <= qtd; s++) {
      for (var pos = 1; pos <= CARTELAS_POR_SERIE; pos++) {
        var c;
        do {
          if (++tentativas > qtd * CARTELAS_POR_SERIE * 20) throw new Error('Não foi possível gerar cartelas únicas.');
          c = gerarCartela_();
        } while (usadas[JSON.stringify(c.numeros)]);
        usadas[JSON.stringify(c.numeros)] = true;
        linhas.push(linhaNova_(d, id++, c.numeros, c.grade, maxSerie + s, pos));
      }
    }
    sh.getRange(sh.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
    return {
      totalSeries: qtd, totalCartelas: linhas.length,
      primeiraSerie: maxSerie + 1, ultimaSerie: maxSerie + qtd, primeiroId: primeiroId, ultimoId: id - 1
    };
  });
}

/* Séries com a grade de cada cartela (para imprimir as folhas). de/ate = intervalo de séries. */
function listarSeries_(p) {
  var d = ler_(aba_(ABA_CARTELAS));
  exigirSerie_(d);
  var de = Number(p.de) || 1, ate = Number(p.ate) || 1e9, mapa = {};
  d.linhas.forEach(function (l) {
    var s = Number(l[d.colunas.serie]) || 0;
    if (!s || s < de || s > ate) return;
    var c = cartelaDeLinha_(d, l);
    (mapa[s] = mapa[s] || []).push({ id: c.id, posicao: c.posicao, grade: c.grade, comprador: c.comprador });
  });
  var series = Object.keys(mapa).map(Number).sort(function (a, b) { return a - b; }).map(function (s) {
    return { serie: s, cartelas: mapa[s].sort(function (a, b) { return a.posicao - b.posicao; }) };
  });
  return { total: series.length, series: series };
}

/* ───────────── ganhadores ─────────────
 * Cada quina ou cartela cheia confirmada no Verificador vira uma linha na aba Ganhadores
 * (criada sozinha). Não duplica: a mesma cartela na mesma rodada e fase só entra uma vez. */
function registrarGanhador_(p) {
  var cartela = Number(p.cartela) || 0;
  if (!cartela) throw new Error('Informe a cartela.');
  var rodada = Number(p.rodada) || 0;
  var fase = String(p.fase) === 'cheia' ? 'cheia' : 'quina';
  return comLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ABA_GANHADORES);
    if (!sh) {
      sh = ss.insertSheet(ABA_GANHADORES);
      sh.appendRow(['data_hora', 'rodada', 'fase', 'padrao', 'serie', 'cartela', 'comprador', 'telefone', 'registrado_por']);
      sh.setFrozenRows(1);
    }
    var n = sh.getLastRow() - 1;
    if (n > 0) {
      var v = sh.getRange(2, 1, n, 6).getValues();
      for (var i = 0; i < v.length; i++) {
        if (Number(v[i][1]) === rodada && String(v[i][2]) === fase && Number(v[i][5]) === cartela) return { duplicado: true };
      }
    }
    var info = verificarToken_(p.token);
    var quem = info ? '***' + String(info.c).slice(-4) : '';
    sh.appendRow([
      Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
      rodada || '', fase, String(p.padrao || ''), Number(p.serie) || '', cartela,
      String(p.comprador || ''), String(p.telefone || ''), quem
    ]);
    return { registrado: true };
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
