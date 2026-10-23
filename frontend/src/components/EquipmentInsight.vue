<script setup lang="ts">
import { computed } from 'vue'
import { classify, healthLevel, LEVEL_TEXT } from '../alerts'
import { formatAge, useDeviceState } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useNow } from '../composables/useNow'
import { useRecentSeries } from '../composables/useRecentSeries'
import type { Alert, Device, Series } from '../domain/devices'
import { explainAlert, fieldAdvice, formatRul, HEALTH_RANGE, rangeSide, RUL_CAP_H, RUL_RANGE } from '../domain/insights'
import { fieldIcon, KIND_ICON, LEVEL_ICON, UI_ICON } from '../icons'
import { tankLabel } from '../plant/tanks'
import type { HistoryRange } from '../types'
import HealthLight from './HealthLight.vue'
import HistoryChart from './HistoryChart.vue'
import Sparkline from './Sparkline.vue'

/**
 * Um equipamento na tela Insights (IA-09): o semáforo e os números da última
 * previsão, a tendência da saúde e da vida útil no período, os sinais que as
 * leituras dão agora e os alertas, cada um com o que significa e o que fazer.
 */
const props = defineProps<{
  device: Device
  prediction: { health: number; rul_h: number | null; model: string | null } | null
  alerts: Alert[]
  health?: Series
  rul?: Series
  range: HistoryRange
  loading: boolean
  error: string | null
}>()

const now = useNow()
const { value, state } = useLiveValues()
const { connection, ageSeconds } = useDeviceState()
const { recentSeries } = useRecentSeries()

