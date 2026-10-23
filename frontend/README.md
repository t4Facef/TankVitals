# TankVitals — Frontend

Dashboard em Vue 3 + TypeScript + Vite para o projeto de monitoramento IoT de tanque de aquicultura.

## Requisitos

- Node.js
- Backend TankVitals só quando o modo simulado estiver desligado

## Instalação

```bash
npm install
```

## Desenvolvimento

Copie `.env.example` para `.env`.

Deixe `VITE_API_BASE_URL=` vazio para usar o proxy do Vite:

```bash
npm run dev
```

Acesse `http://localhost:5173`.

## Modo simulado

Enquanto o backend não tem as rotas do 2º bimestre, o app roda em **modo
simulado** (`VITE_MOCK=true`, o padrão): tudo é gerado no próprio navegador, no
mesmo formato que o backend vai mandar. Na tela de login há um botão para cada
papel de teste: `visualizador`, `operador` e `admin`.

O coração do modo simulado é a planta simulada (`src/mock/plant.ts`): o
tanque, a bomba e os atuadores, no relógio combinado (1 s real = 1 min
simulado). Ela nasce com 7 dias de histórico e responde o cadastro, o
histórico, os alertas e os comandos; a regra do aerador, a reposição, a
recirculação e a falha injetada funcionam. Dá para testar o fluxo Web → IoT
inteiro sem backend.

Ela também faz o papel da IA: a cada 5 s sai uma previsão de saúde e vida útil
da bomba, que percebe a falha injetada aos poucos, e o alerta da IA abre e
fecha com a histerese da IA-08 (3 previsões ruins seguidas abrem, 10 boas
fecham). Não é modelo nenhum, é só o formato certo para as telas.

O que se cadastra pela tela (dispositivos, regras) e o log da auditoria ficam
no `sessionStorage` da aba: recarregar a página mantém, fechar a aba volta ao
início.

Quando o backend tiver as rotas do contrato abaixo, ponha `VITE_MOCK=false` no
`.env`. Nenhum outro código muda.

## Como o app está organizado (WEB-01)

| Onde | O quê |
| --- | --- |
| `src/router/pages.ts` | as telas: título, ícone, grupo do menu, permissão e a tarefa que constrói cada uma |
| `src/stores/auth.ts` | sessão (JWT), papéis e permissões: `can('command')`, `can('train')`... |
| `src/stores/live.ts` | o store ao vivo: última telemetria de cada dispositivo, as recentes e os insights da IA |
| `src/live/socket.ts` | o WebSocket: pede o ticket, conecta e reconecta |
| `src/api/http.ts` | o cliente HTTP: manda o JWT e leva ao login quando a sessão acaba |
| `src/mock/` | o login e a telemetria do modo simulado; o cadastro e a auditoria ficam no `sessionStorage` da aba |
| `src/components/RoleGate.vue` | esconde um trecho de quem não tem a permissão |
| `src/domain/devices.ts` | os tipos do cadastro, do histórico, dos alertas e dos comandos (o contrato) |
| `src/stores/devices.ts` | o cadastro de dispositivos, carregado uma vez para todas as telas |
| `src/api/devices.ts` | as rotas de cadastro, histórico, alertas e comando |
| `src/composables/useLiveValues.ts` | o "agora" de cada dispositivo, com "sem dados" depois de 10 s |
| `src/components/ActuatorControl.vue` | o controle de atuador: estado, botão e "aguardando confirmação" |
| `src/plant/layout.ts` | o molde de um tanque: a posição de cada item pelo id e pelo papel, e os tubos |
| `src/plant/roles.ts` | o papel de cada dispositivo (temperatura, pH, bomba de recirculação...), pelo prefixo do id |
| `src/plant/tanks.ts` | os tanques do cadastro, um por zona: membros, posições, vínculos e tubos (`planTanks`) |
| `src/domain/registry.ts` | as regras do cadastro (id, faixas, limites da regra), usadas pelo formulário e pelo modo simulado |
| `src/composables/useDeviceState.ts` | a situação de cada dispositivo: online, parou ou sem dados, e o pior nível das faixas |
| `src/views/DevicesView.vue` | a tela Dispositivos (WEB-03): resumo, filtros, cartões por tanque, detalhe, formulário e regras |
| `src/components/DeviceCard.vue` | o cartão de um dispositivo: leitura ao vivo, mini gráfico, régua e situação |
| `src/components/DeviceDetail.vue` | o detalhe que abre pela direita, com editar e desativar para o admin |
| `src/views/AuditView.vue` | a Auditoria (WEB-04), só admin: agrupada por dia, filtro por tipo e usuário, paginada |
| `src/views/ToolsView.vue` | as Ferramentas (WEB-04): links do InfluxDB, RabbitMQ, pgAdmin e da documentação da API |
| `src/mock/audit.ts` | a auditoria do modo simulado: 3 dias inventados e o que a pessoa faz no navegador |
| `src/views/InsightsView.vue` | a Insights (IA-09): resumo e um bloco por equipamento |
| `src/components/EquipmentInsight.vue` | o bloco de um equipamento: semáforo, tendência da saúde e da vida útil, sinais e alertas |
| `src/components/HealthLight.vue` | o semáforo da saúde prevista |
| `src/domain/insights.ts` | as faixas da saúde e da vida útil e o que cada alerta significa e pede para fazer |
| `src/api/insights.ts` | o histórico das previsões (`GET /api/insights/history`) |

