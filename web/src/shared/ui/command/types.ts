import type { Component } from 'vue'

export interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: string
  icon: Component
  badge?: string
  action: () => void
}
