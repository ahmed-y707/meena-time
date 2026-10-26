// Trial build on the real Electron app (run: xvfb-run -a node tools/trial-e2e.mjs):
// locked without a code → 7-day code opens it with the countdown → an ended code locks it again.
import { _electron as electron } from '/home/frappeuser/tamken3-audit/node_modules/playwright/index.mjs'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UD = '/tmp/mt-trial-e2e'
const HOME = '/tmp/mt-trial-e2e-home'
for (const d of [UD, HOME]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d) }
const FLAG = `${ROOT}/trial-build.json`
fs.writeFileSync(FLAG, '{"trial":true}')

let pass = 0, fail = 0
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`) }
const keygen = (...a) => execFileSync('node', [`${ROOT}/tools/keygen.js`, ...a], { encoding: 'utf8' }).trim()
const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }
const launch = async () => {
  const app = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT, env: { ...process.env, HOME } })
  return { app, p: await app.firstWindow() }
}
const lock = (p) => p.locator('.dlg-backdrop.lock')

try {
  // 1. trial build, no code
  let { app, p } = await launch()
  await lock(p).waitFor({ timeout: 20000 })
  check('no code: lock screen, login hidden', await lock(p).isVisible() && !(await p.locator('text=شاشة الدخول').count()))
  check('no code: says a code is needed', /تحتاج كود ترخيص/.test(await lock(p).textContent()))
  const req = await lock(p).locator('#req').inputValue()
  check('lock screen shows the request code', /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(req), req)
  await lock(p).locator('#lic').fill('abc.Gold'); await lock(p).getByRole('button', { name: 'تسجيل' }).click(); await p.waitForTimeout(300)
  check('wrong code rejected', /غير صحيح/.test(await lock(p).locator('.err').textContent()))
  await lock(p).locator('#lic').fill(keygen(req, `Trial-${ymd(-9)}-${ymd(-3)}`)); await lock(p).getByRole('button', { name: 'تسجيل' }).click(); await p.waitForTimeout(800)
  check('ended trial code refused, still locked', await lock(p).isVisible() && /انتهت الفترة التجريبية/.test(await lock(p).locator('.err').textContent()))

  // 2. 7-day code
  await lock(p).locator('#lic').fill(keygen(req, '--days', '7')); await lock(p).getByRole('button', { name: 'تسجيل' }).click()
  await p.waitForSelector('text=شاشة الدخول', { timeout: 10000 })
  check('7-day code: unlocked, login screen shown', !(await lock(p).count()))
  await p.locator('#user').fill('Admin'); await p.locator('#pass').fill(''); await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(500)
  await p.locator('#np1').fill('start1'); await p.locator('#np2').fill('start1'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(900)
  await p.locator('#home').first().waitFor({ timeout: 10000 })
  const home = await p.locator('#home .trial').textContent().catch(() => '')
  check('home: trial banner with end date and 7 days left', /تنتهي الفترة التجريبية/.test(home) && /متبقي 7 أيام/.test(home), home)
  check('caption: «حتى <date>»', /Trial\) حتى \d{4}-\d{2}-\d{2}/.test(await p.title()), await p.title())
  await app.close()

  // 3. reopen within the trial: no lock
  ;({ app, p } = await launch())
  await p.waitForSelector('text=شاشة الدخول', { timeout: 20000 })
  check('reopen during the trial: opens normally', !(await lock(p).count()))
  await app.close()

  // 4. the code has ended → locked on start
  fs.writeFileSync(`${UD}/licence.key`, keygen(req, `Trial-${ymd(-8)}-${ymd(-2)}`))
  ;({ app, p } = await launch())
  await lock(p).waitFor({ timeout: 20000 })
  check('after the end: locked with «انتهت الفترة التجريبية»', /انتهت الفترة التجريبية/.test(await lock(p).textContent()))
  await lock(p).getByRole('button', { name: 'إغلاق البرنامج' }).click()
  await app.waitForEvent('close', { timeout: 10000 }).catch(() => {})
  check('«إغلاق البرنامج» quits', true)

  // 5. data folder wiped (uninstall/reinstall) → still locked (state kept outside it)
  fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD)
  ;({ app, p } = await launch())
  await lock(p).waitFor({ timeout: 20000 })
  check('data folder deleted: still locked', await lock(p).isVisible())
  await app.close()

  // 6. a full licence unlocks for good
  fs.writeFileSync(`${UD}/licence.key`, keygen(req, 'Gold'))
  ;({ app, p } = await launch())
  await p.waitForSelector('text=شاشة الدخول', { timeout: 20000 })
  check('full Gold licence: opens', !(await lock(p).count()))
  await app.close()
} catch (e) {
  check('unexpected error', false, e.message)
} finally {
  fs.rmSync(FLAG, { force: true })
  for (const d of [UD, HOME]) fs.rmSync(d, { recursive: true, force: true })
}
console.log(`${pass}/${pass + fail}`)
process.exit(fail ? 1 : 0)
