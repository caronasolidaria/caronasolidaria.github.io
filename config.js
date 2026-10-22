// Ajuste estes valores e publique de novo.
window.CONFIG = {
  // URL do App da Web do Apps Script (termina em /exec). Ver README.md.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwFJdQjVZwIleXElcSBXwQJnPVPpukVWxAEpFb1msUKcoQdhZUINZsEe-AENsEBtJe1Vw/exec',
  // Nome do bairro ou da comunidade, aparece no topo.
  BAIRRO: 'Natal',
  // Cidade, usada nos links de rota quando o ponto não foi marcado no mapa.
  CIDADE: 'Natal, RN',
  // Área onde a busca de endereços e escolas procura: oeste, norte, leste, sul.
  // Grande Natal: Natal, Parnamirim, São Gonçalo do Amarante, Macaíba, Extremoz,
  // Ceará-Mirim, São José de Mipibu e Nísia Floresta.
  REGIAO: [-35.65, -5.45, -34.95, -6.25],
  REGIAO_NOME: 'na Grande Natal',
  REGIAO_TITULO: 'Grande Natal',
  // DDD usado nos exemplos de telefone.
  DDD: '84',
  // Exemplos de nomes de locais de votação (passo "Onde vota?").
  EXEMPLOS_LOCAIS: 'Nassau, Jerônimo, Josefa Botelho',
  // Área que o mapa mostra ao abrir: [[sul, oeste], [norte, leste]]. Aqui, Natal inteira.
  AREA_MAPA: [[-5.9002, -35.2912], [-5.7027, -35.1531]],
  // Centro da cidade: ordena os locais de votação por proximidade (e serve de reserva ao mapa).
  CENTRO: [-5.8054, -35.2081],
  ZOOM: 12,
  // Texto da data da votação.
  DATA: 'Domingo, 25 de outubro · 2º turno · das 8h às 17h',
  // WhatsApp e nome de quem organiza (DDD + número, só dígitos). Deixe vazio para não exibir.
  CONTATO: '81996189993',
  CONTATO_NOME: 'Ricardo Rodrigues',
  // Quando os dados são apagados (igual a APAGAR_EM no Code.gs).
  APAGAR_ATE: '26/10/2026, às 18h',
};
