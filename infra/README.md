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

Pela API, sem abrir a interface (`$ADMIN` é o `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN`):

```bash
BUCKET_ID=$(curl -s "http://localhost:8086/api/v2/buckets?name=tankvitals" \
  -H "Authorization: Token $ADMIN" | jq -r '.buckets[0].id')
ORG_ID=$(curl -s "http://localhost:8086/api/v2/orgs?org=unifacef" \
  -H "Authorization: Token $ADMIN" | jq -r '.orgs[0].id')

curl -s -XPOST "http://localhost:8086/api/v2/authorizations" \
  -H "Authorization: Token $ADMIN" -H "Content-Type: application/json" -d "{
    \"orgID\": \"$ORG_ID\",
    \"description\": \"tankvitals-backend\",
    \"permissions\": [
      {\"action\":\"read\", \"resource\":{\"type\":\"buckets\",\"id\":\"$BUCKET_ID\",\"orgID\":\"$ORG_ID\"}},
      {\"action\":\"write\",\"resource\":{\"type\":\"buckets\",\"id\":\"$BUCKET_ID\",\"orgID\":\"$ORG_ID\"}}
    ]
  }" | jq -r '.token'
```

Conferindo que o escopo é mesmo restrito — o token do backend precisa **falhar**
nas duas últimas:

| Ação com o token do backend | Esperado | Obtido |
| --- | --- | --- |
| escrever no bucket `tankvitals` | 204 | ✅ 204 |
| consultar com Flux | 200 | ✅ 200 |
| criar outro bucket | negado | ✅ 401 |
| listar tokens da organização | nada visível | ✅ 200 com lista vazia (o admin vê 2) |

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

Para validar a **bridge** do plano B (INFRA-04), publique no broker **público** e confirme
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

### Saída real (01/09/2026)

`docker compose ps`:

```
NAME                   STATUS
tankvitals-influxdb    Up 16 minutes (healthy)
tankvitals-mosquitto   Up 16 minutes
```

Escrita no InfluxDB:

```
HTTP/1.1 204 No Content
X-Influxdb-Build: OSS
X-Influxdb-Version: v2.7.12
```

Pub/sub no Mosquitto — o `mosquitto_sub` recebeu o que o `mosquitto_pub` enviou:

```
tankvitals/tanque-01/telemetry {"device_id":"teste","tank_id":"tanque-01","temperature_c":25.5}
```

Bucket conferido: `tankvitals`, org `unifacef`, `retentionRules[0].everySeconds
= 2592000` (30 dias).

> Falta ainda a parte que depende do dispositivo: telemetria a cada ~5 s vinda
> do Wokwi e o `offline` do Last Will ao parar a simulação (precisa da FW-03).

---

## Broker na VM Oracle (INFRA-03) — configuração padrão

Só o **Mosquitto** roda na VM. InfluxDB, backend e frontend continuam na máquina
local: todos fazem conexão *de saída* para o broker, então nenhum deles precisa
de porta aberta.

```
ESP32 (Wokwi) --publish--> mqtt.<dominio>:1883 (VM Oracle)
                                   ^
                        subscribe  |
                   backend Python (maquina local) --> InfluxDB --> Vue
```

**Abrir a porta 1883.** A VM da Oracle tem dois firewalls empilhados, e abrir só
um não funciona — é aqui que quase todo mundo trava:

```bash
# 1) console da Oracle: Networking -> VCN -> Security List -> Add Ingress Rule
#    Source 0.0.0.0/0 | IP Protocol TCP | Destination Port Range 1883

# 2) dentro da VM, por SSH:
#    Ubuntu
sudo iptables -I INPUT 6 -p tcp --dport 1883 -j ACCEPT
sudo netfilter-persistent save

#    Oracle Linux
sudo firewall-cmd --permanent --add-port=1883/tcp && sudo firewall-cmd --reload
```

**DNS.** Crie um registro **A** `mqtt.<seu-dominio>` apontando para o IP público
da VM. No Cloudflare o registro precisa ficar **cinza (DNS only)** — a nuvem
laranja só encaminha portas HTTP/HTTPS e quebra o tráfego MQTT. Pelo mesmo
motivo, **Cloudflare Tunnel não funciona** para MQTT: porta TCP arbitrária lá
exige o Spectrum, que é plano Enterprise.

**Senha.** Obrigatória, já que a porta fica aberta para a internet:

```bash
mosquitto_passwd -c /mosquitto/config/passwd tankvitals
```

e no `mosquitto.conf` da VM, `allow_anonymous false` + `password_file`. O
arquivo `passwd` está no `.gitignore`.

**Testar de fora da VM:**

```bash
mosquitto_sub -h mqtt.<seu-dominio> -t 'tankvitals/#' -v -u tankvitals -P <senha>
```

---

## Plano B: broker público com bridge (INFRA-04)

Se a porta da VM não abrir a tempo, ou a VM cair no dia da apresentação: o ESP32
publica no `test.mosquitto.org` (que também é Mosquitto) e o Mosquitto local
importa o tópico por *bridge* — o backend continua falando só com um Mosquitto.

O bloco de bridge está comentado no `mosquitto.conf`. Antes de usar, **troque o
prefixo de tópico por um único do grupo** (ex.: `tankvitals-unifacef-g3`): o
broker público é aberto, e no prefixo genérico qualquer um pode publicar.

Trocar entre os dois cenários é mexer em quatro linhas do `sketch.ino`
(`MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`) e recompilar no Wokwi.

**Último recurso:** `ngrok tcp 1883` expõe o Mosquitto local, mas o endereço
muda a cada execução — serve para destravar um teste, não para a apresentação.

---

## Problemas comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `Connection refused` no 1883 | Mosquitto 2.x sem `listener`/`allow_anonymous` | conferir o `mosquitto.conf` (INFRA-01) |
| Bridge reconectando em laço | falta `try_private false` | o broker público não é seu |
| Mensagem de outro grupo no tópico | prefixo genérico no broker público | trocar por prefixo único (INFRA-04) |
| `401 unauthorized` do InfluxDB | token sem escopo no bucket, ou org errada | refazer o token (INFRA-02) |
| Dados sumiram depois do restart | subiu com `down -v` | `-v` apaga os volumes |
| Porta 1883 ocupada | Mosquitto instalado direto no Windows | parar o serviço local ou trocar a porta publicada |
| VM não responde na 1883, mesmo com a Security List liberada | falta a regra de `iptables`/`firewalld` dentro da instância | são dois firewalls (INFRA-03) |
| Conexão ao domínio falha, mas ao IP funciona | registro DNS proxiado (nuvem laranja) no Cloudflare | deixar o registro como *DNS only* |
| `Connection Refused: not authorised` | broker da VM com senha e cliente sem credencial | preencher `MQTT_USERNAME`/`MQTT_PASSWORD` no `.env` e no sketch |