**Para fazer uma tela:** crie a view em `src/views/` e aponte o `component` dela
em `src/router/pages.ts`. Enquanto ela não existe, a rota mostra um placeholder
com a tarefa e o que já está chegando no store ao vivo.

**Para esconder um botão do visualizador:**

```vue
<RoleGate permission="command">
  <button>Ligar</button>
</RoleGate>
```

**Para ler o ao vivo:** `useLiveValues().value('od-01', 'oxygen_mg_l')`, que
já devolve `null` quando a leitura ficou velha. O cru fica em
`useLiveStore().latest['od-01']`.

**Para montar uma tela a partir do cadastro:** `useDevicesStore()` tem os
dispositivos ativos e as variáveis (`variables`), cada uma com nome, unidade,
casas decimais e faixa. Nada de lista fixa de grandezas: o dashboard inteiro
sai daí.
Para os outros tipos de mensagem (progresso de job, alerta),
`useLiveStore().subscribe(msg => ...)`.

## Visual

O tema é o "tanque em corte": areia, água e azul-marinho, com o peixe como
marca. A apresentação é num projetor fraco, então o visual segue três regras:

- painel branco com borda de 1,5 px sobre o fundo de areia, nunca só sombra;
- estado em selo de cor sólida e com o nome escrito (`badge-ok`,
  `badge-atencao`, `badge-critico`), nunca só a cor;
- texto secundário em `var(--muted)`, nada de cinza-claro.

| Onde | O quê |
| --- | --- |
| `src/style.css` | os tokens (`--night`, `--accent`, `--nivel-*`, `--water`...) e as classes do dashboard (`.panel`, `.panel-header`, `.level-badge`...) |
| `src/components/BrandMark.vue` | a marca: o peixe com o batimento |
| `src/components/TankDiagram.vue` | o tanque em corte, movido pelo nível e pelos atuadores ao vivo |
| `src/components/MetricCard.vue` | o cartão de leitura com a régua da faixa ideal |

**Contraste:** há dois modos, padrão e alto, que cada pessoa escolhe no menu
do usuário (rodapé do menu lateral). O alto vale para tela com pouco brilho,
como o projetor da apresentação. Cada token tem um valor por modo em
`src/style.css`: token novo vai nos dois blocos. Preferência nova de exibição
entra em `src/composables/usePreferences.ts` e ganha uma seção no
`UserMenu.vue`.

**Para uma tela nova:** monte com `.panel` e um `.panel-header` (título em
`h3`), e pegue as cores dos tokens, nunca em hex solto. O tanque recebe tudo
por props (`level`, `aerator`, `recirculation`, `refill`), e `null` quer
dizer "sem dados".

## Build

```bash
npm run build
npm run preview
```

## Contrato com o backend

O frontend não conversa com MQTT, RabbitMQ ou InfluxDB: só com a API. As rotas,
o login, o WebSocket e o envelope das mensagens estão no
[`docs/ARQUITETURA.md`](../docs/ARQUITETURA.md), da §12 à §17 (a tabela de rotas
é a §17.3). Os tipos ficam em `src/domain/` e `src/live/envelope.ts`, e o modo
simulado (`src/mock/`) responde exatamente naqueles formatos. Mudou uma rota?
Muda lá primeiro.

O que é só do front:

- Nas rotas de admin, o modo simulado responde 403 para os outros papéis, como
  a API vai responder: esconder o botão na tela é conforto, quem barra é a API.
- As regras de validação do cadastro ficam em `src/domain/registry.ts`, e a
  mensagem de erro que a tela mostra é o `detail` da resposta.
- As estatísticas do histórico são calculadas sobre as leituras cruas, não
  sobre os pontos agregados: é delas que saem o "tempo fora da faixa" e o
  "quantas vezes o aerador ligou" do dashboard.

