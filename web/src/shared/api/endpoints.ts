import { http } from './http'
import type {
  DimensionAnalysisResult,
  DimensionType,
  LoginResult,
  OverviewMetrics,
  RealtimePulse,
  RiskReport,
  SessionInfo,
  TimeRangeKey,
} from './types'

export const authApi = {
  login: (username: string, password: string) =>
    http.post<LoginResult>('/api/auth/login', { username, password }, { skipUnauthorizedHandler: true }),
  session: () => http.get<SessionInfo>('/api/auth/session', { skipUnauthorizedHandler: true }),
  logout: () => http.post<{ message: string }>('/api/auth/logout', undefined, { skipUnauthorizedHandler: true }),
}

export const analyticsApi = {
  overview: (range: string) =>
    http.get<OverviewMetrics>(`/api/analytics/overview?range=${encodeURIComponent(range)}`),
  dimensions: (dimension: DimensionType, range: string, limit = 100) =>
    http.get<DimensionAnalysisResult>(
      `/api/analytics/dimensions?dimension=${dimension}&range=${encodeURIComponent(range)}&limit=${limit}`
    ),
  risks: (range: string) => http.get<RiskReport>(`/api/analytics/risks?range=${encodeURIComponent(range)}`),
  realtime: () => http.get<RealtimePulse>('/api/analytics/realtime', { timeoutMs: 6000 }),
}

export type { TimeRangeKey }
