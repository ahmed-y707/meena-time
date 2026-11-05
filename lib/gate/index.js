// «بوابة المدرسة» — everything that must keep running while the school day goes on, in the main
// process, away from the window: the ADMS receiver, the punch journal, the guardian messages and
// WhatsApp. The window drains the journal into its database every few seconds, and acknowledges
// only after saving, so nothing is lost on a crash.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { Journal, localDay } = require('./journal')
const { createReceiver } = require('./adms')
const { createNotifier } = require('./notify')
const { createWhatsApp } = require('./whatsapp')

const GATE_DEFAULTS = { receiver: true, port: 8081, ip: null }

function createGate({ dir, ipcMain, window: getWin, log = (m) => console.log('[gate]', m) }) {
  fs.mkdirSync(dir, { recursive: true })
  const cfgPath = path.join(dir, 'gate.json')
  let cfg = { ...GATE_DEFAULTS }
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } } catch {}
  const saveCfg = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg))

  const journal = new Journal(path.join(dir, 'journal'))
  const devices = {} // sn → {ip, seen, today, day, last}
  let qrUrl = null, qrFor = null
  const whatsapp = createWhatsApp({ authDir: path.join(dir, 'wa-auth'), log, onChange: (s) => { if (s.qr !== qrFor) { qrFor = s.qr; qrUrl = null } nudge('gate:changed') } })
  const notifier = createNotifier({ dir, whatsapp, log })

  // the window is told something changed; it pulls what it needs
  const timers = {}
  function nudge(ch = 'gate:new') {
    if (timers[ch]) return
    timers[ch] = setTimeout(() => { timers[ch] = null; const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch) }, 300)
  }

  const receiver = createReceiver({
    log,
    onDevice(sn, info) { const d = (devices[sn] ||= { today: 0 }); d.ip = info.ip; d.seen = info.seen },
    onPunches(rows) {
      if (!rows.length) return
      journal.append(rows.map((r) => ({ c: r.c, t: r.t, sn: r.sn })))
      const day = localDay()
      const d = (devices[rows[0].sn] ||= { today: 0 })
      if (d.day !== day) { d.day = day; d.today = 0 }
      d.today += rows.filter((r) => r.t.startsWith(day)).length
      d.last = rows.at(-1).t
      try { notifier.onPunches(rows) } catch (e) { log(`notify: ${e.message}`) }
      nudge()
    },
  })

  // today's punches from the journal: the notifier knows who already came after a restart
  function replayToday() {
    const f = path.join(journal.dir, localDay() + '.jsonl')
    if (!fs.existsSync(f)) return
    const rows = []
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) { try { const r = JSON.parse(l); if (r.c && r.t) rows.push(r) } catch {} }
    notifier.onPunches(rows)
  }

  const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)

  // the address written in the devices: remembered, so a change can be warned about
  async function status() {
    if (whatsapp.state.qr && !qrUrl) qrUrl = await require('qrcode').toDataURL(whatsapp.state.qr, { margin: 1, width: 280 })
    const ips = lanIps()
    if (!cfg.ip && ips.length) { cfg.ip = ips[0]; saveCfg() }
    return {
      receiver: { ...receiver.state, enabled: cfg.receiver, ips, ip: cfg.ip, moved: !!cfg.ip && ips.length > 0 && !ips.includes(cfg.ip) },
      devices: Object.entries(devices).map(([sn, d]) => ({ sn, ip: d.ip, seen: d.seen, today: d.day === localDay() ? d.today : 0, last: d.last || null })),
      whatsapp: { status: whatsapp.state.status, me: whatsapp.state.me, error: whatsapp.state.error, qr: whatsapp.state.status === 'qr' ? qrUrl : null },
      today: notifier.status(),
      settings: { ...notifier.settings, sms: maskSms(notifier.settings.sms) },
      providers: notifier.PROVIDERS,
    }
  }
  // secrets never go back to the window in full
  const maskSms = (s = {}) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, /key|token|sid|pass/i.test(k) && v ? '••••••' + String(v).slice(-3) : v]))

  async function applyCfg() {
    if (cfg.receiver) await receiver.start(cfg.port)
    else receiver.stop()
    if (notifier.settings.whatsapp && notifier.settings.smsMode !== 'only') whatsapp.start()
    else whatsapp.stop()
  }

  ipcMain.handle('gate:drain', (_e, max) => journal.drain(Math.min(+max || 5000, 20000)))
  ipcMain.handle('gate:ack', (_e, next) => journal.ack(next))
  ipcMain.handle('gate:status', () => status())
  ipcMain.handle('gate:clock', (_e, sn) => { receiver.syncClock(String(sn)); return true })
  ipcMain.handle('gate:roster', (_e, r) => { notifier.setRoster(r); return true })
  ipcMain.handle('gate:log', (_e, limit) => notifier.readLog(Math.min(+limit || 200, 1000)))
  ipcMain.handle('gate:absence', () => notifier.checkAbsence({ force: true }))
  ipcMain.handle('gate:test', (_e, phone) => notifier.test(String(phone || '')))
  ipcMain.handle('gate:wa', async (_e, action) => {
    if (action === 'logout') await whatsapp.logout()
    else if (action === 'restart') { whatsapp.stop(); whatsapp.start() }
    return status()
  })
  ipcMain.handle('gate:settings', async (_e, patch = {}) => {
    if (patch.sms) for (const [k, v] of Object.entries(patch.sms)) if (typeof v === 'string' && v.startsWith('••••••')) delete patch.sms[k] // unchanged secret
    notifier.setSettings(patch)
    if ('receiver' in patch) cfg.receiver = !!patch.receiver
    if ('port' in patch) { const p = parseInt(patch.port, 10); if (p >= 1 && p <= 65535) cfg.port = p }
    if (patch.confirmIp) cfg.ip = lanIps()[0] || cfg.ip // the devices were updated to the new address
    saveCfg()
    await applyCfg()
    return status()
  })

  replayToday()
  applyCfg()
  return { journal, receiver, notifier, whatsapp, stop() { receiver.stop(); whatsapp.stop(); journal.close() } }
}

module.exports = { createGate }
