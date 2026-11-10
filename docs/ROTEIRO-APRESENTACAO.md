# Roteiro da apresentação — 2º bimestre

Apresentação presencial em **16/11/2026**. O enunciado dispensa slides: o que vale é o sistema funcionando. Os slides ("TankVitals — Apresentação 2º bimestre") servem só para uma abertura de 2 minutos (problema e arquitetura) e podem ser pulados.

A regra da rubrica que manda em tudo: **tecnologia no código sem demonstração não pontua.**

### A ordem é a do enunciado

O professor pede os 12 passos **nesta ordem**. Cada passo é conduzido por quem fez a parte; as seções abaixo, por pessoa, dizem o que fazer e falar em cada passo.

> A divisão segue as frentes e os commits. Confirmem quem fica com a frente IOT antes do ensaio.

| Passo do enunciado | Quem conduz | Critério |
| --- | --- | --- |
| 0. Abertura: problema e arquitetura (slides, opcional) | Luciano | 1 |
| 1. `docker compose up`, containers saudáveis | Pedro | 10 |
| 2. Login e os três papéis | João Pedro | 1 (segurança) |
| 3. Simulador e mensagens no Mosquitto | Igor | 2 |
| 4. FastAPI e a documentação da API | João Pedro | 5 |
| 5. Mensageria: filas, consumidores e consumidor parado | Pedro | 4 |
| 6. InfluxDB e PostgreSQL, histórico | João Pedro | 5 |
| 7. Dashboard ao vivo, gráficos e indicadores | Luciano | 6 |
| 8. Aerador pela regra e reposição pelo botão | Igor | 3 |
| 9. Laboratório gerando os dados | Eduardo | 8 |
| 10. Treino e métricas | Eduardo | 8 |
| 11. Falha injetada: Insights e cena 3D | Eduardo e Luciano | 9 e 7 |
| 12. Assistente respondendo sobre a falha | João Pedro | 9 |

**Atenção ao tempo:** a geração (9) e o treino (10) demoram. Disparem a geração logo depois do passo 1, deixem rodando e voltem a ela no passo 9. No passo 11, a falha leva alguns minutos para derrubar a saúde: injetem no começo do passo 10.

---

## Antes de começar (30 min antes)

- [ ] `docker compose up -d` na raiz e `docker compose ps` com tudo `healthy`. **Nunca** `down -v`.
- [ ] Modelo do Ollama já baixado (o `ollama-init` terminou).
- [ ] Senhas `DEMO_*` do `.env` anotadas para os três usuários.
- [ ] Abas abertas, nesta ordem: aplicação (8080), `/api/docs`, RabbitMQ (15672), InfluxDB (8086), pgAdmin (5050).
- [ ] Um terminal na raiz do projeto, com fonte grande.
- [ ] Se o treino for demorado, Eduardo dispara o Laboratório logo no começo.
- [ ] Alto contraste ligado no menu do usuário, se o projetor estiver lavado.

---

## 1. Luciano — abertura, problema e arquitetura

**Slides:** capa, problema, arquitetura e os três fluxos.

- Apresentar o grupo e dizer que cada um mostra a frente que construiu, com o sistema rodando.
- **Problema:** o 1º bimestre media temperatura, pH, nível e turbidez. Agora entram oxigênio, luz, a bomba de recirculação vigiada pela IA, o aerador automático e a reposição pelo botão.
- **Arquitetura:** andar pelo desenho da esquerda para a direita. O simulador faz o papel do dispositivo, o Mosquitto é a borda MQTT, o gateway passa para o RabbitMQ e cada serviço lê só a sua fila.
- **Fluxos:** IoT → Web, Web → IoT e IA. O resto da apresentação mostra os três funcionando.

## 2. Pedro — Plataforma e mensageria (PLAT)

1. Terminal: `docker compose ps`, tudo `healthy`. Falar que é um comando só (`compose.yaml` na raiz) e que os 16 serviços têm healthcheck.
2. Segredos: `python scripts/gerar_segredos.py` gera tudo na máquina; `.env` e `secrets/` estão no `.gitignore`. Cada serviço tem usuário próprio no Mosquitto, no RabbitMQ e no InfluxDB.
3. Tela **Mensageria**: filas, taxas e consumidores.
4. `docker compose stop writer`: a `q.writer` cresce na tela. `docker compose start writer`: esvazia. Nada se perdeu.
5. DLQ em zero. Explicar o caminho de uma mensagem com erro: `tv.writer.retry` com espera, depois `q.dlq`.

