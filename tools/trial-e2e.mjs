// Trial installer on the real Electron app (run: xvfb-run -a node tools/trial-e2e.mjs):
// opens by itself with the 7-day countdown → past the deadline it locks → only a code from us opens it.
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
const token = (days, deadline) => execFileSync('node', [`${ROOT}/tools/keygen.js`, '--build', String(days), deadline], { encoding: 'utf8' }).trim()

let pass = 0, fail = 0
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`) }
const keygen = (...a) => execFileSync('node', [`${ROOT}/tools/keygen.js`, ...a], { encoding: 'utf8' }).trim()
const setBuild = (days, deadline) => fs.writeFileSync(FLAG, JSON.stringify({ token: token(days, deadline) }))
const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }
const launch = async () => {
  const app = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT, env: { ...process.env, HOME } })
  return { app, p: await app.firstWindow() }
}
const lock = (p) => p.locator('.dlg-backdrop.lock')

try {
  // 1. fresh install: no codes, straight to the login screen
  setBuild(7, ymd(10))
  let { app, p } = await launch()
  await p.waitForSelector('text=شاشة الدخول', { timeout: 20000 })
  check('first run: opens by itself, no code asked', !(await lock(p).count()))
  await p.locator('#user').fill('Admin'); await p.locator('#pass').fill(''); await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(500)
  await p.locator('#np1').fill('start1'); await p.locator('#np2').fill('start1'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(900)
  await p.locator('#home').first().waitFor({ timeout: 10000 })
  const home = await p.locator('#home .trial').textContent().catch(() => '')
  check('home: trial banner, 7 days left, WhatsApp number', /متبقي 7 أيام/.test(home) && /0535322228/.test(home), home)
  check('caption: «حتى <date>»', /Trial\) حتى \d{4}-\d{2}-\d{2}/.test(await p.title()), await p.title())
  await app.close()

  // 2. reopen: same trial, still open
  ;({ app, p } = await launch())
  await p.waitForSelector('text=شاشة الدخول', { timeout: 20000 })
  check('reopen during the trial: opens normally', !(await lock(p).count()))
  await app.close()

  // 3. trial over (build deadline passed) → locked
  setBuild(7, ymd(-1))
  ;({ app, p } = await launch())
  await lock(p).waitFor({ timeout: 20000 })
  const txt = await lock(p).textContent()
  check('trial over: locked, «انتهت الفترة التجريبية» + WhatsApp number', /انتهت الفترة التجريبية/.test(txt) && /0535322228/.test(txt), txt)
  check('login screen not reachable', !(await p.locator('text=شاشة الدخول').count()))
  await lock(p).getByRole('button', { name: 'نسخ كود الطلب' }).click(); await p.waitForTimeout(200)
  check('«نسخ كود الطلب» copies and says so', /تم نسخ/.test(await lock(p).locator('.err').textContent()))
  const req = await lock(p).locator('#req').inputValue()
  await lock(p).getByRole('button', { name: 'إغلاق البرنامج' }).click()
  await app.waitForEvent('close', { timeout: 10000 }).catch(() => {})
  check('«إغلاق البرنامج» quits', true)

  // 4. our full code opens it for good
  setBuild(7, ymd(-1))
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
