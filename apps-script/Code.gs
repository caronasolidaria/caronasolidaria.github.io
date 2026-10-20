/**
 * Carona Solidária — backend em Google Apps Script.
 *
 * A planilha onde este script está "colado" é o banco de dados e também o painel
 * do coordenador. O site (GitHub Pages) só fala com este script; ninguém lê a
 * planilha diretamente.
 *
 * Instalação: ver README.md do repositório.
 */

// Opcional: preencha para exigir um código dos motoristas (o site passa a pedir sozinho).
// Vazio = qualquer pessoa com o link pode se cadastrar como motorista.
const CODIGO_MOTORISTAS = '';

const ABA = 'Pedidos';
const COLUNAS = [
  'id', 'criado_em', 'status',
  'nome', 'whatsapp', 'quem_cadastra', 'endereco', 'referencia', 'regiao',
  'local_votacao', 'turno', 'volta',
  'cadeira_rodas', 'andador', 'ajuda_entrar', 'acompanhante', 'observacoes',
  'motorista_nome', 'motorista_whatsapp', 'motorista_carro', 'combinado_em',
  'lat', 'lng', 'local_lat', 'local_lng',
];
const ABA_MOT = 'Motoristas';
const COLUNAS_MOT = [
  'id', 'criado_em', 'status', 'nome', 'whatsapp', 'carro', 'lugares', 'cadeira_ok',
  'turno', 'regiao', 'lat', 'lng',
];
// Campos que qualquer motorista com o código vê ANTES de assumir a carona.
const PUBLICOS = [
  'id', 'status', 'regiao', 'local_votacao', 'turno', 'volta',
  'cadeira_rodas', 'andador', 'ajuda_entrar', 'acompanhante',
];
const TURNOS = ['manha', 'tarde', 'tanto-faz'];
// Arredondamento das coordenadas, em graus. O mapa aberto a todos nunca mostra a casa:
// ~0,004° ≈ 450 m. Na lista dos motoristas, ~0,0015° ≈ 170 m, só para estimar a distância.
const GRADE_PUBLICA = 0.004;
const GRADE_MOTORISTA = 0.0015;

/** Rode uma vez pelo editor para criar as abas e os cabeçalhos. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[ABA, COLUNAS], [ABA_MOT, COLUNAS_MOT]].forEach(([nome, cols]) => {
    const aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    aba.setFrozenRows(1);
    // Tudo como texto: evita que telefone vire número e que a planilha interprete fórmulas.
    aba.getRange(1, 1, aba.getMaxRows(), cols.length).setNumberFormat('@');
  });
}

function doGet() {
  return json({ ok: true, servico: 'carona-solidaria' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, erro: 'Requisição inválida.' });
  }
  try {
    switch (req.acao) {
      case 'pedir': return json(pedir(req.dados || {}));
      case 'mapa': return json(mapa());
      case 'oferecer': exigirCodigo(req); return json(oferecer(req.dados || {}));
      case 'listar': exigirCodigo(req); return json(listar());
      case 'assumir': exigirCodigo(req); return json(assumir(req.id, req.whatsapp));
      case 'minhas': exigirCodigo(req); return json(minhas(req.whatsapp));
      case 'liberar': exigirCodigo(req); return json(liberar(req.id, req.whatsapp));
      default: return json({ ok: false, erro: 'Ação desconhecida.' });
    }
  } catch (err) {
    return json({ ok: false, erro: err.message || String(err) });
  }
}

// ---------- ações ----------

function pedir(d) {
  const p = Object.assign({
    nome: texto(d.nome, 80, true, 'nome'),
    whatsapp: telefone(d.whatsapp),
    quem_cadastra: texto(d.quem_cadastra, 80, false),
    endereco: texto(d.endereco, 160, true, 'endereço'),
    referencia: texto(d.referencia, 160, false),
    regiao: texto(d.regiao, 80, true, 'rua ou bairro'),
    local_votacao: texto(d.local_votacao, 120, true, 'local de votação'),
    turno: TURNOS.indexOf(d.turno) >= 0 ? d.turno : 'tanto-faz',
    volta: simNao(d.volta),
    cadeira_rodas: simNao(d.cadeira_rodas),
    andador: simNao(d.andador),
    ajuda_entrar: simNao(d.ajuda_entrar),
    acompanhante: simNao(d.acompanhante),
    observacoes: texto(d.observacoes, 300, false),
  }, coordenadas(d), localDeVotacao(d));
  if (d.consentimento !== true) throw new Error('É preciso aceitar o uso dos dados.');

  return comTrava(() => {
    const aba = planilha(ABA);
    p.id = novoId(aba, 'C');
    p.criado_em = agora();
    p.status = 'aberto';
    aba.appendRow(COLUNAS.map(c => seguro(p[c] || '')));
    return { ok: true, id: p.id };
  });
}

function oferecer(d) {
  const m = Object.assign({
    nome: texto(d.nome, 80, true, 'nome'),
    whatsapp: telefone(d.whatsapp),
    carro: texto(d.carro, 80, true, 'carro'),
    lugares: String(Math.min(6, Math.max(1, parseInt(d.lugares, 10) || 1))),
    cadeira_ok: simNao(d.cadeira_ok),
    turno: TURNOS.indexOf(d.turno) >= 0 ? d.turno : 'tanto-faz',
    regiao: texto(d.regiao, 80, false),
  }, coordenadas(d));
  if (d.compromisso !== true) throw new Error('É preciso aceitar o termo de compromisso.');

  return comTrava(() => {
    const aba = planilha(ABA_MOT);
    const existente = ler(aba, COLUNAS_MOT).find(x => x.whatsapp === m.whatsapp);
    if (existente) {
      // Mesmo WhatsApp: atualiza o cadastro em vez de duplicar.
      m.id = existente.id;
      m.criado_em = existente.criado_em;
      m.status = 'ativo';
      aba.getRange(existente._linha, 1, 1, COLUNAS_MOT.length)
        .setValues([COLUNAS_MOT.map(c => seguro(m[c] || ''))]);
    } else {
      m.id = novoId(aba, 'M');
      m.criado_em = agora();
      m.status = 'ativo';
      aba.appendRow(COLUNAS_MOT.map(c => seguro(m[c] || '')));
    }
    return { ok: true, motorista: m };
  });
}

/**
 * Pontos aproximados para o mapa aberto: nenhuma informação pessoal sai daqui.
 * Os locais de votação (escolas, prédios públicos) vão com a posição exata.
 */
