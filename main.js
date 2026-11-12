// Electron main process: one window, the database file in the user's data
// folder (no XAMPP, no fixed drive), and the licence check.
const { app, BrowserWindow, ipcMain, Menu, dialog, screen, session } = require('electron')
const path = require('path')
const fs = require('fs')
const { requestCode, verifyLicence } = require('./lib/license')
const { createGuard } = require('./lib/guard')
const { createGate } = require('./lib/gate')
const { readUsbEdition } = require('./lib/usb-import')

// Demo: own data folder, starts with the test data, all features unlocked.
// Installer: demo/demo-data.sqlite is bundled by tools/build-demo.sh (normal
// builds have no demo/). From source: `npm run demo` (= electron . --demo).
const DEMO_DB = process.argv.includes('--demo') ? path.join(__dirname, 'tools', 'demo-data.sqlite') : path.join(__dirname, 'demo', 'demo-data.sqlite')
const DEMO = fs.existsSync(DEMO_DB)
// its own data folder, apart from a Meena Time / Apex-style copy on the same PC
if (!process.argv.some((a) => a.startsWith('--user-data-dir'))) app.setPath('userData', path.join(app.getPath('appData'), DEMO ? 'Masar Time Demo' : 'Masar Time'))
const dataDir = () => app.getPath('userData')
// one database for all years (v1.0); `name` = 'main', a 4-digit year for a v0.x per-year file, or an
// extra database made from «انشاء قاعدة بيانات» (Apex keeps several: «قاعدة البيانات الحالية/الجديدة»)
const DB_NAME = /^[^\\/:*?"<>|.]{1,40}$/
const dbPath = (name) => path.join(dataDir(), name === 'main' ? 'meena-time.sqlite' : /^\d{4}$/.test(name) ? `meena-time-${name}.sqlite` : `meena-time-db-${name}.sqlite`)
const currentPath = () => path.join(dataDir(), 'current-db.json')
function currentDb() {
  try { const n = JSON.parse(fs.readFileSync(currentPath(), 'utf8')).db; if (n === 'main' || (DB_NAME.test(n) && fs.existsSync(dbPath(n)))) return n } catch {}
  return 'main'
}
const namedDbs = () => (fs.existsSync(dataDir()) ? fs.readdirSync(dataDir()).map((f) => f.match(/^meena-time-db-(.+)\.sqlite$/)?.[1]).filter(Boolean).sort() : [])
const licencePath = () => path.join(dataDir(), 'licence.key')
// trial build (tools/build-trial.sh bundles trial-build.json): the trial starts on first run, then a code from us is needed
const TRIAL_BUILD = path.join(__dirname, 'trial-build.json')
const guard = createGuard({ dataDir, licencePath, buildTrial: fs.existsSync(TRIAL_BUILD) ? (JSON.parse(fs.readFileSync(TRIAL_BUILD, 'utf8')).token || 'invalid') : null })


// Offline edition: the program never talks to the internet. Chromium's own background services
// (updates, spell-check downloads, safe-browsing, metrics…) are switched off, and every request a
// window could make is refused unless it stays on this PC (file:, data:, blob:, devtools:).
// Fingerprint devices are reached by Node on the local network (lib/zk.js, lib/gate) — not through here.
for (const sw of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability', 'no-pings',
  'disable-sync', 'disable-default-apps', 'no-first-run', 'disable-breakpad', 'metrics-recording-only', 'disable-client-side-phishing-detection', 'disable-field-trial-config', 'no-service-autorun']) app.commandLine.appendSwitch(sw)
app.commandLine.appendSwitch('disable-features', 'SpellcheckService,MediaRouter,OptimizationHints,Translate,AutofillServerCommunication,CertificateTransparencyComponentUpdater')
const LOCAL_URL = /^(file|data|blob|devtools|chrome|about):/i
app.whenReady().then(() => {
  const ses = session.defaultSession
  ses.setSpellCheckerEnabled(false)
  ses.setSpellCheckerLanguages([])
  ses.setSpellCheckerDictionaryDownloadURL('file:///nonexistent/') // never fetch dictionaries from Google
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !LOCAL_URL.test(d.url) }))
})

