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

  /**
   * Mapa para marcar um ponto: localização do aparelho, busca por endereço ou toque.
   * opts.campo: usa um campo já existente como texto da busca (ex.: nome da escola).
   * opts.lista: mostra até 5 resultados para a pessoa escolher.
   * opts.semLocalizacao: esconde o botão "usar minha localização".
   */
  function Seletor(raiz, emoji, aoEndereco, opts) {
    var s = this;
    opts = opts || {};
    s.lat = null; s.lng = null; s.mapa = null; s.marcador = null; s.emoji = emoji; s.aoEndereco = aoEndereco;
    var busca = opts.campo || el('input', { type: 'search', placeholder: 'Rua e bairro', 'aria-label': 'Procurar endereço no mapa' });
    var bBusca = el('button', { type: 'button', class: 'btn sec', text: opts.textoBusca || 'Procurar' });
    var lista = el('div', { class: 'opcoes', 'aria-live': 'polite' });
    s.div = el('div', { class: 'mapa' });
    s.status = el('p', { class: 'seletor-status', 'aria-live': 'polite', text: 'Ou toque no mapa, no lugar certo.' });
    if (!opts.semLocalizacao) {
      var bLocal = el('button', { type: 'button', class: 'btn', text: '📍 Usar minha localização' });
      raiz.append(bLocal, el('p', { class: 'dica', text: 'Funciona melhor se estiver no local agora.' }));
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
    }
    if (opts.campo) raiz.append(bBusca);
    else raiz.append(el('p', { class: 'dica', style: 'margin:12px 0 0', text: 'Ou procure pelo endereço:' }),
      el('div', { class: 'busca', style: 'margin-top:4px' }, [busca, bBusca]));
    raiz.append(lista, s.div, s.status);

    function escolher(r) {
      lista.replaceChildren();
      s.marcar(Number(r.lat), Number(r.lon), true, false);
      s.status.textContent = '✅ Marcado no mapa. Confira se o ' + s.emoji + ' está no lugar certo. Se não estiver, toque no lugar certo.';
      if (opts.aoEscolher) opts.aoEscolher(r.name || r.display_name.split(',')[0]);
      else if (s.aoEndereco) s.aoEndereco(busca.value.trim());
    }
    function procurar() {
      var q = busca.value.trim();
      if (!q) { busca.focus(); s.status.textContent = 'Escreva primeiro o que procurar.'; return; }
      s.status.textContent = 'Procurando…';
      lista.replaceChildren();
      s.mostrar();
      var c = C.CENTRO, d = 0.2;
      // Área da busca: oeste, norte, leste, sul. Sem REGIAO no config, ~20 km em volta do centro.
      var area = C.REGIAO || [c[1] - d, c[0] + d, c[1] + d, c[0] - d];
      function consultar(texto) {
        return fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&accept-language=pt-BR' +
          '&limit=' + (opts.lista ? 5 : 1) + '&viewbox=' + area.join(',') + '&bounded=1' +
          '&q=' + encodeURIComponent(texto)).then(function (r) { return r.json(); });
      }
      // O OpenStreetMap tem poucos números de casa no Brasil: sem resultado, tenta só o nome da rua.
      var semNumero = q.split(',')[0].replace(/\s+(n[º°o.]*\s*)?\d+\w*$/i, '').trim();
      consultar(q)
        .then(function (res) {
          if (res.length || !semNumero || semNumero === q) return res;
          return new Promise(function (ok) { setTimeout(ok, 1100); }).then(function () { return consultar(semNumero); });
        })
        .then(function (res) {
          if (!res.length) {
            s.status.textContent = 'Não achei' + (C.REGIAO_NOME ? ' ' + C.REGIAO_NOME : '') +
              '. Confira o nome ou toque no mapa, no lugar certo.';
            return;
          }
          if (!opts.lista || res.length === 1) return escolher(res[0]);
          s.status.textContent = 'Se não for nenhum desses, toque no mapa, no lugar certo.';
          lista.appendChild(el('p', { class: 'seletor-status', style: 'margin:0', text: 'Achei estes. Toque no certo:' }));
          res.forEach(function (r) {
            var a = r.address || {};
            var b = el('button', { type: 'button', class: 'opcao-card', style: 'text-align:left;width:100%;font:inherit;font-weight:700;color:inherit' }, [
              el('span', { class: 'ico', 'aria-hidden': 'true', text: s.emoji }),
              el('span', {}, [r.name || r.display_name.split(',')[0],
                el('small', { text: [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village].filter(Boolean).join(', ') })]),
            ]);
            b.addEventListener('click', function () { escolher(r); });
            lista.appendChild(b);
          });
        })
        .catch(function () { s.status.textContent = 'A busca não funcionou agora. Toque no mapa, no lugar certo.'; });
    }
    bBusca.addEventListener('click', procurar);
    busca.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); procurar(); } });
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
    // Ao corrigir (marcar, escolher), o aviso de erro some.
    form.addEventListener('change', function () { mensagem(erroBox, '', ''); });
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
      (r.locais || []).forEach(function (l) {
        L.marker([l.lat, l.lng], { icon: pino('🗳️'), title: l.nome }).addTo(camadaInicio)
          .bindTooltip(el('span', { text: l.nome + ' · ' + plural(l.pessoas, 'pessoa', 'pessoas') }));
        pontos.push([l.lat, l.lng]);
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
  }, { lista: true });

  var selEscola = new Seletor($('#seletor-escola'), '🗳️', null, {
    campo: $('#p-local'), lista: true, semLocalizacao: true, textoBusca: '🔎 Não achou na lista? Procurar no mapa',
    aoEscolher: function (nome) { if (nome) $('#p-local').value = nome; localEscolhido = null; },
  });

  // Locais de votação oficiais do TSE (2º turno 2026, Grande Natal), em locais-votacao.json.
  var locais = null, localEscolhido = null, esperaSugestao = null;
  function normalizar(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function carregarLocais() {
    if (locais) return Promise.resolve(locais);
    return fetch('locais-votacao.json').then(function (r) { return r.json(); }).then(function (lista) {
      locais = lista.map(function (l) { l.busca = normalizar([l.n, l.b, l.m, l.e].join(' ')); return l; });
      return locais;
    }).catch(function () { return []; });
  }
  function textoLocal(l) { return l.n + ' (' + [l.e, l.b, l.m].filter(Boolean).join(', ') + ')'; }
  function sugerir() {
    var caixa = $('#sugestoes');
    var termos = normalizar($('#p-local').value).split(/\s+/).filter(function (t) { return t.length > 1; });
    caixa.replaceChildren();
    if (localEscolhido || !termos.length || !locais) return;
    var achados = locais.filter(function (l) {
      return termos.every(function (t) { return l.busca.indexOf(t) >= 0; });
    }).sort(function (a, b) {
      return distanciaKm(C.CENTRO, [a.lat, a.lng]) - distanciaKm(C.CENTRO, [b.lat, b.lng]);
    });
    if (!achados.length) {
      caixa.appendChild(el('p', { class: 'dica', text: 'Não achei na lista oficial. Confira o nome ou procure no mapa, abaixo.' }));
      return;
    }
    caixa.appendChild(el('p', { class: 'seletor-status', style: 'margin:0', text: 'Toque no seu local de votação:' }));
    achados.slice(0, 6).forEach(function (l) {
      var b = el('button', { type: 'button', class: 'opcao-card' }, [
        el('span', { class: 'ico', 'aria-hidden': 'true', text: '🗳️' }),
        el('span', {}, [l.n, el('small', { text: [l.e, l.b, l.m].filter(Boolean).join(' · ') })]),
      ]);
      b.addEventListener('click', function () { escolherLocal(l); });
      caixa.appendChild(b);
    });
    if (achados.length > 6) {
      caixa.appendChild(el('p', { class: 'dica', text: 'Há mais ' + (achados.length - 6) + '. Digite mais do nome para achar o seu.' }));
    }
  }
  function escolherLocal(l) {
    localEscolhido = l;
    $('#p-local').value = l.n;
    $('#sugestoes').replaceChildren(el('div', { class: 'msg ok', text: '✅ ' + textoLocal(l) }));
    if (l.lat != null) selEscola.marcar(l.lat, l.lng, true, false);
  }
  $('#p-local').addEventListener('input', function () {
    if (localEscolhido) { localEscolhido = null; selEscola.limpar(); }
    clearTimeout(esperaSugestao);
    esperaSugestao = setTimeout(sugerir, 150);
  });

  /** Lista de pares [rótulo, valor] como linhas separadas. */
  function preencherResumo(dl, pares) {
    dl.replaceChildren();
    pares.filter(function (x) { return x[1]; }).forEach(function (x) {
      dl.appendChild(el('div', { class: 'item' }, [el('dt', { text: x[0] }), el('dd', { text: x[1] })]));
    });
  }

  function dadosPedido(f) {
    var outra = valor(f, 'para') === 'outra';
    return {
      nome: f.nome.value, whatsapp: f.whatsapp.value, quem_cadastra: outra ? f.quem_cadastra.value : '',
      regiao: f.regiao.value, endereco: f.regiao.value.trim() + ', ' + f.numero.value.trim(), referencia: f.referencia.value,
      local_votacao: localEscolhido ? textoLocal(localEscolhido) : f.local_votacao.value, turno: valor(f, 'turno'), volta: valor(f, 'volta') === 'sim',
      cadeira_rodas: f.cadeira_rodas.checked, andador: f.andador.checked,
      ajuda_entrar: f.ajuda_entrar.checked, acompanhante: f.acompanhante.checked,
      observacoes: f.observacoes.value, consentimento: f.consentimento.checked,
      lat: selPedir.lat, lng: selPedir.lng, local_lat: selEscola.lat, local_lng: selEscola.lng,
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
      if (passo === 'escola') { selEscola.mostrar(); carregarLocais().then(sugerir); }
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
          ['Escola no mapa', d.local_lat != null ? '✅ Marcada' : 'Não marcada'],
          ['Horário', TURNOS[d.turno]],
          ['Volta', d.volta ? 'Precisa de carona na volta' : 'Só a ida'],
          ['Ajuda', ajudas.join(' · ') || 'Nenhuma'],
          ['Observações', d.observacoes],
        ];
        var dl = $('#p-resumo');
        preencherResumo(dl, linhas);
        $('#p-zap-aviso').textContent = telBonito(d.whatsapp);
        dl.appendChild(el('p', { class: 'dica', style: 'margin:12px 0 0', text: 'Para corrigir algo, toque em Voltar.' }));
      }
    },
    enviar: function (f) {
      return api('pedir', { dados: dadosPedido(f) }).then(function (r) {
        f.reset();
        selPedir.limpar();
        selEscola.limpar();
        localEscolhido = null;
        $('#sugestoes').replaceChildren();
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
  }, { lista: true });

  function so(id) {
    ['f-codigo', 'm-escolha', 'f-oferecer', 'painel'].forEach(function (x) { $('#' + x).hidden = x !== id; });
    window.scrollTo(0, 0);
  }

  /** Identificação do motorista em cada chamada: WhatsApp + senha secreta guardada só neste aparelho. */
  function credenciais(extra) {
    var p = lembrar('perfil') || {};
    return Object.assign({ codigo: lembrar('codigo'), whatsapp: p.whatsapp, token: p.token }, extra || {});
  }

  function telaMotorista() {
    if (lembrar('pedeCodigo') && !lembrar('codigo')) return so('f-codigo');
    if (!lembrar('perfil')) {
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
    // Sem cadastro a lista recusa de qualquer jeito; aqui só importa se o código passou.
    function aceitar() {
      guardar('codigo', codigo);
      mensagem(caixa, '', '');
      telaMotorista();
    }
    api('listar', { codigo: codigo }).then(aceitar).catch(function (err) {
      if (/código do grupo/i.test(err.message)) mensagem(caixa, 'erro', err.message);
      else aceitar();
    }).then(function () { ocupado(botao, false); });
  });

  $('#b-cadastrar').addEventListener('click', function () {
    $('#f-oferecer').reset();
    $('#o-whatsapp').readOnly = false;
    selOferecer.limpar();
    so('f-oferecer');
    wOferecer.ir(0);
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
        token: (lembrar('perfil') || {}).token,
      };
      return api('oferecer', { codigo: lembrar('codigo'), dados: dados }).then(function (r) {
        guardar('perfil', r.motorista);
        so('painel');
        return carregarPainel();
      });
    },
  });

  $('#b-editar').addEventListener('click', function () {
    var p = lembrar('perfil') || {}, f = $('#f-oferecer');
    f.reset();
    f.nome.value = p.nome || '';
    f.whatsapp.value = telBonito(p.whatsapp);
    // O WhatsApp identifica o cadastro: para trocar de número, só com a organização.
    f.whatsapp.readOnly = true;
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
    if (confirm('Sair deste aparelho? Por segurança, para entrar de novo você vai precisar falar com a organização.')) sair();
  });
  $('#b-atualizar').addEventListener('click', function () { carregarPainel(); });

  var mapaMot = null, camadaMot = null;

  function carregarPainel() {
    var perfil = lembrar('perfil') || {};
    $('#ola').textContent = 'Olá, ' + (perfil.nome || 'motorista') + '! 👋';
    var aviso = $('#m-painel');
    mensagem(aviso, 'aviso', 'Carregando…');
    return api('minhas', credenciais()).then(function (r) {
      guardar('perfil', r.motorista);
      $('#ola').textContent = 'Olá, ' + r.motorista.nome + '! 👋';
      desenharMinhas(r.caronas);
      if (r.motorista.status === 'pendente') {
        $('#area-pedidos').hidden = true;
        return mensagem(aviso, 'aviso', '⏳ Cadastro recebido! A organização vai conferir e liberar o seu acesso aos pedidos. Volte aqui daqui a pouco e toque em Atualizar.');
      }
      if (r.motorista.status !== 'ativo') {
        $('#area-pedidos').hidden = true;
        return mensagem(aviso, 'erro', 'Seu cadastro de motorista está desativado. Fale com a organização.');
      }
      return api('listar', credenciais()).then(function (lista) {
        mensagem(aviso, '', '');
        $('#area-pedidos').hidden = false;
        desenharPedidos(lista);
      });
    }).catch(function (e) {
      if (/código do grupo/i.test(e.message)) return;
      if (/não encontrado neste aparelho/i.test(e.message)) {
        // Cadastro apagado ou senha inválida: volta para a tela inicial do motorista.
        esquecer('perfil');
        so('m-escolha');
        return mensagem($('#m-escolha-aviso'), 'erro', e.message);
      }
      mensagem(aviso, 'erro', e.message);
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
    var escolas = {};
    pedidos.forEach(function (p) {
      if (p.local_lat === undefined) return;
      var k = p.local_lat + ',' + p.local_lng;
      if (escolas[k]) return;
      escolas[k] = true;
      L.marker([p.local_lat, p.local_lng], { icon: pino('🗳️'), title: p.local_votacao }).addTo(camadaMot)
        .bindTooltip(el('span', { text: p.local_votacao }));
      pontos.push([p.local_lat, p.local_lng]);
    });
    if (pontos.length > 1) mapaMot.fitBounds(pontos, { padding: [50, 50], maxZoom: 16 });
    else if (pontos.length === 1) mapaMot.setView(pontos[0], 15);
  }

  function cartaoPedido(p) {
    var cartao = el('article', { class: 'card', id: 'pedido-' + p.id }, [
      el('div', { class: 'linha' }, [el('h3', { text: p.regiao }), el('span', { class: 'id', text: p.id })]),
      p.km != null ? el('p', { class: 'distancia', text: '📍 ' + textoDistancia(p.km) }) : null,
      el('p', { text: '🗳️ Vota em: ' + p.local_votacao +
        (p.lat !== undefined && p.local_lat !== undefined
          ? ' (' + textoDistancia(distanciaKm([p.lat, p.lng], [p.local_lat, p.local_lng])).replace(' de você', ' da casa') + ')' : '') }),
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
      api('assumir', credenciais({ id: p.id })).then(function () {
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
    preencherResumo(dl, campos);

    var perfil = lembrar('perfil') || {};
    var texto = 'Olá, ' + c.nome + '! Sou ' + (perfil.nome || c.motorista_nome) + ', da Carona Solidária. ' +
      'Vou te levar para votar no domingo, em ' + c.local_votacao + '. Que horário fica melhor para você?';
    var zap = el('a', { class: 'btn', target: '_blank', rel: 'noopener', text: '💬 Chamar no WhatsApp',
      href: 'https://wa.me/55' + digitos(c.whatsapp) + '?text=' + encodeURIComponent(texto) });
    var destino = c.lat ? c.lat + ',' + c.lng : c.endereco + (C.CIDADE ? ', ' + C.CIDADE : '');
    var rota = el('a', { class: 'btn sec', target: '_blank', rel: 'noopener', text: '🏠 Caminho até a casa',
      href: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destino) });
    var escola = c.local_lat ? c.local_lat + ',' + c.local_lng : c.local_votacao + (C.CIDADE ? ', ' + C.CIDADE : '');
    var rotaEscola = el('a', { class: 'btn sec', target: '_blank', rel: 'noopener', text: '🗳️ Caminho da casa até o local de votação',
      href: 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(destino) + '&destination=' + encodeURIComponent(escola) });
    var desistir = el('button', { class: 'btn sec', type: 'button', text: 'Não posso mais ir' });
    var cartao = el('article', { class: 'card' }, [
      el('div', { class: 'linha' }, [el('h3', { text: '🙋 ' + c.nome }), el('span', { class: 'id', text: c.id })]),
      dl,
      el('div', { class: 'pilha', style: 'margin:0' }, [zap, rota, rotaEscola, desistir]),
    ]);
    desistir.addEventListener('click', function () {
      if (!confirm('Devolver a carona de ' + c.nome + ' para a lista? Lembre de avisar a pessoa no WhatsApp.')) return;
      ocupado(desistir, true);
      api('liberar', credenciais({ id: c.id })).then(function () {
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
    var quem = C.CONTATO_NOME ? C.CONTATO_NOME + ', da organização,' : 'a organização';
    $$('.ajuda-contato:not([data-sempre])').forEach(function (caixa) {
      caixa.append(
        (caixa.dataset.texto || '📞 Precisa de ajuda ou prefere que alguém preencha por você? Chame ' + quem + ' no WhatsApp:') + ' ',
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

  // Tema claro/escuro: segue o aparelho até a pessoa escolher.
  var escuroNoAparelho = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  function aplicarTema() {
    var tema = lembrar('tema');
    if (tema) document.documentElement.dataset.theme = tema;
    else delete document.documentElement.dataset.theme;
    var escuro = tema ? tema === 'dark' : escuroNoAparelho;
    $('#tema').textContent = escuro ? '☀️' : '🌙';
    $('#tema').title = escuro ? 'Usar tema claro' : 'Usar tema escuro';
    $('#tema').setAttribute('aria-label', $('#tema').title);
  }
  $('#tema').addEventListener('click', function () {
    var escuro = lembrar('tema') ? lembrar('tema') === 'dark' : escuroNoAparelho;
    guardar('tema', escuro ? 'light' : 'dark');
    aplicarTema();
  });
  aplicarTema();

  window.addEventListener('hashchange', mostrar);
  mostrar();
})();