## Gêmeo 3D (WEB-05 a WEB-08)

A cena é Three.js puro, sem TresJS, para o loop de animação ficar à vista. Ela
**só muda com o que chega ao vivo pelo WebSocket**: lê o store de dentro do
próprio loop e nunca é refeita a cada mensagem. Só o cadastro (item ou tanque
que entra ou sai), o cenário e a troca de contraste reconstroem objetos.

**Vários tanques:** cada zona do cadastro (`tanque-01`, `tanque-02`...) é um
tanque, montado pelo mesmo molde. Cadastrar um sensor com uma zona nova, pela
tela Dispositivos, faz um segundo tanque aparecer na cena sozinho, cinza e
"sem dados" até ele publicar.

**Três cenários**, escolhidos no topo da tela e guardados nas preferências:
piscicultura ao ar livre, galpão e aquário de exposição. O tanque, os dados e as
cores são os mesmos nos três; muda o ambiente, a luz e os peixes (tilápias na
criação, ornamentais no aquário).

**Navegação:** a visão geral mostra um selo por tanque e um pino só nos itens
fora do normal. Clicar no tanque (ou no selo) voa até ele e abre as estatísticas
do aquário; clicar num item chega perto e abre o painel dele. Esc ou "Voltar"
sobem um nível, e o foco fica na URL (`/gemeo-3d?tanque=tanque-01&item=od-01`),
que é o link "Ver no 3D" de Dispositivos.

| Onde | O quê |
| --- | --- |
| `src/plant/roles.ts` | o papel de cada item, pelo prefixo do id (`od-`, `bomba-rec-`...), depois pela chave da variável |
| `src/plant/tanks.ts` | `planTanks`: os tanques do cadastro, com a posição de cada item, os vínculos (que leitura mexe em quê) e os tubos |
| `src/plant/layout.ts` | o molde do tanque: `SCENE_LAYOUT` (posição **pelo id**), `ROLE_LAYOUT` (pelo papel), `AUTO_SLOTS` e `PIPE_TEMPLATE` |
| `src/scene/TwinScene.ts` | a cena: renderer, o loop único, os tanques, o cenário, o foco, o clique e a dica |
| `src/scene/TankRig.ts` | um tanque inteiro em coordenadas locais: itens, tubos, água, peixes, efeitos, selo e pinos |
| `src/scene/environments/` | os cenários (`farm.ts`, `warehouse.ts`, `showroom.ts`), o céu e as árvores instanciadas (`shared.ts`) |
| `src/scene/fish.ts` | os peixes: um `InstancedMesh` por tanque, com a cauda ondulando no shader |
| `src/scene/CameraRig.ts` | a câmera que voa até o tanque ou o item; instantânea com movimento reduzido |
| `src/scene/markers.ts` | o selo do tanque, os pinos e a dica do mouse, em HTML por cima do canvas |
| `src/scene/focus.ts` | visão geral, tanque e item: para onde cada clique e cada Esc levam |
| `src/scene/quality.ts` | baixa a qualidade sozinha sem placa de vídeo ou com quadros lentos (ou com `?qualidade=baixa`) |
| `src/scene/models.ts` | os modelos de poucos polígonos; cada um declara os próprios bocais |
| `src/scene/pipes.ts` | o caminho dos tubos: sai e chega no eixo de cada bocal, com as curvas arredondadas |
| `src/scene/effects.ts` | bolhas, jatos e o fluxo nos tubos, com `InstancedMesh` |
| `src/scene/tokens.ts` | as cores da cena, lidas dos tokens do CSS (os dois contrastes) |
| `src/views/TwinView.vue` | a tela imersiva: caminho, seletor de cenário, legenda e o cartão da direita |
| `src/components/TwinOverview.vue` | a visão geral: um cartão por tanque e o que está fora do normal |
| `src/components/TankPanel.vue` | as estatísticas do aquário: água, bomba (IA), atuadores, alertas e itens |
| `src/components/TwinPanel.vue` | o painel de um item: leitura, mini gráfico ao vivo, saúde prevista e comandos |
| `src/composables/useTwinTanks.ts` | o resumo de cada tanque para os painéis, pela mesma conta da cena |

**O que mexe em quê**, em cada tanque, pelo dispositivo do papel:

