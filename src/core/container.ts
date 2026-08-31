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
 * Lightweight service container.
 * Manages service registration, retrieval, and lifecycle.
 */
export class Container {
  private services = new Map<string, unknown>();
  private lifecycles: { name: string; service: Lifecycle }[] = [];

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
    if (this.isLifecycle(service)) {
      this.lifecycles.push({ name, service });
    }
  }

  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not registered`);
    }
    return service as T;
  }

  has(name: string): boolean {
    return this.services.has(name);
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

  private isLifecycle(obj: unknown): obj is Lifecycle {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'start' in obj &&
      'stop' in obj &&
      typeof (obj as Lifecycle).start === 'function' &&
      typeof (obj as Lifecycle).stop === 'function'
    );
  }
}
