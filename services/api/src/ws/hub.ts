import type { WebSocket } from "ws";

/** Keeps track of open sockets per user so other code can push events to them. */
export class Hub {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  add(userId: string, socket: WebSocket): void {
    const set = this.sockets.get(userId) ?? new Set<WebSocket>();
    set.add(socket);
    this.sockets.set(userId, set);
    socket.on("close", () => this.remove(userId, socket));
  }

  private remove(userId: string, socket: WebSocket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
  }

  /** Number of open sockets for a user. */
  count(userId: string): number {
    return this.sockets.get(userId)?.size ?? 0;
  }

  /** Send an event to every open socket of a user. Returns how many received it. */
  send(userId: string, type: string, data: unknown): number {
    const set = this.sockets.get(userId);
    if (!set) return 0;
    const message = JSON.stringify({ type, data });
    let sent = 0;
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
        sent += 1;
      }
    }
    return sent;
  }
}
