import EventEmitter from 'eventemitter3';
import type { AppEvents } from '../types/events.js';

/**
 * Type-safe event bus using eventemitter3.
 * All event names and payloads defined in AppEvents interface.
 */
export class EventBus extends EventEmitter<AppEvents> {
  private static _instance: EventBus | null = null;

  static getInstance(): EventBus {
    if (!EventBus._instance) {
      EventBus._instance = new EventBus();
    }
    return EventBus._instance;
  }

  /** Reset singleton (for testing) */
  static reset(): void {
    if (EventBus._instance) {
      EventBus._instance.removeAllListeners();
      EventBus._instance = null;
    }
  }
}
