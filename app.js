(function () {
  'use strict';

  var C = window.CONFIG || {};
  C.CENTRO = C.CENTRO || [-15.79, -47.88];
  C.ZOOM = C.ZOOM || 14;
  var TURNOS = { manha: 'De manhã (8h ao meio-dia)', tarde: 'À tarde (meio-dia às 17h)', 'tanto-faz': 'Qualquer horário' };
  var AJUDAS = {
    cadeira_rodas: '♿ Cadeira de rodas',
    andador: '🦯 Andador ou bengala',
    ajuda_entrar: '🤝 Ajuda para entrar no carro',
    acompanhante: '👥 Vai com acompanhante',
  };
  var FONTES = ['20px', '23px', '26px', '29px'];

  // ---------- utilitários ----------

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
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
    var d = digitos(v).slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function valor(form, nome) { return (form.querySelector('[name="' + nome + '"]:checked') || {}).value; }
  function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }

  function mensagem(alvo, tipo, texto) {
    alvo.replaceChildren(texto ? el('div', { class: 'msg ' + tipo, role: tipo === 'erro' ? 'alert' : 'status', text: texto }) : document.createTextNode(''));
  }

  function api(acao, extra) {
    if (!C.SCRIPT_URL) return Promise.reject(new Error('O site ainda não foi ligado à planilha. Fale com a organização.'));
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
      if (!j.ok) {
        // Só acontece se a organização ligar o código do grupo no Apps Script.
        if (/código do grupo/i.test(j.erro || '')) {
          esquecer('codigo');
          guardar('pedeCodigo', true);
          setTimeout(function () { if (!$('#v-motorista').hidden) telaMotorista(); });
        }
        throw new Error(j.erro || 'Erro desconhecido.');
      }
      return j;
    }, function (e) {
      throw new Error(e.message && e.message.indexOf('Falha') === 0 ? e.message : 'Sem conexão. Verifique a internet e tente de novo.');
    });
  }

  function ocupado(botao, sim) {
    botao.disabled = sim;
    if (sim) { botao.dataset.rotulo = botao.textContent; botao.textContent = 'Enviando…'; }
    else if (botao.dataset.rotulo) botao.textContent = botao.dataset.rotulo;
  }

  // ---------- tamanho da letra ----------

  var fonte = Math.min(FONTES.length - 1, Math.max(0, lembrar('fonte') || 0));
  function aplicarFonte() {
    document.documentElement.style.fontSize = FONTES[fonte];
    $('#fonte-menos').disabled = fonte === 0;
    $('#fonte-mais').disabled = fonte === FONTES.length - 1;
    guardar('fonte', fonte);
  }

  // ---------- mapa ----------

  function novoMapa(div) {
    if (!window.L) { div.textContent = 'Não foi possível carregar o mapa. Você pode continuar sem ele.'; return null; }
    var m = L.map(div, { scrollWheelZoom: false }).setView(C.CENTRO, C.ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    return m;
  }

  function pino(emoji) {
    return L.divIcon({ className: '', html: '<div class="pino">' + emoji + '</div>', iconSize: [36, 36], iconAnchor: [18, 32] });
  }

  function distanciaKm(a, b) {
    var r = Math.PI / 180;
    var dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.pow(Math.sin(dLng / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }
  function textoDistancia(km) {
    if (km < 1) return 'a uns ' + Math.max(100, Math.round(km * 10) * 100) + ' m de você';
    return 'a uns ' + km.toFixed(1).replace('.', ',') + ' km de você';
  }

  /** Mapa para marcar um ponto: localização do aparelho, busca por endereço ou toque. */
  function Seletor(raiz, emoji, aoEndereco) {
    var s = this;
    s.lat = null; s.lng = null; s.mapa = null; s.marcador = null; s.emoji = emoji; s.aoEndereco = aoEndereco;
    var bLocal = el('button', { type: 'button', class: 'btn', text: '📍 Usar minha localização' });
    var busca = el('input', { type: 'search', placeholder: 'Rua e bairro', 'aria-label': 'Procurar endereço no mapa' });
    var bBusca = el('button', { type: 'button', class: 'btn sec', text: 'Procurar' });
    s.div = el('div', { class: 'mapa' });
    s.status = el('p', { class: 'seletor-status', 'aria-live': 'polite', text: 'Ou toque no mapa, no lugar certo.' });
    raiz.append(bLocal, el('p', { class: 'dica', text: 'Funciona melhor se estiver no local agora.' }),
      el('p', { class: 'dica', style: 'margin:12px 0 0', text: 'Ou procure pelo endereço:' }),
      el('div', { class: 'busca', style: 'margin-top:4px' }, [busca, bBusca]), s.div, s.status);

    bLocal.addEventListener('click', function () {
      if (!navigator.geolocation) { s.status.textContent = 'Este aparelho não informa a localização. Procure a rua ou toque no mapa.'; return; }
      s.status.textContent = 'Procurando sua localização…';
      navigator.geolocation.getCurrentPosition(function (p) {
        s.marcar(p.coords.latitude, p.coords.longitude, true, true);
      }, function (err) {
        s.status.textContent = err.code === 1
          ? 'Sem permissão para usar a localização. Procure a rua ou toque no mapa.'
          : 'Não foi possível achar a localização. Procure a rua ou toque no mapa.';
      }, { enableHighAccuracy: true, timeout: 15000 });
    });
    function procurar() {
      var q = busca.value.trim();
      if (!q) { busca.focus(); return; }
      s.status.textContent = 'Procurando…';
      fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=' +
        encodeURIComponent(q + (C.CIDADE ? ', ' + C.CIDADE : '')))
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.length) { s.status.textContent = 'Não achei esse endereço. Tente só a rua e o bairro, ou toque no mapa.'; return; }
          s.marcar(Number(res[0].lat), Number(res[0].lon), true, false);
          s.status.textContent = '✅ Achei! Confira se o ' + s.emoji + ' está no lugar certo. Se não estiver, toque no lugar certo.';
          if (s.aoEndereco) s.aoEndereco(q);
        })
        .catch(function () { s.status.textContent = 'A busca não funcionou agora. Toque no mapa, no lugar certo.'; });
    }
    bBusca.addEventListener('click', procurar);
    busca.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); procurar(); } });
  }

  Seletor.prototype.mostrar = function () {
    var s = this;
    if (s.mapa) { s.mapa.invalidateSize(); return; }
    s.mapa = novoMapa(s.div);
    if (!s.mapa) return;
    s.mapa.on('click', function (e) { s.marcar(e.latlng.lat, e.latlng.lng, false, true); });
    if (s.lat != null) s.marcar(s.lat, s.lng, true, false);
  };

  Seletor.prototype.marcar = function (lat, lng, centralizar, buscarEndereco) {
    var s = this;
    s.lat = lat; s.lng = lng;
    if (s.mapa) {
      if (!s.marcador) {
        s.marcador = L.marker([lat, lng], { icon: pino(s.emoji), draggable: true }).addTo(s.mapa);
        s.marcador.on('dragend', function () { var p = s.marcador.getLatLng(); s.marcar(p.lat, p.lng, false, true); });
      } else s.marcador.setLatLng([lat, lng]);
      if (centralizar) s.mapa.setView([lat, lng], 17);
    }
    s.status.textContent = '✅ Ponto marcado. Se não estiver certo, toque no lugar certo.';
    if (buscarEndereco && s.aoEndereco) {
      // Nominatim pede no máximo 1 consulta por segundo.
      clearTimeout(s.espera);
      s.espera = setTimeout(function () {
        fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=pt-BR&lat=' + lat + '&lon=' + lng)
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var a = j.address || {};
            var partes = [a.road, a.suburb || a.neighbourhood || a.city_district].filter(Boolean);
            if (partes.length) s.aoEndereco(partes.join(', '));
          })
          .catch(function () { /* sem endereço automático, tudo bem */ });
      }, 900);
    }
  };

  Seletor.prototype.limpar = function () {
    this.lat = null; this.lng = null;
    if (this.marcador) { this.marcador.remove(); this.marcador = null; }
    this.status.textContent = 'Ou toque no mapa, no lugar certo.';
  };

  // ---------- passo a passo ----------

  function wizard(form, cfg) {
    var passos = $$('.passo', form);
    var texto = $('.progresso-texto', form), barra = $('.barra span', form);
    var bVoltar = $('[data-voltar]', form), bCont = $('[data-continuar]', form), bEnviar = $('[data-enviar]', form);
    var erroBox = $('.erro-passo', form);
    var i = 0;
    function nome() { return passos[i].dataset.step; }
    function erro(msg) { mensagem(erroBox, 'erro', msg); }
    function ir(n) {
      i = Math.max(0, Math.min(n, passos.length - 1));
      passos.forEach(function (p, k) { p.hidden = k !== i; });
      texto.textContent = 'Passo ' + (i + 1) + ' de ' + passos.length;
      barra.style.width = ((i + 1) / passos.length * 100) + '%';
      bCont.hidden = i === passos.length - 1;
      bEnviar.hidden = i !== passos.length - 1;
      mensagem(erroBox, '', '');
      if (cfg.aoMostrar) cfg.aoMostrar(nome(), form);
      window.scrollTo(0, 0);
      var h = $('h2', passos[i]);
      if (h) h.focus({ preventScroll: true });
    }
    function avancar() {
      var msg = cfg.validar(nome(), form);
      if (msg) return erro(msg);
      if (i < passos.length - 1) ir(i + 1);
    }
    bCont.addEventListener('click', avancar);
    bVoltar.addEventListener('click', function () { if (i > 0) ir(i - 1); else cfg.sair(); });
    $$('[data-avanca]', form).forEach(function (inp) {
      inp.addEventListener('change', function () { setTimeout(avancar, 300); });
    });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') {
        e.preventDefault();
        if (i < passos.length - 1) avancar();
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (i < passos.length - 1) return avancar();
      var msg = cfg.validar(nome(), form);
      if (msg) return erro(msg);
      ocupado(bEnviar, true);
      Promise.resolve().then(function () { return cfg.enviar(form); })
        .catch(function (err) { erro(err.message); })
        .then(function () { ocupado(bEnviar, false); });
    });
    return { ir: ir, atual: function () { return i; } };
  }

  // ---------- navegação ----------

  function mostrar() {
    var nome = (location.hash || '#inicio').slice(1);
    var alvo = document.getElementById('v-' + nome) ? nome : 'inicio';
    $$('[data-view]').forEach(function (s) { s.hidden = s.id !== 'v-' + alvo; });
    window.scrollTo(0, 0);
    if (alvo === 'inicio') carregarMapaInicio();
    if (alvo === 'pedir') {
      if (!$('#ok-pedir').hidden) { $('#ok-pedir').hidden = true; $('#f-pedir').hidden = false; wPedir.ir(0); }
      else wPedir.ir(wPedir.atual());
    }
    if (alvo === 'motorista') telaMotorista();
  }

  // ---------- mapa da página inicial ----------

  var mapaInicio = null, camadaInicio = null;
  function carregarMapaInicio() {
    if (!mapaInicio) {
      mapaInicio = novoMapa($('#mapa-inicio'));
      if (!mapaInicio) return;
      camadaInicio = L.layerGroup().addTo(mapaInicio);
    } else mapaInicio.invalidateSize();
    if (!C.SCRIPT_URL) { $('#totais').textContent = 'Os pedidos e motoristas vão aparecer aqui assim que o site for ligado à planilha.'; return; }
    api('mapa').then(function (r) {
      camadaInicio.clearLayers();
      var pontos = [];
      r.pontos.forEach(function (p) {
        var partes = [];
        if (p.pedidos) partes.push('🙋 ' + p.pedidos);
        if (p.motoristas) partes.push('🚗 ' + p.motoristas);
        if (p.combinados) partes.push('✅ ' + p.combinados);
        var c = p.pedidos ? cor('--pedido') : p.motoristas ? cor('--motorista') : cor('--combinado');
        L.circle([p.lat, p.lng], { radius: 300, color: c, weight: 2, fillOpacity: 0.12, interactive: false }).addTo(camadaInicio);
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', html: '<div class="selo">' + partes.join(' &nbsp;') + '</div>', iconSize: [0, 0] }),
          interactive: false, keyboard: false,
        }).addTo(camadaInicio);
        pontos.push([p.lat, p.lng]);
      });
      if (pontos.length) mapaInicio.fitBounds(pontos, { padding: [50, 50], maxZoom: 15 });
      var t = r.totais;
      $('#totais').textContent = plural(t.pedidos, 'pessoa esperando carona', 'pessoas esperando carona') + ' · ' +
        plural(t.motoristas, 'motorista cadastrado', 'motoristas cadastrados') + ' · ' +
        plural(t.combinados, 'carona combinada', 'caronas combinadas') + '.';
    }).catch(function (e) { $('#totais').textContent = e.message; });
  }

  // ---------- pedir carona ----------

  var selPedir = new Seletor($('#seletor-pedir'), '🏠', function (txt) {
    var f = $('#p-regiao');
    if (!f.value.trim()) f.value = txt;
  });

  function dadosPedido(f) {
    var outra = valor(f, 'para') === 'outra';
    return {
      nome: f.nome.value, whatsapp: f.whatsapp.value, quem_cadastra: outra ? f.quem_cadastra.value : '',
      regiao: f.regiao.value, endereco: f.regiao.value.trim() + ', ' + f.numero.value.trim(), referencia: f.referencia.value,
      local_votacao: f.local_votacao.value, turno: valor(f, 'turno'), volta: valor(f, 'volta') === 'sim',
      cadeira_rodas: f.cadeira_rodas.checked, andador: f.andador.checked,
      ajuda_entrar: f.ajuda_entrar.checked, acompanhante: f.acompanhante.checked,
      observacoes: f.observacoes.value, consentimento: f.consentimento.checked,
      lat: selPedir.lat, lng: selPedir.lng,
    };
  }

  var wPedir = wizard($('#f-pedir'), {
    sair: function () { location.hash = ''; },
    validar: function (passo, f) {
      if (passo === 'para-quem' && !valor(f, 'para')) return 'Toque em uma das opções.';
      if (passo === 'nome' && !f.nome.value.trim()) return 'Escreva o nome de quem vai votar.';
      if (passo === 'whatsapp' && !telValido(f.whatsapp.value)) return 'Confira o WhatsApp: precisa ter o DDD e o número. Exemplo: (84) 99999-9999';
      if (passo === 'endereco' && !f.regiao.value.trim()) return 'Escreva a rua e o bairro.';
      if (passo === 'endereco' && !f.numero.value.trim()) return 'Escreva o número da casa. Se não tiver, escreva s/n.';
      if (passo === 'escola' && !f.local_votacao.value.trim()) return 'Escreva o nome da escola onde vota. Se não souber, veja no título de eleitor.';
      if (passo === 'conferir' && !f.consentimento.checked) return 'Para enviar, marque a autorização acima.';
      return '';
    },
    aoMostrar: function (passo, f) {
      if (passo === 'nome') {
        var outra = valor(f, 'para') === 'outra';
        $('#p-titulo-nome').textContent = outra ? 'Qual é o nome de quem vai votar?' : 'Qual é o seu nome?';
        $('#p-bloco-quem').hidden = !outra;
      }
      if (passo === 'mapa') selPedir.mostrar();
      if (passo === 'conferir') {
        var d = dadosPedido(f);
        var ajudas = Object.keys(AJUDAS).filter(function (k) { return d[k]; }).map(function (k) { return AJUDAS[k]; });
        var linhas = [
          ['Quem vai votar', d.nome],
          ['Quem preencheu', d.quem_cadastra],
          ['WhatsApp', telBonito(d.whatsapp)],
          ['Endereço', d.endereco],
          ['Referência', d.referencia],
          ['No mapa', d.lat != null ? '✅ Marcado' : 'Não marcado'],
          ['Vota em', d.local_votacao],
          ['Horário', TURNOS[d.turno]],
          ['Volta', d.volta ? 'Precisa de carona na volta' : 'Só a ida'],
          ['Ajuda', ajudas.join(' · ') || 'Nenhuma'],
          ['Observações', d.observacoes],
        ];
        var dl = $('#p-resumo');
        dl.replaceChildren();
        linhas.filter(function (x) { return x[1]; }).forEach(function (x) {
          dl.append(el('dt', { text: x[0] }), el('dd', { text: x[1] }));
        });
        dl.append(el('dd', { class: 'dica', text: 'Para corrigir algo, toque em Voltar.' }));
      }
    },
    enviar: function (f) {
      return api('pedir', { dados: dadosPedido(f) }).then(function (r) {
        f.reset();
        selPedir.limpar();
        wPedir.ir(0);
        f.hidden = true;
        $('#ok-id').textContent = r.id;
        $('#ok-pedir').hidden = false;
        window.scrollTo(0, 0);
      });
    },
  });

  // ---------- motorista ----------

  var selOferecer = new Seletor($('#seletor-oferecer'), '🚗', function (txt) {
    var f = $('#o-regiao');
    if (!f.value.trim()) f.value = txt;
  });

  function so(id) {
    ['f-codigo', 'm-escolha', 'f-oferecer', 'painel'].forEach(function (x) { $('#' + x).hidden = x !== id; });
    window.scrollTo(0, 0);
  }

  function telaMotorista() {
    if (lembrar('pedeCodigo') && !lembrar('codigo')) return so('f-codigo');
    if (!lembrar('perfil')) {
      $('#f-ja').hidden = true;
      so('m-escolha');
      // Descobre logo se a organização ligou o código, antes de a pessoa preencher o cadastro.
      if (C.SCRIPT_URL) api('listar', { codigo: lembrar('codigo') }).catch(function () {});
      return;
    }
    so('painel');
    carregarPainel();
  }

  function sair() {
    esquecer('codigo');
    esquecer('perfil');
    $('#m-codigo').value = '';
    telaMotorista();
  }

  $('#f-codigo').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, codigo = $('#m-codigo').value.trim(), caixa = $('.erro-passo', f);
    if (!codigo) return mensagem(caixa, 'erro', 'Digite o código do grupo.');
    var botao = $('button[type=submit]', f);
    ocupado(botao, true);
    api('listar', { codigo: codigo }).then(function () {
      guardar('codigo', codigo);
      mensagem(caixa, '', '');
      telaMotorista();
    }).catch(function (err) { mensagem(caixa, 'erro', err.message); })
      .then(function () { ocupado(botao, false); });
  });

  $('#b-cadastrar').addEventListener('click', function () {
    $('#f-oferecer').reset();
    selOferecer.limpar();
    so('f-oferecer');
    wOferecer.ir(0);
  });
  $('#b-ja').addEventListener('click', function () {
    $('#f-ja').hidden = false;
    $('#m-ja-tel').focus();
  });
  $('#f-ja').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, tel = $('#m-ja-tel').value, caixa = $('.erro-passo', f);
    if (!telValido(tel)) return mensagem(caixa, 'erro', 'Confira o WhatsApp: precisa ter o DDD e o número.');
    var botao = $('button', f);
    ocupado(botao, true);
    api('minhas', { codigo: lembrar('codigo'), whatsapp: tel }).then(function (r) {
      if (!r.motorista) return mensagem(caixa, 'erro', 'Não achamos cadastro com esse WhatsApp. Toque em "Primeira vez" para se cadastrar.');
      guardar('perfil', r.motorista);
      telaMotorista();
    }).catch(function (err) { mensagem(caixa, 'erro', err.message); })
      .then(function () { ocupado(botao, false); });
  });

  var wOferecer = wizard($('#f-oferecer'), {
    sair: function () { if (lembrar('perfil')) telaMotorista(); else so('m-escolha'); },
    validar: function (passo, f) {
      if (passo === 'nome' && !f.nome.value.trim()) return 'Escreva o seu nome.';
      if (passo === 'whatsapp' && !telValido(f.whatsapp.value)) return 'Confira o WhatsApp: precisa ter o DDD e o número. Exemplo: (84) 99999-9999';
      if (passo === 'carro' && !f.carro.value.trim()) return 'Escreva o modelo e a cor do carro.';
      if (passo === 'carro' && !valor(f, 'lugares')) return 'Toque em quantas pessoas cabem no carro.';
      if (passo === 'termo' && !f.compromisso.checked) return 'Para continuar, marque que aceita o termo.';
      return '';
    },
    aoMostrar: function (passo) { if (passo === 'mapa') selOferecer.mostrar(); },
    enviar: function (f) {
      var dados = {
        nome: f.nome.value, whatsapp: f.whatsapp.value, carro: f.carro.value, lugares: valor(f, 'lugares'),
        cadeira_ok: valor(f, 'cadeira_ok') === 'sim', turno: valor(f, 'turno'), regiao: f.regiao.value,
        compromisso: f.compromisso.checked, lat: selOferecer.lat, lng: selOferecer.lng,
      };
      return api('oferecer', { codigo: lembrar('codigo'), dados: dados }).then(function (r) {
        guardar('perfil', r.motorista);
        so('painel');
        return carregarPainel().then(function () {
          mensagem($('#m-painel'), 'ok', 'Cadastro salvo! Agora escolha abaixo quem você pode levar.');
        });
      });
    },
  });

  $('#b-editar').addEventListener('click', function () {
    var p = lembrar('perfil') || {}, f = $('#f-oferecer');
    f.reset();
    f.nome.value = p.nome || '';
    f.whatsapp.value = telBonito(p.whatsapp);
    f.carro.value = p.carro || '';
    f.regiao.value = p.regiao || '';
    $$('input[type=radio]', f).forEach(function (r) {
      if ((r.name === 'lugares' && r.value === p.lugares) || (r.name === 'cadeira_ok' && r.value === p.cadeira_ok) ||
        (r.name === 'turno' && r.value === p.turno)) r.checked = true;
    });
    selOferecer.limpar();
    if (p.lat) selOferecer.marcar(Number(p.lat), Number(p.lng), true, false);
    so('f-oferecer');
    wOferecer.ir(0);
  });
  $('#b-sair').addEventListener('click', function () {
    if (confirm('Sair deste aparelho? Para entrar de novo, use o seu WhatsApp.')) sair();
  });
  $('#b-atualizar').addEventListener('click', function () { carregarPainel(); });

  var mapaMot = null, camadaMot = null;

  function carregarPainel() {
    var perfil = lembrar('perfil') || {};
    $('#ola').textContent = 'Olá, ' + (perfil.nome || 'motorista') + '! 👋';
    var aviso = $('#m-painel');
    mensagem(aviso, 'aviso', 'Carregando os pedidos…');
    var codigo = lembrar('codigo');
    return Promise.all([
      api('listar', { codigo: codigo }),
      api('minhas', { codigo: codigo, whatsapp: perfil.whatsapp }),
    ]).then(function (rs) {
      mensagem(aviso, '', '');
      if (rs[1].motorista) guardar('perfil', rs[1].motorista);
      desenharMinhas(rs[1].caronas);
      desenharPedidos(rs[0]);
    }).catch(function (e) {
      if (!/código do grupo/i.test(e.message)) mensagem(aviso, 'erro', e.message);
    });
  }

  function tags(p) {
    var t = [TURNOS[p.turno] || p.turno, p.volta === 'sim' ? 'Ida e volta' : 'Só ida'];
    Object.keys(AJUDAS).forEach(function (k) { if (p[k] === 'sim') t.push(AJUDAS[k]); });
    return el('div', { class: 'tags' }, t.map(function (x) { return el('span', { class: 'tag', text: x }); }));
  }

  function desenharPedidos(r) {
    var perfil = lembrar('perfil') || {};
    var eu = perfil.lat ? [Number(perfil.lat), Number(perfil.lng)] : null;
    var pedidos = r.abertos.map(function (p) {
      p.km = eu && p.lat !== undefined ? distanciaKm(eu, [p.lat, p.lng]) : null;
      return p;
    }).sort(function (a, b) {
      return (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km);
    });

    var lista = $('#lista');
    lista.replaceChildren(el('p', {
      text: pedidos.length === 0
        ? 'Nenhum pedido esperando motorista agora. Volte mais tarde e toque em Atualizar!'
        : plural(pedidos.length, 'pessoa esperando', 'pessoas esperando') + '. Já combinadas: ' + r.combinados + '.',
    }));
    pedidos.forEach(function (p) { lista.appendChild(cartaoPedido(p)); });

    if (!mapaMot) {
      mapaMot = novoMapa($('#mapa-motorista'));
      if (!mapaMot) return;
      camadaMot = L.layerGroup().addTo(mapaMot);
    } else mapaMot.invalidateSize();
    camadaMot.clearLayers();
    var pontos = [];
    if (eu) { L.marker(eu, { icon: pino('🚗'), title: 'Você' }).addTo(camadaMot); pontos.push(eu); }
    pedidos.forEach(function (p) {
      if (p.lat === undefined) return;
      L.marker([p.lat, p.lng], { icon: pino('🙋'), title: 'Pedido ' + p.id }).addTo(camadaMot).on('click', function () {
        var c = document.getElementById('pedido-' + p.id);
        if (!c) return;
        $$('.card.destaque').forEach(function (x) { x.classList.remove('destaque'); });
        c.classList.add('destaque');
        c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      pontos.push([p.lat, p.lng]);
    });
    if (pontos.length > 1) mapaMot.fitBounds(pontos, { padding: [50, 50], maxZoom: 16 });
    else if (pontos.length === 1) mapaMot.setView(pontos[0], 15);
  }

  function cartaoPedido(p) {
    var cartao = el('article', { class: 'card', id: 'pedido-' + p.id }, [
      el('div', { class: 'linha' }, [el('h3', { text: p.regiao }), el('span', { class: 'id', text: p.id })]),
      p.km != null ? el('p', { class: 'distancia', text: '📍 ' + textoDistancia(p.km) }) : null,
      el('p', { text: '🗳️ Vota em: ' + p.local_votacao }),
      tags(p),
    ]);
    var botao = el('button', { class: 'btn', type: 'button', text: '🚗 Eu levo esta pessoa' });
    var confirma = el('div', { hidden: '' }, [
      el('p', { text: 'Confirma? Depois disso você recebe o nome, o telefone e o endereço, e o pedido sai da lista.' }),
    ]);
    var sim = el('button', { class: 'btn', type: 'button', text: 'Sim, eu levo' });
    var nao = el('button', { class: 'btn sec', type: 'button', text: 'Cancelar' });
    var erro = el('div');
    confirma.append(el('div', { class: 'nav-passos' }, [nao, sim]), erro);
    botao.addEventListener('click', function () { botao.hidden = true; confirma.hidden = false; });
    nao.addEventListener('click', function () { botao.hidden = false; confirma.hidden = true; });
    sim.addEventListener('click', function () {
      ocupado(sim, true);
      var perfil = lembrar('perfil') || {};
      api('assumir', { codigo: lembrar('codigo'), id: p.id, whatsapp: perfil.whatsapp }).then(function () {
        return carregarPainel().then(function () {
          mensagem($('#m-painel'), 'ok', '✅ Carona combinada! Chame a pessoa no WhatsApp para acertar o horário.');
          window.scrollTo(0, 0);
        });
      }).catch(function (e) {
        mensagem(erro, 'erro', e.message);
        ocupado(sim, false);
      });
    });
    cartao.append(botao, confirma);
    return cartao;
  }

  function desenharMinhas(caronas) {
    var alvo = $('#minhas');
    alvo.replaceChildren();
    if (!caronas.length) return;
    alvo.appendChild(el('h2', { text: caronas.length === 1 ? 'Sua carona' : 'Suas caronas (' + caronas.length + ')' }));
    caronas.forEach(function (c) { alvo.appendChild(cartaoCombinado(c)); });
  }

  function cartaoCombinado(c) {
    var ajudas = Object.keys(AJUDAS).filter(function (k) { return c[k] === 'sim'; }).map(function (k) { return AJUDAS[k]; });
    var campos = [
      ['Nome', c.nome],
      ['WhatsApp', telBonito(c.whatsapp)],
      ['Quem cadastrou', c.quem_cadastra],
      ['Endereço', c.endereco],
      ['Referência', c.referencia],
      ['Vota em', c.local_votacao],
      ['Horário', TURNOS[c.turno] || c.turno],
      ['Volta', c.volta === 'sim' ? 'Precisa de carona na volta' : 'Só a ida'],
      ['Ajuda', ajudas.join(' · ')],
      ['Observações', c.observacoes],
    ].filter(function (x) { return x[1]; });
    var dl = el('dl', { class: 'resumo' });
    campos.forEach(function (x) { dl.append(el('dt', { text: x[0] }), el('dd', { text: x[1] })); });

    var perfil = lembrar('perfil') || {};
    var texto = 'Olá, ' + c.nome + '! Sou ' + (perfil.nome || c.motorista_nome) + ', da Carona Solidária. ' +
      'Vou te levar para votar no domingo, em ' + c.local_votacao + '. Que horário fica melhor para você?';
    var zap = el('a', { class: 'btn', target: '_blank', rel: 'noopener', text: '💬 Chamar no WhatsApp',
      href: 'https://wa.me/55' + digitos(c.whatsapp) + '?text=' + encodeURIComponent(texto) });
    var destino = c.lat ? c.lat + ',' + c.lng : c.endereco + (C.CIDADE ? ', ' + C.CIDADE : '');
    var rota = el('a', { class: 'btn sec', target: '_blank', rel: 'noopener', text: '🗺️ Ver o caminho',
      href: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destino) });
    var desistir = el('button', { class: 'btn sec', type: 'button', text: 'Não posso mais ir' });
    var cartao = el('article', { class: 'card' }, [
      el('div', { class: 'linha' }, [el('h3', { text: '🙋 ' + c.nome }), el('span', { class: 'id', text: c.id })]),
      dl,
      el('div', { class: 'pilha', style: 'margin:0' }, [zap, rota, desistir]),
    ]);
    desistir.addEventListener('click', function () {
      if (!confirm('Devolver a carona de ' + c.nome + ' para a lista? Lembre de avisar a pessoa no WhatsApp.')) return;
      ocupado(desistir, true);
      api('liberar', { codigo: lembrar('codigo'), id: c.id, whatsapp: c.motorista_whatsapp }).then(function () {
        return carregarPainel();
      }).catch(function (e) {
        alert(e.message);
        ocupado(desistir, false);
      });
    });
    return cartao;
  }

  // ---------- início ----------

  $('#data').textContent = [C.BAIRRO, C.DATA].filter(Boolean).join(' · ');
  $$('.apagar').forEach(function (s) { s.textContent = C.APAGAR_ATE || 'o fim da eleição'; });
  if (C.CONTATO) {
    $$('.ajuda-contato').forEach(function (caixa) {
      caixa.append(
        (caixa.dataset.texto || '📞 Prefere que alguém preencha por você? Chame a organização no WhatsApp:') + ' ',
        el('a', { href: 'https://wa.me/55' + digitos(C.CONTATO), target: '_blank', rel: 'noopener', text: telBonito(C.CONTATO) })
      );
    });
  }

  // Máscara de telefone enquanto digita.
  document.addEventListener('input', function (e) {
    if (e.target.type === 'tel') e.target.value = telBonito(e.target.value);
  });

  $('#fonte-menos').addEventListener('click', function () { fonte = Math.max(0, fonte - 1); aplicarFonte(); });
  $('#fonte-mais').addEventListener('click', function () { fonte = Math.min(FONTES.length - 1, fonte + 1); aplicarFonte(); });
  aplicarFonte();

  window.addEventListener('hashchange', mostrar);
  mostrar();
})();
