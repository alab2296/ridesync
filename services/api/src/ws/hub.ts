import type { WebSocket } from "ws";

/** Keeps track of who is connected, so other code can push an event to a user. */
export class Hub {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  add(userId: string, socket: WebSocket): void {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socket);
    socket.once("close", () => this.remove(userId, socket));
  }

  private remove(userId: string, socket: WebSocket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
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
