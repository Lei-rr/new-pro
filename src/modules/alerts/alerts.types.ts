/** 共享告警类型（模块私有） */
export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}
