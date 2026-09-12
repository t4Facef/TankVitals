# O que falta no TankVitals

Estado em **12/09/2026**. Tudo que ainda depende de gente, na ordem em que vale
fazer. O critério de aceite de cada item está em [TAREFAS.md](TAREFAS.md); aqui
está só o que fazer e por quê.

---

## Como está hoje

O sistema **roda ponta a ponta**. Validei com a pilha inteira de pé:

```
fake_device.py → Mosquitto → ingestor → InfluxDB → API → dashboard
```

| Camada | Situação |
| --- | --- |
| Infra (Mosquitto + InfluxDB) | ✅ no ar, bridge com o broker público funcionando |
| Backend (BE-01..09) | ✅ completo, 106 testes verdes |
| Frontend (FE-01..08) | ✅ build limpo, consumindo os 6 endpoints |
| Firmware (FW-03..05) | ⚠️ escrito, **nunca rodou** |
| Entrega (ENT-01..04) | ⬜ não começou |

38 aceites foram validados contra o sistema rodando (não por leitura de
código). O que sobra precisa de **navegador**, do **Wokwi** ou de **decisão da
equipe** — nada disso eu consigo fazer daqui.

---

## 1. Rodar o firmware no Wokwi ⬅ comece aqui

**Por que é o primeiro:** vale 1,5 pt de dispositivo IoT + reforça 2,0 pts de
MQTT, e é o único trecho do sistema que nunca executou. Se tiver erro de
compilação, é melhor descobrir agora.

Não tenho toolchain Arduino nem navegador, então escrevi o
[sketch.ino](../firmware/wokwi/sketch.ino) conferindo o contrato campo a campo
(os 12 campos da §2.2 e os 3 tópicos da §2.1 batem), mas **ele nunca foi
compilado**.

### Passo a passo

1. Abra o projeto no Wokwi e cole `firmware/wokwi/sketch.ino`.
2. No Library Manager, confirme as 4 bibliotecas do
   [libraries.txt](../firmware/wokwi/libraries.txt). As versões estão fixas de
   propósito: o sketch usa a API `JsonDocument` do **ArduinoJson 7**; se o
   Wokwi puxar a 6, não compila.
3. Rode. No monitor serial tem que aparecer:
   ```
   [wifi] conectando em Wokwi-GUEST... ok, IP 10.13.37.2
   [mqtt] conectando em test.mosquitto.org como tankvitals-XXXX... ok
   [pub] {"device_id":"esp32-tank-01","tank_id":"tanque-01",...}
   ```
4. Com a infra de pé, confirme do outro lado da bridge:
   ```bash
   docker exec tankvitals-mosquitto \
     mosquitto_sub -h localhost -t 'tankvitals-unifacef-g3/#' -v
   ```
5. Suba o backend e veja o log: `Leitura gravada: tank_id=tanque-01 temp=...`

### Isso fecha, de uma vez

- **FW-03** (Wi-Fi, NTP, MQTT, Last Will)
- **FW-04** (payload JSON) — cole a saída no `jq .` para o aceite do validador
- **FW-05** (LED e comando `/cmd`)
- **INFRA-05** (telemetria a cada ~5 s, `online`/`offline`)
- O último aceite aberto da **BE-05**

### Testes que só dão para fazer no Wokwi

| O quê | Como | Esperado |
| --- | --- | --- |
| LED de alerta | girar o potenciômetro até pH ~3 | LED do D19 acende; voltar a 7 apaga |
| Last Will | parar a simulação | broker publica `offline` no tópico de status |
| Comando remoto | `mosquitto_pub -t 'tankvitals-unifacef-g3/tanque-01/cmd' -m '{"interval_s":2}'` | publicação passa a sair a cada 2 s |
| Comando inválido | mandar `{"interval_s":9999}` e `{lixo` | ignorados, firmware não cai |
| `seq` sem pulo | olhar o serial | incrementa de 1 em 1 |

> **Se não compilar,** me manda o erro do Wokwi que eu corrijo. É o risco real
> desse item: código C++ que nunca passou por um compilador.

---

## 2. Conferir o dashboard no navegador

O backend está validado por HTTP e WebSocket, mas **ninguém olhou a tela**. Os
aceites de FE-03 a FE-08 são visuais e é rápido percorrer.

Com tudo de pé (`docker compose up -d`, backend, `npm run dev` e o
`fake_device.py`), abra <http://localhost:5173> e confira:

- os 4 cards com valor real e o badge em **"Tempo real"**;
- o gráfico desenhando, com as linhas tracejadas da faixa segura;
- trocar o período (1h / 6h / 24h / 7d) recarregando;
- layout em **1366×768** e em tela de celular;
- derrubar o backend → mostra desconectado; subir → reconecta **sem F5**;
- deixar aberto 10 min e ver se não degrada (FE-06);
- DevTools: trocar de aba e voltar não deixa WebSocket órfão (FE-03).

Para o cenário de alerta, sem mexer no Wokwi:

