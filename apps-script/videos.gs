/**
 * Show de Prêmios — Apps Script de VÍDEOS (independente do script das cartelas).
 *
 * Como publicar:
 *  1. Abra a planilha nova → Extensões → Apps Script → cole este arquivo.
 *  2. Implantar → Nova implantação → Tipo: App da Web
 *     Executar como: Eu · Quem tem acesso: Qualquer pessoa.
 *  3. Copie a URL terminada em /exec e coloque em VIDEO_SCRIPT no painel.html.
 *  4. Depois de editar este código, use Implantar → Gerenciar implantações →
 *     Editar → Nova versão (a URL continua a mesma).
 *
 * Aba usada: "Videos" (criada sozinha se não existir), com as colunas:
 *   A: titulo · B: videoId · C: ativo (SIM/NAO; vazio conta como SIM)
 * Para tirar um vídeo do painel, apague a linha (ou escreva NAO em "ativo").
 */
var ABA_VIDEOS = 'Videos';

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.acao === 'listarVideos')        out = ok({ videos: listarVideos_() });
    else if (p.acao === 'adicionarVideo') out = ok(adicionarVideo_(p.titulo, p.videoId));
    else if (p.acao === 'removerVideo')   out = ok(removerVideo_(p.videoId));
    else out = erro('Ação desconhecida: ' + p.acao);
  } catch (err) {
    out = erro(String(err && err.message || err));
  }
  return responder_(out, p.callback);
}

function ok(dados)   { return { sucesso: true,  dados: dados }; }
function erro(msg)   { return { sucesso: false, dados: { mensagem: msg } }; }

/* JSONP quando vier ?callback= (é como o painel chama); JSON puro nos demais casos. */
function responder_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[A-Za-z0-9_$.]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function aba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ABA_VIDEOS);
  if (!sh) {
    sh = ss.insertSheet(ABA_VIDEOS);
    sh.appendRow(['titulo', 'videoId', 'ativo']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function listarVideos_() {
  var sh = aba_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var linhas = sh.getRange(2, 1, n, 3).getValues();
  var vistos = {};
  var lista = [];
  linhas.forEach(function (l) {
    var id = extrairId_(l[1]);
    var ativo = String(l[2]).trim().toUpperCase();
    if (!id || ativo === 'NAO' || ativo === 'NÃO' || ativo === 'FALSE' || vistos[id]) return;
    vistos[id] = true;
    lista.push({ titulo: String(l[0] || id), videoId: id });
  });
  return lista;
}

function adicionarVideo_(titulo, videoId) {
  var id = extrairId_(videoId);
  if (!id) throw new Error('videoId inválido');
  var sh = aba_();
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var ids = sh.getRange(2, 2, n, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (extrairId_(ids[i][0]) === id) throw new Error('Este vídeo já está na lista.');
    }
  }
  sh.appendRow([titulo || id, id, 'SIM']);
  return { videoId: id };
}

function removerVideo_(videoId) {
  var id = extrairId_(videoId);
  var sh = aba_();
  for (var r = sh.getLastRow(); r >= 2; r--) {
    if (extrairId_(sh.getRange(r, 2).getValue()) === id) sh.deleteRow(r);
  }
  return { videoId: id };
}

/* Aceita o ID puro (11 caracteres) ou um link do YouTube. */
function extrairId_(v) {
  var s = String(v || '').trim();
  var m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
}