let mainWin = null
function createWindow() {
  const win = (mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Masar Time',
    backgroundColor: '#edf1f2',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  }))
  win.maximize()
  // 115 % on wide screens, as msar-erp.com renders (tenant uiScale); Ctrl + / Ctrl − / Ctrl 0 adjust it and the choice is kept
  const zoomFile = path.join(dataDir(), 'zoom.json')
  const fit = screen.getPrimaryDisplay().workAreaSize.width >= 1536 ? 1.15 : 1
  let zoom = fit
  try { zoom = JSON.parse(fs.readFileSync(zoomFile, 'utf8')).zoom || fit } catch {}
  const setZoom = (z) => { zoom = Math.round(Math.min(2, Math.max(0.6, z)) * 100) / 100; win.webContents.setZoomFactor(zoom) }
  win.webContents.on('did-finish-load', () => setZoom(zoom))
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown' || !i.control) return
    const k = i.key
    if (k === '=' || k === '+') setZoom(zoom + 0.1)
    else if (k === '-') setZoom(zoom - 0.1)
    else if (k === '0') setZoom(fit)
    else return
    e.preventDefault()
    try { fs.writeFileSync(zoomFile, JSON.stringify({ zoom })) } catch {}
  })
  Menu.setApplicationMenu(null) // the app draws its own sidebar
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

// sql.js' .wasm is handed over as bytes: fetch() can't read file:// (or app.asar) URLs.
ipcMain.handle('sql:wasm', () => fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')))
ipcMain.handle('db:list', () =>
  fs.existsSync(dataDir())
    ? fs.readdirSync(dataDir()).map((f) => f.match(/^meena-time-(\d{4})\.sqlite$/)?.[1]).filter(Boolean)
    : [])
ipcMain.handle('db:names', () => ['main', ...namedDbs()])
ipcMain.handle('db:current', () => currentDb())
ipcMain.handle('db:use', (_e, name) => {
  if (name !== 'main' && !namedDbs().includes(name)) return false
  fs.writeFileSync(currentPath(), JSON.stringify({ db: name }))
  return true
})
// a new, empty database file (the renderer fills it with the default setup on first open)
ipcMain.handle('db:create', (_e, name, bytes) => {
  name = String(name || '').trim()
  if (name === 'main' || /^\d{4}$/.test(name) || !DB_NAME.test(name)) return { ok: false, error: 'اسم قاعدة البيانات غير صالح' }
  if (fs.existsSync(dbPath(name))) return { ok: false, error: 'لا يمكن انشاء قاعدة بيانات بنفس اسم قاعدة بيانات اخري' }
  fs.writeFileSync(dbPath(name), Buffer.from(bytes))
  return { ok: true }
})
ipcMain.handle('db:load', (_e, year) => (fs.existsSync(dbPath(year)) ? fs.readFileSync(dbPath(year)) : null))
// after merging v0.x per-year files into the main DB, keep them renamed (never deleted)
ipcMain.handle('db:retire', (_e, year) => {
  if (!/^\d{4}$/.test(year) || !fs.existsSync(dbPath(year))) return false
  fs.renameSync(dbPath(year), dbPath(year) + '.v0-merged')
  return true
})
ipcMain.handle('db:save', (_e, year, bytes) => {
  fs.mkdirSync(dataDir(), { recursive: true })
  const tmp = dbPath(year) + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(bytes))
  fs.renameSync(tmp, dbPath(year)) // atomic replace: a crash never leaves a half-written DB
  return true
})
ipcMain.handle('licence:status', () => {
  if (DEMO) return { requestCode: requestCode(), ok: true, edition: 'Demo' }
  return guard.status()
})
ipcMain.handle('licence:register', async (_e, code) => {
  const res = verifyLicence(code)
  if (!res.ok) return res
  const prev = fs.existsSync(licencePath()) ? fs.readFileSync(licencePath(), 'utf8') : null
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(licencePath(), String(code).trim())
  const st = guard.status()
  if (st.locked && prev !== null) fs.writeFileSync(licencePath(), prev) // an already-ended trial code doesn't replace a working one
  return st
})

