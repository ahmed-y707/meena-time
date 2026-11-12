// Masar Time USB — free edition handed out with the fingerprint device by «التحكم التقني».
// Punches come only from the device's USB export (attlog.dat on a flash drive); one report:
// when each employee came in and went out. Every PC needs its own activation key.
// No internet at all: no link, no updates, every non-local request is refused.
const { app, BrowserWindow, ipcMain, dialog, session, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const { deviceCode, verifyKey, dataKey, clean } = require('./licence')
const { createStore } = require('./store')
const BRAND = require('./brand.json')

if (!process.argv.some((a) => a.startsWith('--user-data-dir'))) app.setPath('userData', path.join(app.getPath('appData'), 'Masar Time USB'))
// the installed program refuses to start under a debugger (the fuses already block --inspect / NODE_OPTIONS)
if (app.isPackaged && process.argv.some((a) => /^--(remote-debugging|inspect|js-flags)/i.test(a))) app.exit(1)
const dataDir = () => app.getPath('userData')
const keyFile = () => path.join(dataDir(), 'activation.key')

for (const sw of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability', 'no-pings', 'disable-sync',
  'disable-default-apps', 'no-first-run', 'disable-breakpad', 'metrics-recording-only', 'disable-client-side-phishing-detection', 'disable-field-trial-config']) app.commandLine.appendSwitch(sw)
app.commandLine.appendSwitch('disable-features', 'SpellcheckService,MediaRouter,OptimizationHints,Translate,AutofillServerCommunication,CertificateTransparencyComponentUpdater')
const LOCAL_URL = /^(file|data|blob|about|chrome):/i

// ── activation ───────────────────────────────────────────
let store = null
function activation() {
  const key = fs.existsSync(keyFile()) ? fs.readFileSync(keyFile(), 'utf8').trim() : ''
  if (!key || !verifyKey(key)) { store = null; return { ok: false, code: deviceCode() } }
  if (!store) {
    try { store = createStore(path.join(dataDir(), 'masar-usb.dat'), dataKey(key)) }
    catch { return { ok: false, code: deviceCode(), error: 'damaged' } }
  }
  return { ok: true, code: deviceCode() }
}
// every data call re-checks the activation: a window that skips the lock screen gets nothing
const need = (fn) => (...args) => (activation().ok ? fn(...args) : { error: 'locked' })

// ── the flash drive ──────────────────────────────────────
const ATTLOG = /attlog.*\.dat$/i
function driveRoots() {
  if (!app.isPackaged && process.env.MT_USB_ROOTS) return process.env.MT_USB_ROOTS.split(':') // tests only: a folder that plays the flash drive
  if (process.platform === 'win32') {
    const sys = (process.env.SystemDrive || 'C:').toUpperCase()
    return 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((r) => r.slice(0, 2) !== sys && fs.existsSync(r))
  }
  const out = []
  for (const base of [`/run/media/${process.env.USER || ''}`, '/media', `/media/${process.env.USER || ''}`, '/mnt']) {
    try { for (const d of fs.readdirSync(base)) out.push(path.join(base, d)) } catch {}
  }
  return out
}
function findAttlogs() {
  const found = []
  const look = (dir, depth) => {
    let items = []
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const it of items) {
      const p = path.join(dir, it.name)
      if (it.isFile() && ATTLOG.test(it.name)) {
        try { const st = fs.statSync(p); found.push({ path: p, name: it.name, size: st.size, modified: st.mtime.toISOString(), serial: it.name.match(/^([A-Z0-9]+)_attlog/i)?.[1] || '' }) } catch {}
      } else if (it.isDirectory() && depth < 2 && !/^(\$|System Volume Information)/i.test(it.name)) look(p, depth + 1)
    }
  }
  for (const r of driveRoots()) look(r, 0)
  return found
}
function readPunchFile(p) {
  const st = fs.statSync(p)
  if (st.size > 50 * 1024 * 1024) throw new Error('big')
  return fs.readFileSync(p, 'utf8')
}

// ── IPC ──────────────────────────────────────────────────
ipcMain.handle('brand', () => BRAND)
ipcMain.handle('act:status', () => activation())
ipcMain.handle('act:activate', (_e, key) => {
  const k = clean(key)
  if (!verifyKey(k)) return { ok: false, code: deviceCode() }
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(keyFile(), k)
  return activation()
})
ipcMain.handle('usb:scan', need(() => ({ files: findAttlogs() })))
ipcMain.handle('usb:import', need((_e, paths) => {
  const results = []
  for (const p of [].concat(paths || [])) {
    try { results.push({ path: p, ...store.importText(readPunchFile(p), p) }) }
    catch (err) { results.push({ path: p, error: err.message === 'big' ? 'الملف كبير جداً' : 'تعذّرت قراءة الملف' }) }
  }
  return { results }
}))
ipcMain.handle('usb:pick', need(async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: 'اختر ملف الحركات من الفلاشة', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'ملف حركات البصمة', extensions: ['dat', 'txt', 'csv'] }] })
  return r.canceled ? { paths: [] } : { paths: r.filePaths }
}))
ipcMain.handle('emp:list', need(() => store.employees()))
ipcMain.handle('emp:rename', need((_e, pin, name) => store.renameEmployee(String(pin), name)))
ipcMain.handle('emp:delete', need((_e, pin) => store.deleteEmployee(String(pin))))
ipcMain.handle('report', need((_e, f) => store.report(f || {})))
ipcMain.handle('summary', need(() => store.summary()))

// print / PDF through a hidden window, so only the report is printed
async function withDoc(html, fn) {
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); return await fn(w) } finally { w.destroy() }
}
ipcMain.handle('print', need((_e, html) => withDoc(html, (w) => new Promise((resolve) => w.webContents.print({ printBackground: true },
  (ok, reason) => resolve(ok || /cancel/i.test(reason || '') ? { ok } : { ok: false, error: `تعذّرت الطباعة (${reason || 'لا توجد طابعة'})` }))))))
ipcMain.handle('pdf', need(async (_e, html, name) => {
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: name || 'تقرير الحضور.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (r.canceled) return { ok: false, canceled: true }
  const pdf = await withDoc(html, (w) => w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } }))
  fs.writeFileSync(r.filePath, pdf)
  return { ok: true, path: r.filePath }
}))
ipcMain.handle('quit', () => app.quit())

// ── window ───────────────────────────────────────────────
let mainWin = null
app.whenReady().then(() => {
  const ses = session.defaultSession
  ses.setSpellCheckerEnabled(false)
  ses.setSpellCheckerLanguages([])
  ses.setSpellCheckerDictionaryDownloadURL('file:///nonexistent/')
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !LOCAL_URL.test(d.url) }))
  Menu.setApplicationMenu(null)
  mainWin = new BrowserWindow({
    width: 1200, height: 780, minWidth: 980, minHeight: 620, title: BRAND.product, backgroundColor: '#f3f6f6',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: !app.isPackaged },
  })
  mainWin.maximize()
  mainWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWin.webContents.on('will-navigate', (e) => e.preventDefault())
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'))
})
app.on('window-all-closed', () => app.quit())