function format(n: number | null | undefined, decimals: number): string {
  return n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function ago(iso: string): string {
  return formatAge(Math.max(0, Math.round((now.value - Date.parse(iso)) / 1000)))
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** O nível só pela previsão: é ele que acende o semáforo. */
const aiLevel = computed<ItemLevel>(() =>
  props.prediction ? healthLevel(props.prediction.health, props.prediction.rul_h) : 'vazio',
)

const VERDICT: Record<ItemLevel, string> = {
  ok: 'Saudável: a IA não vê falha próxima.',
  atencao: 'Desgaste começando: acompanhe e programe uma revisão.',
  critico: 'Falha próxima: revise o equipamento ainda hoje.',
  vazio: 'Sem previsão recente. A IA só prevê com a telemetria do equipamento chegando.',
}

const levelIcon = computed(() => (aiLevel.value === 'vazio' ? UI_ICON.semDado : LEVEL_ICON[aiLevel.value]))

const situation = computed(() => {
  const link = connection(props.device.id)
  const age = ageSeconds(props.device.id)
  if (link === 'online') return { cls: 'is-online', text: `Publicando · ${formatAge(age ?? 0)}` }
  if (link === 'never') return { cls: 'is-never', text: 'Sem dados ainda' }
  return { cls: 'is-stale', text: `Parou ${formatAge(age ?? 0)}` }
})

const running = computed(() => (props.device.state_field ? state(props.device.id, props.device.state_field) : null))

/** Cada variável agora, com a pista do que ela indica quando sai da faixa. */
const signals = computed(() =>
  props.device.fields.map((field) => {
    const current = value(props.device.id, field.key)
    const side = current === null ? null : rangeSide(current, field.range)
    return {
      field,
      side,
      icon: fieldIcon(field.key),
      text: format(current, field.decimals),
      level: current !== null && field.range ? classify(current, field.range) : null,
      points: recentSeries(props.device.id, field.key),
      advice: side ? fieldAdvice(field, side) : null,
    }
  }),
)

const clues = computed(() => signals.value.filter((s) => s.advice !== null))

function sourceOf(alert: Alert): string {
  if (alert.field === null) return 'Previsão da IA'
  const field = props.device.fields.find((f) => f.key === alert.field)
  return `Faixa de ${field?.short ?? alert.field}`
}

const mine = computed(() => props.alerts.filter((alert) => alert.device === props.device.id))

const openAlerts = computed(() =>
  mine.value
    .filter((alert) => alert.closed_at === null)
    .map((alert) => ({ alert, source: sourceOf(alert), advice: explainAlert(alert, props.device) })),
)

const closedAlerts = computed(() =>
  mine.value
    .filter((alert) => alert.closed_at !== null)
    .slice(0, 6)
    .map((alert) => ({ alert, source: sourceOf(alert) })),
)

const minHealth = computed(() => props.health?.stats.min)
</script>

<template>
  <article :id="device.id" class="panel equipment-insight">
    <header class="ei-head">
      <span class="ei-icon"><component :is="KIND_ICON.equipment" :size="20" aria-hidden="true" /></span>
      <div class="ei-title">
        <h3>{{ device.name }}</h3>
        <p>
          <code>{{ device.id }}</code> · {{ tankLabel(device.zone) }} ·
          <span :class="['ei-situation', situation.cls]"><span class="ei-dot" aria-hidden="true" />{{ situation.text }}</span>
          <template v-if="running !== null"> · {{ running ? 'ligada' : 'desligada' }}</template>
        </p>
      </div>
      <nav class="ei-links" aria-label="Ver em outras telas">
        <RouterLink class="button" :to="{ name: 'gemeo-3d', query: { tanque: device.zone, item: device.id } }">
          Ver no 3D <component :is="UI_ICON.abrir" :size="15" aria-hidden="true" />
        </RouterLink>
        <RouterLink class="button" :to="{ name: 'dashboard' }">
          Dashboard <component :is="UI_ICON.abrir" :size="15" aria-hidden="true" />
        </RouterLink>
      </nav>
    </header>

    <div class="ei-top">
      <section class="ei-now" aria-label="Previsão de agora">
        <HealthLight :level="aiLevel" />
        <div class="ei-numbers">
          <span class="ei-label">Saúde prevista</span>
          <span class="ei-health-row">
            <strong :class="['ei-health', aiLevel === 'vazio' ? '' : `ink-${aiLevel}`]">
              {{ prediction ? `${format(prediction.health, 0)} %` : '—' }}
            </strong>
            <span :class="['table-level', `badge-${aiLevel}`]">
              <component :is="levelIcon" :size="13" aria-hidden="true" />
              {{ ITEM_LEVEL_TEXT[aiLevel] }}
            </span>
          </span>
          <span class="ei-label">Vida útil restante</span>
          <strong class="ei-rul">{{ prediction?.rul_h != null ? formatRul(prediction.rul_h) : '—' }}</strong>
          <p class="ei-verdict">{{ VERDICT[aiLevel] }}</p>
          <small v-if="prediction?.model" class="ei-model">modelo {{ prediction.model }}</small>
        </div>
      </section>

      <section class="ei-trend" aria-label="Tendência da saúde">
        <div class="ei-section-head">
          <h4>Tendência da saúde</h4>
          <small v-if="minHealth !== undefined">mínima no período: {{ format(minHealth, 0) }} %</small>
        </div>
        <div v-if="loading && !health" class="loading-state">
          <span class="spinner" />
          Carregando o histórico…
        </div>
        <div v-else-if="error && !health" class="error-state">
          <component :is="LEVEL_ICON.critico" :size="22" aria-hidden="true" />
          <strong>Não foi possível carregar o histórico</strong>
          <span>{{ error }}</span>
        </div>
        <HistoryChart
          v-else
          :points="health?.points ?? []"
          label="Saúde"
          unit="%"
          :threshold="HEALTH_RANGE"
          :range="range"
          :y-min="0"
          :y-max="100"
        />
      </section>
    </div>

    <section class="ei-rul-chart" aria-label="Vida útil no período">
      <div class="ei-section-head">
        <h4>Vida útil restante</h4>
        <small>teto de {{ RUL_CAP_H }} h: no teto, nenhuma falha à vista</small>
      </div>
      <HistoryChart
        v-if="!(loading && !rul) && !(error && !rul)"
        :points="rul?.points ?? []"
        label="Vida útil"
        unit="h"
        :threshold="RUL_RANGE"
        :range="range"
        :y-min="0"
        :y-max="RUL_CAP_H"
      />
    </section>

    <div class="ei-bottom">
      <section class="ei-signals" aria-label="Sinais nas leituras">
        <div class="ei-section-head">
          <h4>Sinais nas leituras</h4>
          <small>agora, pela faixa de cada variável</small>
        </div>
        <ul class="ei-vars">
          <li v-for="s in signals" :key="s.field.key" :class="s.level ? `is-${s.level}` : ''">
            <small><component :is="s.icon" :size="13" aria-hidden="true" /> {{ s.field.short }}</small>
            <b>{{ s.text }}<i v-if="s.text !== '—'"> {{ s.field.unit }}</i></b>
            <Sparkline
              :points="s.points"
              :ok-min="s.field.range?.ok_min"
              :ok-max="s.field.range?.ok_max"
              :width="140"
              :height="24"
            />
          </li>
        </ul>
        <ul v-if="clues.length" class="ei-advice">
          <li v-for="s in clues" :key="s.field.key" :class="`is-${s.level}`">
            <strong>{{ s.field.short }} {{ s.side === 'high' ? 'acima' : 'abaixo' }} do normal</strong>
            <p>{{ s.advice?.meaning }}</p>
            <p><b>O que fazer:</b> {{ s.advice?.action }}</p>
          </li>
        </ul>
        <p v-else-if="aiLevel === 'atencao' || aiLevel === 'critico'" class="ei-ahead">
          As leituras ainda estão dentro da faixa: a IA percebe o desgaste antes. Acompanhe a vibração e a temperatura
          do motor nos mini gráficos.
        </p>
        <p v-else class="ei-calm">
          <component :is="LEVEL_ICON.ok" :size="16" aria-hidden="true" />
          Todas as variáveis dentro da faixa normal.
        </p>
        <p class="ei-note">Estas pistas saem das leituras e da faixa de cada variável, não do modelo da IA.</p>
      </section>

      <section class="ei-alerts" aria-label="Alertas do equipamento">
        <div class="ei-section-head">
          <h4>Alertas</h4>
          <small>{{ openAlerts.length ? `${openAlerts.length} ${openAlerts.length === 1 ? 'aberto' : 'abertos'}` : 'nenhum aberto' }}</small>
        </div>
        <ul v-if="openAlerts.length" class="ei-alert-list">
          <li v-for="a in openAlerts" :key="a.alert.id" :class="`is-${a.alert.level}`">
            <div class="ei-alert-head">
              <span :class="['table-level', `badge-${a.alert.level}`]">
                <component :is="LEVEL_ICON[a.alert.level]" :size="13" aria-hidden="true" />
                {{ LEVEL_TEXT[a.alert.level] }}
              </span>
              <strong>{{ a.alert.message }}</strong>
              <small>{{ a.source }} · aberto {{ ago(a.alert.opened_at) }}</small>
            </div>
            <template v-if="a.advice">
              <p><b>O que significa:</b> {{ a.advice.meaning }}</p>
              <p><b>O que fazer:</b> {{ a.advice.action }}</p>
            </template>
          </li>
        </ul>
        <p v-else class="ei-calm">
          <component :is="LEVEL_ICON.ok" :size="16" aria-hidden="true" />
          Nenhum alerta aberto para este equipamento.
        </p>
        <details v-if="closedAlerts.length" class="ei-closed">
          <summary>Fechados recentemente ({{ closedAlerts.length }})</summary>
          <ul>
            <li v-for="c in closedAlerts" :key="c.alert.id">
              <span class="table-level badge-vazio">{{ LEVEL_TEXT[c.alert.level] }}</span>
              <span>{{ c.alert.message }}</span>
              <small>{{ c.source }} · {{ clock(c.alert.opened_at) }} a {{ clock(c.alert.closed_at ?? c.alert.opened_at) }}</small>
            </li>
          </ul>
        </details>
      </section>
    </div>
  </article>
</template>

<style scoped>
.equipment-insight {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-bottom: 22px;
  scroll-margin-top: calc(var(--app-top-offset, 0px) + 16px);
}

.ei-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding-bottom: 12px;
  border-bottom: var(--bw-strong) solid var(--line);
}

.ei-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: var(--brand-fish);
  background: var(--night);
}

