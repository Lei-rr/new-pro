<script setup lang="ts" generic="T extends Record<string, unknown>">
export interface Column<T> {
  key: keyof T & string;
  label: string;
  align?: 'left' | 'right' | 'center';
  format?: (row: T) => string | number;
}

defineProps<{
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T) => string | number;
}>();

function cellText(row: T, col: Column<T>): string | number {
  const v = row[col.key];
  if (col.format) return col.format(row);
  if (typeof v === 'string' || typeof v === 'number') return v;
  return v == null ? '—' : String(v);
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs">
      <thead>
        <tr class="border-b border-slate-200/80 bg-slate-50/50 text-slate-400 dark:border-slate-800/80 dark:bg-slate-950/40">
          <th
            v-for="col in columns"
            :key="col.key"
            class="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-3xs"
            :class="col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100/80 dark:divide-slate-800/60">
        <tr
          v-for="(row, i) in rows"
          :key="rowKey ? rowKey(row) : i"
          class="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-200"
            :class="col.align === 'right' ? 'text-right tabular-nums font-mono' : col.align === 'center' ? 'text-center' : ''"
          >
            {{ cellText(row, col) }}
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length" class="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
            暂无相关明细数据
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
