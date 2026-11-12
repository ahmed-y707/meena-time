// Trial guard (Electron main): decides whether the program may run.
// - A trial code carries signed dates (lib/license.js), so its end can't be edited.
// - Turning the PC clock back is caught by a «latest time seen» kept in three places
//   (data folder, ProgramData / home folder, Windows registry), encrypted with a key tied
//   to this machine, plus the timestamps of the data files themselves.
// - Offline edition: no internet time check — only the PC clock and the seals above.
// - Trial installer: the trial starts by itself on first run (kept in the same three places,
//   so reinstalling doesn't restart it) and never goes past the deadline signed into the build.
// - Once a trial was used on this PC the program never runs again without a valid code,
//   even after uninstalling or deleting the data folder.
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { requestCode, verifyLicence, verifyBuildTrial } = require('./license')

const SLACK = 2 * 3600e3 // clock may drift / DST: allow 2 h before calling it a rollback
const REG_KEY = 'HKCU\\Software\\MeenaTime'

const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dayStart = (s) => new Date(`${s}T00:00:00`).getTime()

function createGuard({ dataDir, licencePath, buildTrial = null }) {
  const build = buildTrial && verifyBuildTrial(buildTrial)
  const requireKey = !!buildTrial
  const key = crypto.createHash('sha256').update(`mt-guard|${requestCode()}`).digest()
  const seal = (obj) => {
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([c.update(JSON.stringify(obj)), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
  }
  const open = (txt) => {
    try {
      const b = Buffer.from(String(txt).trim(), 'base64')
      const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
      d.setAuthTag(b.subarray(12, 28))
      return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString())
    } catch { return null }
  }

  const shared = process.platform === 'win32'
    ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'MeenaTime', 'state.dat')
    : path.join(os.homedir(), '.meena-time-state')
  const files = () => [path.join(dataDir(), '.mt-state'), shared]
  const reg = {
    read() {
      if (process.platform !== 'win32') return null
      try { return execFileSync('reg', ['query', REG_KEY, '/v', 's'], { encoding: 'utf8', windowsHide: true }).match(/REG_SZ\s+(\S+)/)?.[1] || null } catch { return null }
    },
    write(v) {
      if (process.platform !== 'win32') return
      try { execFileSync('reg', ['add', REG_KEY, '/v', 's', '/t', 'REG_SZ', '/d', v, '/f'], { windowsHide: true, stdio: 'ignore' }) } catch {}
    },
  }

  function readState() {
    const st = { hw: 0, trialUsed: false, firstRun: 0 }
    for (const raw of [...files().map((f) => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }), reg.read()]) {
      const o = raw && open(raw)
      if (!o) continue
      st.hw = Math.max(st.hw, +o.hw || 0)
      st.trialUsed = st.trialUsed || !!o.trialUsed
      if (+o.firstRun) st.firstRun = st.firstRun ? Math.min(st.firstRun, +o.firstRun) : +o.firstRun
    }
    // the data files are stamped by the same clock: one «from the future» means it was turned back
    try {
      for (const f of fs.readdirSync(dataDir())) {
        if (/\.sqlite$|^licence\.key$/.test(f)) st.hw = Math.max(st.hw, fs.statSync(path.join(dataDir(), f)).mtimeMs)
      }
    } catch {}
    return st
  }
  function writeState(st) {
    const v = seal({ hw: st.hw, trialUsed: st.trialUsed, firstRun: st.firstRun })
    for (const f of files()) {
      try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, v) } catch {}
    }
    reg.write(v)
  }

  const now = () => Date.now()

  function status() {
    const code = fs.existsSync(licencePath()) ? fs.readFileSync(licencePath(), 'utf8') : ''
    const lic = verifyLicence(code)
    const st = readState()
    const t = now()
    const res = { requestCode: requestCode(), ...lic }
    if (lic.ok && lic.trial) {
      st.trialUsed = true
      const clockBack = t + SLACK < st.hw || t + 86400e3 < dayStart(lic.issued)
      const last = dayStart(lic.expires) + 86400e3 // end of the last usable day
      res.daysLeft = Math.max(0, Math.ceil((last - t) / 86400e3))
      if (clockBack) Object.assign(res, { ok: false, locked: true, reason: 'clock' })
      else if (t >= last) Object.assign(res, { ok: false, locked: true, reason: 'expired' })
    } else if (!lic.ok && build) {
      st.trialUsed = true
      if (!st.firstRun) st.firstRun = t
      const last = Math.min(dayStart(ymd(st.firstRun)) + build.days * 86400e3, dayStart(build.deadline) + 86400e3)
      Object.assign(res, { ok: true, edition: 'Trial', trial: true, expires: ymd(last - 86400e3), daysLeft: Math.max(0, Math.ceil((last - t) / 86400e3)) })
      if (t + SLACK < st.hw || t + SLACK < st.firstRun) Object.assign(res, { ok: false, locked: true, reason: 'clock' })
      else if (t >= last) Object.assign(res, { ok: false, locked: true, reason: 'expired' })
    } else if (!lic.ok && (requireKey || st.trialUsed)) {
      Object.assign(res, { locked: true, reason: st.trialUsed ? 'expired' : 'nokey' })
    }
    if (!res.locked || res.reason !== 'clock') st.hw = Math.max(st.hw, t)
    writeState(st)
    return res
  }

  return { status, today: () => ymd(now()) }
}

module.exports = { createGuard }
