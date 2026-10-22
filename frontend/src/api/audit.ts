import { MOCK } from '../config'
import type { AuditPage, AuditQuery } from '../domain/audit'
import { mockGetAudit } from '../mock/api'
import { request } from './http'

/** A auditoria, paginada e filtrada por tipo e usuário (BACK-06, só admin). */
export function getAudit(query: AuditQuery): Promise<AuditPage> {
  if (MOCK) return mockGetAudit(query)
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) })
  if (query.type) params.set('type', query.type)
  if (query.user) params.set('user', query.user)
  return request<AuditPage>(`/api/audit?${params.toString()}`)
}
