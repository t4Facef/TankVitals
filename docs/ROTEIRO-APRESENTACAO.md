# Roteiro da demonstração — 2º bimestre

Os 12 passos do enunciado, **na ordem pedida**. Serve para testar antes e para apresentar no dia 16/11: Luciano conduz na tela, e quem construiu cada parte comenta o passo dela.

Cada passo diz o que fazer, o que deve aparecer e o que fazer se não aparecer. Ao testar, marque o resultado na tabela do fim.

| Passo | Quem comenta |
| --- | --- |
| 1. Compose · 5. RabbitMQ | Pedro |
| 2. Papéis · 4. API · 6. Bancos · 12. Assistente | João Pedro |
| 3. MQTT · 8. Regra e botão | Igor |
| 7. Dashboard e 3D | Luciano |
| 9. Laboratório · 10. Treino · 11. Falha | Eduardo |

---

## Preparação (antes de testar e antes da aula)

Todos os comandos são no PowerShell, na raiz do projeto.

1. **Reconstruir as imagens.** A correção das consultas ao InfluxDB ainda não está nas imagens deste PC:
   ```powershell
   docker compose up -d --build
   ```
   **Nunca** use `docker compose down -v`: apaga os dados e o modelo baixado do LLM.
2. **Ver as senhas** dos usuários e das ferramentas:
   ```powershell
   Select-String '^(DEMO_|PGADMIN_DEFAULT|INFLUXDB_USERNAME|INFLUXDB_PASSWORD|POSTGRES_PASSWORD)' .env
   ```
