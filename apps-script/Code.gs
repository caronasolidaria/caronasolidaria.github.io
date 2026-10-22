/**
 * Carona Solidária — backend em Google Apps Script.
 *
 * A planilha onde este script está "colado" é o banco de dados e também o painel
 * da organização. O site (GitHub Pages) só fala com este script; ninguém lê a
 * planilha diretamente.
 *
 * Segurança (a URL deste script é pública, então toda proteção mora aqui):
 * - motoristas novos ficam "pendente" até a organização mudar para "ativo" na planilha;
 * - cada motorista recebe uma senha secreta (token), guardada só no celular dele,
 *   exigida para ver a lista, assumir, ver as próprias caronas, devolver e editar;
 * - limites de envio contra robôs; nada de dado pessoal no mapa aberto.
 *
 * Instalação: ver README.md do repositório.
 */

// Opcional: preencha para exigir um código dos motoristas (o site passa a pedir sozinho).
// Vazio = qualquer pessoa com o link pode se cadastrar (e espera a aprovação da organização).
const CODIGO_MOTORISTAS = '';

// Para a segurança de todos, os dados são apagados sozinhos neste momento (horário de Natal).
const APAGAR_EM = new Date('2026-10-26T18:00:00-03:00');

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
  'turno', 'regiao', 'lat', 'lng', 'token',
];
// Campos que um motorista aprovado vê ANTES de assumir a carona.
const PUBLICOS = [
  'id', 'status', 'regiao', 'local_votacao', 'turno', 'volta',
  'cadeira_rodas', 'andador', 'ajuda_entrar', 'acompanhante',
];
const TURNOS = ['manha', 'tarde', 'tanto-faz'];
// Valores permitidos na coluna status: viram um menu de opções na planilha.
const STATUS_PEDIDO = ['aberto', 'combinado', 'realizado', 'cancelado'];
const STATUS_MOTORISTA = ['pendente', 'ativo', 'inativo'];
// Arredondamento das coordenadas, em graus. O mapa aberto a todos nunca mostra a casa:
// ~0,004° ≈ 450 m. Na lista dos motoristas, ~0,0015° ≈ 170 m, só para estimar a distância.
const GRADE_PUBLICA = 0.004;
const GRADE_MOTORISTA = 0.0015;
// Limites contra abuso.
const MAX_CARONAS_POR_MOTORISTA = 4;
const MAX_PEDIDOS_ABERTOS_POR_WHATSAPP = 2;
const MAX_PEDIDOS_POR_HORA = 60;
const MAX_CADASTROS_POR_HORA = 30;

/** Rode pelo editor depois de colar uma versão nova: cria abas, cabeçalhos, menus e o agendamento. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[ABA, COLUNAS, STATUS_PEDIDO], [ABA_MOT, COLUNAS_MOT, STATUS_MOTORISTA]].forEach(([nome, cols, status]) => {
    const aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    aba.setFrozenRows(1);
    // Tudo como texto: evita que telefone vire número e que a planilha interprete fórmulas.
    aba.getRange(1, 1, aba.getMaxRows(), cols.length).setNumberFormat('@');
    // Coluna status com menu de opções: a planilha recusa qualquer outro valor.
    const regra = SpreadsheetApp.newDataValidation().requireValueInList(status, true).setAllowInvalid(false).build();
    aba.getRange(2, cols.indexOf('status') + 1, aba.getMaxRows() - 1, 1).setDataValidation(regra);
  });
  // Agenda a exclusão automática (na primeira vez, o Google pede uma permissão a mais).
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'apagarTudo')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (new Date() < APAGAR_EM) ScriptApp.newTrigger('apagarTudo').timeBased().at(APAGAR_EM).create();
}

/** Apaga todos os pedidos e motoristas, mantendo só os cabeçalhos. */
function apagarTudo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [ABA, ABA_MOT].forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (aba && aba.getLastRow() > 1) aba.deleteRows(2, aba.getLastRow() - 1);
  });
}

function doGet() {
  return json({ ok: true, servico: 'carona-solidaria' });
}

function doPost(e) {
  // Garantia extra, caso o agendamento falhe: depois do prazo, apaga e não aceita mais nada.
  if (new Date() >= APAGAR_EM) {
    apagarTudo();
    return json({ ok: false, erro: 'A Carona Solidária foi encerrada e, para a segurança de todos, os dados foram apagados. Obrigado!' });
  }
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
      case 'listar': exigirCodigo(req); return json(listar(autenticar(req, true)));
      case 'assumir': exigirCodigo(req); return json(assumir(req.id, autenticar(req, true)));
      case 'minhas': exigirCodigo(req); return json(minhas(autenticar(req, false)));
      case 'liberar': exigirCodigo(req); return json(liberar(req.id, autenticar(req, false)));
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
    local_votacao: texto(d.local_votacao, 200, true, 'local de votação'),
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
    limitar('pedidos', MAX_PEDIDOS_POR_HORA);
    const aba = planilha(ABA);
    const abertos = ler(aba, COLUNAS).filter(l => l.whatsapp === p.whatsapp && l.status === 'aberto').length;
    if (abertos >= MAX_PEDIDOS_ABERTOS_POR_WHATSAPP) {
      throw new Error('Já existem ' + abertos + ' pedidos esperando motorista com este WhatsApp. Para mudar algo, fale com a organização.');
    }
    p.id = novoId(aba, 'C');
    p.criado_em = agora();
    p.status = 'aberto';
    aba.appendRow(COLUNAS.map(c => celula(c, p[c])));
    return { ok: true, id: p.id };
  });
}

