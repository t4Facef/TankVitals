<script setup lang="ts">
// Página Ferramentas (WEB-04): os links das interfaces que o compose deixa
// abertas só em 127.0.0.1, como o enunciado pede, e o que mostrar em cada uma
// na apresentação. Cada link é testado daqui: se não responder, a pessoa sabe
// antes de clicar.
import { onMounted, reactive, type Component } from 'vue'
import { BookOpen, Database, ExternalLink, Rabbit, RefreshCw, ServerCog } from 'lucide-vue-next'
import { API_BASE } from '../api/http'
import { TOOL_URLS } from '../config'

type Probe = 'checking' | 'up' | 'down'

interface Tool {
  id: string
  name: string
  icon: Component
  url: string
  /** Mesmo endereço do app (passa pelo nginx): dá para ler o status da resposta. */
  sameOrigin: boolean
  what: string
  demo: string
}

const TOOLS: Tool[] = [
  {
    id: 'api',
    name: 'Documentação da API',
    icon: BookOpen,
    url: `${API_BASE}/api/docs`,
    sameOrigin: !API_BASE,
    what: 'As rotas REST do FastAPI, com o formato de cada uma, geradas a partir do próprio código.',
    demo: 'Use o botão Authorize com um usuário de demonstração e experimente GET /api/devices.',
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    icon: Rabbit,
    url: TOOL_URLS.rabbitmq,
    sameOrigin: false,
    what: 'O barramento interno: as exchanges, as filas, os consumidores e a DLQ.',
    demo: 'Na aba Queues, pare o writer e veja a q.writer crescer; volte com ele e veja esvaziar.',
  },
  {
    id: 'influxdb',
    name: 'InfluxDB',
    icon: Database,
    url: TOOL_URLS.influxdb,
    sameOrigin: false,
    what: 'As séries no tempo: as leituras dos sensores e da bomba e as previsões da IA.',
    demo: 'No Data Explorer, o bucket tankvitals tem o ao vivo; o lab, a amostra dos dados sintéticos.',
  },
  {
    id: 'pgadmin',
    name: 'pgAdmin (PostgreSQL)',
    icon: ServerCog,
    url: TOOL_URLS.pgadmin,
    sameOrigin: false,
    what: 'O banco relacional: usuários, dispositivos, faixas, regras, alertas, comandos e auditoria.',
    demo: 'Abra as tabelas de dispositivos, regras e auditoria e compare com as telas do app.',
  },
]

const status = reactive<Record<string, Probe>>({})

const PROBE_TIMEOUT_MS = 4000

/**
 * Testa se o endereço responde. Fora do app, o navegador não deixa ler a
 * resposta (`no-cors`), mas deixa saber se ela veio: é o que basta aqui.
 */
async function probe(tool: Tool): Promise<void> {
  status[tool.id] = 'checking'
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(tool.url, {
      mode: tool.sameOrigin ? 'same-origin' : 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    status[tool.id] = tool.sameOrigin && !response.ok ? 'down' : 'up'
  } catch {
    status[tool.id] = 'down'
  } finally {
    window.clearTimeout(timeout)
  }
}

function probeAll(): void {
  TOOLS.forEach((tool) => void probe(tool))
}

onMounted(probeAll)

const STATUS_TEXT: Record<Probe, string> = {
  checking: 'Verificando…',
  up: 'Respondendo',
  down: 'Não respondeu daqui',
}
</script>

<template>
  <main class="dashboard">
    <header class="page-header">
      <div>
        <h2>Ferramentas</h2>
        <p>
          As interfaces do InfluxDB, do RabbitMQ e do PostgreSQL ficam abertas só em 127.0.0.1: os links funcionam
          na máquina que roda o <code>docker compose</code>, e em nenhuma outra.
        </p>
      </div>

      <button type="button" class="button" @click="probeAll">
        <RefreshCw :size="16" aria-hidden="true" />
        Testar de novo
      </button>
    </header>

    <div class="tools-grid">
      <article v-for="tool in TOOLS" :key="tool.id" class="panel tool-card">
        <div class="panel-header">
          <h3>
            <component :is="tool.icon" :size="19" aria-hidden="true" />
            {{ tool.name }}
          </h3>
          <span :class="['tool-status', `is-${status[tool.id] ?? 'checking'}`]" role="status">
            <span class="tool-dot" aria-hidden="true" />
            {{ STATUS_TEXT[status[tool.id] ?? 'checking'] }}
          </span>
        </div>

        <p class="tool-what">{{ tool.what }}</p>
        <p class="tool-demo"><strong>Na apresentação:</strong> {{ tool.demo }}</p>

        <div class="tool-foot">
          <code>{{ tool.url }}</code>
          <a class="button button-primary" :href="tool.url" target="_blank" rel="noopener noreferrer">
            Abrir
            <ExternalLink :size="15" aria-hidden="true" />
            <span class="sr-only">(abre em outra aba)</span>
          </a>
        </div>
      </article>
    </div>

    <section class="panel tools-note">
      <h3>Usuário e senha</h3>
      <p>
        Cada interface pede o próprio login. Os usuários e as senhas estão no <code>.env</code> e na pasta
        <code>secrets/</code>, gerados na máquina de cada um pelo <code>scripts/gerar_segredos.py</code>. Nenhuma
        senha fica no Git nem nesta página.
      </p>
      <p>
        "Não respondeu daqui" quer dizer que o serviço está fora do ar ou que esta não é a máquina da demo. Com o
        compose de pé, confira em <code>docker compose ps</code>.
      </p>
    </section>
  </main>
</template>

<style scoped>
.page-header code,
.tools-note code {
  font-size: 0.875em;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.tool-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-card .panel-header {
  margin-bottom: 8px;
}

.tool-card h3 {
  display: flex;
  align-items: center;
  gap: 9px;
}

.tool-card h3 svg {
  color: var(--accent);
}

.tool-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
}

.tool-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.tool-status.is-up {
  color: var(--ok-ink);
}

.tool-status.is-up .tool-dot {
  background: var(--nivel-ok);
}

.tool-status.is-down {
  color: var(--critico-ink);
}

.tool-status.is-down .tool-dot {
  background: var(--nivel-critico);
}

.tool-status.is-checking {
  color: var(--muted);
}

.tool-status.is-checking .tool-dot {
  border: 2px solid var(--muted);
}

.tool-what {
  font-weight: 600;
}

.tool-demo {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.tool-demo strong {
  color: var(--ink);
  font-weight: var(--fw-heavy);
}

.tool-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  border-top: var(--bw) solid var(--line-soft);
}

.tool-foot code {
  color: var(--muted);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.tools-note {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tools-note h3 {
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.tools-note p {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>
