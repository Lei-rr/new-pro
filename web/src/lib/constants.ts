import type { Component } from 'vue';
import {
  LayoutDashboard,
  ScrollText,
  Boxes,
  CircleDollarSign,
  Bell,
  type LucideIcon,
} from '@lucide/vue';

/** 图表专用色板（亮/暗两套），与 shadcn zinc token 分离，保证图表对比度 */
export const CHART_COLORS = {
  light: ['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7'],
  dark: ['#a1a1aa', '#71717a', '#d4d4d8', '#52525b', '#e4e4e7', '#3f3f46'],
} as const;

export const SEMANTIC = {
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  info: '#3b82f6',
} as const;

export const SEVERITY_COLOR: Record<string, string> = {
  critical: SEMANTIC.error,
  warning: SEMANTIC.warning,
  info: SEMANTIC.info,
} as const;

/** 时间范围预设：按自然日（今天/昨天/近N天），统一按日对齐 */
export const TIME_RANGES = [
  { label: '今天', days: 1 },
  { label: '近 3 天', days: 3 },
  { label: '近 7 天', days: 7 },
  { label: '近 30 天', days: 30 },
] as const;

export type TimeRangeDays = (typeof TIME_RANGES)[number]['days'];

export interface NavItem {
  title: string;
  to: string;
  icon: Component | LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { title: '总览', to: '/', icon: LayoutDashboard },
  { title: '实时日志', to: '/logs', icon: ScrollText },
  { title: '维度分析', to: '/dimensions', icon: Boxes },
  { title: '成本分析', to: '/cost', icon: CircleDollarSign },
  { title: '告警中心', to: '/alerts', icon: Bell },
];

export const PAGE_SIZE = 20;
