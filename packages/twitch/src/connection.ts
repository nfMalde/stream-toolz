// The connection to Twitch: the streamer's own app (registered as "Public", so only a Client ID, no secret),
// the login by code (device code flow), the tokens (validated every hour, refreshed before they expire) and the
// EventSub session. It subscribes to what the modules that are on read (features.ts): the chat (its notices bring
// subs, gifted subs and raids) and the follows. A feature the login has no permission for waits for a new login; the
// others keep running. Reconnects by itself after network trouble; a revoked or invalid login ends in 'logged-out'.

import { EventEmitter } from 'node:events';
import type { TwitchAccount, TwitchAppInput, TwitchError, TwitchStage, TwitchStatus } from './api';
import { eventFromFollow, eventFromNotification, type ChannelEvent } from './events';
import { chatMessageFromEvent, type ChatMessage } from './message';
import { EventSubSocket } from './eventsub';
import { FEATURE_SCOPES, scopesFor, TWITCH_FEATURES, type FeatureState, type TwitchFeature } from './features';
import { getCustomRewards, getUsers, sendChatMessage, subscribe, type HelixAuth } from './helix';
import { redemptionFromEvent, type CustomReward, type Redemption } from './redemption';
import {
  CLIENT_ID,
  refreshTokens,
  revokeToken,
  startDeviceLogin,
  TwitchHttpError,
  validateToken,
  waitForDeviceLogin,
  type DeviceLogin,
  type TokenInfo,
  type TwitchTokens,
} from './oauth';

/** What is kept (encrypted) between starts. */
export interface StoredTwitch {
  clientId?: string;
  tokens?: TwitchTokens;
  user?: TwitchAccount;
}

export interface TwitchStore {
  load(): StoredTwitch;
  save(value: StoredTwitch): void;
}

export interface TwitchConnectionOptions {
  store: TwitchStore;
  /** Login name of the channel to read; '' = the account's own channel. */
  channel: () => string;
  /** What the modules that are on read: the login asks for these permissions only. */
  features: () => readonly TwitchFeature[];
  openBrowser: (url: string) => void;
  log: (line: string) => void;
}

export type TwitchEvents = {
  status: [TwitchStatus];
  message: [ChatMessage];
  /** A moderator deleted one message (its id). */
  deleted: [string];
  /** A user's messages were removed (timeout, ban; their user id). */
  userCleared: [string];
  /** The whole chat was cleared. */
  chatCleared: [];
  /** A follow, sub, gifted sub or raid. */
  event: [ChannelEvent];
  /** A channel points reward was redeemed. */
  redemption: [Redemption];
};

/** Waits between reconnect attempts after network trouble. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
/** Twitch asks apps to validate their token every hour. */
const VALIDATE_EVERY_MS = 60 * 60_000;
/** Tokens are refreshed when they expire within this time. */
const REFRESH_BEFORE_MS = 10 * 60_000;
/** The feature 'chat': messages, notices (subs, gifted subs, raids) and moderation. */
const CHAT_SUBSCRIPTIONS = ['channel.chat.message', 'channel.chat.notification', 'channel.chat.message_delete', 'channel.chat.clear_user_messages', 'channel.chat.clear'];

export class TwitchFailure extends Error {
  constructor(
    readonly code: TwitchError,
    message = '',
    /** Worth trying again by itself (network trouble, Twitch busy). */
    readonly retry = false,
  ) {
    super(message || code);
  }
}

function toFailure(err: unknown): TwitchFailure {
  if (err instanceof TwitchFailure) return err;
  if (err instanceof TwitchHttpError) {
    if (err.message.toLowerCase().includes('invalid client')) return new TwitchFailure('invalid-client', err.message);
    // 401 from the API: the token expired in between; a new attempt validates and refreshes it.
    if (err.status === 401 || err.status === 429 || err.status >= 500) return new TwitchFailure('network', err.message, true);
    return new TwitchFailure('unknown', err.message);
  }
  // fetch() failed: offline, DNS, timeout.
  return new TwitchFailure('network', err instanceof Error ? err.message : String(err), true);
}

