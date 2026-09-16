import { toast } from '@/shared/lib/toast'

/**
 * 通用 CSV 导出，自带 UTF-8 BOM 避免 Excel 中文乱码，自动释放 Blob 内存
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined | null)[][]
) {
  if (!rows || rows.length === 0) {
    toast.error('无可用数据导出')
    return
  }

  const formatCell = (val: string | number | undefined | null) => {
    if (val === null || val === undefined) return '""'
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  const csvHeader = headers.map(formatCell).join(',')
  const csvBody = rows.map((row) => row.map(formatCell).join(',')).join('\n')
  const csvContent = '\uFEFF' + csvHeader + '\n' + csvBody

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success(`已导出 CSV: ${a.download}`)
}
