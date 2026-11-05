// Live punches from the devices on the client's network, in the main process, away from
// the window: the ADMS receiver and the punch journal. The window drains the journal into its
// database every few seconds, and acknowledges only after saving, so nothing is lost on a crash.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { Journal, localDay } = require('./journal')
const { createReceiver } = require('./adms')

const GATE_DEFAULTS = { receiver: true, port: 8081, ip: null }

function createGate({ dir, ipcMain, window: getWin, log = (m) => console.log('[gate]', m) }) {
  fs.mkdirSync(dir, { recursive: true })
  const cfgPath = path.join(dir, 'gate.json')
  let cfg = { ...GATE_DEFAULTS }
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } } catch {}
  const saveCfg = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg))

  const journal = new Journal(path.join(dir, 'journal'))
  const devices = {} // sn → {ip, seen, today, day, last}

  // the window is told something changed; it pulls what it needs
  let nudgeTimer = null
  function nudge() {
    if (nudgeTimer) return
    nudgeTimer = setTimeout(() => { nudgeTimer = null; const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('gate:new') }, 300)
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
      nudge()
    },
  })

  const lanIps = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)

  // the address written in the devices: remembered, so a change can be warned about
  function status() {
    const ips = lanIps()
    if (!cfg.ip && ips.length) { cfg.ip = ips[0]; saveCfg() }
    return {
      receiver: { ...receiver.state, enabled: cfg.receiver, ips, ip: cfg.ip, moved: !!cfg.ip && ips.length > 0 && !ips.includes(cfg.ip) },
      devices: Object.entries(devices).map(([sn, d]) => ({ sn, ip: d.ip, seen: d.seen, today: d.day === localDay() ? d.today : 0, last: d.last || null })),
    }
  }

  async function applyCfg() {
    if (cfg.receiver) await receiver.start(cfg.port)
    else receiver.stop()
  }

  ipcMain.handle('gate:drain', (_e, max) => journal.drain(Math.min(+max || 5000, 20000)))
  ipcMain.handle('gate:ack', (_e, next) => journal.ack(next))
  ipcMain.handle('gate:status', () => status())
  ipcMain.handle('gate:clock', (_e, sn) => { receiver.syncClock(String(sn)); return true })
  ipcMain.handle('gate:settings', async (_e, patch = {}) => {
    if ('receiver' in patch) cfg.receiver = !!patch.receiver
    if ('port' in patch) { const p = parseInt(patch.port, 10); if (p >= 1 && p <= 65535) cfg.port = p }
    if (patch.confirmIp) cfg.ip = lanIps()[0] || cfg.ip // the devices were updated to the new address
    saveCfg()
    await applyCfg()
    return status()
  })

  applyCfg()
  return { journal, receiver, stop() { receiver.stop(); journal.close() } }
}

module.exports = { createGate }