export class TwitchConnection extends EventEmitter<TwitchEvents> {
  private data: StoredTwitch;
  private stage: TwitchStage;
  /** The connection's own stage, kept while a new login runs in the browser. */
  private connectionStage: TwitchStage = 'connecting';
  private error: TwitchError | undefined;
  private errorMessage: string | undefined;
  private channel: TwitchAccount | undefined;
  private featureStates: Partial<Record<TwitchFeature, FeatureState>> = {};
  private socket: EventSubSocket | undefined;
  /** The login running in the browser: its code, and the wait for the streamer's confirmation. */
  private pendingLogin: { login: DeviceLogin; controller: AbortController } | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private validateTimer: ReturnType<typeof setInterval> | undefined;
  private refreshing: Promise<TwitchTokens> | undefined;
  private attempts = 0;
  /** Raised on every connect and disconnect: results of older attempts are ignored. */
  private generation = 0;

  constructor(private readonly options: TwitchConnectionOptions) {
    super();
    // Only what this version keeps: an older file may still hold a client secret, which is dropped.
    const stored = options.store.load() as StoredTwitch & { clientSecret?: string };
    this.data = { clientId: stored.clientId, tokens: stored.tokens, user: stored.user };
    if (stored.clientSecret !== undefined) options.store.save(this.data);
    this.stage = this.restingStage();
  }

  get status(): TwitchStatus {
    const pending = this.pendingLogin?.login;
    return {
      stage: this.stage,
      hasApp: this.hasApp,
      clientIdHint: this.data.clientId ? this.data.clientId.slice(-4) : undefined,
      user: this.data.user,
      channel: this.channel,
      login: pending && { userCode: pending.userCode, verificationUri: pending.verificationUri, expiresAt: pending.expiresAt },
      error: this.error,
      message: this.errorMessage,
      asks: this.loginFeatures(),
      features: this.stage === 'connected' ? { ...this.featureStates } : undefined,
    };
  }

  /** The logged-in account (its own messages may be left out). */
  get ownUserId(): string | undefined {
    return this.data.user?.id;
  }

  private get hasApp(): boolean {
    return !!this.data.clientId;
  }

  private get clientId(): string {
    if (!this.data.clientId) throw new TwitchFailure('invalid-client');
    return this.data.clientId;
  }

  /** What a login asks for: the features of the modules that are on; with none on, the chat (Twitch wants one). */
  private loginFeatures(): TwitchFeature[] {
    const features = TWITCH_FEATURES.filter((feature) => this.options.features().includes(feature));
    return features.length ? features : ['chat'];
  }

  private scopes(): string[] {
    return scopesFor(this.loginFeatures());
  }

  start(): void {
    if (this.hasApp && this.data.tokens) void this.connect();
    else this.setStage(this.restingStage());
  }

  stop(): void {
    this.generation++;
    this.closeSocket();
    this.clearLogin();
    clearTimeout(this.reconnectTimer);
    clearInterval(this.validateTimer);
  }

  /** Connects again: the channel changed, or the modules that are on (and so the subscriptions they need). */
  reconnect(): void {
    if (this.hasApp && this.data.tokens) void this.connect();
  }

  /**
   * Stores the Client ID after Twitch confirmed it: a login code is requested and not used (it simply expires),
   * so an unknown ID is reported right away. A different app drops the old login.
   */
  async saveApp(input: TwitchAppInput): Promise<void> {
    const clientId = input.clientId.trim();
    if (!CLIENT_ID.test(clientId)) throw new TwitchFailure('invalid-client');
    try {
      await startDeviceLogin(clientId, this.scopes());
    } catch (err) {
      throw toFailure(err);
    }
    const sameApp = clientId === this.data.clientId;
    if (!sameApp) this.clearLogin();
    if (!sameApp) await this.logout();
    this.update({ clientId });
    this.options.log(`TWITCH    app saved (…${clientId.slice(-4)})`);
    if (!sameApp || !this.data.tokens) this.setStage('logged-out');
    else this.setStage(this.stage);
  }

  /** Forgets the app, the login and its tokens. */
  async removeApp(): Promise<void> {
    this.clearLogin();
    await this.logout();
    this.data = {};
    this.options.store.save(this.data);
    this.options.log('TWITCH    app removed');
    this.setStage('no-app');
  }

