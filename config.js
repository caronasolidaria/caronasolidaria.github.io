// Ajuste estes valores e publique de novo.
window.CONFIG = {
  // URL do App da Web do Apps Script (termina em /exec). Ver README.md.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwFJdQjVZwIleXElcSBXwQJnPVPpukVWxAEpFb1msUKcoQdhZUINZsEe-AENsEBtJe1Vw/exec',
  // Nome do bairro ou da comunidade, aparece no topo.
  BAIRRO: 'Vila de Ponta Negra',
  // Cidade, usada nos links de rota quando o ponto não foi marcado no mapa.
  CIDADE: 'Natal, RN',
  // Área onde a busca de endereços e escolas procura: oeste, norte, leste, sul.
  // Grande Natal: Natal, Parnamirim, São Gonçalo do Amarante, Macaíba, Extremoz,
  // Ceará-Mirim, São José de Mipibu e Nísia Floresta.
  REGIAO: [-35.65, -5.45, -34.95, -6.25],
  REGIAO_NOME: 'na Grande Natal',
  // Centro e zoom iniciais do mapa (latitude, longitude). Pegue no openstreetmap.org.
  CENTRO: [-5.8883, -35.1691],
  ZOOM: 15,
  // Texto da data da votação.
  DATA: 'Domingo, 25 de outubro · 2º turno · das 8h às 17h',
  // WhatsApp de quem organiza (DDD + número, só dígitos). Deixe vazio para não exibir.
  CONTATO: '',
  // Até quando os dados ficam guardados antes de serem apagados.
  APAGAR_ATE: '31/10/2026',
};