**Perguntas prováveis:** por que RabbitMQ além do MQTT (borda leve × barramento interno com fila por consumidor); o que é a DLQ; como o writer evita duplicar (id do envelope guardado).

## 3. Igor — Dispositivo e controle (IOT)

1. Terminal:
   ```
   docker compose exec mosquitto sh -c 'mosquitto_sub -u gateway -P "$MQTT_GATEWAY_PASSWORD" -t "tankvitals/+/+/+/telemetry" -v'
   ```
   Ler um envelope: `id`, `ts`, `type`, `device`, `payload`.
2. `SIM_SPEED=60`: 1 s real = 1 min simulado; um dia simulado dura 24 min.
3. Dashboard: o aerador liga quando o oxigênio fica abaixo de 5 mg/L e desliga em 6,5 (histerese, para não ficar ligando e desligando). Quem decide é o serviço `rules`.
4. Entrar como `operator`, ligar a **Reposição de água**, confirmar e mostrar o nível subindo. O comando faz o caminho inverso: API → RabbitMQ → gateway → Mosquitto → simulador.

**Perguntas prováveis:** o que acontece se o gateway cair (as filas seguram); por que histerese; como o simulador simula a falha (física do `core/physics.py`, a mesma do treino).

## 4. João Pedro — Backend e assistente (BACK)

1. Entrar como `viewer`: sem botões e sem Auditoria. Tentar comandar dá 403 (mostrar em `/api/docs` ou no terminal).
2. `/api/docs`: rotas organizadas, login JWT pelo botão Authorize.
3. pgAdmin (já com o banco cadastrado): tabelas `devices`, `device_fields`, `rules`, `alerts` e `audit`.
4. InfluxDB: Data Explorer, measurement `telemetry`.
5. **Assistente:** perguntar sobre o estado da bomba; a resposta chega aos poucos (streaming), com os dados atuais. Fazer a 6ª pergunta no mesmo minuto e mostrar o limite (429).

**Perguntas prováveis:** por que dois bancos (cadastro relacional × série temporal); como funciona o ticket do WebSocket (uso único, curto); por que LLM local (sem nuvem, sem chave).

## 5. Luciano — Interface e 3D (WEB)

1. Dashboard: leituras mudando sozinhas pelo WebSocket. Trocar o período do gráfico e ler os indicadores: mínimo, máximo, média, tempo fora da faixa e quantas vezes o aerador ligou.
2. Como `admin`, em **Dispositivos**, apertar a faixa do oxigênio e voltar ao dashboard: a cor muda sem mexer no código. As telas são montadas pelo cadastro.
3. **Gêmeo 3D:** girar a cena e mostrar a legenda de cores. A falha fica para o Eduardo.
4. Mostrar o alto contraste no menu do usuário.

## 6. Eduardo — Inteligência artificial (IA)

1. **Laboratório:** mostrar os parâmetros que o enunciado exige (equipamentos, dias, % que falha e modos, ruído, faltantes e outliers, semente), pedir a geração (1.008.000 leituras) e mostrar o andamento. A API não trava: o trabalho vai pela fila para o `worker`.
2. **Treinamento:** MAE, RMSE e R², previsto × real, importância dos atributos e comparação com a base (prever a média); o modelo só entra se vencer a base, e entra sem reiniciar, mostrando a versão em uso. Divisão por equipamento, nunca por linha.
3. **Gêmeo 3D:** injetar falha de rolamento. Em poucos minutos a saúde e a vida útil caem na **Insights**, o alerta abre e a bomba fica vermelha e treme.
4. **Reparar** e mostrar a recuperação. Parar o simulador (`docker compose stop simulator`) faz o 3D avisar "sem dados"; depois `start`.

**Perguntas prováveis:** por que dados sintéticos; o que é vida útil restante; como evitam que o modelo "cole" (o rótulo nunca sai do simulador); histerese do alerta (3 leituras ruins abrem, 10 boas fecham).

## 7. Encerramento

Slide final e perguntas. Qualquer integrante pode ser perguntado sobre qualquer parte: leiam as perguntas prováveis dos outros.

---

## Plano B

| Se… | Faça |
| --- | --- |
| um serviço não sobe | `docker compose logs <serviço>`; `docker compose restart <serviço>` |
| o assistente não responde | o modelo ainda está carregando; seguir e voltar no fim |
| o treino demora | mostrar o último modelo aceito na tela Treinamento |
| o projetor apaga as cores | alto contraste no menu do usuário |
