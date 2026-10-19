(function () {
  'use strict';

  var C = window.CONFIG || {};
  var TURNOS = { manha: 'Manhã (8h às 12h)', tarde: 'Tarde (12h às 17h)', 'tanto-faz': 'Qualquer horário' };
  var AJUDAS = {
    cadeira_rodas: 'Cadeira de rodas',
    andador: 'Andador ou bengala',
    ajuda_entrar: 'Precisa de ajuda para entrar no carro',
    acompanhante: 'Vai com acompanhante',
  };

  // ---------- utilitários ----------

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }

  function guardar(chave, valor) {
    try { localStorage.setItem('carona.' + chave, JSON.stringify(valor)); } catch (e) { /* sem storage */ }
  }
  function lembrar(chave) {
    try { return JSON.parse(localStorage.getItem('carona.' + chave)); } catch (e) { return null; }
  }
  function esquecer(chave) {
    try { localStorage.removeItem('carona.' + chave); } catch (e) { /* sem storage */ }
  }

  function digitos(v) { return String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); }
  function telValido(v) { var d = digitos(v); return d.length >= 10 && d.length <= 11; }
  function telBonito(v) {
    var d = digitos(v);
    return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
      : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : v;
  }

  function mensagem(alvo, tipo, texto) {
    alvo.replaceChildren(texto ? el('div', { class: 'msg ' + tipo, role: tipo === 'erro' ? 'alert' : 'status', text: texto }) : document.createTextNode(''));
  }

  function api(acao, extra) {
    if (!C.SCRIPT_URL) return Promise.reject(new Error('O site ainda não foi ligado à planilha (SCRIPT_URL vazio em config.js).'));
    var corpo = Object.assign({ acao: acao }, extra || {});
    // text/plain evita a checagem CORS prévia, que o Apps Script não responde.
    return fetch(C.SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo),
    }).then(function (r) {
      if (!r.ok) throw new Error('Falha na conexão (' + r.status + '). Tente de novo.');
      return r.json();
    }).then(function (j) {
      if (!j.ok) throw new Error(j.erro || 'Erro desconhecido.');
      return j;
    }, function (e) {
      throw new Error(e.message && e.message.indexOf('Falha') === 0 ? e.message : 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
    });
  }

  function ocupado(botao, sim) {
    botao.disabled = sim;
    if (sim) { botao.dataset.rotulo = botao.textContent; botao.textContent = 'Enviando…'; }
    else if (botao.dataset.rotulo) botao.textContent = botao.dataset.rotulo;
  }

  // ---------- navegação ----------

  function mostrar() {
    var nome = (location.hash || '#inicio').slice(1);
    var alvo = document.getElementById('v-' + nome) ? nome : 'inicio';
    document.querySelectorAll('[data-view]').forEach(function (s) { s.hidden = s.id !== 'v-' + alvo; });
    window.scrollTo(0, 0);
    if (alvo === 'pedir') { $('#f-pedir').hidden = false; $('#ok-pedir').hidden = true; }
    if (alvo === 'motorista' && lembrar('codigo')) abrirPainel();
  }

  // ---------- pedir carona ----------

  function enviarPedido(ev) {
    ev.preventDefault();
    var f = ev.target;
    var aviso = $('#m-pedir');
    var dados = {
      nome: f.nome.value, whatsapp: f.whatsapp.value, quem_cadastra: f.quem_cadastra.value,
      regiao: f.regiao.value, endereco: f.endereco.value, referencia: f.referencia.value,
      local_votacao: f.local_votacao.value, turno: (f.querySelector('[name=turno]:checked') || {}).value,
      volta: f.volta.checked, cadeira_rodas: f.cadeira_rodas.checked, andador: f.andador.checked,
      ajuda_entrar: f.ajuda_entrar.checked, acompanhante: f.acompanhante.checked,
      observacoes: f.observacoes.value, consentimento: f.consentimento.checked,
    };
    var falta = [['nome', 'o nome'], ['regiao', 'a rua e o bairro'], ['endereco', 'o endereço completo'], ['local_votacao', 'o local de votação']]
      .filter(function (c) { return !dados[c[0]].trim(); }).map(function (c) { return c[1]; });
    if (falta.length) return mensagem(aviso, 'erro', 'Falta preencher: ' + falta.join(', ') + '.');
    if (!telValido(dados.whatsapp)) return mensagem(aviso, 'erro', 'Confira o WhatsApp: precisa ter DDD e número.');
    if (!dados.consentimento) return mensagem(aviso, 'erro', 'Para enviar, marque a autorização de uso dos dados.');

    var botao = f.querySelector('button[type=submit]');
    ocupado(botao, true);
    mensagem(aviso, '', '');
    api('pedir', { dados: dados }).then(function (r) {
      f.hidden = true;
      f.reset();
      $('#ok-id').textContent = r.id;
      $('#ok-pedir').hidden = false;
      window.scrollTo(0, 0);
    }).catch(function (e) {
      mensagem(aviso, 'erro', e.message);
    }).then(function () { ocupado(botao, false); });
  }

  // ---------- motorista ----------

  function entrar(ev) {
    ev.preventDefault();
    var codigo = $('#m-codigo').value.trim();
    if (!codigo) return mensagem($('#m-cod'), 'erro', 'Digite o código do grupo.');
    var botao = ev.target.querySelector('button');
    ocupado(botao, true);
    api('listar', { codigo: codigo }).then(function (r) {
      guardar('codigo', codigo);
      mensagem($('#m-cod'), '', '');
      abrirPainel(r);
    }).catch(function (e) {
      mensagem($('#m-cod'), 'erro', e.message);
    }).then(function () { ocupado(botao, false); });
  }

  function abrirPainel(resultado) {
    $('#f-codigo').hidden = true;
    $('#painel').hidden = false;
    if (resultado) desenharLista(resultado); else atualizar();
  }

  function sair() {
    esquecer('codigo');
    $('#painel').hidden = true;
    $('#f-codigo').hidden = false;
    $('#m-codigo').value = '';
    $('#lista').replaceChildren();
    $('#minhas').replaceChildren();
  }

  function atualizar() {
    var aviso = $('#m-lista');
    mensagem(aviso, 'aviso', 'Carregando pedidos…');
    api('listar', { codigo: lembrar('codigo') }).then(function (r) {
      mensagem(aviso, '', '');
      desenharLista(r);
    }).catch(function (e) {
      if (/código/i.test(e.message)) { sair(); return mensagem($('#m-cod'), 'erro', e.message); }
      mensagem(aviso, 'erro', e.message);
    });
  }

  function tags(p) {
    var t = [TURNOS[p.turno] || p.turno, p.volta === 'sim' ? 'Ida e volta' : 'Só ida'];
    Object.keys(AJUDAS).forEach(function (k) { if (p[k] === 'sim') t.push(AJUDAS[k]); });
    return el('div', { class: 'tags' }, t.map(function (x) { return el('span', { class: 'tag', text: x }); }));
  }

  function desenharLista(r) {
    var lista = $('#lista');
    lista.replaceChildren();
    var resumo = r.abertos.length === 0
      ? 'Nenhum pedido esperando motorista agora. Volte mais tarde!'
      : r.abertos.length + (r.abertos.length === 1 ? ' pedido esperando' : ' pedidos esperando') + ' motorista.';
    lista.appendChild(el('p', { text: resumo + ' Já combinadas: ' + r.combinados + '.' }));
    r.abertos.forEach(function (p) { lista.appendChild(cartaoAberto(p)); });
  }

  function cartaoAberto(p) {
    var cartao = el('article', { class: 'card' }, [
      el('div', { class: 'linha' }, [el('h3', { text: p.regiao }), el('span', { class: 'id', text: p.id })]),
      el('p', { text: 'Vota em: ' + p.local_votacao }),
      tags(p),
    ]);
    var botao = el('button', { class: 'btn', type: 'button', text: 'Eu levo' });
    botao.addEventListener('click', function () {
      botao.hidden = true;
      cartao.appendChild(formAssumir(p, cartao));
    });
    cartao.appendChild(botao);
    return cartao;
  }

  function formAssumir(p, cartao) {
    var f = $('#t-assumir').content.firstElementChild.cloneNode(true);
    var eu = lembrar('motorista') || {};
    f.nome.value = eu.nome || '';
    f.whatsapp.value = eu.whatsapp || '';
    f.carro.value = eu.carro || '';
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var aviso = $('.m-assumir', f);
      var m = { nome: f.nome.value.trim(), whatsapp: f.whatsapp.value, carro: f.carro.value.trim(), compromisso: f.compromisso.checked };
      if (!m.nome || !m.carro) return mensagem(aviso, 'erro', 'Preencha seu nome e o carro.');
      if (!telValido(m.whatsapp)) return mensagem(aviso, 'erro', 'Confira seu WhatsApp: precisa ter DDD e número.');
      if (!m.compromisso) return mensagem(aviso, 'erro', 'Para aceitar, marque o termo de compromisso.');
      var botao = f.querySelector('button');
      ocupado(botao, true);
      api('assumir', { codigo: lembrar('codigo'), id: p.id, motorista: m }).then(function (r) {
        guardar('motorista', { nome: m.nome, whatsapp: m.whatsapp, carro: m.carro });
        cartao.replaceWith(cartaoCombinado(r.carona, 'Carona combinada! Chame a pessoa no WhatsApp para acertar o horário.'));
      }).catch(function (e) {
        mensagem(aviso, 'erro', e.message);
        ocupado(botao, false);
      });
    });
    return f;
  }

  function cartaoCombinado(c, titulo) {
    var ajudas = Object.keys(AJUDAS).filter(function (k) { return c[k] === 'sim'; }).map(function (k) { return AJUDAS[k]; });
    var campos = [
      ['Nome', c.nome],
      ['WhatsApp', telBonito(c.whatsapp)],
      ['Quem cadastrou', c.quem_cadastra],
      ['Endereço', c.endereco],
      ['Referência', c.referencia],
      ['Vota em', c.local_votacao],
      ['Horário', TURNOS[c.turno] || c.turno],
      ['Volta', c.volta === 'sim' ? 'Precisa de carona na volta' : 'Só ida'],
      ['Ajuda', ajudas.join(' · ')],
      ['Observações', c.observacoes],
    ].filter(function (x) { return x[1]; });
    var dl = el('dl');
    campos.forEach(function (x) { dl.appendChild(el('dt', { text: x[0] })); dl.appendChild(el('dd', { text: x[1] })); });

    var eu = lembrar('motorista') || {};
    var texto = 'Olá, ' + c.nome + '! Sou ' + (eu.nome || c.motorista_nome) + ', da Carona Solidária. Vou te levar para votar no domingo, em ' +
      c.local_votacao + '. Que horário fica melhor para você?';
    var zap = el('a', { class: 'btn', href: 'https://wa.me/55' + digitos(c.whatsapp) + '?text=' + encodeURIComponent(texto), target: '_blank', rel: 'noopener', text: 'Chamar no WhatsApp' });
    var desistir = el('button', { class: 'btn sec', type: 'button', text: 'Não posso mais: devolver para a lista' });
    var cartao = el('article', { class: 'card' }, [
      el('div', { class: 'msg ok', text: titulo }),
      el('div', { class: 'linha' }, [el('h3', { text: c.regiao }), el('span', { class: 'id', text: c.id })]),
      dl,
      el('div', { class: 'acoes' }, [zap, desistir]),
    ]);
    desistir.addEventListener('click', function () {
      if (!confirm('Devolver a carona de ' + c.nome + ' para a lista? Avise a pessoa no WhatsApp.')) return;
      ocupado(desistir, true);
      api('liberar', { codigo: lembrar('codigo'), id: c.id, whatsapp: c.motorista_whatsapp }).then(function () {
        cartao.remove();
        atualizar();
      }).catch(function (e) {
        alert(e.message);
        ocupado(desistir, false);
      });
    });
    return cartao;
  }

  function minhasCaronas() {
    var alvo = $('#minhas');
    var eu = lembrar('motorista') || {};
    if (!eu.whatsapp) {
      var f = el('form', { class: 'card' }, [
        el('label', { for: 'm-meu', text: 'Seu WhatsApp' }),
        el('input', { id: 'm-meu', type: 'tel', inputmode: 'tel', required: '' }),
        el('div', {}),
        el('button', { class: 'btn', type: 'submit', text: 'Ver minhas caronas' }),
      ]);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var tel = $('#m-meu').value;
        if (!telValido(tel)) return mensagem(f.children[2], 'erro', 'Confira o WhatsApp: precisa ter DDD e número.');
        guardar('motorista', { whatsapp: tel });
        minhasCaronas();
      });
      return alvo.replaceChildren(f);
    }
    mensagem(alvo, 'aviso', 'Carregando suas caronas…');
    api('minhas', { codigo: lembrar('codigo'), whatsapp: eu.whatsapp }).then(function (r) {
      alvo.replaceChildren(el('h3', { text: r.caronas.length ? 'Minhas caronas' : 'Você ainda não assumiu nenhuma carona.' }));
      r.caronas.forEach(function (c) { alvo.appendChild(cartaoCombinado(c, 'Você vai levar esta pessoa.')); });
    }).catch(function (e) { mensagem(alvo, 'erro', e.message); });
  }

  // ---------- início ----------

  if (C.BAIRRO) $('#bairro').textContent = '· ' + C.BAIRRO;
  $('#data').textContent = C.DATA || '';
  document.querySelectorAll('.apagar').forEach(function (s) { s.textContent = C.APAGAR_ATE || 'o fim da eleição'; });
  if (C.CONTATO) {
    var link = el('a', { href: 'https://wa.me/55' + digitos(C.CONTATO), target: '_blank', rel: 'noopener', text: telBonito(C.CONTATO) });
    var p = $('#ok-contato');
    p.append('Se até sábado à noite ninguém tiver chamado, fale com a organização: ', link, '.');
  }

  $('#f-pedir').addEventListener('submit', enviarPedido);
  $('#f-codigo').addEventListener('submit', entrar);
  $('#b-atualizar').addEventListener('click', function () { $('#minhas').replaceChildren(); atualizar(); });
  $('#b-minhas').addEventListener('click', minhasCaronas);
  $('#b-sair').addEventListener('click', sair);
  window.addEventListener('hashchange', mostrar);
  mostrar();
})();
