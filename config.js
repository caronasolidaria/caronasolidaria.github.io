// Ajuste estes valores e publique de novo.
window.CONFIG = {
  // Texto da data da votação.
  DATA: 'Domingo, 25 de outubro · 2º turno · das 8h às 17h',
  // WhatsApp e nome de quem organiza (DDD + número, só dígitos). Deixe vazio para não exibir.
  CONTATO: '81996189993',
  CONTATO_NOME: 'Ricardo Rodrigues',
  // Código do site no GitHub (link do "Feito por" no rodapé).
  REPOSITORIO: 'https://github.com/caronasolidaria/caronasolidaria.github.io',
  // Quando os dados são apagados (igual a APAGAR_EM no Code.gs).
  APAGAR_ATE: '26/10/2026, às 18h',

  // Uma entrada por cidade; a pessoa escolhe na primeira tela (ou pelo link ?cidade=recife).
  // Cada cidade tem a SUA planilha (SCRIPT_URL) e a sua lista oficial de locais de votação.
  //   SCRIPT_URL      URL do App da Web do Apps Script da planilha da cidade (termina em /exec)
  //   BAIRRO          nome que aparece no topo
  //   UF              sigla do estado, na tela de escolha
  //   CIDADE          usada nos links de rota quando o ponto não foi marcado no mapa
  //   REGIAO          área da busca de endereços e escolas: oeste, norte, leste, sul
  //   AREA_MAPA       área que o mapa mostra ao abrir: [[sul, oeste], [norte, leste]]
  //   CENTRO          centro da cidade: ordena os locais de votação por proximidade
  //   LOCAIS          arquivo com os locais de votação do 2º turno (dados abertos do TSE)
  CIDADES: {
    natal: {
      SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwFJdQjVZwIleXElcSBXwQJnPVPpukVWxAEpFb1msUKcoQdhZUINZsEe-AENsEBtJe1Vw/exec',
      BAIRRO: 'Natal',
      UF: 'RN',
      CIDADE: 'Natal, RN',
      // Grande Natal: Natal, Parnamirim, São Gonçalo do Amarante, Macaíba, Extremoz,
      // Ceará-Mirim, São José de Mipibu e Nísia Floresta.
      REGIAO: [-35.65, -5.45, -34.95, -6.25],
      REGIAO_NOME: 'na Grande Natal',
      REGIAO_TITULO: 'Grande Natal',
      DDD: '84',
      EXEMPLOS_LOCAIS: 'Nassau, Jerônimo, Josefa Botelho',
      AREA_MAPA: [[-5.9002, -35.2912], [-5.7027, -35.1531]],
      CENTRO: [-5.8054, -35.2081],
      ZOOM: 12,
      LOCAIS: 'locais-natal.json',
    },
    recife: {
      SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxnmWYAr_jcJxaursjXStuH7Oz2DG8hgLWGmEGqo6W0YsEpdx2uCmiFbeMA4NoyrbxXZg/exec',
      BAIRRO: 'Recife',
      UF: 'PE',
      CIDADE: 'Recife, PE',
      // Grande Recife: Recife, Olinda, Jaboatão dos Guararapes, Paulista, Camaragibe,
      // São Lourenço da Mata, Abreu e Lima, Igarassu, Cabo de Santo Agostinho, Moreno,
      // Ipojuca, Itapissuma, Ilha de Itamaracá e Araçoiaba.
      REGIAO: [-35.24, -7.7, -34.78, -8.57],
      REGIAO_NOME: 'no Grande Recife',
      REGIAO_TITULO: 'região metropolitana do Recife',
      DDD: '81',
      EXEMPLOS_LOCAIS: 'Ginásio Pernambucano, UFPE, Nassau',
      AREA_MAPA: [[-8.1552, -35.0186], [-7.929, -34.8515]],
      CENTRO: [-8.0585, -34.8848],
      ZOOM: 12,
      LOCAIS: 'locais-recife.json',
    },
    jp: {
      SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwbfv98k1g4O5l4xK-mTu8ii6G2jhLhutn9d9GTXBq292fVaHAWNPAPz4DcWXXUtd2Zsg/exec',
      BAIRRO: 'João Pessoa',
      UF: 'PB',
      CIDADE: 'João Pessoa, PB',
      // Grande João Pessoa: João Pessoa, Cabedelo, Bayeux, Santa Rita, Conde e Lucena.
      REGIAO: [-35.04, -6.85, -34.77, -7.35],
      REGIAO_NOME: 'na Grande João Pessoa',
      REGIAO_TITULO: 'Grande João Pessoa',
      DDD: '83',
      EXEMPLOS_LOCAIS: 'UFPB, Unipê, Pio X',
      AREA_MAPA: [[-7.2477, -34.974], [-7.056, -34.793]],
      CENTRO: [-7.1216, -34.882],
      ZOOM: 12,
      LOCAIS: 'locais-jp.json',
    },
  },
};