  /**
   * Starts the login: Twitch gives a code, its page (code filled in) opens in the browser, and the app waits until
   * the streamer confirmed it there. The status shows the code meanwhile.
   */
  async beginLogin(): Promise<void> {
    const clientId = this.clientId;
    this.clearLogin();
    let login: DeviceLogin;
    try {
      login = await startDeviceLogin(clientId, this.scopes());
    } catch (err) {
      const failure = toFailure(err);
      this.setStage(this.restingStage(), failure.code, failure.message);
      return;
    }
    const controller = new AbortController();
    this.pendingLogin = { login, controller };
    this.setStage('logging-in');
    this.options.openBrowser(login.verificationUri);
    const result = await waitForDeviceLogin(clientId, login, controller.signal);
    if (this.pendingLogin?.controller !== controller) return;
    this.pendingLogin = undefined;
    if ('tokens' in result) {
      this.update({ tokens: result.tokens, user: undefined });
      this.options.log('TWITCH    logged in');
      void this.connect();
      return;
    }
    if (result.error === 'cancelled') return;
    const error: TwitchError = result.error === 'expired' ? 'login-timeout' : result.error === 'invalid-client' ? 'invalid-client' : 'login-denied';
    this.options.log(`TWITCH    login ended: ${result.error}`);
    this.setStage(this.restingStage(), error);
  }

  /** Opens Twitch's page for the running login again. */
  reopenLogin(): void {
    const login = this.pendingLogin?.login;
    if (login) this.options.openBrowser(login.verificationUri);
  }

  cancelLogin(): void {
    if (!this.pendingLogin) return;
    this.clearLogin();
    this.setStage(this.restingStage());
  }

  /** Logs out: the access token is revoked at Twitch (if possible) and the tokens are forgotten. */
  async logout(): Promise<void> {
    this.generation++;
    this.clearLogin();
    this.closeSocket();
    clearTimeout(this.reconnectTimer);
    clearInterval(this.validateTimer);
    const token = this.data.tokens?.accessToken;
    if (token && this.data.clientId) await revokeToken(this.data.clientId, token).catch(() => undefined);
    if (this.data.tokens || this.data.user) this.update({ tokens: undefined, user: undefined });
    this.channel = undefined;
    this.setStage(this.restingStage());
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    this.closeSocket();
    clearTimeout(this.reconnectTimer);
    clearInterval(this.validateTimer);
    this.setStage('connecting');
    try {
      const info = await this.validated();
      if (generation !== this.generation) return;
      const [me] = await getUsers(this.auth(), { ids: [info.userId] });
      const user = me ?? { id: info.userId, login: info.login, name: info.login };
      this.update({ user });
      const wanted = this.options.channel();
      const channel = wanted && wanted !== user.login ? (await getUsers(this.auth(), { logins: [wanted] }))[0] : user;
      if (generation !== this.generation) return;
      if (!channel) throw new TwitchFailure('channel-unknown', wanted);
      this.channel = channel;
      this.subscribeFeatures(generation, user, channel, info.scopes);
      this.scheduleValidation(generation);
    } catch (err) {
      this.fail(err, generation);
    }
  }

  /**
   * The features the modules that are on read and the login has the permission for get their subscriptions; the
   * others wait for a new login ('needs-login'). Without any, no socket is opened (Twitch closes an unused one).
   */
  private subscribeFeatures(generation: number, user: TwitchAccount, channel: TwitchAccount, scopes: string[]): void {
    const wanted = this.options.features();
    const allowed = wanted.filter((feature) => scopes.includes(FEATURE_SCOPES[feature]));
    this.featureStates = Object.fromEntries(wanted.map((feature) => [feature, allowed.includes(feature) ? 'active' : 'needs-login']));
    if (allowed.length) this.openSocket(generation, user, channel, allowed);
    else this.connected(channel);
  }

  private connected(channel: TwitchAccount): void {
    this.attempts = 0;
    const features = Object.entries(this.featureStates).map(([feature, state]) => `${feature} ${state}`);
    this.options.log(`TWITCH    connected to ${channel.login} (${features.join(', ') || 'no module reads Twitch'})`);
    this.setStage('connected');
  }

