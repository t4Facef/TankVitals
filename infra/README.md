# TankVitals — Infraestrutura

Mosquitto (broker MQTT) e InfluxDB (série temporal) via Docker Compose.

Tarefas: INFRA-01..INFRA-05 em [../docs/TAREFAS.md](../docs/TAREFAS.md).
Contratos: [../docs/ARQUITETURA.md](../docs/ARQUITETURA.md) §4, §7, §8.

---

## Subir e derrubar

```bash
cd infra

docker compose up -d          # sobe os dois serviços
docker compose ps             # confere se estão running/healthy
docker compose logs -f        # acompanha os logs (Ctrl+C sai do log, não para nada)
docker compose logs -f mosquitto

docker compose down           # para os containers, mantém os dados
docker compose down -v        # para e APAGA os dados (recomeça do zero)
```

| Serviço | Endereço | Para quê |
| --- | --- | --- |
| Mosquitto | `localhost:1883` | MQTT |
| Mosquitto (WebSocket) | `localhost:9001` | reserva do 2º bimestre |
| InfluxDB | <http://localhost:8086> | interface e API do banco |

---

## Credenciais

Criadas pelo bloco de setup automático do `docker-compose.yml` (INFRA-01):
organização `unifacef`, bucket `tankvitals`, retenção de 30 dias.

O token usado pelo backend é gerado na interface do InfluxDB
(**Load Data → API Tokens**), com permissão de leitura e escrita **apenas no
bucket `tankvitals`**, e vai para o `.env` da raiz (INFRA-02).

> Não use o token de admin no backend. Se ele vazar no GitHub, vaza o banco
> inteiro. E se qualquer token vazar em commit, gere um novo — apagar o arquivo
> depois não tira o segredo do histórico do Git.

---

## Como validar (INFRA-05)

Testar o broker sem depender do ESP32, com dois terminais:

```bash
# terminal A — escuta o broker LOCAL
mosquitto_sub -h localhost -t '<SEU_PREFIXO>/#' -v

# terminal B — publica imitando o dispositivo
mosquitto_pub -h localhost -t '<SEU_PREFIXO>/tanque-01/telemetry' \
  -m '{"device_id":"teste","tank_id":"tanque-01","temperature_c":25.5}'
```

Para validar a **bridge** (INFRA-03), publique no broker **público** e confirme
que a mensagem aparece no terminal A:

```bash
mosquitto_pub -h test.mosquitto.org -t '<SEU_PREFIXO>/tanque-01/telemetry' \
  -m '{"device_id":"teste","tank_id":"tanque-01","temperature_c":25.5}'
```

Teste de escrita direta no InfluxDB (INFRA-02) — deve responder **HTTP 204**:

```bash
curl -i -XPOST "http://localhost:8086/api/v2/write?org=unifacef&bucket=tankvitals&precision=s" \
  -H "Authorization: Token $INFLUX_TOKEN" \
  --data-raw "water_reading,tank_id=teste temperature_c=25.5"
```

> Cole aqui um trecho real da saída quando estiver funcionando. Isso vira prova
> de funcionamento na apresentação.

---

## Plano B: túnel TCP (INFRA-04)

Se o `test.mosquitto.org` estiver instável no dia da apresentação:

```bash
ngrok tcp 1883
```

Anote o host e a porta gerados (ex.: `0.tcp.sa.ngrok.io:14523`) e altere **duas
linhas** no `firmware/wokwi/sketch.ino`:

```cpp
#define MQTT_HOST "0.tcp.sa.ngrok.io"
#define MQTT_PORT 14523
```

Depois recompile no Wokwi. **O endereço muda a cada execução do ngrok** — se
for usar na apresentação, abra o túnel antes e não reinicie.

---

## Problemas comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `Connection refused` no 1883 | Mosquitto 2.x sem `listener`/`allow_anonymous` | conferir o `mosquitto.conf` (INFRA-01) |
| Bridge reconectando em laço | falta `try_private false` | o broker público não é seu |
| Mensagem de outro grupo no tópico | prefixo genérico no broker público | trocar por prefixo único (INFRA-03) |
| `401 unauthorized` do InfluxDB | token sem escopo no bucket, ou org errada | refazer o token (INFRA-02) |
| Dados sumiram depois do restart | subiu com `down -v` | `-v` apaga os volumes |
| Porta 1883 ocupada | Mosquitto instalado direto no Windows | parar o serviço local ou trocar a porta publicada |
