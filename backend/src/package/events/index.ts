/**
 * Tiny in-process event bus. Modules publish what happened; packages that
 * care subscribe at boot. Publishers never know who is listening, which is
 * what lets a listener move out to its own service later without touching
 * the publisher.
 */
export interface AppEvents {
  "order.placed": { orderId: string };
  "order.paid": { orderId: string };
  "order.status": {
    orderId: string;
    status: "CONFIRMED" | "PACKED" | "SHIPPED" | "DELIVERED";
  };
  "order.cancelled": { orderId: string };
}

type EventName = keyof AppEvents;
type Handler<K extends EventName> = (payload: AppEvents[K]) => Promise<void> | void;

const handlers = new Map<EventName, Handler<EventName>[]>();

export function on<K extends EventName>(event: K, handler: Handler<K>): void {
  const list = handlers.get(event) ?? [];
  list.push(handler as Handler<EventName>);
  handlers.set(event, list);
}

/** Fire-and-forget: a failing handler is logged, never surfaced to the publisher. */
export function emit<K extends EventName>(event: K, payload: AppEvents[K]): void {
  for (const handler of handlers.get(event) ?? []) {
    Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => console.error(`Event handler failed (${event}):`, err));
  }
}
