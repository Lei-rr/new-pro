import { createLogger } from './logger.js';

/**
 * 生命周期：启动/停机编排。
 * 组件显式注册，start 顺序执行，stop 逆序执行（容错）。
 */
export interface Lifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class LifecycleManager {
  private items: Array<{ name: string; service: Lifecycle }> = [];

  register(name: string, service: unknown): void {
    if (isLifecycle(service)) {
      this.items.push({ name, service });
    }
  }

  async startAll(): Promise<void> {
    for (const item of this.items) {
      await item.service.start();
    }
  }

  async stopAll(): Promise<void> {
    const log = createLogger('lifecycle');
    for (const item of [...this.items].reverse()) {
      try {
        await item.service.stop();
      } catch (err) {
        log.error({ err, service: item.name }, 'Service stop failed');
      }
    }
  }
}

function isLifecycle(obj: unknown): obj is Lifecycle {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'start' in obj &&
    'stop' in obj &&
    typeof (obj as Lifecycle).start === 'function' &&
    typeof (obj as Lifecycle).stop === 'function'
  );
}
