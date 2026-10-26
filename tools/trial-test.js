// Trial guard checks (no Electron): node tools/trial-test.js
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-trial-'))
process.env.HOME = path.join(tmp, 'home'); fs.mkdirSync(process.env.HOME)
const data = path.join(tmp, 'data'); fs.mkdirSync(data)
const { createGuard } = require('../lib/guard')
const { requestCode } = require('../lib/license')
const lic = path.join(data, 'licence.key')
const key = (...a) => execFileSync('node', [path.join(__dirname, 'keygen.js'), requestCode(), ...a], { encoding: 'utf8' }).trim()
const build = (days, deadline) => execFileSync('node', [path.join(__dirname, 'keygen.js'), '--build', String(days), deadline], { encoding: 'utf8' }).trim()
const g = (buildTrial = null) => createGuard({ dataDir: () => data, licencePath: () => lic, buildTrial })
let pass = 0, fail = 0
const check = (name, cond, extra) => { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + JSON.stringify(extra)}`) }
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
const reset = () => { for (const f of fs.readdirSync(data)) fs.rmSync(path.join(data, f)); fs.rmSync(path.join(process.env.HOME, '.meena-time-state'), { force: true }) }

let s = g().status(); check('normal build, no code: runs (3-employee mode)', !s.locked && !s.ok, s)
s = g('bogus.TrialBuild-7-20991231').status(); check('trial build with a forged token: locked nokey', s.locked && s.reason === 'nokey', s)
fs.writeFileSync(lic, key('--days', '7')); s = g().status()
check('7-day code: runs, trial, 7 days left', s.ok && s.trial && s.daysLeft === 7 && !s.locked, s)
fs.writeFileSync(lic, key('--days', '7').replace(/.$/, (c) => (c === '1' ? '2' : '1'))); s = g().status()
check('edited dates in the code: rejected', !s.ok && s.locked, s)
fs.rmSync(lic); s = g().status(); check('code deleted after a trial (normal build): locked', s.locked && s.reason === 'expired', s)
fs.rmSync(path.join(data, '.mt-state')); s = g().status(); check('data-folder state deleted too: still locked (home/ProgramData copy)', s.locked, s)
reset(); fs.writeFileSync(lic, key(`Trial-${day(-10)}-${day(-4)}`)); s = g().status(); check('ended trial code: locked expired', s.locked && s.reason === 'expired' && !s.ok, s)
reset(); fs.writeFileSync(lic, key(`Trial-${day(0)}-${day(0)}`)); s = g().status(); check('last day still usable', s.ok && s.daysLeft === 1, s)
reset(); fs.writeFileSync(lic, key('--days', '7')); g().status()
const st = path.join(data, '.mt-state'); const future = Date.now() + 3 * 86400e3
const t = new Date(future); fs.utimesSync(path.join(data, 'licence.key'), t, t)
s = g().status(); check('clock turned back (file stamped 3 days ahead): locked clock', s.locked && s.reason === 'clock', s)
reset(); fs.writeFileSync(lic, key(`Trial-${day(5)}-${day(11)}`)); s = g().status(); check('code issued in the future (clock set back before issue): locked clock', s.locked && s.reason === 'clock', s)
reset(); fs.writeFileSync(lic, key('--days', '7')); fs.writeFileSync(st, 'garbage'); s = g().status(); check('tampered state file: ignored, still runs', s.ok, s)
reset(); fs.writeFileSync(lic, key('Gold')); s = g(build(7, day(10))).status(); check('full Gold licence in trial build: runs', s.ok && !s.trial && !s.locked, s)
// trial installer: starts by itself on first run
reset(); const B = build(7, day(10))
s = g(B).status(); check('trial installer, first run: runs, 7 days left, no code', s.ok && s.trial && s.daysLeft === 7 && !s.locked, s)
s = g(B).status(); check('second start: same trial', s.ok && s.daysLeft === 7, s)
const realNow = Date.now
Date.now = () => realNow() + 4 * 86400e3; s = g(B).status(); check('4 days later: 3 days left', s.ok && s.daysLeft === 3, s)
Date.now = () => realNow() + 8 * 86400e3; s = g(B).status(); check('8 days later: locked expired', s.locked && s.reason === 'expired', s)
Date.now = () => realNow() + 1 * 86400e3; s = g(B).status(); check('clock turned back after that: locked clock', s.locked && s.reason === 'clock', s)
Date.now = realNow
for (const f of fs.readdirSync(data)) fs.rmSync(path.join(data, f))
Date.now = () => realNow() + 8 * 86400e3; s = g(B).status(); check('reinstall (data folder wiped): trial does not restart', s.locked, s); Date.now = realNow
reset(); s = g(build(7, day(-1))).status(); check('build past its deadline: locked even on first run', s.locked && s.reason === 'expired', s)
reset(); s = g(build(7, day(2))).status(); check('deadline caps the days left', s.ok && s.daysLeft === 3, s)
;(async () => {
  const gg = g(); await gg.checkNetTime(5000)
  const real = new Date(); check('server time reachable and matches today', gg.today() === `${real.getFullYear()}-${String(real.getMonth() + 1).padStart(2, '0')}-${String(real.getDate()).padStart(2, '0')}`, gg.today())
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`${pass}/${pass + fail}`); process.exit(fail ? 1 : 0)
})()