3. **Treinar uma vez antes.** A tela Insights só mostra saúde e vida útil depois que existe um modelo aceito. Entre como `admin`, gere os dados no **Laboratório** e treine no **Treinamento** (passos 9 e 10). Na apresentação, o treino do passo 10 cria uma versão nova, que entra sem reiniciar nada.
4. **Fazer uma pergunta ao Assistente** para o modelo do LLM já ficar carregado na memória.
5. Deixar abertas, nesta ordem: a aplicação (<http://localhost:8080>), `/api/docs`, pgAdmin (<http://127.0.0.1:5050>), InfluxDB (<http://127.0.0.1:8086>) e um terminal com fonte grande.

---

## 1. `docker compose up` com os containers saudáveis

**Fazer:**
```powershell
docker compose up -d
docker compose ps
```

**Deve aparecer:** 14 serviços `Up (healthy)`: api, frontend, gateway, inference, influxdb, mosquitto, ollama, pgadmin, postgres, rabbitmq, rules, simulator, worker e writer. Os 3 de preparação (`token-bootstrap`, `migrate` e `ollama-init`) ficam `Exited (0)`: rodam uma vez na subida e terminam, e o 0 quer dizer que deu certo. Só é problema se algum terminar com outro número.

**Se não aparecer:** `docker compose logs <serviço>` e `docker compose restart <serviço>`.

## 2. Login e os três papéis

**Fazer:** em <http://localhost:8080>, entrar como `viewer`, depois sair e entrar como `operator`, depois como `admin`.

**Deve aparecer:**
- `viewer`: vê o dashboard, mas sem botão nos atuadores e sem **Auditoria** no menu.
- `operator`: os botões dos atuadores aparecem, e o painel da bomba no Gêmeo 3D tem **Injetar falha** e **Reparar**.
- `admin`: aparecem a **Auditoria**, a edição em **Dispositivos**, **Gerar dados** no Laboratório e **Treinar modelos** no Treinamento.

**Se não aparecer:** uma senha errada cinco vezes seguidas bloqueia a conta por 5 minutos.

## 3. Simulador enviando pelo Mosquitto (MQTT)

**Fazer:**
```powershell
docker compose exec mosquitto sh -c 'mosquitto_sub -u gateway -P "$MQTT_GATEWAY_PASSWORD" -t "tankvitals/+/+/+/telemetry" -v'
```
Sair com `Ctrl+C`.

**Deve aparecer:** várias linhas por segundo, uma por dispositivo, como `tankvitals/tanque-01/sensor/od-01/telemetry {"id": "...", "ts": "...", "type": "telemetry", "device": "od-01", "payload": {"oxygen_mg_l": 6.8}}`. Mostrar o envelope: id, instante, tipo, dispositivo e conteúdo.

## 4. Backend FastAPI e a documentação da API

**Fazer:** abrir <http://localhost:8080/api/docs>.
1. Em `POST /api/auth/login`, **Try it out**, corpo `{"username": "admin", "password": "<senha>"}`, **Execute** e copiar o `access_token`.
2. **Authorize** (cadeado no topo), colar o token e confirmar.
3. Em `GET /api/devices`, **Try it out** e **Execute**.

**Deve aparecer:** a lista das rotas agrupadas; `GET /api/devices` responde 200 com os 9 dispositivos e as faixas. Sem o token, a mesma rota responde 401.

## 5. Mensageria: filas, consumidores e consumidor parado

**Fazer:** abrir a tela **Mensageria** na aplicação. No terminal:
```powershell
docker compose stop writer
```
Esperar uns 15 segundos olhando a fila `q.writer`, e então:
```powershell
docker compose start writer
```

**Deve aparecer:** as filas com seus consumidores, as taxas e as últimas mensagens. Com o writer parado, a `q.writer` fica sem consumidor e cresce (no teste, chegou a 91 em 15 s); ao voltar, esvazia até 0. A **DLQ** fica em 0.

## 6. InfluxDB e PostgreSQL, com consulta ao histórico

**Fazer:**
- **pgAdmin** (<http://127.0.0.1:5050>, login `PGADMIN_DEFAULT_EMAIL` e `PGADMIN_DEFAULT_PASSWORD`): Servers › TankVitals (senha `POSTGRES_PASSWORD`) › Databases › tankvitals › Schemas › public › Tables. Em `devices`, `device_fields`, `rules` e `audit`: botão direito › View/Edit Data › All Rows.
- **InfluxDB** (<http://127.0.0.1:8086>, login `INFLUXDB_USERNAME` e `INFLUXDB_PASSWORD`): Data Explorer, bucket `tankvitals`, measurement `telemetry`, um campo como `oxygen_mg_l`, **Submit**.
- **Histórico:** no dashboard, trocar o período do gráfico (1 h, 6 h, 24 h, 7 d).

**Deve aparecer:** no PostgreSQL, os 9 dispositivos com nomes legíveis, as faixas, a regra do aerador e, em `audit`, os logins do passo 2. No InfluxDB, a curva da variável. No dashboard, o gráfico e os indicadores do período.

**Se não aparecer:** se o histórico mostrar "InfluxDB indisponível", a API está com a imagem antiga: refaça o passo 1 da Preparação.

## 7. Dashboard em tempo real por WebSocket

**Fazer:** abrir o **Dashboard** e ficar uns segundos nele. Depois abrir o **Gêmeo 3D**, girar a cena e clicar na bomba.

**Deve aparecer:** as leituras mudam sozinhas a cada segundo, sem recarregar a página. Os indicadores mostram mínimo, máximo, média, tempo fora da faixa e, nos atuadores, quantas vezes ligaram. No 3D, cada item tem a cor do seu estado, e o painel da bomba mostra a última leitura, um mini gráfico e a saúde prevista.

## 8. Atuador pela regra e atuador pelo botão (Web → IoT)

**Fazer — aerador pela regra** (como `admin`): em **Dispositivos**, no cartão da regra do aerador, mudar **Liga abaixo de** para um valor acima do oxigênio atual (por exemplo 9) e **Desliga a partir de** para 10. **Salvar limites** e voltar ao dashboard. Depois devolver os limites para 5 e 6,5.

**Deve aparecer:** o aerador liga sozinho em poucos segundos, sem ninguém apertar nada, e desliga quando os limites voltam ao normal. Sem mexer na regra, isso também acontece sozinho à noite no simulador, quando o oxigênio cai abaixo de 5 (um dia simulado dura 24 minutos).

**Fazer — reposição pelo botão** (como `operator` ou `admin`): no dashboard, ligar a **Reposição de água**. Desligar depois.

**Deve aparecer:** "Aguardando confirmação do dispositivo…" e, logo depois, a reposição ligada; o nível da água sobe nas leituras seguintes. O comando aparece na **Auditoria**.

**Em seguida, injetar a falha** (passo 11 precisa de tempo): no **Gêmeo 3D**, clicar na bomba, escolher o modo **Rolamento gasto** e clicar em **Injetar falha**. A bomba leva de 2 a 4 minutos para degradar.

## 9. Laboratório gerando dados sintéticos em massa

**Fazer** (como `admin`): em **Laboratório**, mostrar os parâmetros (bombas, dias, sensores por bomba, fração com falha, modos de falha, ruído, faltantes, valores absurdos e semente). Manter o padrão (100 bombas × 7 dias) e clicar em **Gerar dados**.

**Deve aparecer:** o job com o progresso subindo até **concluído**, e o dataset novo na lista com 1.008.000 leituras. A API continua respondendo durante a geração, porque quem trabalha é o worker.

## 10. Treinamento dos modelos e leitura das métricas

**Fazer:** em **Treinamento**, escolher o dataset do passo 9 e clicar em **Treinar modelos**.

**Deve aparecer:** ao concluir, os dois modelos (saúde e vida útil restante) com MAE, RMSE e R², o gráfico de previsto × real, a importância dos atributos e a comparação com a base que prevê sempre a média. A versão nova aparece como **em uso**, sem reiniciar nenhum serviço.

**Se não aparecer:** se o treino demorar, mostrar a versão treinada na preparação e seguir.

## 11. Falha: saúde, vida útil e alerta na Insights e no 3D

**Fazer:** abrir a **Insights** e depois o **Gêmeo 3D**. Em seguida, **Reparar** a bomba no painel do 3D. Por fim, no terminal:
```powershell
docker compose stop simulator
docker compose start simulator
```

**Deve aparecer:**
- Na **Insights**, a saúde caindo, a vida útil restante encurtando e um alerta aberto.
- No **3D**, a bomba em vermelho e tremendo.
- Depois de **Reparar**, a saúde volta a subir. O alerta só fecha depois de 10 previsões boas seguidas, para não ficar piscando.
- Com o simulador parado, o 3D avisa "Sem dados"; ao voltar, a cena retoma.

## 12. Assistente com LLM local respondendo sobre a falha

**Fazer:** em **Assistente**, perguntar "Por que a bomba está em alerta e o que devo fazer?". Fazer a pergunta enquanto o alerta ainda está aberto, ou repetir o passo 11 antes.

**Deve aparecer:** a resposta chegando aos poucos, citando a saúde, a vida útil e o alerta da bomba. Se o modelo ainda estiver carregando, a tela avisa. Cada usuário pode fazer 5 perguntas por minuto; a sexta recebe um aviso de limite.

---

## Resultado do teste

| Passo | OK | Observação |
| --- | --- | --- |
| 1. Compose | ☐ | |
| 2. Papéis | ☐ | |
| 3. MQTT | ☐ | |
| 4. API | ☐ | |
| 5. Mensageria | ☐ | |
| 6. Bancos e histórico | ☐ | |
| 7. Dashboard e 3D | ☐ | |
| 8. Regra e botão | ☐ | |
| 9. Laboratório | ☐ | |
| 10. Treinamento | ☐ | |
| 11. Falha | ☐ | |
| 12. Assistente | ☐ | |

Os passos 1 a 5 já foram testados com o sistema real em 10/11; do 6 em diante, este é o primeiro teste completo.
