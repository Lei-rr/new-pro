const STATUS_PATTERN = /(?:status_code=|statusCode=)(\d{3})/
const KNOWN_STATUS = ['400', '401', '403', '404', '408', '429', '500', '502', '503', '504']

/** 从 NewAPI 失败日志正文中提取网关错误码，无匹配返回 undefined */
export function parseGatewayErrorCode(content: string): string | undefined {
  if (!content) return undefined

  const matched = content.match(STATUS_PATTERN)
  if (matched) return matched[1]

  for (const code of KNOWN_STATUS) {
    if (content.includes(code)) return code
  }
  return 'ERR'
}
