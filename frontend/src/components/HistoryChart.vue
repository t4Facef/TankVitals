<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Line } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import type { HistoryPoint, MetricThreshold } from '../types'
import { UI_ICON } from '../icons'
import { usePreferences } from '../composables/usePreferences'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
)

// Uma variável qualquer do cadastro: quem chama passa os pontos, o nome, a
// unidade e a faixa. O gráfico não sabe de nenhuma grandeza fixa.
const props = defineProps<{
  points: HistoryPoint[]
  label: string
  unit: string
  threshold?: MetricThreshold | null
  range: string
  /** Eixo fixo, para grandezas com escala própria (a saúde vai de 0 a 100 %). */
  yMin?: number
  yMax?: number
}>()

// Lidos do CSS na hora de desenhar, e lidos de novo quando o contraste muda:
// os tokens são outros em cada modo.
const preferences = usePreferences()
const palette = computed(() => {
  void preferences.contrast
  const css = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    serie: token('--serie-1', '#2a7299'),
    limite: token('--ideal-line', '#4b9568'),
    faixa: token('--ideal-wash', '#e3f2e8'),
    grade: token('--line-soft', '#e7e1d5'),
    texto: token('--muted', '#576c7c'),
    noite: token('--night', '#163d5a'),
    fonte: token('--font', 'sans-serif'),
  }
})

const labels = computed(() => props.points.map((point) => new Date(point.t)))

// Linhas tracejadas da faixa segura, com os limites vindos da API.
const safeMin = computed(() => props.threshold?.ok_min ?? undefined)
const safeMax = computed(() => props.threshold?.ok_max ?? undefined)

const chartData = computed<ChartData<'line', number[], Date>>(() => {
  const points = props.points
  const datasets: ChartData<'line', number[], Date>['datasets'] = [
    {
      label: props.label,
      data: points.map((point) => point.v),
      // Linha grossa e sem área embaixo: no projetor, área clara some e
      // linha fina falha.
      borderWidth: 2.8,
      borderColor: palette.value.serie,
      backgroundColor: palette.value.serie,
      pointRadius: points.length > 120 ? 0 : 2,
      pointHoverRadius: 5,
      tension: 0.25,
      fill: false,
    },
  ]

  if (safeMin.value !== undefined) {
    datasets.push({
      label: 'Limite mínimo',
      data: points.map(() => safeMin.value as number),
      borderWidth: 2,
      borderDash: [7, 6],
      borderColor: palette.value.limite,
      pointRadius: 0,
      fill: false,
    })
  }

  if (safeMax.value !== undefined) {
    // Com os dois limites, o espaço entre eles fica sombreado: é a faixa ideal.
    const temMinimo = safeMin.value !== undefined
    datasets.push({
      label: 'Limite máximo',
      data: points.map(() => safeMax.value as number),
      borderWidth: 2,
      borderDash: [7, 6],
      borderColor: palette.value.limite,
      backgroundColor: palette.value.faixa,
      pointRadius: 0,
      fill: temMinimo ? '-1' : false,
    })
  }

  return {
    labels: labels.value,
    datasets,
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 250,
  },
  interaction: {
    intersect: false,
    mode: 'index',
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: palette.value.noite,
      cornerRadius: 8,
      padding: 10,
      titleFont: { family: palette.value.fonte, weight: 800 },
      bodyFont: { family: palette.value.fonte, weight: 600 },
      callbacks: {
        label: (context) => {
          const value = context.parsed.y
          if (value === null) return ''
          return `${context.dataset.label}: ${value.toLocaleString('pt-BR')} ${props.unit}`
        },
      },
    },
  },
  scales: {
    x: {
      type: 'time',
      time: {
        unit: props.range === '7d' ? 'day' : props.range === '24h' ? 'hour' : 'minute',
        displayFormats: {
          minute: 'HH:mm',
          hour: props.range === '7d' ? 'dd/MM' : 'HH:mm',
          day: 'dd/MM',
        },
      },
      grid: {
        display: false,
      },
      ticks: {
        maxTicksLimit: 8,
        color: palette.value.texto,
        font: { family: palette.value.fonte, size: 12, weight: 700 },
      },
    },
    y: {
      beginAtZero: false,
      min: props.yMin,
      max: props.yMax,
      grid: {
        color: palette.value.grade,
      },
      ticks: {
        color: palette.value.texto,
        font: { family: palette.value.fonte, size: 12, weight: 700 },
        callback: (value) => `${Number(value).toLocaleString('pt-BR')} ${props.unit}`,
      },
    },
  },
}))
</script>

<template>
  <div class="chart-wrap">
    <div v-if="points.length === 0" class="chart-empty">
      <div class="empty-icon"><component :is="UI_ICON.semDado" :size="24" aria-hidden="true" /></div>
      <strong>Sem dados no período</strong>
      <span>Assim que houver leituras, elas aparecerão neste gráfico.</span>
    </div>

    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>
