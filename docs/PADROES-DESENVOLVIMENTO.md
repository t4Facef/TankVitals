# TankVitals — Guia de desenvolvimento

Um apanhado de como trabalhar no repositório: criar branch, commitar, abrir PR
e não pisar no trabalho do colega. É guia, não regulamento — se algo aqui
atrapalhar mais do que ajudar, a gente muda.

Leia junto com [TAREFAS.md](TAREFAS.md) (o que fazer) e
[ARQUITETURA.md](ARQUITETURA.md) (como as peças se encaixam).

---

## Índice

- [1. O fluxo, em resumo](#1-o-fluxo-em-resumo)
- [2. Criando uma branch](#2-criando-uma-branch)
- [3. Commits (Conventional Commits)](#3-commits-conventional-commits)
- [4. Abrindo um Pull Request](#4-abrindo-um-pull-request)
- [5. Revisando o PR do colega](#5-revisando-o-pr-do-colega)
- [6. Antes de considerar a tarefa pronta](#6-antes-de-considerar-a-tarefa-pronta)
- [7. Dicas por frente](#7-dicas-por-frente)
- [8. Cuidado com o .env](#8-cuidado-com-o-env)
- [9. Socorro! (receitas de Git)](#9-socorro-receitas-de-git)

---

## 1. O fluxo, em resumo

A ideia é simples: a `main` fica sempre funcionando, e cada tarefa acontece numa
branch separada que depois volta pra `main` por Pull Request.

```
main ──●───────────────●──────────────●──►  sempre roda
        \             /  \           /
         ●──●──●─────●     ●──●─────●
         feat/be-05        feat/fe-06
```

Por que separar em branch: enquanto você mexe no backend, alguém mexe no front.
Se os dois commitarem direto na `main`, um quebra o outro e ninguém entende o
porquê. Na branch, seu trabalho fica isolado até estar funcionando.

O ciclo completo de uma tarefa, do começo ao fim:

```bash
# 1. parte do estado mais novo da main
git checkout main
git pull origin main

# 2. cria a branch da sua tarefa
git checkout -b feat/be-05-ingestor-mqtt

# 3. trabalha, commitando aos poucos
git add backend/app/mqtt_ingestor.py
git commit -m "feat(be-05): assina topicos de telemetria e status"

# 4. antes de enviar, traz o que mudou na main
git pull --rebase origin main

# 5. envia e abre o PR
git push -u origin feat/be-05-ingestor-mqtt
# o próprio push imprime no terminal um link pra abrir o PR — é só clicar
```

Uma branch por tarefa do backlog costuma ser o tamanho certo. Se ela estiver
aberta há muitos dias, vale trazer a `main` pra dentro dela (passo 4) de vez em
quando, pra não acumular conflito.

---

## 2. Criando uma branch

O formato que a gente usa é **`<tipo>/<id-da-tarefa>-<descrição-curta>`**:

```
feat/be-05-ingestor-mqtt
feat/fe-06-grafico-historico
fix/be-04-timestamp-em-1970
docs/ent-02-readme-com-prints
chore/infra-01-docker-compose
```

Tipos: `feat` (coisa nova), `fix` (correção), `docs`, `chore` (configuração,
dependência), `refactor`, `test`.

Duas coisinhas que evitam dor de cabeça: tudo minúsculo com hífen, e sem acento
nem espaço no nome (alguns comandos de Git engasgam com isso).

---

## 3. Commits (Conventional Commits)

É só um jeito padronizado de escrever a mensagem:

```
<tipo>(<escopo>): <o que essa mudança faz>
```

O **escopo** é o id da tarefa em minúsculas — `be-05`, `fe-06`, `infra-03`.
Assim dá pra achar tudo de uma tarefa depois:

```bash
git log --oneline --grep="be-05"
```

Exemplos:

```
feat(be-07): endpoint de historico agregado
fix(fw-04): nao publica NaN quando o DS18B20 falha
docs(arquitetura): fecha contrato do payload
chore(infra-01): sobe mosquitto e influxdb
test(be-03): cobre bordas da faixa de temperatura
```

Se a mudança não for de nenhuma tarefa, use a área no lugar do id:
`docs(readme): ...`, `chore(deps): ...`.

**O que ajuda na hora de escrever a descrição:** diga o efeito da mudança, não a
ação. `fix(be-04): grava timestamp do dispositivo` conta muito mais do que
`fix(be-04): ajustes` — daqui a três semanas, quando alguém estiver caçando
quando um bug entrou, é essa linha que vai salvar.

Precisando explicar mais, dá pra usar um corpo depois de uma linha em branco.
Vale a pena quando o "porquê" não é óbvio:

```
fix(be-08): envia leitura ao websocket a partir da thread do paho

Usa asyncio.run_coroutine_threadsafe com o loop capturado no lifespan.
Antes o await direto na thread do paho nao disparava nada e o dashboard
so atualizava no F5.
```

**Sobre o tamanho:** se a mensagem precisa de "e" pra descrever o que você fez
(`adiciona endpoint e corrige css e atualiza readme`), provavelmente cabia em
commits separados. Mas não trave por isso — commit demais é problema muito menor
do que commit de menos.

---

## 4. Abrindo um Pull Request

Depois do `git push`, o terminal mostra um link. Clicou, abriu o PR.

**Título:** igual ao commit — `feat(be-05): ingestor mqtt gravando no influxdb`.

**Descrição:** o que ajuda quem vai revisar é saber três coisas — qual tarefa é,
o que você fez, e como testar. Algo assim já basta:

```markdown
Tarefa: BE-05

O que fiz:
- assina os tópicos de telemetria e status
- valida com parse_reading() e grava no InfluxDB
- reconecta sozinho se o broker cair

Como testar:
1. docker compose up -d na pasta infra
2. uvicorn app.main:app --reload na pasta backend
3. python tools/fake_device.py
4. conferir os pontos no Data Explorer do InfluxDB
```

Algumas coisas que costumam evitar retrabalho:

- **PR menor é revisado mais rápido.** PR de 800 linhas geralmente recebe um
  "aprovado" sem ninguém ter lido de verdade.
- **Peça pra alguém dar uma olhada** antes do merge. Não precisa ser cerimônia:
  manda no grupo "abri o PR da BE-05, dá uma olhada?".
- **Se o merge quebrar a `main`**, avisa no grupo e corrige — acontece, não é
  problema. O ruim é ficar quebrado sem ninguém saber, porque trava as outras
  frentes.
- No GitHub, **Squash and merge** deixa o histórico mais limpo: seu PR inteiro
  vira um commit só na `main`.

**Uma coisa que vale mesmo o cuidado:** se você mudou nome de campo, tópico,
endpoint ou porta, atualize a `ARQUITETURA.md` no mesmo PR e avise no grupo.
Esses nomes são o encaixe entre as frentes — mudou de um lado sem avisar, o
outro lado quebra e a pessoa perde horas procurando o motivo.

---

## 5. Revisando o PR do colega

Não precisa ser revisão profunda. Bater o olho em quatro coisas já pega quase
tudo:

1. Faz o que a tarefa pedia? (compare com o critério de aceite no backlog)
2. Os nomes batem com a `ARQUITETURA.md`?
3. E se der errado — rede caiu, banco fora, lista vazia — o que acontece?
4. Tem senha ou token no meio do código?

Ao comentar, aponte o caso concreto em vez do julgamento. "aqui, se o `pulseIn`
der timeout, o valor vai pro banco como 0 — não era pra omitir o campo?" ajuda
muito mais do que "tá errado". E se a ressalva for pequena, aprova e comenta —
segurar PR por detalhe de formatação só atrasa todo mundo.

---

## 6. Antes de considerar a tarefa pronta

Uma conferida rápida:

- [ ] Testei rodando (não só li o código e achei que estava certo)
- [ ] O critério de aceite da tarefa acontece de verdade
- [ ] O `.env` não foi junto no commit
- [ ] Mudei algum nome de campo/endpoint? Atualizei a `ARQUITETURA.md`
- [ ] A `main` continua rodando depois do merge

---

## 7. Dicas por frente

Não são regras — são as coisas que costumam economizar tempo em cada
tecnologia.

### Python (backend)

- Use `type hints` nas funções (`def parse(topic: str) -> Reading | None:`). O
  editor passa a te avisar dos erros antes de você rodar.
- Configuração (endereço, porta, token, limite de faixa) vem do `config.py`. Se
  precisar mudar depois, muda num lugar só.
- `logging` em vez de `print()`. Na hora de descobrir por que uma leitura sumiu,
  é o log que conta a história.
- Evite `except:` sozinho: ele engole o erro e você fica sem saber o que
  aconteceu. Melhor capturar a exceção específica e logar.

### TypeScript / Vue (frontend)

- `<script setup lang="ts">` em todo componente.
- Quando o TypeScript reclamar, geralmente ele está certo. Colocar `any` faz o
  erro sumir agora e voltar em forma de tela branca depois.
- Os tipos do que vem da API ficam todos em `src/types.ts` — um lugar só.
- Se você criou `setInterval` ou abriu um WebSocket, feche no `onUnmounted`.
  Senão a página vai ficando lenta com o tempo, sem motivo aparente.

### C++ / Arduino (firmware)

- Pino, tópico e faixa em `#define`/`const` no topo do arquivo, não espalhados
  pelo `loop()`.
- **Nada de `delay()` no `loop()`** — use `millis()`. O `delay()` trava o
  `mqtt.loop()` e a conexão cai sozinha; é um problema chato de diagnosticar
  porque parece problema de rede.
- Toda leitura de sensor pode falhar. Devolva `NAN` e trate, em vez de mandar
  lixo pro backend.

### Markdown (documentação)

- Tabela pra contrato, lista numerada pra passo a passo.
- Link relativo entre os arquivos (`[TAREFAS.md](TAREFAS.md)`), que funciona
  direto no GitHub.

---

## 8. Cuidado com o .env

O `.env` guarda o token do InfluxDB, e ele **não vai pro Git** — o `.gitignore`
já cuida disso. O que vai versionado é o `.env.example`, com as mesmas chaves
vazias, pra quem clonar saber o que precisa preencher.

Conferida rápida antes de enviar:

```bash
git status --short          # nada de .env ou node_modules na lista
```

Se um token vazar em commit, o jeito certo é **gerar um token novo**. Apagar o
arquivo no commit seguinte não resolve: ele continua no histórico, visível pra
quem clonar o repositório.

---

## 9. Receitas de Git

**Comecei a mexer na `main` sem querer**

```bash
git stash                       # guarda o que você fez
git checkout -b feat/be-05-ingestor
git stash pop                   # traz de volta, agora na branch certa
```

**Minha branch ficou pra trás da `main`**

```bash
git pull --rebase origin main
# se der conflito: resolve os arquivos, git add neles, git rebase --continue
```

**Errei a mensagem do último commit (e ainda não dei push)**

```bash
git commit --amend -m "feat(be-05): mensagem correta"
```

**Commitei o `.env` sem querer (e ainda não dei push)**

```bash
git rm --cached .env
git commit -m "chore: remove .env do versionamento"
# se ele já estava preenchido, gere um token novo por garantia
```

**Quero ver o que vou enviar antes do push**

```bash
git diff origin/main...HEAD --stat
```

**Quero jogar fora tudo que fiz nesta branch**

```bash
git checkout .          # descarta o que não foi commitado
git clean -fd           # apaga arquivos novos — não tem volta, confira antes
```

**Quero ver tudo que foi feito numa tarefa**

```bash
git log --oneline --grep="be-05"
```
