/**
 * Modo simulado (mock): login e dados ao vivo gerados no próprio navegador.
 *
 * Existe para a interface andar antes do backend ter as rotas novas. Enquanto
 * a BACK-03 (login) e a BACK-04 (WebSocket com ticket) não existirem, deixe
 * ligado. Quando elas estiverem no ar, ponha `VITE_MOCK=false` no `.env` do
 * frontend e a casca passa a falar com a API de verdade, sem mudar mais nada.
 *
 * Sem a variável, o padrão é ligado.
 */
export const MOCK = import.meta.env.VITE_MOCK !== 'false'

function envUrl(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

/**
 * Interfaces de administração da página Ferramentas (WEB-04). O compose
 * publica todas só em 127.0.0.1 (PLAT-08): os links abrem na máquina que roda
 * a demo, e em nenhuma outra. Porta diferente no compose? Mude no `.env`.
 */
export const TOOL_URLS = {
  influxdb: envUrl(import.meta.env.VITE_INFLUXDB_URL, 'http://127.0.0.1:8086'),
  rabbitmq: envUrl(import.meta.env.VITE_RABBITMQ_URL, 'http://127.0.0.1:15672'),
  pgadmin: envUrl(import.meta.env.VITE_PGADMIN_URL, 'http://127.0.0.1:5050'),
}
