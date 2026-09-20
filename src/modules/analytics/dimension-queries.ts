import { buildTimeScope } from '../../shared/sql.js'
import type { TimeRangeFilter } from '../../core/time-range.js'
import type { DimensionType } from './types.js'

export interface DimensionQuery {
  sql: string
  params: unknown[]
}

interface DimensionTemplate {
  select: string
  group: string
  join: string
}

const TEMPLATES: Record<DimensionType, DimensionTemplate> = {
  group: {
    select: `COALESCE(NULLIF(l."group", ''), '默认分组(default)') AS entity_id,
             COALESCE(NULLIF(l."group", ''), 'default') AS entity_name`,
    group: `l."group"`,
    join: '',
  },
  user: {
    select: `COALESCE(NULLIF(l.username, ''), '未知用户') AS entity_id,
             COALESCE(NULLIF(l.username, ''), '未知用户') AS entity_name`,
    group: 'l.username',
    join: '',
  },
  channel: {
    select: `COALESCE(l.channel_id::text, '0') AS entity_id,
             COALESCE(c.name, '渠道 #' || COALESCE(l.channel_id::text, '未知')) AS entity_name`,
    group: 'l.channel_id, c.name',
    join: 'LEFT JOIN channels c ON l.channel_id = c.id',
  },
  ip: {
    select: `COALESCE(NULLIF(l.ip, ''), '未知IP') AS entity_id,
             COALESCE(NULLIF(l.ip, ''), '未知IP') AS entity_name`,
    group: 'l.ip',
    join: '',
  },
  model: {
    select: `COALESCE(NULLIF(l.model_name, ''), '未知模型') AS entity_id,
             COALESCE(NULLIF(l.model_name, ''), '未知模型') AS entity_name`,
    group: 'l.model_name',
    join: '',
  },
}

export function buildDimensionQuery(
  dimension: DimensionType,
  range: TimeRangeFilter,
  limit: number
): DimensionQuery {
  const template = TEMPLATES[dimension]
  const scope = buildTimeScope(range.startTime, range.endTime, 'l.created_at')

  const clauses = ['l.type IN (2, 5)']
  if (scope.and) clauses.push(scope.and.replace(/^AND /, ''))
  const params: unknown[] = [...scope.params, limit]

  return {
    sql: `
      SELECT
        ${template.select},
        count(*) AS total_requests,
        count(*) FILTER (WHERE l.type = 2) AS success_requests,
        count(*) FILTER (WHERE l.type = 5) AS failed_requests,
        COALESCE(sum(l.quota) FILTER (WHERE l.type = 2), 0) AS total_quota,
        COALESCE(sum(l.prompt_tokens) FILTER (WHERE l.type = 2), 0) AS prompt_tokens,
        COALESCE(sum(l.completion_tokens) FILTER (WHERE l.type = 2), 0) AS completion_tokens,
        COALESCE(round(avg(l.use_time * 1000) FILTER (WHERE l.use_time > 0)), 0) AS avg_latency,
        to_char(timezone('Asia/Shanghai', to_timestamp(min(l.created_at))), 'YYYY-MM-DD HH24:MI:SS') AS first_seen,
        to_char(timezone('Asia/Shanghai', to_timestamp(max(l.created_at))), 'YYYY-MM-DD HH24:MI:SS') AS last_seen
      FROM logs l
      ${template.join}
      WHERE ${clauses.join(' AND ')}
      GROUP BY ${template.group}
      ORDER BY total_requests DESC
      LIMIT $${params.length}
    `,
    params,
  }
}
