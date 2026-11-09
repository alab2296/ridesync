import type { WebSocket } from "ws";

/** Keeps track of who is connected, so other code can push an event to a user. */
export class Hub {
  private readonly sockets = new Map<string, Set<WebSocket>>();
  /** Sockets that answered the last ping. Anything missing here is presumed dead. */
  private readonly alive = new WeakSet<WebSocket>();
  private timer: NodeJS.Timeout | undefined;

  add(userId: string, socket: WebSocket): void {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socket);
    this.alive.add(socket);
    socket.on("pong", () => this.alive.add(socket));
    socket.once("close", () => this.remove(userId, socket));
  }

  private remove(userId: string, socket: WebSocket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
  }

  /** Ping every connection each interval; terminate those that never answered the previous ping. */
  startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.timer = setInterval(() => {
      for (const set of this.sockets.values()) {
        for (const socket of [...set]) {
          if (!this.alive.has(socket)) {
            socket.terminate();
            continue;
          }
          this.alive.delete(socket);
          socket.ping();
        }
      }
    }, intervalMs);
    this.timer.unref();
  }

  stopHeartbeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  connectionCount(userId: string): number {
    return this.sockets.get(userId)?.size ?? 0;
  }

  /** Send one JSON event to every open connection of a user. */
  sendTo(userId: string, event: Record<string, unknown>): void {
    const payload = JSON.stringify(event);
    for (const socket of this.sockets.get(userId) ?? []) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }
}
