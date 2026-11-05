// WhatsApp on the school's own number, linked by QR — straight over WhatsApp's
// websocket (Baileys): no browser, a few MB of memory. Heals itself: a dropped
// connection reconnects with backoff, unlinking from the phone brings a fresh QR,
// and a connection stuck without a QR or a link is restarted after STUCK_MS.
const fs = require('fs')

const STUCK_MS = 120e3
// used only when WhatsApp's current web version can't be fetched (offline at start)
const FALLBACK_VERSION = [2, 3000, 1052645975]

function createWhatsApp({ authDir, log = () => {}, onChange = () => {} }) {
  let B = null // the library, loaded on first use (keeps start-up fast when WhatsApp is off)
  let sock = null
  let wanted = false
  let retry = 0
  let timer = null
  let stuckSince = null
  const state = { status: 'off', qr: null, me: null, error: null }
  const set = (patch) => { Object.assign(state, patch); onChange({ ...state }) }

  async function connect() {
    clearTimeout(timer)
    if (!wanted) return
    B ||= require('@whiskeysockets/baileys')
    set({ status: 'starting', qr: null, error: null })
    stuckSince ??= Date.now()
    try {
      const { state: auth, saveCreds } = await B.useMultiFileAuthState(authDir)
      let version = FALLBACK_VERSION
      try { version = (await B.fetchLatestWaWebVersion({ timeout: 8000 })).version || version } catch {}
      const logger = require('pino')({ level: 'silent' })
      const s = B.default({
        version, auth, logger, browser: B.Browsers.windows('Desktop'), printQRInTerminal: false,
        markOnlineOnConnect: false, syncFullHistory: false, shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false, connectTimeoutMs: 30e3,
      })
      sock = s
      s.ev.on('creds.update', saveCreds)
      s.ev.on('connection.update', (u) => {
        if (sock !== s) return
        if (u.qr) { stuckSince = null; set({ status: 'qr', qr: u.qr }) }
        if (u.connection === 'open') {
          retry = 0; stuckSince = null
          set({ status: 'connected', qr: null, me: (s.user?.id || '').split(':')[0].split('@')[0] || null, error: null })
        }
        if (u.connection === 'close') {
          const code = u.lastDisconnect?.error?.output?.statusCode
          sock = null
          if (!wanted) return set({ status: 'off', qr: null })
          if (code === B.DisconnectReason.loggedOut) {
            // unlinked from the phone (or «فصل الرقم»): forget the session, show a new QR
            log('whatsapp: logged out — new QR')
            fs.rmSync(authDir, { recursive: true, force: true })
            set({ status: 'starting', qr: null, me: null })
            timer = setTimeout(connect, 1000)
            return
          }
          // 515 = «restart required» right after pairing; anything else: back off up to a minute
          const wait = code === 515 ? 500 : Math.min(60e3, 2000 * 2 ** Math.min(retry++, 5))
          set({ status: 'starting', qr: null, error: code ? `انقطع الاتصال (${code})` : 'انقطع الاتصال' })
          timer = setTimeout(connect, wait)
        }
      })
    } catch (e) {
      log(`whatsapp: ${e.message}`)
      set({ status: 'starting', error: String(e.message || e).slice(0, 150) })
      timer = setTimeout(connect, Math.min(60e3, 5000 * 2 ** Math.min(retry++, 3)))
    }
  }

  // watchdog: the window must never sit on «جاري التحضير»
  setInterval(() => {
    if (!wanted || state.status === 'connected' || state.status === 'qr') { stuckSince = null; return }
    if (stuckSince && Date.now() - stuckSince > STUCK_MS) {
      log('whatsapp: stuck — restarting')
      stuckSince = Date.now()
      try { sock?.end(undefined) } catch {}
      sock = null
      connect()
    }
  }, 10e3).unref()

  return {
    state,
    start() { if (wanted) return; wanted = true; retry = 0; connect() },
    stop() { wanted = false; clearTimeout(timer); try { sock?.end(undefined) } catch {}; sock = null; set({ status: 'off', qr: null }) },
    async logout() {
      try { await sock?.logout() } catch {}
      try { sock?.end(undefined) } catch {}
      sock = null
      fs.rmSync(authDir, { recursive: true, force: true })
      set({ status: 'starting', qr: null, me: null })
      if (wanted) { clearTimeout(timer); timer = setTimeout(connect, 1000) }
    },
    // phone: international digits (9665XXXXXXXX)
    async send(phone, text) {
      if (state.status !== 'connected' || !sock) throw new Error('واتساب غير مربوط')
      const [hit] = await sock.onWhatsApp(phone + '@s.whatsapp.net')
      if (!hit?.exists) { const e = new Error('الرقم غير مسجّل على واتساب'); e.notOnWhatsApp = true; throw e }
      await sock.sendMessage(hit.jid, { text })
    },
  }
}

module.exports = { createWhatsApp }
