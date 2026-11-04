/* Online play between two devices using PeerJS (free, open source).
   The two browsers talk directly to each other; PeerJS's free public server only helps them find each other.
   The handshake is belt and braces: the guest says hello every second until the host answers, either side
   can show up first, a dropped connection to the server reconnects with the same code, and anything that
   takes longer than 15 seconds offers "Try again" with the same code. */
(() => {
'use strict';
const G = window.G = window.G || {};
const PREFIX = 'n4968n-race-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes like O/0 or I/1
const TIMEOUT = 15000, HELLO_EVERY = 1000, PING_EVERY = 1500, DEAD_AFTER = 6000;
const store = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} } };

const Net = G.Net = {
  peer: null, conn: null, role: null, lastRole: null, code: null, linked: false,
  canReplace: () => true,   // the game says whether a reloaded guest may take over the old seat
  onStatus: () => {}, onOpen: () => {}, onMsg: () => {}, onClose: () => {},
  timers: [], lastSeen: 0, deadline: 0,

  available() { return typeof window.Peer === 'function'; },
  makeCode() { let c = ''; for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; return c; },
  inviteLink(code) { return location.origin + location.pathname + '?join=' + code; },
  // a reload of the page picks the same race back up
  remembered() { return { host: store.get('n4968n-host'), join: store.get('n4968n-join') }; },

  later(fn, ms) { const id = setTimeout(fn, ms); this.timers.push(id); return id; },
  every(fn, ms) { const id = setInterval(fn, ms); this.timers.push(id); return id; },
  clearTimers() { this.timers.forEach(id => { clearTimeout(id); clearInterval(id); }); this.timers = []; },
  status(kind, text) { try { this.onStatus(kind, text); } catch (e) { console.error(e); } },
  // give up after 15 seconds of trying and offer "Try again"
  armTimeout(text) {
    this.deadline = performance.now() + TIMEOUT;
    clearTimeout(this.tmo);
    this.tmo = setTimeout(() => { if (!this.linked && this.role) this.status('timeout', text); }, TIMEOUT);
  },

  host(code) {
    this.leave();
    if (!this.available()) { this.status('error', 'Online play needs an internet connection (the PeerJS script did not load).'); return; }
    this.role = this.lastRole = 'host';
    const keep = !!code;
    this.code = (code || this.makeCode()).toUpperCase();
    store.set('n4968n-host', this.code); store.set('n4968n-join', null);
    this.status('connecting', 'Setting up your race…');
    this.armTimeout('Could not reach the matchmaking server. Check your internet, then press Try again (same code).');
    this.hostPeer(keep);
    this.every(() => this.heartbeat(), PING_EVERY);
  },
  hostPeer(keep) {
    const peer = this.peer = new window.Peer(PREFIX + this.code.toLowerCase());
    peer.on('open', () => { if (this.peer === peer && !this.linked) this.status('waiting', 'Waiting for your friend to join…'); clearTimeout(this.tmo); });
    peer.on('connection', c => {
      if (this.peer !== peer) return;
      const busy = this.conn && this.conn.open && this.linked;
      // before the race a new arrival is almost always our friend after a reload, so they take the seat back
      if (busy && !this.canReplace() && performance.now() - this.lastSeen < DEAD_AFTER) {
        // already racing someone who's still there
        c.on('open', () => { c.send({ t: '_full' }); setTimeout(() => c.close(), 300); });
        return;
      }
      this.attach(c);   // a first guest, or a guest who reloaded and replaced a dead connection
    });
    peer.on('error', err => {
      if (this.peer !== peer) return;
      const type = err.type || '';
      if (type === 'unavailable-id') {
        // our own code is still held by the server (a reload): wait and take it back; a stranger's code: pick another
        if (keep || this.linked) { this.status('connecting', `Reclaiming code ${this.code}…`); this.rebuild(() => this.hostPeer(true), 2000); }
        else { this.code = this.makeCode(); store.set('n4968n-host', this.code); this.status('connecting', 'Setting up your race…'); this.rebuild(() => this.hostPeer(false), 50); }
        return;
      }
      if (type === 'peer-unavailable') return;
      if (this.linked) return;   // the server hiccupped but the friend is already connected directly
      this.status('connecting', 'Lost the matchmaking server, reconnecting…');
      this.rebuild(() => this.hostPeer(true), 2000);
    });
    peer.on('disconnected', () => {
      // the server connection dropped (phone went to sleep, wifi blip): come back with the same code
      if (this.peer !== peer) return;
      this.later(() => { if (this.peer === peer && peer.disconnected && !peer.destroyed) try { peer.reconnect(); } catch (e) {} }, 800);
    });
  },
  // throw away the current peer object and make a new one shortly
  rebuild(make, ms) {
    const old = this.peer; this.peer = null;
    try { if (old) old.destroy(); } catch (e) {}
    this.later(() => { if (this.role && !this.peer) make(); }, ms);
  },

  join(code) {
    this.leave();
    if (!this.available()) { this.status('error', 'Online play needs an internet connection (the PeerJS script did not load).'); return; }
    this.role = this.lastRole = 'guest';
    this.code = code.toUpperCase();
    store.set('n4968n-join', this.code); store.set('n4968n-host', null);
    this.status('connecting', 'Looking for race ' + this.code + '…');
    this.armTimeout(`Couldn't reach race ${this.code}. Make sure your friend still has the invite screen open, then press Try again.`);
    this.guestPeer();
    this.every(() => this.heartbeat(), PING_EVERY);
  },
  guestPeer() {
    const peer = this.peer = new window.Peer();
    peer.on('open', () => { if (this.peer === peer) this.dial(); });
    peer.on('error', err => {
      if (this.peer !== peer) return;
      const type = err.type || '';
      if (type === 'peer-unavailable') {
        // the host isn't there yet (or is reconnecting): keep knocking until the deadline
        if (!this.linked) this.status('connecting', `Looking for race ${this.code}… (is the invite screen open?)`);
        return;
      }
      if (this.linked) return;
      this.status('connecting', 'Lost the matchmaking server, reconnecting…');
      this.rebuild(() => this.guestPeer(), 2000);
    });
    peer.on('disconnected', () => {
      if (this.peer !== peer) return;
      this.later(() => { if (this.peer === peer && peer.disconnected && !peer.destroyed) try { peer.reconnect(); } catch (e) {} }, 800);
    });
  },
  // call the host, and call again every 3 seconds until we're linked or time runs out
  dial() {
    if (this.linked || !this.peer || this.peer.destroyed || this.role !== 'guest') return;
    if (performance.now() > this.deadline) return;
    if (!this.peer.disconnected) {
      const old = this.conn;
      if (!old || !old.open) {
        if (old) { this.conn = null; try { old.close(); } catch (e) {} }
        this.attach(this.peer.connect(PREFIX + this.code.toLowerCase(), { reliable: true, serialization: 'json' }));
      }
    }
    clearTimeout(this.dialT);
    this.dialT = this.later(() => this.dial(), 3000);
  },

  attach(c) {
    const prev = this.conn;
    this.conn = c; this.linked = false; this.lastSeen = performance.now();
    if (prev && prev !== c) try { prev.close(); } catch (e) {}
    const opened = () => {
      if (this.conn !== c) return;
      this.lastSeen = performance.now();
      if (this.role === 'host') this.linkUp(c);   // the host goes on open, or on the first hello, whichever comes first
      else {
        // the guest says hello every second until the host answers
        const hi = () => { if (this.conn === c && !this.linked && c.open) try { c.send({ t: '_hi' }); } catch (e) {} };
        hi(); const id = this.every(() => { if (this.linked || this.conn !== c) clearInterval(id); else hi(); }, HELLO_EVERY);
      }
    };
    c.on('open', opened);
    if (c.open) opened();
    c.on('data', d => {
      if (this.conn !== c) return;
      this.lastSeen = performance.now();
      if (!d || typeof d !== 'object') return;
      if (d.t === '_hi') { try { c.send({ t: '_ack' }); } catch (e) {} if (this.role === 'host') this.linkUp(c); return; }
      if (d.t === '_ack') { if (this.role === 'guest') this.linkUp(c); return; }
      if (d.t === '_p') return;
      if (d.t === '_full') { this.status('error', 'That race already has two players.'); this.leave(); return; }
      if (!this.linked) this.linkUp(c);   // a real message means we're talking
      this.onMsg(d);
    });
    c.on('close', () => this.lost(c));
    c.on('error', () => {});
    if (this.role === 'host') {
      // a half-made connection that never says hello gets dropped, and we keep waiting
      this.later(() => { if (this.conn === c && !this.linked) { this.conn = null; try { c.close(); } catch (e) {} this.status('waiting', 'Waiting for your friend to join…'); } }, TIMEOUT);
    }
  },
  linkUp(c) {
    if (this.linked || this.conn !== c) return;
    this.linked = true; clearTimeout(this.tmo); clearTimeout(this.dialT);
    this.status('connected', 'Friend connected ✓');
    try { this.onOpen(); } catch (e) { console.error(e); }
  },
  lost(c) {
    if (this.conn !== c) return;
    const was = this.linked;
    this.conn = null; this.linked = false;
    if (was) this.onClose();
    else if (this.role === 'guest') this.dial();
  },
  heartbeat() {
    const c = this.conn;
    if (!c || !c.open) return;
    try { c.send({ t: '_p' }); } catch (e) {}
  },

  // start over with the same code
  retry() { const code = this.code; if (!code) return; if (this.lastRole === 'guest') this.join(code); else this.host(code); },
  forget() { store.set('n4968n-host', null); store.set('n4968n-join', null); },
  send(msg) { if (this.conn && this.conn.open && this.linked) { try { this.conn.send(msg); } catch (e) {} } },
  connected() { return !!(this.conn && this.conn.open && this.linked); },

  leave(forget) {
    const c = this.conn, p = this.peer;
    this.clearTimers(); clearTimeout(this.tmo);
    this.conn = null; this.peer = null; this.role = null; this.linked = false;
    if (forget) this.forget();
    try { if (c) c.close(); } catch (e) {}
    try { if (p) p.destroy(); } catch (e) {}
  },
};
})();
