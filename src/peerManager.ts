import Peer, { DataConnection } from 'peerjs';
import { PeerMessage, PlayerId } from './types';

export const PEER_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export class PeerGameSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  public myPeerId: string = '';
  public isHost: boolean = false;
  public myPlayerId: PlayerId = 1;
  private onMessageCallback: ((msg: PeerMessage) => void) | null = null;
  private onStatusChangeCallback: ((status: string, connected: boolean) => void) | null = null;

  constructor() {}

  public initHost(
    onReady: (code: string) => void,
    onConnected: () => void,
    onMessage: (msg: PeerMessage) => void,
    onStatusChange: (status: string, connected: boolean) => void
  ) {
    this.destroy();
    this.isHost = true;
    this.myPlayerId = 1;
    this.onMessageCallback = onMessage;
    this.onStatusChangeCallback = onStatusChange;

    const shortCode = 'tank-' + Math.floor(1000 + Math.random() * 9000);
    this.myPeerId = shortCode;

    this.onStatusChangeCallback?.('در حال اتصال به سرور و ایجاد اتاق...', false);

    try {
      this.peer = new Peer(shortCode, {
        config: PEER_ICE_CONFIG,
      });

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        onReady(id);
        this.onStatusChangeCallback?.('اتاق ساخته شد! کد اتاق را برای حریف بفرستید.', false);
      });

      this.peer.on('connection', (connection) => {
        this.conn = connection;
        this.setupConnectionHandlers(onConnected);
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // If custom ID was unavailable, retry with random peer
          this.peer = new Peer({
            config: PEER_ICE_CONFIG,
          });
          this.peer.on('open', (id) => {
            this.myPeerId = id;
            onReady(id);
            this.onStatusChangeCallback?.('اتاق ساخته شد! در انتظار ورود حریف...', false);
          });
          this.peer.on('connection', (connection) => {
            this.conn = connection;
            this.setupConnectionHandlers(onConnected);
          });
        } else {
          this.onStatusChangeCallback?.(`خطای ارتباطی: ${err.message || err.type}`, false);
        }
      });
    } catch (e: any) {
      this.onStatusChangeCallback?.(`خطای اتصال: ${e.message}`, false);
    }
  }

  public joinRoom(
    hostCode: string,
    onConnected: () => void,
    onMessage: (msg: PeerMessage) => void,
    onStatusChange: (status: string, connected: boolean) => void
  ) {
    this.destroy();
    this.isHost = false;
    this.myPlayerId = 2;
    this.onMessageCallback = onMessage;
    this.onStatusChangeCallback = onStatusChange;

    this.onStatusChangeCallback?.('در حال اتصال به شبکه WebRTC...', false);

    try {
      this.peer = new Peer({
        config: PEER_ICE_CONFIG,
      });

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.onStatusChangeCallback?.(`در حال اتصال به اتاق ${hostCode}...`, false);
        const connection = this.peer!.connect(hostCode.trim().toLowerCase(), {
          reliable: true,
        });
        this.conn = connection;
        this.setupConnectionHandlers(onConnected);
      });

      this.peer.on('error', (err) => {
        this.onStatusChangeCallback?.(
          `خطای اتصال: ${err.type === 'peer-unavailable' ? 'اتاقی با این شناسه یافت نشد!' : err.message}`,
          false
        );
      });
    } catch (e: any) {
      this.onStatusChangeCallback?.(`خطا: ${e.message}`, false);
    }
  }

  private setupConnectionHandlers(onConnected: () => void) {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.onStatusChangeCallback?.('اتصال همتا برقرار شد! بازیکنان آماده چیدمان هستند.', true);
      onConnected();
      // Send handshake
      this.send({ type: 'INIT_ACK', payload: { player: this.myPlayerId } });
    });

    this.conn.on('data', (data: any) => {
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        this.onMessageCallback?.(msg);
      } catch (e) {
        console.error('Failed to parse peer message', e);
      }
    });

    this.conn.on('close', () => {
      this.onStatusChangeCallback?.('حریف از بازی خارج شد یا ارتباط قطع گردید.', false);
    });

    this.conn.on('error', (err) => {
      this.onStatusChangeCallback?.(`خطای ارتباطی با حریف: ${err}`, false);
    });
  }

  public send(msg: PeerMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  public destroy() {
    if (this.conn) {
      try {
        this.conn.close();
      } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
  }
}