function mapa() {
  const celulas = {};
  const locais = {};
  const totais = { pedidos: 0, combinados: 0, motoristas: 0 };
  function somar(l, tipo) {
    totais[tipo]++;
    if (!l.lat || !l.lng) return;
    const lat = arredondar(l.lat, GRADE_PUBLICA);
    const lng = arredondar(l.lng, GRADE_PUBLICA);
    const k = lat + ',' + lng;
    celulas[k] = celulas[k] || { lat: lat, lng: lng, pedidos: 0, combinados: 0, motoristas: 0 };
    celulas[k][tipo]++;
  }
  ler(planilha(ABA), COLUNAS).forEach(l => {
    const ativo = l.status === 'aberto' || l.status === 'combinado' || l.status === 'realizado';
    if (l.status === 'aberto') somar(l, 'pedidos');
    else if (ativo) somar(l, 'combinados');
    if (ativo && l.local_lat && l.local_lng) {
      const k = l.local_lat + ',' + l.local_lng;
      locais[k] = locais[k] || { nome: l.local_votacao, lat: Number(l.local_lat), lng: Number(l.local_lng), pessoas: 0 };
      locais[k].pessoas++;
    }
  });
  ler(planilha(ABA_MOT), COLUNAS_MOT).forEach(l => {
    if (l.status === 'ativo') somar(l, 'motoristas');
  });
  return {
    ok: true,
    pontos: Object.keys(celulas).map(k => celulas[k]),
    locais: Object.keys(locais).map(k => locais[k]),
    totais: totais,
  };
}

function listar() {
  const linhas = ler(planilha(ABA), COLUNAS);
  const abertos = linhas.filter(l => l.status === 'aberto').map(l => {
    const o = {};
    PUBLICOS.forEach(c => { o[c] = l[c]; });
    if (l.lat && l.lng) {
      o.lat = arredondar(l.lat, GRADE_MOTORISTA);
      o.lng = arredondar(l.lng, GRADE_MOTORISTA);
    }
    if (l.local_lat && l.local_lng) {
      o.local_lat = Number(l.local_lat);
      o.local_lng = Number(l.local_lng);
    }
    return o;
  });
  return {
    ok: true,
    abertos: abertos,
    combinados: linhas.filter(l => l.status === 'combinado' || l.status === 'realizado').length,
  };
}

