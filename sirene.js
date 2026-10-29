/* sirene.js — Show de Prêmios — Versão 1.0
 * Sirene de alerta (quina / cartela cheia). Usada pelo Verificador (que dispara)
 * e pelas telas do telão (datashow, video, patrocinadores, entrevista), que tocam
 * a sirene no computador ligado ao sistema de som principal.
 *
 * Mensagem: { tipo: 'alerta_sirene', payload: { id, em, tipo: 'quina'|'cheia', cartela, padrao } }
 *
 * O navegador só libera som depois de um clique/tecla na página. Enquanto estiver
 * bloqueado, as telas do telão mostram um aviso pequeno no canto inferior esquerdo.
 */
(function () {
  var ctx = null, ultimoId = null, aviso = null;
  var JANELA_MS = 15000; /* ignora mensagem velha (ex.: a página abriu e leu a última mensagem do Firebase) */

  function criarAviso() {
    if (aviso || !document.body) return;
    aviso = document.createElement('div');
    aviso.id = 'sirene-aviso';
    aviso.textContent = '🔇 Sirene sem som — clique na tela ou aperte uma tecla';
    aviso.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(0,0,0,.75);color:#ffd600;' +
      'font:600 12px sans-serif;padding:6px 10px;border-radius:8px;pointer-events:none;display:none';
    document.body.appendChild(aviso);
  }

  function atualizarAviso() {
    if (!aviso) return;
    aviso.style.display = (ctx && ctx.state === 'running') ? 'none' : 'block';
  }

  /* Libera o som (chame dentro de um clique/tecla). Devolve true se já está liberado. */
  function liberar() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().then(atualizarAviso);
    } catch (e) {}
    atualizarAviso();
    return !!ctx && ctx.state === 'running';
  }

  /* Sirene "wail": som subindo e descendo entre 650 e 1350 Hz, bem forte e comprimido. */
  function tocar(duracao) {
    liberar();
    if (!ctx) return false;
    duracao = duracao || 4.2;
    var t0 = ctx.currentTime + 0.05, fim = t0 + duracao, ciclo = 1.4;

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26; comp.knee.value = 6; comp.ratio.value = 14;
    comp.attack.value = 0.003; comp.release.value = 0.1;
    var mestre = ctx.createGain();
    mestre.gain.setValueAtTime(0, t0);
    mestre.gain.linearRampToValueAtTime(1, t0 + 0.06);
    mestre.gain.setValueAtTime(1, fim - 0.15);
    mestre.gain.linearRampToValueAtTime(0, fim);
    mestre.connect(comp); comp.connect(ctx.destination);

    [['sawtooth', 1, 0.6], ['square', 1.004, 0.3]].forEach(function (c) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = c[0]; g.gain.value = c[2];
      osc.frequency.setValueAtTime(650 * c[1], t0);
      for (var t = t0; t < fim; t += ciclo) {
        osc.frequency.linearRampToValueAtTime(1350 * c[1], t + ciclo / 2);
        osc.frequency.linearRampToValueAtTime(650 * c[1], t + ciclo);
      }
      osc.connect(g); g.connect(mestre);
      osc.start(t0); osc.stop(fim + 0.05);
    });
    return true;
  }

  /* Duração por tipo de prêmio */
  function duracaoDe(tipo) { return tipo === 'cheia' ? 8.4 : 4.2; }

  /* Telão: recebe a mensagem (BroadcastChannel ou Firebase) e toca uma única vez. */
  function tratar(d) {
    var p = d && d.payload;
    if (!p || d.tipo !== 'alerta_sirene') return;
    if (p.id && p.id === ultimoId) return;            /* mesma mensagem chegou pelos dois canais */
    if (p.em && Math.abs(Date.now() - p.em) > JANELA_MS) return;
    ultimoId = p.id || null;
    tocar(duracaoDe(p.tipo));
  }

  function novaMensagem(tipo, cartela, padrao) {
    return {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      em: Date.now(), tipo: tipo, cartela: cartela || null, padrao: padrao || ''
    };
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, liberar, { passive: true });
  });
  document.addEventListener('DOMContentLoaded', function () {
    /* Só as telas do telão mostram o aviso; o verificador tem o seu próprio indicador. */
    if (document.body && document.body.getAttribute('data-sirene-aviso') !== 'nao') criarAviso();
    atualizarAviso();
  });

  /* Diagnóstico das telas do telão: guarda a última troca de tela (de onde, para onde, por qual canal)
     e mostra tudo isso ao apertar a tecla D. Serve para descobrir por que uma tela mudou sozinha. */
  var VERSAO_TELAO = '2026-10-29c';
  function registrarTroca(de, para, msg) {
    try {
      localStorage.setItem('telao_ultima_troca', JSON.stringify({
        de: de, para: para, em: new Date().toLocaleString('pt-BR'),
        via: msg && msg.ts ? 'Firebase (mensagem enviada às ' + new Date(msg.ts).toLocaleTimeString('pt-BR') + ')' : 'canal do navegador (outra aba deste computador)'
      }));
    } catch (e) {}
  }
  function mostrarDiagnostico() {
    var antigo = document.getElementById('telao-diag');
    if (antigo) { antigo.remove(); return; }
    var ult = null;
    try { ult = JSON.parse(localStorage.getItem('telao_ultima_troca') || 'null'); } catch (e) {}
    var d = document.createElement('div');
    d.id = 'telao-diag';
    d.style.cssText = 'position:fixed;left:12px;top:12px;z-index:2147483647;background:rgba(0,0,0,.88);color:#fff;font:14px/1.5 Consolas,monospace;padding:12px 16px;border:1px solid #ffd600;border-radius:10px;max-width:90vw';
    d.innerHTML = '<b style="color:#ffd600">Diagnóstico da tela</b> (aperte D para fechar)<br>' +
      'Tela: ' + (location.pathname.split('/').pop() || 'index.html') + '<br>' +
      'Versão do telão: ' + VERSAO_TELAO + '<br>' +
      'Som: ' + (ctx && ctx.state === 'running' ? 'liberado' : 'bloqueado') + '<br>' +
      (ult ? 'Última troca de tela: ' + ult.de + ' → ' + ult.para + '<br>Quando: ' + ult.em + '<br>Por: ' + ult.via : 'Nenhuma troca de tela registrada neste aparelho.');
    document.body.appendChild(d);
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'd' || e.key === 'D') mostrarDiagnostico();
  });

  window.Sirene = {
    registrarTroca: registrarTroca,
    liberar: liberar, tocar: tocar, tratar: tratar, duracaoDe: duracaoDe,
    novaMensagem: novaMensagem,
    pronta: function () { return !!ctx && ctx.state === 'running'; }
  };
})();
