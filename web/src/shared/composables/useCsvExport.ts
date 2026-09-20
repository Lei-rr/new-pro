import { toast } from '@/shared/lib/toast'

type CsvCell = string | number | undefined | null

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '""'
  return `"${String(value).replace(/"/g, '""')}"`
}

/** 导出 CSV（带 UTF-8 BOM，规避 Excel 中文乱码） */
export function exportToCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  if (rows.length === 0) {
    toast.error('无可用数据导出')
    return
  }

  const content = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  toast.success(`已导出 CSV: ${link.download}`)
}