function assumir(id, whatsapp) {
  const mot = acharMotorista(telefone(whatsapp));
  if (!mot) throw new Error('Faça seu cadastro de motorista antes de assumir uma carona.');

  return comTrava(() => {
    const aba = planilha(ABA);
    const l = ler(aba, COLUNAS).find(x => x.id === String(id));
    if (!l) throw new Error('Pedido não encontrado.');
    if (l.status !== 'aberto') throw new Error('Outra pessoa já assumiu essa carona. Atualize a lista.');
    const mudar = {
      status: 'combinado',
      motorista_nome: mot.nome,
      motorista_whatsapp: mot.whatsapp,
      motorista_carro: mot.carro,
      combinado_em: agora(),
    };
    Object.keys(mudar).forEach(c => {
      aba.getRange(l._linha, COLUNAS.indexOf(c) + 1).setValue(seguro(mudar[c]));
    });
    return { ok: true, carona: limpo(Object.assign(l, mudar)) };
  });
}

function minhas(whatsapp) {
  const tel = telefone(whatsapp);
  const mot = acharMotorista(tel);
  const caronas = ler(planilha(ABA), COLUNAS)
    .filter(l => l.status === 'combinado' && l.motorista_whatsapp === tel)
    .map(limpo);
  return { ok: true, motorista: mot ? limpo(mot) : null, caronas: caronas };
}

function liberar(id, whatsapp) {
  const tel = telefone(whatsapp);
  return comTrava(() => {
    const aba = planilha(ABA);
    const l = ler(aba, COLUNAS).find(x => x.id === String(id));
    if (!l || l.status !== 'combinado' || l.motorista_whatsapp !== tel) {
      throw new Error('Essa carona não está com você.');
    }
    ['motorista_nome', 'motorista_whatsapp', 'motorista_carro', 'combinado_em'].forEach(c => {
      aba.getRange(l._linha, COLUNAS.indexOf(c) + 1).setValue('');
    });
    aba.getRange(l._linha, COLUNAS.indexOf('status') + 1).setValue('aberto');
    return { ok: true };
  });
}

// ---------- utilitários ----------

function exigirCodigo(req) {
  if (!CODIGO_MOTORISTAS) return;
  if (String(req.codigo || '').trim().toLowerCase() !== CODIGO_MOTORISTAS.toLowerCase()) {
    throw new Error('Código do grupo incorreto.');
  }
}

function comTrava(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function planilha(nome) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!aba) throw new Error('Planilha não configurada: rode setup() no editor.');
  return aba;
}

function ler(aba, colunas) {
  const n = aba.getLastRow();
  if (n < 2) return [];
  const vals = aba.getRange(2, 1, n - 1, colunas.length).getDisplayValues();
  return vals.map((v, i) => {
    const o = { _linha: i + 2 };
    colunas.forEach((c, j) => { o[c] = v[j]; });
    return o;
  });
}

function acharMotorista(tel) {
  return ler(planilha(ABA_MOT), COLUNAS_MOT).find(x => x.whatsapp === tel && x.status === 'ativo') || null;
}

function limpo(l) {
  const o = Object.assign({}, l);
  delete o._linha;
  return o;
}

function novoId(aba, prefixo) {
  // Curto e fácil de falar por telefone: C-001, M-001...
  return prefixo + '-' + String(aba.getLastRow()).padStart(3, '0');
}

function texto(v, max, obrigatorio, rotulo) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  if (obrigatorio && !s) throw new Error('Preencha o campo: ' + rotulo + '.');
  return s;
}

function telefone(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length < 10 || d.length > 11) throw new Error('WhatsApp inválido: use DDD + número.');
  return d;
}

function coordenadas(d) {
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const ok = d.lat !== '' && d.lat != null && isFinite(lat) && isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return ok ? { lat: lat.toFixed(5), lng: lng.toFixed(5) } : { lat: '', lng: '' };
}

function localDeVotacao(d) {
  const c = coordenadas({ lat: d.local_lat, lng: d.local_lng });
  return { local_lat: c.lat, local_lng: c.lng };
}

function arredondar(v, grade) {
  return Number((Math.round(Number(v) / grade) * grade).toFixed(5));
}

function simNao(v) {
  return v === true ? 'sim' : 'nao';
}

// Impede que um valor começando com = + - @ vire fórmula na planilha.
// Números puros (coordenadas negativas) passam direto.
function seguro(v) {
  const s = String(v);
  return /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
}

function agora() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm');
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