  private openSocket(generation: number, user: TwitchAccount, channel: TwitchAccount, features: TwitchFeature[]): void {
    this.socket = new EventSubSocket(
      {
        onSession: (sessionId) => {
          void (async () => {
            try {
              const condition = { broadcaster_user_id: channel.id, user_id: user.id };
              for (const type of features.includes('chat') ? CHAT_SUBSCRIPTIONS : []) {
                try {
                  await subscribe(this.auth(), type, condition, sessionId);
                } catch (err) {
                  // 409: already subscribed (a repeated welcome); anything else ends the attempt.
                  if (!(err instanceof TwitchHttpError && err.status === 409)) throw err;
                }
              }
              if (generation !== this.generation) return;
              if (features.includes('follows')) {
                const follows = await this.subscribeFollows(user, channel, sessionId);
                this.featureStates = { ...this.featureStates, follows };
              }
              if (generation !== this.generation) return;
              if (features.includes('redemptions')) {
                const redemptions = await this.subscribeRedemptions(user, channel, sessionId);
                this.featureStates = { ...this.featureStates, redemptions };
              }
              if (generation !== this.generation) return;
              this.connected(channel);
            } catch (err) {
              const failure = err instanceof TwitchHttpError && (err.status === 400 || err.status === 403) ? new TwitchFailure('subscription-failed', err.message) : err;
              this.fail(failure, generation);
            }
          })();
        },
        onNotification: (type, event) => this.notification(type, event),
        onRevocation: (type, status) => {
          this.options.log(`TWITCH    subscription ${type} revoked: ${status}`);
          // E.g. the account is no longer a moderator of the channel: the chat goes on without follows.
          if (type === 'channel.follow' && generation === this.generation) {
            this.featureStates = { ...this.featureStates, follows: 'unavailable' };
            this.emit('status', this.status);
          }
          if (type !== 'channel.chat.message') return;
          this.fail(status === 'authorization_revoked' ? new TwitchFailure('token-invalid', status) : new TwitchFailure('subscription-failed', status), generation);
        },
        onClosed: (reason) => {
          if (generation !== this.generation) return;
          this.options.log(`TWITCH    connection ${reason}`);
          this.socket = undefined;
          this.setStage('connecting');
          this.scheduleReconnect();
        },
      },
      this.options.log,
    );
    this.socket.connect();
  }

  /**
   * Follows need the follower permission and, for another channel, a moderator account: without them the chat
   * still runs, the status says why there are no follows.
   */
  private async subscribeFollows(user: TwitchAccount, channel: TwitchAccount, sessionId: string): Promise<FeatureState> {
    try {
      await subscribe(this.auth(), 'channel.follow', { broadcaster_user_id: channel.id, moderator_user_id: user.id }, sessionId, '2');
      return 'active';
    } catch (err) {
      if (err instanceof TwitchHttpError && err.status === 409) return 'active';
      this.options.log(`TWITCH    no follows: ${(err as Error).message}`);
      if (err instanceof TwitchHttpError && (err.status === 400 || err.status === 403)) return 'unavailable';
      throw err;
    }
  }

  /** Redemptions are the broadcaster's own: reading another channel gets 'unavailable', the rest goes on. */
  private async subscribeRedemptions(user: TwitchAccount, channel: TwitchAccount, sessionId: string): Promise<FeatureState> {
    if (user.id !== channel.id) return 'unavailable';
    try {
      await subscribe(this.auth(), 'channel.channel_points_custom_reward_redemption.add', { broadcaster_user_id: channel.id }, sessionId);
      return 'active';
    } catch (err) {
      if (err instanceof TwitchHttpError && err.status === 409) return 'active';
      this.options.log(`TWITCH    no redemptions: ${(err as Error).message}`);
      if (err instanceof TwitchHttpError && (err.status === 400 || err.status === 403)) return 'unavailable';
      throw err;
    }
  }

  /** The channel's custom rewards, for a module to pick from (needs the redemptions permission). */
  async customRewards(): Promise<CustomReward[]> {
    if (!this.channel) throw new TwitchFailure('channel-unknown');
    return getCustomRewards(this.auth(), this.channel.id);
  }

  /** A chat message in the channel as the logged-in account (needs the chatWrite permission). */
  async sendMessage(text: string, replyTo?: string): Promise<void> {
    const user = this.status.user;
    if (!this.channel || !user) throw new TwitchFailure('channel-unknown');
    await sendChatMessage(this.auth(), this.channel.id, user.id, text, replyTo);
  }

  private notification(type: string, event: unknown): void {
    const e = event && typeof event === 'object' ? (event as Record<string, unknown>) : {};
    switch (type) {
      case 'channel.chat.message': {
        const message = chatMessageFromEvent(event);
        if (message) this.emit('message', message);
        break;
      }
      case 'channel.chat.notification': {
        const channelEvent = eventFromNotification(event);
        if (channelEvent) this.emit('event', channelEvent);
        break;
      }
      case 'channel.follow': {
        const follow = eventFromFollow(event);
        if (follow) this.emit('event', follow);
        break;
      }
      case 'channel.chat.message_delete':
        if (typeof e.message_id === 'string') this.emit('deleted', e.message_id);
        break;
      case 'channel.chat.clear_user_messages':
        if (typeof e.target_user_id === 'string') this.emit('userCleared', e.target_user_id);
        break;
      case 'channel.chat.clear':
        this.emit('chatCleared');
        break;
      case 'channel.channel_points_custom_reward_redemption.add': {
        const redemption = redemptionFromEvent(event);
        if (redemption) this.emit('redemption', redemption);
        break;
      }
    }
  }

