# Infraestrutura integrada TankVitals

O Compose do segundo bimestre fica em `docker-compose.yml`, incluído pelo
`compose.yaml` da raiz. Ele inicia Mosquitto com ACL, RabbitMQ com as
definições PLAT-05, InfluxDB, PostgreSQL, Ollama, API, gateway, writer, rules,
inference, worker, simulador, pgAdmin e frontend.

## Gerar segredos e iniciar

Na raiz do repositório:

```powershell
python scripts/gerar_segredos.py
docker compose up -d --build
docker compose ps
```

O gerador cria o `.env` e a pasta `secrets/`, os dois ignorados pelo Git, e
imprime as senhas dos três usuários de demonstração uma vez, para anotação
local. Não as cole em logs nem no repositório. Não use `--force` sem intenção de
trocar as credenciais: ele gera senhas novas, que não valem para volumes já
criados com as antigas.

A aplicação fica em <http://localhost:8080>. O login usa `viewer`, `operator`
ou `admin` e as respectivas senhas `DEMO_*` do `.env` local.

Na primeira subida, o `ollama-init` baixa o modelo do assistente (cerca de
2 GB). O resto do sistema não espera por ele: enquanto o download não termina,
a tela do assistente avisa que o modelo está carregando.

## Portas e permissões

- A única porta acessível pela rede é `8080` (Nginx → API e WebSocket).
- Mosquitto (`1883`), InfluxDB (`8086`), RabbitMQ Management (`15672`) e
  pgAdmin (`5050`) ficam vinculados a `127.0.0.1`.
- AMQP (`5672`), PostgreSQL (`5432`) e Ollama não são publicados no host.
- Writer lê um token Influx com escrita somente no bucket `tankvitals`; API e
  worker recebem token separado, limitado aos buckets `tankvitals` e `lab`.
- O pgAdmin já abre com o PostgreSQL cadastrado; a senha do banco está em
  `POSTGRES_PASSWORD` no `.env`.
- Os serviços Python e o Nginx rodam sem root. Os dados ficam em volumes
  nomeados; `docker compose down` preserva os volumes. **Não use `down -v`**:
  ele apaga também o modelo baixado do Ollama.

## Verificação

```powershell
docker compose ps
docker compose logs --tail 100 api gateway writer
```

Faça login pela interface e abra **Mensageria** para consultar filas, taxas,
consumidores, as últimas 50 mensagens de `q.ws` e uma amostra reencaminhada da
DLQ. O endpoint `GET /api/messaging` exige JWT e consulta RabbitMQ no backend.

A documentação da API fica em <http://localhost:8080/api/docs>.
