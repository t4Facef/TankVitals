# Guia de uso e de implementação — TankVitals

Do zero até cada funcionalidade, e como cada parte foi construída. Contratos detalhados: [ARQUITETURA.md](ARQUITETURA.md) §11–17. Tarefas por frente: [TAREFAS-2BIM.md](TAREFAS-2BIM.md).

---

## Parte 1 — Usar o sistema

### 1.1 Ligar

**Requisitos:** Docker Desktop com pelo menos 8 GB para o WSL (`%UserProfile%\.wslconfig` com `memory=8GB`) e Python 3.11+.

```powershell
git clone <repo> ; cd TankVitals
python scripts/gerar_segredos.py      # só na primeira vez; anote as senhas DEMO_*
docker compose up -d --build
docker compose ps                     # espere todos "healthy"
```

- A primeira subida baixa as imagens e o modelo do assistente (cerca de 2 GB, 15 a 20 min). As seguintes levam uns 2 min.
- `gerar_segredos.py --force` troca todas as senhas; os volumes antigos não aceitam as novas. Só use para começar do zero.
- Desligar: `docker compose down`. **Nunca `down -v`**: apaga os dados e o modelo baixado.

### 1.2 Entrar

Abra <http://localhost:8080>.

| Usuário | Pode |
| --- | --- |
| `viewer` | ver tudo |
| `operator` | + ligar e desligar atuadores, injetar e reparar falhas |
| `admin` | + cadastro, gerar dados, treinar e auditoria |

Senhas: `DEMO_VIEWER_PASSWORD`, `DEMO_OPERATOR_PASSWORD` e `DEMO_ADMIN_PASSWORD` no `.env`. Cinco erros seguidos bloqueiam a conta por 5 min. O login vale 2 h (`JWT_TTL_MINUTES`).

### 1.3 As telas

| Tela | Como usar |
| --- | --- |
| **Dashboard** | Leituras ao vivo por dispositivo, em cores pela faixa. Escolha o período (1 h, 6 h, 24 h, 7 d) para o gráfico e os indicadores: mínimo, máximo, média, tempo fora da faixa e, nos atuadores, tempo ligado e quantas vezes ligou. O `operator` liga a reposição de água pelo botão; a tela espera o dispositivo confirmar a mudança. |
| **Gêmeo 3D** | Tanque e bomba em 3D, nas cores da faixa. O `operator` escolhe um modo de falha (rolamento, entupimento, superaquecimento, desbalanceamento) e injeta; **Reparar** devolve a bomba a nova. Sem dados por alguns segundos, a cena avisa. |
| **Dispositivos** | Lista do cadastro. O `admin` cria dispositivos, variáveis e faixas (normal e crítica) e edita a regra do aerador. As outras telas se ajustam sozinhas. |
| **Laboratório** | O `admin` configura a geração (equipamentos, dias simulados, % que falha e modos de falha, ruído, leituras faltantes, outliers e semente), dispara a base sintética (1.008.000 leituras no padrão) e acompanha o progresso. |
| **Treinamento** | O `admin` treina os modelos de saúde e de vida útil, vê as métricas e a comparação com a base. O modelo só é aceito se for melhor. |
| **Insights** | Saúde (0–100) e vida útil restante da bomba, tendência no tempo e alertas da IA. |
| **Assistente** | Perguntas em português sobre o tanque, respondidas pelo LLM local com os dados atuais. Limite de 5 perguntas por minuto. |
| **Mensageria** | Filas do RabbitMQ: mensagens, taxas, consumidores, as últimas 50 mensagens e a DLQ. |
| **Auditoria** | (`admin`) Logins, comandos e mudanças no cadastro, com quem e quando. |
| **Ferramentas** | Atalhos para `/api/docs`, RabbitMQ, InfluxDB e pgAdmin. |

O menu do usuário tem o **alto contraste** e a saída.

### 1.4 Ferramentas de fora

