# Carona Solidária · Vila de Ponta Negra

Site simples para vizinhos com carro levarem vizinhos com dificuldade de locomoção (idosos, pessoas com deficiência) até o local de votação. Gratuito e apartidário.

- **Site**: estático, no GitHub Pages (`index.html`, `app.js`, `config.js`): <https://rsilveirafh.github.io/carona-solidaria/>
- **Dados**: uma planilha Google privada, acessada só pelo Apps Script em `apps-script/Code.gs`. **Nenhum dado pessoal fica neste repositório.**

## Como funciona

1. Quem precisa de carona responde um passo a passo (uma pergunta por tela, letra grande) e pode marcar a casa no mapa.
2. Motoristas voluntários fazem o próprio cadastro (carro, lugares, cadeira de rodas, de onde saem, horário) e veem os pedidos ordenados por distância, só com rua/bairro, local de votação, horário e necessidades.
3. Ao tocar em "Eu levo", o pedido sai da lista e só esse motorista vê nome, WhatsApp e endereço, com botões para chamar no WhatsApp e abrir o caminho no mapa.
4. O mapa da página inicial (OpenStreetMap) mostra só a **região aproximada** (~450 m) de pedidos, motoristas e caronas combinadas.

A planilha é o painel da organização: aba `Pedidos` (quem pediu, quem assumiu e quando) e aba `Motoristas`.

## Ligar a planilha (5 minutos, uma vez)

1. Abra <https://sheets.new> e dê um nome, ex.: `Carona Solidária — dados`.
2. Menu **Extensões → Apps Script**. Apague o conteúdo e cole o de `apps-script/Code.gs` (versão bruta: <https://raw.githubusercontent.com/rsilveirafh/carona-solidaria/main/apps-script/Code.gs>). Salve.
3. No seletor de funções, escolha `setup` e clique em **Executar**. Autorize o acesso (aparece "app não verificado": *Avançado → Acessar*). As abas `Pedidos` e `Motoristas` serão criadas.
4. **Implantar → Nova implantação →** tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
5. Copie a URL que termina em `/exec` e coloque em `SCRIPT_URL` no `config.js`.
6. No `config.js`, confira também `BAIRRO`, `CENTRO` do mapa e `CONTATO` (seu WhatsApp, para o atalho "prefere que alguém preencha por você?").

> Se mudar o `Code.gs` depois, use **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão**, para manter a mesma URL.

## Código do grupo (opcional)

Por padrão, qualquer pessoa com o link pode se cadastrar como motorista. Para restringir, preencha `CODIGO_MOTORISTAS` no `Code.gs` e publique uma nova versão: o site passa a pedir o código antes do cadastro, sem mudar nada no site.

## Cuidados

- **Não apague linhas** da planilha durante a operação (os números dos pedidos dependem disso). Para cancelar um pedido, escreva `cancelado` na coluna `status`. Para tirar um motorista, escreva `inativo`.
- Depois da eleição, **apague a planilha** (o prazo prometido no site está em `APAGAR_ATE` no `config.js`).
- Transporte de eleitores tem restrições legais (Lei nº 6.091/1974). O site traz avisos de que a iniciativa é apartidária e de que a organização só põe as pessoas em contato. Na dúvida, consulte o cartório eleitoral.