// «سحب من الفلاشة»: the device's USB export (…_attlog.dat) on any removable drive — as in Masar Time USB
const ATTLOG = /attlog.*\.dat$/i
function flashRoots() {
  if (!app.isPackaged && process.env.MT_USB_ROOTS) return process.env.MT_USB_ROOTS.split(':') // tests only: a folder that plays the flash drive
  if (process.platform === 'win32') {
    const sys = (process.env.SystemDrive || 'C:').toUpperCase()
    return 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((r) => r.slice(0, 2) !== sys && fs.existsSync(r))
  }
  const out = []
  for (const base of [`/run/media/${process.env.USER || ''}`, '/media', `/media/${process.env.USER || ''}`, '/mnt']) { try { for (const d of fs.readdirSync(base)) out.push(path.join(base, d)) } catch {} }
  return out
}
// upgrade from Masar Time USB on this PC (MT_USB_DATA_DIR: tests only)
ipcMain.handle('usb-edition:read', () => readUsbEdition((!app.isPackaged && process.env.MT_USB_DATA_DIR) || path.join(app.getPath('appData'), 'Masar Time USB')))
ipcMain.handle('flash:scan', () => {
  const found = []
  const look = (dir, depth) => {
    let items = []
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const it of items) {
      const p = path.join(dir, it.name)
      if (it.isFile() && ATTLOG.test(it.name)) found.push({ path: p, name: it.name })
      else if (it.isDirectory() && depth < 2 && !/^(\$|System Volume Information)/i.test(it.name)) look(p, depth + 1)
    }
  }
  for (const r of flashRoots()) look(r, 0)
  return found
})
ipcMain.handle('flash:read', (_e, p) => {
  if (!ATTLOG.test(path.basename(String(p))) || fs.statSync(p).size > 50 * 1024 * 1024) return null // only punch files found by flash:scan
  return fs.readFileSync(p, 'utf8')
})

// «قراءة الحركات» from a ZKTeco device on the LAN (TCP 4370, UDP fallback inside node-zklib).
// «حالة الجهاز» light in «قراءة الحركات»: can we open a TCP connection to the device?
ipcMain.handle('device:ping', (_e, { ip, port }) => new Promise((resolve) => {
  const sock = require('net').createConnection({ host: ip, port: port || 4370, timeout: 2000 })
  const done = (ok) => { sock.destroy(); resolve(ok) }
  sock.once('connect', () => done(true)); sock.once('timeout', () => done(false)); sock.once('error', () => done(false))
}))
ipcMain.handle('device:read', async (_e, { ip, port }) => {
  const ZKLib = require('node-zklib')
  const zk = new ZKLib(ip, port || 4370, 10000, 4000)
  try {
    await zk.createSocket()
    const res = await zk.getAttendances()
    const pad = (n) => String(n).padStart(2, '0')
    const punches = (res?.data || []).map((a) => {
      const d = new Date(a.recordTime)
      return { code: String(a.deviceUserId), ts: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
    })
    return { ok: true, punches }
  } catch (err) {
    return { ok: false, error: `تعذّر الاتصال بالجهاز ${ip}:${port || 4370} — تأكد أن الجهاز يعمل وعلى نفس الشبكة` }
  } finally {
    try { await zk.disconnect() } catch {}
  }
})

// «مزامنة ساعة الجهاز» for a device read over the network (port 4370)
ipcMain.handle('device:clock', async (_e, { ip, port, key }) => {
  const { ZK } = require('./lib/zk')
  const zk = new ZK(ip, port || 4370)
  try {
    await zk.connect(key || 0)
    await zk.setTime()
    return { ok: true }
  } catch {
    return { ok: false, error: `تعذّر الاتصال بالجهاز ${ip}:${port || 4370} — تأكد أن الجهاز يعمل وعلى نفس الشبكة` }
  } finally {
    await zk.close().catch(() => {})
  }
})

// «نقل بصمات الموظفين»: users + fingerprints from one device to another (lib/zk.js).
ipcMain.handle('device:transfer', (e, { from, to, sel }) =>
  require('./lib/zk').transfer(from, to, sel, (done, total) => e.sender.send('device:transfer-progress', { done, total })))

// Daily automatic backup on start-up: copy each year's DB to userData/backups,
// keep the newest 30 copies.
function dailyBackup() {
  try {
    const dir = path.join(dataDir(), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10)
    for (const f of fs.readdirSync(dataDir()).filter((f) => /^meena-time(-\d{4}|-db-.+)?\.sqlite$/.test(f))) {
      const dest = path.join(dir, f.replace('.sqlite', `-${stamp}.sqlite`))
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(dataDir(), f), dest)
    }
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort()
    for (const old of all.slice(0, Math.max(0, all.length - 30))) fs.unlinkSync(path.join(dir, old))
  } catch (err) {
    console.error('backup failed', err)
  }
}