| Ferramenta | Endereço | Login |
| --- | --- | --- |
| Documentação da API | <http://localhost:8080/api/docs> | Authorize com o token do login |
| RabbitMQ | <http://127.0.0.1:15672> | `RABBITMQ_ADMIN_*` do `.env` |
| InfluxDB | <http://127.0.0.1:8086> | `INFLUXDB_ADMIN_*` do `.env` |
| pgAdmin | <http://127.0.0.1:5050> | `PGADMIN_*`; o banco já está cadastrado, senha `POSTGRES_PASSWORD` |

### 1.5 Comandos úteis

```powershell
docker compose logs -f api                       # log de um serviço
docker compose restart <serviço>                 # reiniciar um serviço
docker compose stop writer ; docker compose start writer   # fila acumula e esvazia
docker compose exec mosquitto sh -c 'mosquitto_sub -u gateway -P "$MQTT_GATEWAY_PASSWORD" -t "tankvitals/+/+/+/telemetry" -v'
```

### 1.6 Problemas comuns

| Sintoma | Causa e saída |
| --- | --- |
| Mosquitto reiniciando com `set: illegal option` | scripts com CRLF; o `.gitattributes` já força LF. Num clone antigo: `git rm --cached -r . ; git reset --hard` |
| `token-bootstrap` sai com erro | InfluxDB fora do ar ou volume criado com outra senha |
| Assistente "carregando o modelo" | o `ollama-init` ainda está baixando; veja `docker compose logs ollama-init` |
| Docker Desktop fecha sozinho | pouca memória para o WSL; ajuste o `.wslconfig` |

---

## Parte 2 — Como foi implementado

### 2.1 Visão geral

```
Simulador ⇄ Mosquitto ⇄ Gateway ⇄ RabbitMQ ⇄ writer → InfluxDB
                                     ⇅        rules · inference · worker
                                    API → PostgreSQL, Ollama, InfluxDB
                                     ⇅ REST + WebSocket
                                 Navegador (Vue, nginx :8080)
```

Toda mensagem ao vivo usa o mesmo **envelope** no MQTT, no RabbitMQ e no WebSocket: `{id, ts, type, device, payload}`. O `id` é UUID e é ele que deixa a gravação idempotente.

### 2.2 PLAT — Plataforma e mensageria

- **Compose:** `compose.yaml` na raiz inclui `infra/docker-compose.yml`. 14 serviços contínuos mais 3 de inicialização (`token-bootstrap`, `migrate`, `ollama-init`), todos com healthcheck ou condição de término.
- **Segredos (PLAT-02):** `scripts/gerar_segredos.py` gera senhas aleatórias, o `.env` e o `secrets/definitions.json` do RabbitMQ (senhas já em hash). Nada disso vai para o Git.
- **Mosquitto (PLAT-04):** usuário e senha por cliente e ACL: o simulador publica telemetria e lê comandos; o gateway faz o inverso.
- **RabbitMQ (PLAT-05):** topologia declarada uma vez no `definitions.json`; nenhum serviço declara fila. Exchanges `tv.telemetry`, `tv.commands`, `tv.insights`, `tv.events`, `tv.jobs` e `tv.dlx`; uma fila por consumidor; `tv.writer.retry` com espera antes da `q.dlq`.
- **InfluxDB:** o `token-bootstrap` cria tokens com escopo: o writer só escreve no `tankvitals`; API e worker leem e escrevem no `tankvitals` e no `lab`.
- **writer (PLAT-06):** consome a `q.writer`, valida o envelope, guarda os ids já gravados (SQLite) e grava no InfluxDB. Erro de formato vai para a DLQ; InfluxDB fora do ar volta para a fila.
- **Mensageria (PLAT-07):** a API consulta a API de gerenciamento do RabbitMQ e espia a DLQ sem consumir.

### 2.3 IOT — Dispositivo e controle