| Dado ao vivo | Na cena |
| --- | --- |
| nível (`nivel-NN`) | altura da água e o feixe do sensor ultrassônico; sem sensor de nível o tanque fica sem água (nada é inventado) |
| turbidez (`turbidez-NN`) | cor e transparência da água |
| luminosidade (`luz-NN`) | dia e noite do cenário (média dos tanques): céu, sol, lua, estrelas, postes, janelas e a luz do aquário |
| oxigênio (`od-NN`) | ritmo do cardume e da cauda; abaixo de 4 mg/L os peixes sobem para a superfície |
| vazão (`bomba-rec-NN`) | partículas nos tubos da recirculação e o jato de retorno |
| vibração (`bomba-rec-NN`) | tremor da bomba: quanto mais vibração, mais treme |
| estado dos atuadores | bolhas do aerador, jato da reposição, ventoinhas e lâmpadas |

**Cor de cada item:** normal, atenção, crítico ou sem dados. Vale o pior entre a
faixa do cadastro, a saúde prevista pela IA (vermelho abaixo de 40 % ou com
menos de 24 h de vida útil, amarelo abaixo de 70 %) e um alerta aberto da IA
(os alertas sem `field`). O estado também vai escrito no selo, no pino e na dica.

**Sem dados:** se nenhuma telemetria chegar por 10 s, a cena congela, fica
cinza e avisa; volta sozinha quando as leituras voltam. Um tanque sem nenhum
dispositivo publicando para sozinho, mesmo com os outros vivos. No modo
simulado, o botão "Parar o simulador", no rodapé do menu, corta as mensagens.

**Para pôr um item novo na cena:** use o prefixo da convenção no id (`ph-02`,
`od-03`...) e ele entra no lugar do papel no tanque da zona dele; o formulário
de cadastro já sugere o id assim. Um id fora da convenção entra sozinho na
borda da frente (sondas) ou numa fila no chão; para um lugar fixo, dê a posição
em `SCENE_LAYOUT`, pelo id. Tubo novo vai em `PIPE_TEMPLATE`, de `<papel>.<bocal>`
a `<papel>.<bocal>`; ele só aparece com os dois bocais na cena.

**Desempenho:** em desenvolvimento, `__twin.stats()` no console mostra as
chamadas de desenho, os triângulos e a memória da placa de vídeo.

## Dispositivos (WEB-03)

Um cartão por dispositivo, agrupados por tanque, com a leitura ao vivo, o mini
gráfico das últimas mensagens, a régua da faixa e a situação (publicando, parou,
sem dados). O resumo do topo também filtra, e cada tanque tem o link para vê-lo
no 3D. Clicar num cartão abre o detalhe pela direita, onde o admin edita e
desativa. No cadastro, o id é sugerido pela convenção dos prefixos e a zona
lista as que já existem: uma zona nova cria outro tanque.

## Insights (IA-09)

Um bloco por equipamento do cadastro (hoje só a bomba de recirculação), com:

- o **semáforo** e os números da última previsão: saúde em %, vida útil em
  horas ("168 h ou mais" no teto) e uma frase do que fazer. Previsão com mais
  de 60 s apaga o semáforo, como no 3D;
- a **tendência** da saúde e da vida útil no período (1 h, 6 h, 24 h ou 7 dias),
  com as faixas de 70 % e 24 h desenhadas;
- os **sinais nas leituras**: as quatro variáveis com mini gráfico e, para cada
  uma fora da faixa, o que costuma ser e o que conferir, pelos modos de falha
  da IA-01. É uma pista da faixa, não do modelo, e a tela diz isso;
- os **alertas** abertos do equipamento, da IA e das faixas, cada um com o que
  significa e o que fazer, e os fechados recentes.

A previsão é a mesma do store que pinta a bomba no 3D, então as duas telas
mudam juntas. O painel da bomba no 3D e o detalhe em Dispositivos têm o link
"Ver na Insights", que abre a página já no bloco do equipamento
(`/insights#bomba-rec-01`).

**Para ver na apresentação:** no 3D, abra a bomba, injete a falha e vá para a
Insights. Em uns 2,5 min o semáforo passa a amarelo, em uns 3 min a vermelho e
o alerta da IA abre; reparar fecha o alerta em menos de 1 min.

## Página Ferramentas

Os links do InfluxDB, do RabbitMQ e do pgAdmin apontam para `127.0.0.1`, nas
portas padrão (8086, 15672 e 5050), porque o compose publica essas interfaces
só ali (PLAT-08). Se a porta for outra, ajuste `VITE_INFLUXDB_URL`,
`VITE_RABBITMQ_URL` e `VITE_PGADMIN_URL` no `.env`. A documentação da API é
`/api/docs`, pelo mesmo endereço do app.

## Observação sobre Chart.js

O gráfico desenha os limites da faixa normal como linhas tracejadas e sombreia o espaço entre eles, sem dependência extra além do Chart.js.
