import { createLogger } from './logger.js';

const log = createLogger('container');

/**
 * Component lifecycle interface.
 * Any service that needs startup/shutdown logic implements this.
 */
export interface Lifecycle {
  /** Called during application bootstrap, in dependency order */
  start(): Promise<void>;
  /** Called during graceful shutdown, in reverse order */
  stop(): Promise<void>;
}

/**
 * Lightweight service lifecycle manager.
 * Services are registered at bootstrap; started in order, stopped in reverse.
 */
export class Container {
  private lifecycles: { name: string; service: Lifecycle }[] = [];

  register(name: string, service: unknown): void {
    if (isLifecycle(service)) {
      this.lifecycles.push({ name, service });
    }
  }

  async startAll(): Promise<void> {
    for (const item of this.lifecycles) {
      await item.service.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const item of [...this.lifecycles].reverse()) {
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
