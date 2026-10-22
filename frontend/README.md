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
| `src/mock/` | o login e a telemetria do modo simulado |
| `src/components/RoleGate.vue` | esconde um trecho de quem não tem a permissão |
| `src/domain/devices.ts` | os tipos do cadastro, do histórico, dos alertas e dos comandos (o contrato) |
| `src/stores/devices.ts` | o cadastro de dispositivos, carregado uma vez para todas as telas |
| `src/api/devices.ts` | as rotas de cadastro, histórico, alertas e comando |
| `src/composables/useLiveValues.ts` | o "agora" de cada dispositivo, com "sem dados" depois de 10 s |
| `src/components/ActuatorControl.vue` | o controle de atuador: estado, botão e "aguardando confirmação" |
| `src/plant/layout.ts` | onde cada dispositivo do cadastro entra no desenho (e no 3D) |
| `src/domain/registry.ts` | as regras do cadastro (id, faixas, limites da regra), usadas pelo formulário e pelo modo simulado |
| `src/composables/useDeviceState.ts` | a situação de cada dispositivo: online, parou ou sem dados, e o pior nível das faixas |
| `src/views/DevicesView.vue` | a tela Dispositivos (WEB-03): lista ao vivo, formulário do admin e aba de regras |
| `src/views/AuditView.vue` | a Auditoria (WEB-04), só admin: filtro por tipo e usuário, paginada |
| `src/views/ToolsView.vue` | as Ferramentas (WEB-04): links do InfluxDB, RabbitMQ, pgAdmin e da documentação da API |
| `src/mock/audit.ts` | a auditoria do modo simulado: 3 dias inventados e o que a pessoa faz no navegador |

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

O frontend não conversa com MQTT, RabbitMQ ou InfluxDB: só com a API. Os
formatos estão em `src/domain/devices.ts` e o modo simulado
(`src/mock/registry.ts` e `src/mock/plant.ts`) responde exatamente assim.

| Rota | O que o front espera | Tarefa |
| --- | --- | --- |
| `POST /api/auth/login` | formulário `username` e `password`; devolve `{access_token, token_type}` | BACK-03 |
| `POST /api/ws/ticket` | `{ticket}`, de uso único | BACK-04 |
| `WS /ws/live?ticket=...` | um envelope `{id, ts, type, device, payload}` por mensagem: `telemetry`, `insight`, `alert`... | BACK-04 |
| `GET /api/devices` | `[{id, name, kind, zone, active, fields, state_field, commands, control}]`; cada campo com `key, label, short, unit, decimals, range`. Vêm também os desativados (`active: false`) | BACK-05 |
| `POST /api/devices` | (admin) corpo `{id, name, kind, zone, active, fields}`; a API completa `state_field`, `commands` e `control` pelo tipo e devolve o dispositivo. 409 para id repetido, 422 para faixa inválida | BACK-06 |
| `PUT /api/devices/{id}` | (admin) corpo `{name, zone, active, fields}`; o id e o tipo não mudam. Devolve o dispositivo | BACK-06 |
| `GET /api/rules` | `[{id, name, device, field, actuator, on_below, off_at, updated_at, updated_by}]` | BACK-06 |
| `PUT /api/rules/{id}` | (admin) corpo `{on_below, off_at}`, com `off_at > on_below`; devolve a regra | BACK-06 |
| `GET /api/history?range=6h` | `{range, from, to, step_s, series}`; cada série com `device, field, points` (uns 360 pontos) e `stats` (`count, min, max, avg, last, out_of_range_s`; nos campos de estado, `on_s` e `turn_ons`). `&device=od-01` filtra | BACK-05 |
| `GET /api/alerts?status=all` | `[{id, device, field, level, message, value, opened_at, closed_at}]`, os mais novos primeiro | BACK-05 |
| `GET /api/audit?page=1&page_size=25` | (admin) `{items, total, page, page_size}`, os mais novos primeiro; cada item `{id, ts, user, type, action, target, detail, ok}`. `&type=login` e `&user=admin` filtram. Tipos: `login`, `command`, `registry`, `job`, `assistant`; as ações conhecidas estão em `src/domain/audit.ts` | BACK-06 |
| `POST /api/devices/{id}/command` | corpo `{command: "on", value: true}` (ou `inject_fault` e `repair`); devolve `{id, status: "sent"}`. O estado novo chega pela telemetria | IOT-04 |

Nas rotas de admin, o modo simulado responde 403 para os outros papéis, como a
API vai responder: esconder o botão na tela é conforto, quem barra é a API. As
regras de validação do cadastro ficam em `src/domain/registry.ts`, e a mensagem
de erro que a tela mostra é o `detail` da resposta.

As estatísticas do histórico são calculadas sobre as leituras cruas, não sobre
os pontos agregados: é delas que saem o "tempo fora da faixa" e o "quantas
vezes o aerador ligou" do dashboard.

## Página Ferramentas

Os links do InfluxDB, do RabbitMQ e do pgAdmin apontam para `127.0.0.1`, nas
portas padrão (8086, 15672 e 5050), porque o compose publica essas interfaces
só ali (PLAT-08). Se a porta for outra, ajuste `VITE_INFLUXDB_URL`,
`VITE_RABBITMQ_URL` e `VITE_PGADMIN_URL` no `.env`. A documentação da API é
`/api/docs`, pelo mesmo endereço do app.

## Observação sobre Chart.js

O gráfico desenha os limites da faixa normal como linhas tracejadas e sombreia o espaço entre eles, sem dependência extra além do Chart.js.
