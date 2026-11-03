/* Online play between two devices using PeerJS (free, open source).
   The two browsers talk directly to each other; PeerJS's free public server only helps them find each other. */
(() => {
'use strict';
const G = window.G = window.G || {};
const PREFIX = 'n4968n-race-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes like O/0 or I/1

const Net = G.Net = {
  peer: null, conn: null, role: null, code: null,
  onStatus: () => {}, onOpen: () => {}, onMsg: () => {}, onClose: () => {},

  available() { return typeof window.Peer === 'function'; },
  makeCode() { let c = ''; for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; return c; },
  inviteLink(code) { return location.origin + location.pathname + '?join=' + code; },

  host() {
    this.leave();
    if (!this.available()) { this.onStatus('error', 'Online play needs an internet connection (the PeerJS script did not load).'); return; }
    this.role = 'host';
    this.code = this.makeCode();
    this.onStatus('connecting', 'Setting up your race…');
    const peer = this.peer = new window.Peer(PREFIX + this.code.toLowerCase());
    peer.on('open', () => this.onStatus('waiting', 'Waiting for your friend to join…'));
    peer.on('connection', c => {
      if (this.conn && this.conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
      this.attach(c);
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') { this.host(); return; }   // code already taken: pick another
      this.onStatus('error', 'Connection problem: ' + (err.type || err.message || err));
    });
    peer.on('disconnected', () => { if (!this.conn) try { peer.reconnect(); } catch (e) {} });
  },

  join(code) {
    this.leave();
    if (!this.available()) { this.onStatus('error', 'Online play needs an internet connection (the PeerJS script did not load).'); return; }
    this.role = 'guest';
    this.code = code.toUpperCase();
    this.onStatus('connecting', 'Looking for race ' + this.code + '…');
    const peer = this.peer = new window.Peer();
    peer.on('open', () => this.attach(peer.connect(PREFIX + this.code.toLowerCase(), { reliable: true, serialization: 'json' })));
    peer.on('error', err => {
      this.onStatus('error', err.type === 'peer-unavailable'
        ? `No race found with code ${this.code}. Check the code, and make sure your friend still has the invite screen open.`
        : 'Connection problem: ' + (err.type || err.message || err));
    });
  },

  attach(c) {
    this.conn = c;
    c.on('open', () => { this.onStatus('connected', 'Connected!'); this.onOpen(); });
    c.on('data', d => { if (d && d.t === 'full') { this.onStatus('error', 'That race already has two players.'); return; } this.onMsg(d); });
    c.on('close', () => { if (this.conn === c) { this.conn = null; this.onClose(); } });
    c.on('error', () => {});
  },

  send(msg) { if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (e) {} } },
  connected() { return !!(this.conn && this.conn.open); },

  leave() {
    const c = this.conn, p = this.peer;
    this.conn = null; this.peer = null; this.role = null;
    try { if (c) c.close(); } catch (e) {}
    try { if (p) p.destroy(); } catch (e) {}
  },
};
})();