/** Cadastro novo (fica pendente) ou edição do próprio cadastro (exige o token). */
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
      // Token em branco = a organização liberou um novo aparelho (troca de celular).
      if (existente.token && String(d.token || '') !== existente.token) {
        throw new Error('Este WhatsApp já tem cadastro de motorista. Se você trocou de celular, fale com a organização.');
      }
      // A edição não muda id, data nem status (quem aprova é a organização).
      ['id', 'criado_em', 'status'].forEach(c => { m[c] = existente[c]; });
      m.token = existente.token || Utilities.getUuid().replace(/-/g, '');
      aba.getRange(existente._linha, 1, 1, COLUNAS_MOT.length)
        .setValues([COLUNAS_MOT.map(c => celula(c, m[c]))]);
    } else {
      limitar('cadastros', MAX_CADASTROS_POR_HORA);
      m.id = novoId(aba, 'M');
      m.criado_em = agora();
      m.status = 'pendente';
      m.token = Utilities.getUuid().replace(/-/g, '');
      aba.appendRow(COLUNAS_MOT.map(c => celula(c, m[c])));
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
    if (!coordValida(l.lat, l.lng)) return;
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
    if (ativo && coordValida(l.local_lat, l.local_lng)) {
      const k = l.local_lat + ',' + l.local_lng;
      // Só o nome do local (antes do endereço entre parênteses), sem nada do pedido.
      locais[k] = locais[k] || { nome: l.local_votacao.split(' (')[0].slice(0, 100), lat: Number(l.local_lat), lng: Number(l.local_lng), pessoas: 0 };
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
    if (coordValida(l.lat, l.lng)) {
      o.lat = arredondar(l.lat, GRADE_MOTORISTA);
      o.lng = arredondar(l.lng, GRADE_MOTORISTA);
    }
    if (coordValida(l.local_lat, l.local_lng)) {
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

function assumir(id, mot) {
  return comTrava(() => {
    const aba = planilha(ABA);
    const linhas = ler(aba, COLUNAS);
    const minhasAgora = linhas.filter(x => x.status === 'combinado' && x.motorista_whatsapp === mot.whatsapp).length;
    if (minhasAgora >= MAX_CARONAS_POR_MOTORISTA) {
      throw new Error('Você já tem ' + minhasAgora + ' caronas combinadas, o máximo por motorista. Se puder levar mais, fale com a organização.');
    }
    const l = linhas.find(x => x.id === String(id));
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
      aba.getRange(l._linha, COLUNAS.indexOf(c) + 1).setValue(celula(c, mudar[c]));
    });
    return { ok: true, carona: limpo(Object.assign(l, mudar)) };
  });
}

function minhas(mot) {
  const caronas = ler(planilha(ABA), COLUNAS)
    .filter(l => l.status === 'combinado' && l.motorista_whatsapp === mot.whatsapp)
    .map(limpo);
  return { ok: true, motorista: limpo(mot), caronas: caronas };
}

function liberar(id, mot) {
  return comTrava(() => {
    const aba = planilha(ABA);
    const l = ler(aba, COLUNAS).find(x => x.id === String(id));
    if (!l || l.status !== 'combinado' || l.motorista_whatsapp !== mot.whatsapp) {
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

/** Confere WhatsApp + token do motorista. Com exigirAtivo, só passa quem a organização aprovou. */
function autenticar(req, exigirAtivo) {
  const tel = String(req.whatsapp || '').replace(/\D/g, '');
  const token = String(req.token || '');
  const mot = tel && ler(planilha(ABA_MOT), COLUNAS_MOT).find(x => x.whatsapp === tel);
  if (!mot || !mot.token || !token || token !== mot.token) {
    throw new Error('Cadastro de motorista não encontrado neste aparelho. Se você trocou de celular, fale com a organização.');
  }
  if (exigirAtivo && mot.status === 'pendente') {
    throw new Error('Seu cadastro está esperando a aprovação da organização. Volte daqui a pouco e toque em Atualizar.');
  }
  if (exigirAtivo && mot.status !== 'ativo') {
    throw new Error('Seu cadastro de motorista está desativado. Fale com a organização.');
  }
  return mot;
}

/** Conta envios na última hora (aproximado) e recusa acima do limite. */
function limitar(chave, max) {
  const cache = CacheService.getScriptCache();
  const k = 'limite-' + chave + '-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMddHH');
  const n = Number(cache.get(k) || 0) + 1;
  if (n > max) throw new Error('Muitos envios agora. Tente de novo daqui a pouco.');
  cache.put(k, String(n), 3600);
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

function coordValida(lat, lng) {
  const a = Number(lat), b = Number(lng);
  return lat !== '' && lng !== '' && isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
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

/**
 * Valor pronto para a planilha. O apóstrofo na frente força texto: impede fórmulas
 * (= + - @) e impede que a planilha em português leia "-5.88" como -588 ou "22/10" como data.
 * A planilha não mostra o apóstrofo. A coluna status fica sem ele, por causa do menu.
 */
function celula(coluna, v) {
  const s = v == null ? '' : String(v);
  return s === '' || coluna === 'status' ? s : "'" + s;
}

function agora() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm');
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