  private fail(err: unknown, generation: number): void {
    if (generation !== this.generation) return;
    const failure = toFailure(err);
    this.options.log(`TWITCH    ${failure.code}: ${failure.message}`);
    this.closeSocket();
    if (failure.code === 'token-invalid') {
      // The login is gone (revoked, password changed, app changed): a new login is needed. (A missing permission
      // is no reason: that feature waits for a new login, the others keep running.)
      clearInterval(this.validateTimer);
      this.update({ tokens: undefined });
      this.channel = undefined;
      this.setStage('logged-out', failure.code, failure.message);
      return;
    }
    this.setStage('error', failure.code, failure.message);
    if (failure.retry) this.scheduleReconnect();
  }

  /** A valid token: refreshed when it expires soon or Twitch no longer accepts it. */
  private async validated(): Promise<TokenInfo> {
    let tokens = this.data.tokens;
    if (!tokens) throw new TwitchFailure('token-invalid');
    if (tokens.expiresAt - Date.now() < REFRESH_BEFORE_MS) tokens = await this.refresh(tokens);
    let info = await validateToken(tokens.accessToken);
    if (!info) info = await validateToken((await this.refresh(tokens)).accessToken);
    if (!info || (info.clientId && info.clientId !== this.data.clientId)) throw new TwitchFailure('token-invalid');
    return info;
  }

  /**
   * One refresh at a time: a refresh token works once, so two refreshes side by side (the hourly check next to
   * a reconnect) would log the streamer out. A second caller waits for the running one.
   */
  private refresh(tokens: TwitchTokens): Promise<TwitchTokens> {
    this.refreshing ??= this.refreshOnce(tokens).finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private async refreshOnce(tokens: TwitchTokens): Promise<TwitchTokens> {
    const clientId = this.clientId;
    // The stored tokens may be newer than the caller's (an earlier refresh).
    const current = this.data.tokens ?? tokens;
    let fresh: TwitchTokens;
    try {
      fresh = await refreshTokens(clientId, current.refreshToken);
    } catch (err) {
      // 400/401: the refresh token is used up or revoked. Anything else (429, 5xx, network) is tried again later.
      if (err instanceof TwitchHttpError && (err.status === 400 || err.status === 401)) throw new TwitchFailure('token-invalid', err.message);
      throw err;
    }
    if (!this.data.tokens || this.data.clientId !== clientId) {
      // Logged out (or the app changed) meanwhile: the new tokens must not bring the login back.
      await revokeToken(clientId, fresh.accessToken).catch(() => undefined);
      throw new TwitchFailure('token-invalid', 'logged out during refresh');
    }
    this.update({ tokens: fresh });
    return fresh;
  }

  private scheduleValidation(generation: number): void {
    clearInterval(this.validateTimer);
    this.validateTimer = setInterval(() => {
      this.validated().catch((err: unknown) => {
        // Network trouble here is not fatal: the chat keeps running, the next check tries again.
        const failure = toFailure(err);
        if (!failure.retry) this.fail(failure, generation);
      });
    }, VALIDATE_EVERY_MS);
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)]!;
    this.attempts++;
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }

  private auth(): HelixAuth {
    if (!this.data.tokens) throw new TwitchFailure('token-invalid');
    return { clientId: this.clientId, accessToken: this.data.tokens.accessToken };
  }

  private closeSocket(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private clearLogin(): void {
    this.pendingLogin?.controller.abort();
    this.pendingLogin = undefined;
  }

  private update(change: Partial<StoredTwitch>): void {
    this.data = { ...this.data, ...change };
    this.options.store.save(this.data);
  }

  /** Without a login in progress: no app, logged out, or how the connection was last. */
  private restingStage(): TwitchStage {
    if (!this.hasApp) return 'no-app';
    return this.data.tokens ? this.connectionStage : 'logged-out';
  }

  private setStage(stage: TwitchStage, error?: TwitchError, message?: string): void {
    if (stage === 'connecting' || stage === 'connected' || stage === 'error') this.connectionStage = stage;
    this.stage = stage;
    this.error = error;
    this.errorMessage = message;
    this.emit('status', this.status);
  }
}