.ei-title {
  flex: 1 1 260px;
  min-width: 0;
}

.ei-title h3 {
  font-size: 1.25rem;
  font-weight: var(--fw-heavy);
  line-height: 1.2;
}

.ei-title p {
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.ei-situation {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ei-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}

.ei-situation.is-online {
  color: var(--ok-ink);
}

.ei-situation.is-online .ei-dot {
  background: var(--nivel-ok);
}

.ei-situation.is-stale {
  color: var(--atencao-text);
}

.ei-situation.is-stale .ei-dot {
  background: var(--atencao-mark);
}

.ei-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ei-top {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 18px;
}

.ei-now {
  display: flex;
  align-self: start;
  align-items: flex-start;
  gap: 18px;
  padding: 18px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.ei-numbers {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-label {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.ei-label + .ei-rul {
  margin-bottom: 6px;
}

.ei-health-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.ei-health {
  font-size: 2.75rem;
  font-weight: var(--fw-heavy);
  line-height: 1;
}

.ei-rul {
  font-size: 1.5rem;
  font-weight: var(--fw-heavy);
}

.ei-verdict {
  font-weight: 700;
  line-height: 1.4;
}

.ei-model {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.ei-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  margin-bottom: 8px;
}

.ei-section-head h4 {
  font-size: 1rem;
  font-weight: var(--fw-heavy);
}

.ei-section-head small {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.ei-trend :deep(.chart-wrap),
.ei-trend .loading-state,
.ei-trend .error-state {
  height: 250px;
  min-height: 0;
}

.ei-rul-chart :deep(.chart-wrap) {
  height: 170px;
}

.ei-rul-chart :deep(.chart-empty) {
  min-height: 0;
}

.ei-bottom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.ei-vars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  padding: 0;
  list-style: none;
}

.ei-vars li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-left: 3px solid var(--nivel-ok);
  border-radius: 8px;
  background: var(--surface-2);
}

.ei-vars li.is-atencao {
  border-left-color: var(--atencao-mark);
}

.ei-vars li.is-critico {
  border-left-color: var(--nivel-critico);
}

.ei-vars small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

.ei-vars b {
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.ei-vars i {
  color: var(--muted);
  font-size: 0.75rem;
  font-style: normal;
}

.ei-vars :deep(.sparkline) {
  width: 100%;
  height: 24px;
}

.ei-advice,
.ei-alert-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding: 0;
  list-style: none;
}

.ei-advice li,
.ei-alert-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: var(--bw) solid var(--line);
  border-left: 4px solid var(--atencao-mark);
  border-radius: var(--radius-sm);
  background: var(--surface);
  line-height: 1.45;
}

.ei-advice li.is-critico,
.ei-alert-list li.is-critico {
  border-left-color: var(--nivel-critico);
}

.ei-alert-list {
  margin-top: 0;
}

.ei-alert-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 2px;
}

.ei-alert-head small {
  flex-basis: 100%;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.ei-calm {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  color: var(--ok-ink);
  font-weight: 700;
}

.ei-ahead {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--atencao-text);
  font-weight: 700;
  line-height: 1.45;
  background: var(--surface-2);
}

.ei-alerts .ei-calm {
  margin-top: 0;
}

.ei-note {
  margin-top: 10px;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.ei-closed {
  margin-top: 12px;
}

.ei-closed summary {
  color: var(--muted);
  font-weight: var(--fw-bold);
  cursor: pointer;
}

.ei-closed ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 0;
  list-style: none;
}

.ei-closed li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 0.875rem;
}

.ei-closed small {
  color: var(--muted);
  font-weight: 600;
}

@media (max-width: 1000px) {
  .ei-top,
  .ei-bottom {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 440px) {
  .ei-now {
    padding: 14px;
  }

  .ei-health {
    font-size: 2.25rem;
  }
}
</style>
