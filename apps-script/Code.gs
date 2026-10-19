/**
 * Carona Solidária — backend em Google Apps Script.
 *
 * A planilha onde este script está "colado" é o banco de dados e também o painel
 * do coordenador. O site (GitHub Pages) só fala com este script; ninguém lê a
 * planilha diretamente.
 *
 * Instalação: ver README.md do repositório.
 */

// Código que você manda só para motoristas de confiança. TROQUE antes de implantar.
const CODIGO_MOTORISTAS = 'troque-este-codigo';

const ABA = 'Pedidos';
const COLUNAS = [
  'id', 'criado_em', 'status',
  'nome', 'whatsapp', 'quem_cadastra', 'endereco', 'referencia', 'regiao',
  'local_votacao', 'turno', 'volta',
  'cadeira_rodas', 'andador', 'ajuda_entrar', 'acompanhante', 'observacoes',
  'motorista_nome', 'motorista_whatsapp', 'motorista_carro', 'combinado_em',
];
// Campos que qualquer motorista com o código vê ANTES de assumir a carona.
const PUBLICOS = [
  'id', 'status', 'regiao', 'local_votacao', 'turno', 'volta',
  'cadeira_rodas', 'andador', 'ajuda_entrar', 'acompanhante',
];
const TURNOS = ['manha', 'tarde', 'tanto-faz'];

/** Rode uma vez pelo editor para criar a aba e o cabeçalho. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(ABA) || ss.insertSheet(ABA);
  aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]).setFontWeight('bold');
  aba.setFrozenRows(1);
  // Tudo como texto: evita que telefone vire número e que a planilha interprete fórmulas.
  aba.getRange(1, 1, aba.getMaxRows(), COLUNAS.length).setNumberFormat('@');
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
      case 'listar': exigirCodigo(req); return json(listar());
      case 'assumir': exigirCodigo(req); return json(assumir(req.id, req.motorista || {}));
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
  const p = {
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
  };
  if (d.consentimento !== true) throw new Error('É preciso aceitar o uso dos dados.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = planilha();
    p.id = novoId(aba);
    p.criado_em = agora();
    p.status = 'aberto';
    aba.appendRow(COLUNAS.map(c => seguro(p[c] || '')));
    return { ok: true, id: p.id };
  } finally {
    lock.releaseLock();
  }
}

function listar() {
  const linhas = ler();
  const abertos = linhas.filter(l => l.status === 'aberto').map(l => {
    const o = {};
    PUBLICOS.forEach(c => { o[c] = l[c]; });
    return o;
  });
  return {
    ok: true,
    abertos: abertos,
    total: linhas.length,
    combinados: linhas.filter(l => l.status === 'combinado' || l.status === 'realizado').length,
  };
}

function assumir(id, m) {
  const mot = {
    motorista_nome: texto(m.nome, 80, true, 'seu nome'),
    motorista_whatsapp: telefone(m.whatsapp),
    motorista_carro: texto(m.carro, 80, true, 'carro'),
  };
  if (m.compromisso !== true) throw new Error('É preciso aceitar o termo de compromisso.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = planilha();
    const linhas = ler(aba);
    const l = linhas.find(x => x.id === String(id));
    if (!l) throw new Error('Pedido não encontrado.');
    if (l.status !== 'aberto') throw new Error('Outra pessoa já assumiu essa carona. Atualize a lista.');
    mot.status = 'combinado';
    mot.combinado_em = agora();
    Object.keys(mot).forEach(c => {
      aba.getRange(l._linha, COLUNAS.indexOf(c) + 1).setValue(seguro(mot[c]));
    });
    return { ok: true, carona: completo(Object.assign(l, mot)) };
  } finally {
    lock.releaseLock();
  }
}

function minhas(whatsapp) {
  const tel = telefone(whatsapp);
  const caronas = ler()
    .filter(l => l.status === 'combinado' && l.motorista_whatsapp === tel)
    .map(completo);
  return { ok: true, caronas: caronas };
}

function liberar(id, whatsapp) {
  const tel = telefone(whatsapp);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = planilha();
    const l = ler(aba).find(x => x.id === String(id));
    if (!l || l.status !== 'combinado' || l.motorista_whatsapp !== tel) {
      throw new Error('Essa carona não está com você.');
    }
    ['motorista_nome', 'motorista_whatsapp', 'motorista_carro', 'combinado_em'].forEach(c => {
      aba.getRange(l._linha, COLUNAS.indexOf(c) + 1).setValue('');
    });
    aba.getRange(l._linha, COLUNAS.indexOf('status') + 1).setValue('aberto');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- utilitários ----------

function exigirCodigo(req) {
  if (String(req.codigo || '').trim().toLowerCase() !== CODIGO_MOTORISTAS.toLowerCase()) {
    throw new Error('Código do grupo incorreto.');
  }
}

function planilha() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
  if (!aba) throw new Error('Planilha não configurada: rode setup() no editor.');
  return aba;
}

function ler(aba) {
  aba = aba || planilha();
  const n = aba.getLastRow();
  if (n < 2) return [];
  const vals = aba.getRange(2, 1, n - 1, COLUNAS.length).getDisplayValues();
  return vals.map((v, i) => {
    const o = { _linha: i + 2 };
    COLUNAS.forEach((c, j) => { o[c] = v[j]; });
    return o;
  });
}

function completo(l) {
  const o = {};
  COLUNAS.forEach(c => { o[c] = l[c]; });
  return o;
}

function novoId(aba) {
  // Curto e fácil de falar por telefone: C-001, C-002...
  return 'C-' + String(aba.getLastRow()).padStart(3, '0');
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

function simNao(v) {
  return v === true ? 'sim' : 'nao';
}

// Impede que um valor começando com = + - @ vire fórmula na planilha.
function seguro(v) {
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function agora() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm');
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