```bash
cd backend
.venv/Scripts/python.exe tools/fake_device.py --interval 5 --anomalia ph
```

Confirmei que isso leva a API a `level: critico` com `ph 5.5`. Na tela, o card
do pH tem que ficar vermelho e mudar o rótulo.

> **Cuidado:** rodar dois `fake_device` ao mesmo tempo faz um sobrescrever o
> outro e a anomalia "desaparece". Foi o que me aconteceu.

---

## 3. ENT-02 — README com evidências

Falta o que só vocês têm:

- [ ] **Link público do projeto no Wokwi** no README
- [ ] **Prints do dashboard**: um em estado normal, um em alerta (use o
      `--anomalia`)
- [ ] Pedir para alguém de outra frente subir tudo seguindo só o README, numa
      máquina limpa. Se travar, o passo a passo está incompleto.

A ordem de subida para documentar é: `docker compose up -d` → backend →
frontend → Wokwi.

---

## 4. ENT-01 — Histórico da equipe no Git

O aceite é "commits de todos os integrantes". Como está hoje:

```
     27  LucianoMazar <lmazaraojr@gmail.com>
      3  EduardoColombari <duducolombarielias@gmail.com>
      1  EduardoElias <duducolombarielias@gmail.com>
      1  Igor Barcelos <igor_carloni@hotmail.com>
      1  Luciano Mazarão Jr <159916665+LucMazarJR@...>
      1  t4Facef <t4unifacef@gmail.com>
```

São **4 pessoas** em 6 identidades: o Eduardo aparece com dois nomes no mesmo
e-mail, e o Luciano com duas contas. Se a turma tem mais integrantes do que
isso, falta alguém commitar. Padronizar o `user.name` de cada um deixaria o
histórico mais legível para quem avalia:

```bash
git config user.name "Nome Sobrenome"
```

Segredo versionado: o `.env` está no `.gitignore` e confirmei que **não está
rastreado**.

> Os 12 commits que fiz na semana da infra estão na `main` mas **não foram
> enviados** (`git push` pendente). Conferir antes da entrega.

---

## 5. ENT-03 e ENT-04 — Ensaio e roteiro

Depois que o Wokwi estiver validado:

1. Subir tudo do zero numa máquina reiniciada, **cronometrando** (aceite: menos
   de 5 min).
2. Percorrer os 6 elos da [ARQUITETURA §10](ARQUITETURA.md#10-como-validar-cada-elo-da-corrente).
3. Ensaiar a demonstração do alerta — é o momento que amarra a apresentação.
4. Ensaiar o caminho de emergência (abaixo).

---

## Riscos que valem atenção

### O `test.mosquitto.org` é serviço de terceiro

Sem a VM, a cadeia do Wokwi até o broker local passa por um broker **público e
aberto**. Se ele estiver fora ou congestionado na hora da apresentação, o elo
1→3 quebra.

**Plano de emergência:** o `fake_device.py` publica direto no broker local e
pula o trecho público inteiro. Tenha o comando pronto e avise que é ferramenta
de desenvolvimento — a rubrica exige o dispositivo funcionando, então isso é
recurso de última hora, não substituto.

Como o broker é aberto, qualquer um pode publicar em
`tankvitals-unifacef-g3/#`. **O `g3` foi escolhido por mim a partir do exemplo
da própria documentação — confirmem se o número do grupo está certo.** Um
prefixo colidindo com outro grupo no meio da defesa seria péssimo.

### O Docker Desktop não sobe sozinho

Depois de reiniciar a máquina ele fica fora, e `docker compose ps` dá erro de
pipe. Abrir o Docker Desktop é o primeiro passo de qualquer sessão.

E um detalhe que já me mordeu: o `com.docker.backend` **escuta na 5173**, a
mesma porta padrão do Vite. Os dois convivem, mas se a 5173 der conflito
estranho, é daí.

---

## Nitpicks que não valem bloquear a entrega

Coisas que notei, decidi não mexer, e ficam registradas:

1. **Timestamp com microssegundos.** O último ponto do `/api/readings/history`
   vem como `2026-09-12T12:02:58.825404Z`, enquanto os anteriores vêm em
   segundos inteiros — é o `_stop` da janela parcial do `aggregateWindow`. É ISO
   8601 válido, termina em `Z` e o front parseia sem problema; só não é uniforme
   como o exemplo da §6.

2. **`crit_min: 0` na turbidez.** O `/api/thresholds` manda `crit_min: 0.0` para
   turbidez, mas a §5 não define alerta por turbidez baixa. É inofensivo (não
   existe NTU negativo), mas `null` descreveria melhor, como já é feito no nível.

3. **Os testes do repositório mockam o `query_api`.** Isso deu falsa confiança:
   o bug do `/api/stats` passou por todos os 105 testes porque nenhum executa
   Flux de verdade. Se sobrar tempo, um teste de integração contra o InfluxDB do
   compose pegaria essa classe de erro.