- **Simulador (`app/simulator`):** 9 dispositivos na zona `tanque-01`: 6 sensores de água, a bomba de recirculação (equipamento) e 2 atuadores. Ciclo de dia e noite (luz, temperatura, oxigênio) e `SIM_SPEED=60` (1 leitura por segundo = 1 min simulado).
- **Bomba (IOT-06):** `simulator/pump.py` adapta a física de `core/physics.py`, a mesma usada para gerar os dados de treino. O desgaste e o modo de falha nunca saem na telemetria.
- **Gateway:** tópico `tankvitals/<zona>/<tipo>/<device>/telemetry` → routing key `telemetry.<zona>.<tipo>.<device>`; comandos da `q.commands` → `.../cmd`.
- **rules:** regra do aerador com histerese (liga < 5 mg/L, desliga ≥ 6,5), lida do PostgreSQL, e alertas de faixa.

### 2.4 BACK — Backend e assistente

- **API FastAPI (`app/main.py`):** tudo sob `/api`, login obrigatório fora de `/api/health`, `/api/auth/login` e a documentação.
- **Login:** bcrypt, JWT HS256 com papel, bloqueio por tentativas; o papel é conferido em cada rota.
- **PostgreSQL:** tabelas `users`, `devices`, `device_fields` (faixas), `rules`, `alerts`, `audit` e as da IA, migradas pelo Alembic (`migrate`) e com seed idempotente.
- **Histórico (`telemetry_history.py`):** consulta Flux com variáveis numéricas e estados separados (booleano não tem média), indicadores calculados nas leituras cruas e faixas vindas do cadastro. Os parâmetros entram no texto por `app/flux.py`, com escape, porque o `params=` do cliente só funciona no InfluxDB Cloud.
- **WebSocket:** o navegador pede um ticket de uso único e abre `/ws`; a API consome a `q.ws` e repassa.
- **Assistente:** monta o contexto (últimas leituras, saúde da bomba, alertas abertos), chama o Ollama em streaming e limita 5 perguntas por minuto por usuário.

### 2.5 WEB — Interface e 3D

- **Vue 3 + TypeScript + Vite**, servido pelo nginx, que também encaminha `/api` e `/ws`.
- **Telas guiadas pelo cadastro:** rótulos, unidades, casas decimais e faixas vêm de `GET /api/devices`; uma variável nova aparece sem mudar o front.
- **Tempo real:** um store recebe os envelopes do WebSocket e atualiza dashboard, 3D e Insights.
- **3D:** cena do tanque e da bomba com cores pela faixa e animação de falha.
- **Acessibilidade:** alto contraste no menu do usuário; botões aparecem só para quem pode usar.
- **Modo simulado:** `VITE_MOCK=true` roda as telas sem backend, para desenvolvimento.

### 2.6 IA — Inteligência artificial

- **Física (`core/physics.py`):** população de bombas com valores de base sorteados, ruído e desgaste que acelera perto da falha, em 4 modos.
- **Dados sintéticos (Laboratório):** o `worker` gera 1.008.000 leituras com rótulos de saúde e vida útil e guarda uma amostra no bucket `lab`.
- **Treino:** modelos de saúde e de vida útil restante (scikit-learn), métricas em dados separados e comparação com a base; o modelo só é aceito se for melhor. Ao aceitar, o worker publica `model.updated`.
- **inference:** consome a telemetria da bomba, aplica o modelo aceito e publica saúde, vida útil e tendência em `tv.insights`. O id da previsão é um `uuid5` da leitura, para a reentrega não duplicar. Alertas com histerese: 3 leituras ruins abrem, 10 boas fecham; vão para a tabela `alerts`.

### 2.7 Testes

```powershell
python -m pytest backend/tests scripts/tests -q     # na raiz
cd frontend ; npm run build
```

Os testes simulam InfluxDB e RabbitMQ. Por isso o ensaio com `docker compose up` é obrigatório: foi nele que apareceram os defeitos que só existem com os serviços reais (consultas Flux com `params`, CRLF nos scripts, bucket `lab` na primeira subida).
