# Carona Solidária

Site simples para vizinhos com carro levarem vizinhos com dificuldade de locomoção (idosos, pessoas com deficiência) até o local de votação. Gratuito e apartidário.

- **Site**: estático, no GitHub Pages (`index.html`, `app.js`, `config.js`).
- **Dados**: uma planilha Google privada, acessada só pelo Apps Script em `apps-script/Code.gs`. **Nenhum dado pessoal fica neste repositório.**

## Como funciona

1. Quem precisa de carona preenche o pedido (aberto, sem código).
2. Motoristas convidados entram com o **código do grupo** e veem só rua/bairro, local de votação, horário e necessidades.
3. Ao clicar em "Eu levo", o pedido sai da lista e só esse motorista vê nome, WhatsApp e endereço.
4. O motorista pode devolver a carona para a lista em "Minhas caronas".

A planilha é o painel da organização: lá aparecem todos os pedidos, quem assumiu e quando.

## Ligar a planilha (5 minutos, uma vez)

1. Abra <https://sheets.new> e dê um nome, ex.: `Carona Solidária — dados`.
2. Menu **Extensões → Apps Script**. Apague o conteúdo e cole o de `apps-script/Code.gs`.
3. Na linha `const CODIGO_MOTORISTAS = 'troque-este-codigo';`, troque pelo código que você vai mandar aos motoristas. Salve.
4. No seletor de funções, escolha `setup` e clique em **Executar**. Autorize o acesso (aparece "app não verificado": *Avançado → Acessar*). A aba `Pedidos` será criada.
5. **Implantar → Nova implantação →** tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie a URL que termina em `/exec` e coloque em `SCRIPT_URL` no `config.js`.

> Se mudar o `Code.gs` depois, use **Implantar → Gerenciar implantações → editar → Nova versão**, para manter a mesma URL.

## Cuidados

- **Não apague linhas** da planilha durante a operação (os números dos pedidos dependem disso). Para cancelar, escreva `cancelado` na coluna `status`.
- Depois da eleição, **apague a planilha** (o prazo prometido no site está em `APAGAR_ATE` no `config.js`).
- Transporte de eleitores tem restrições legais (Lei nº 6.091/1974). O site traz avisos de que a iniciativa é apartidária e de que a organização só põe as pessoas em contato. Na dúvida, consulte o cartório eleitoral.