ipcMain.handle('db:pick', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'اختر ملف النسخة الاحتياطية', filters: [{ name: 'Meena Time DB', extensions: ['sqlite'] }], properties: ['openFile'],
  })
  return canceled || !filePaths[0] ? null : { path: filePaths[0], bytes: fs.readFileSync(filePaths[0]) }
})
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0) })
ipcMain.handle('app:quit', () => app.exit(0))
ipcMain.handle('paths', () => ({ data: dataDir(), backups: path.join(dataDir(), 'backups') }))
ipcMain.handle('db:backup', async (e, year, bytes) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'حفظ نسخة احتياطية',
    defaultPath: path.join(app.getPath('documents'), `meena-time-backup-${new Date().toISOString().slice(0, 10)}.sqlite`),
    filters: [{ name: 'Meena Time DB', extensions: ['sqlite'] }],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, Buffer.from(bytes))
  return { ok: true, path: filePath }
})

const FILTERS = { xlsx: [{ name: 'Excel', extensions: ['xlsx'] }], pdf: [{ name: 'PDF', extensions: ['pdf'] }] }
async function askSavePath(e, name, ext) {
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    defaultPath: path.join(app.getPath('documents'), name.replace(/[\\/:*?"<>|]/g, ' ')), filters: FILTERS[ext] || [],
  })
  return canceled ? null : filePath
}
ipcMain.handle('file:save', async (e, name, bytes, ext) => {
  const fp = await askSavePath(e, name, ext)
  if (!fp) return { ok: false }
  fs.writeFileSync(fp, Buffer.from(bytes))
  return { ok: true, path: fp }
})
// Report → PDF through Chromium's own renderer (keeps the Arabic shaping and RTL)
ipcMain.handle('file:pdf', async (e, name, html) => {
  const fp = await askSavePath(e, name, 'pdf')
  if (!fp) return { ok: false }
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', landscape: html.includes('data-landscape'), printBackground: true, margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } })
    fs.writeFileSync(fp, pdf)
    return { ok: true, path: fp }
  } catch (err) {
    return { ok: false, error: 'تعذّر إنشاء ملف PDF' }
  } finally {
    w.destroy()
  }
})

// ── link with the web version (Frappe REST, token auth) ──
// Kept in its own file (not the database) so backups never carry the API secret.
// the site link belongs to one database: an extra database starts unlinked
// Print through a hidden window so only the document prints (not the desktop),
// and a missing/failed printer comes back as a message instead of nothing happening
ipcMain.handle('print:html', async (e, html) => {
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    return await new Promise((resolve) => w.webContents.print({ printBackground: true, landscape: html.includes('data-landscape') }, (ok, reason) =>
      resolve(ok || /cancel/i.test(reason || '') ? { ok } : { ok: false, error: `تعذّرت الطباعة (${reason || 'لا توجد طابعة'})` })))
  } finally {
    w.destroy()
  }
})

app.whenReady().then(() => {
  if (DEMO && !fs.existsSync(dbPath('main'))) {
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.copyFileSync(DEMO_DB, dbPath('main'))
  }
  dailyBackup()
  createWindow()
  gate = createGate({ dir: path.join(dataDir(), 'gate'), ipcMain, window: () => mainWin })
})
let gate = null
app.on('before-quit', () => { try { gate?.stop() } catch {} })
app.on('window-all-closed', () => app.quit())
