// Twitch EventSub over WebSocket: the chat arrives as notifications. The socket handles Twitch's
// keepalive (silence means the connection is dead), reconnect requests and repeated messages.
// Docs: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/

export const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';
/** A reconnect goes only to Twitch's EventSub hosts. */
const EVENTSUB_HOST = 'eventsub.wss.twitch.tv';
/** Frames above this are not Twitch's (a chat notification is a few KiB) and are not parsed. */
const MAX_FRAME_BYTES = 256 * 1024;

/** Extra time on top of Twitch's keepalive before the connection counts as dead. */
const KEEPALIVE_MARGIN_MS = 5_000;
/** Message ids remembered to drop repeats. */
const SEEN_IDS = 500;

export interface EventSubHandlers {
  /** A new session: subscribe now (within 10 s). Not called after a reconnect: subscriptions move along. */
  onSession(sessionId: string): void;
  onNotification(type: string, event: unknown): void;
  /** Twitch revoked a subscription (token revoked, user banned, …). */
  onRevocation(type: string, status: string): void;
  /** The connection ended without a reconnect request; the caller decides when to connect again. */
  onClosed(reason: string): void;
}

interface Envelope {
  metadata?: { message_id?: string; message_type?: string; subscription_type?: string };
  payload?: {
    session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    subscription?: { type?: string; status?: string };
    event?: unknown;
  };
}

export class EventSubSocket {
  private socket: WebSocket | undefined;
  /** The old socket during a reconnect, until the new one says welcome. */
  private previous: WebSocket | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private keepaliveMs = 10_000 + KEEPALIVE_MARGIN_MS;
  private readonly seen: string[] = [];
  private closed = false;

  constructor(
    private readonly handlers: EventSubHandlers,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  connect(url = EVENTSUB_URL): void {
    this.closed = false;
    this.open(url, false);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.watchdog);
    for (const socket of [this.socket, this.previous]) socket?.close(1000);
    this.socket = undefined;
    this.previous = undefined;
  }

  private open(url: string, reconnect: boolean): void {
    const socket = new WebSocket(url);
    if (reconnect) this.previous = this.socket;
    this.socket = socket;
    // During a reconnect the old socket may still deliver notifications until the new one says welcome.
    socket.addEventListener('message', (event) => {
      if (this.closed || (socket !== this.socket && socket !== this.previous)) return;
      this.feed(typeof event.data === 'string' ? event.data : '', reconnect && socket === this.socket);
    });
    socket.addEventListener('close', (event) => {
      if (socket !== this.socket || this.closed) return;
      clearTimeout(this.watchdog);
      this.socket = undefined;
      this.handlers.onClosed(`closed (${event.code}${event.reason ? `: ${event.reason}` : ''})`);
    });
    socket.addEventListener('error', () => {
      // A 'close' follows; nothing else to do.
    });
    this.arm();
  }

  /** One message from Twitch. Public for tests. */
  feed(data: string, reconnect = false): void {
    if (data.length > MAX_FRAME_BYTES) return;
    let message: Envelope;
    try {
      message = JSON.parse(data) as Envelope;
    } catch {
      return;
    }
    this.arm();
    const id = message.metadata?.message_id;
    if (id) {
      if (this.seen.includes(id)) return;
      this.seen.push(id);
      if (this.seen.length > SEEN_IDS) this.seen.shift();
    }
    const payload = message.payload ?? {};
    switch (message.metadata?.message_type) {
      case 'session_welcome': {
        const seconds = payload.session?.keepalive_timeout_seconds;
        if (typeof seconds === 'number' && seconds > 0) this.keepaliveMs = seconds * 1000 + KEEPALIVE_MARGIN_MS;
        this.arm();
        if (reconnect) {
          this.previous?.close(1000);
          this.previous = undefined;
          this.log('EventSub reconnected');
        } else if (payload.session?.id) {
          this.handlers.onSession(payload.session.id);
        }
        break;
      }
      case 'session_keepalive':
        break;
      case 'notification':
        this.handlers.onNotification(text(payload.subscription?.type) || text(message.metadata?.subscription_type), payload.event);
        break;
      case 'session_reconnect': {
        const url = reconnectUrl(payload.session?.reconnect_url);
        if (url) {
          this.log('EventSub asked to reconnect');
          this.open(url, true);
        }
        break;
      }
      case 'revocation':
        this.handlers.onRevocation(text(payload.subscription?.type), text(payload.subscription?.status));
        break;
    }
  }

  /** No message within the keepalive time: the connection is dead. */
  private arm(): void {
    clearTimeout(this.watchdog);
    if (this.closed || !this.socket) return;
    this.watchdog = setTimeout(() => {
      const socket = this.socket;
      this.socket = undefined;
      socket?.close(4000);
      if (!this.closed) this.handlers.onClosed('keepalive timeout');
    }, this.keepaliveMs);
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The reconnect address, if it is a WebSocket address at Twitch's EventSub host. */
export function reconnectUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol === 'wss:' && (host === EVENTSUB_HOST || host.endsWith(`.${EVENTSUB_HOST}`))) return url.href;
  } catch {
    // Not an address.
  }
  return undefined;
}
