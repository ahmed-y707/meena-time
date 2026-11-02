// School edition on the real Electron app:  xvfb-run -a node tools/school-e2e.mjs
// licence → vocabulary → «المدرسة» menu → live receiver on a test port → 3 devices push
// 600 punches (new numbers become students) → batched save + journal acknowledged →
// a late student gets a notice in the log → WhatsApp QR shows → the app is KILLED right
// after more punches arrive and none are lost after reopening.
import { _electron as electron } from '/home/frappeuser/tamken3-audit/node_modules/playwright/index.mjs'
import fs from 'fs'; import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UD = '/tmp/ms-school-e2e', HOME = '/tmp/ms-school-e2e-home'
for (const d of [UD, HOME]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d) }
const PORT = 18555
let pass = 0, fail = 0
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${n}${x ? '  ' + x : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const ts = (d) => `${today} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const launch = async () => {
  const app = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT, env: { ...process.env, HOME } })
  const p = await app.firstWindow()
  p.on('pageerror', (e) => console.log('pageerror:', e.message))
  return { app, p }
}
const login = async (p, first) => {
  await p.waitForSelector('text=شاشة الدخول', { timeout: 30000 })
  await p.locator('#user').fill('Admin'); await p.locator('#pass').fill(first ? '' : 'start1')
  await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(600)
  if (first) { await p.locator('#np1').fill('start1'); await p.locator('#np2').fill('start1'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(900) }
  await p.locator('#home').first().waitFor({ timeout: 15000 })
}
const menu = async (p, top, item) => {
  await p.locator('#menubar .menu > button', { hasText: top }).first().click()
  await p.locator('.menu.open .drop button', { hasText: item }).first().click()
  await p.waitForTimeout(500)
}
const post = (sn, lines) => fetch(`http://127.0.0.1:${PORT}/iclock/cdata?SN=${sn}&table=ATTLOG`, { method: 'POST', body: lines.join('\n') + '\n' }).then((r) => r.text())
const count = (p, sql, args = []) => p.evaluate(([s, a]) => DB.one(s, a)?.n, [sql, args])

try {
  // 1. licence (the unregistered program allows 3 people only)
  let { app, p } = await launch()
  await p.waitForSelector('text=شاشة الدخول', { timeout: 30000 })
  const req = (await p.evaluate(() => window.bridge.licenceStatus())).requestCode
  const lic = execFileSync('node', [`${ROOT}/tools/keygen.js`, req, 'Gold'], { encoding: 'utf8' }).trim()
  check('licence accepted', (await p.evaluate((l) => window.bridge.register(l), lic)).ok)
  await app.close()

  ;({ app, p } = await launch())
  await login(p, true)
  check('caption: Masar Time, registered', /^Masar Time Ver\. 1\.0\.0 \(Gold\) Registered/.test(await p.title()), await p.title())
  const bar = await p.locator('#menubar').textContent()
  check('menu bar: «المدرسة»', bar.includes('المدرسة'))
  await p.locator('#menubar .menu > button', { hasText: 'البيانات الأساسية' }).first().click(); await p.waitForTimeout(300)
  const baseMenu = await p.locator('body').textContent()
  check('vocabulary: «الطلاب», «المراحل والفصول», no «موظف» anywhere', baseMenu.includes('الطلاب') && baseMenu.includes('المراحل والفصول') && !baseMenu.includes('موظف'))
  await p.locator('#menubar .menu > button', { hasText: 'البيانات الأساسية' }).first().click(); await p.waitForTimeout(200)

  // 2. a 07:00-style shift that started 30 minutes ago, and one student with a guardian number
  const start = new Date(Date.now() - 30 * 60e3)
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  await p.evaluate(({ s, e }) => {
    DB.run("INSERT INTO shift_groups (id, name_ar) VALUES (900, 'TEST-الدوام المدرسي')")
    for (let slot = 0; slot < 7; slot++) DB.run(`INSERT INTO shift_windows (group_id, calendar, slot, window_no, start_in, check_in, late_min, end_in, start_out, early_min, check_out, end_out)
      VALUES (900, 'Y', ?, 1, '00:01', ?, 10, '23:50', '23:51', 0, '23:55', '23:59')`, [slot, s])
    DB.run("INSERT INTO employees (code, name_ar, status, shift_group_id, mobile) VALUES ('3001', 'TEST-نورة', 'نشط', 900, '0551234567')")
    return DB.flush()
  }, { s: hhmm(start), e: '' })
  await p.evaluate(() => School.sendRoster())
  check('new student gets «انصراف بدون بصمة» automatically', (await count(p, "SELECT no_punch_out AS n FROM employees WHERE code = '3001'")) === 1)

  // 3. receiver on the test port
  await menu(p, 'المدرسة', 'استقبال البصمات من الأجهزة مباشرة')
  const rw = p.locator('[data-win="gate-receiver"]')
  await rw.locator('#r-port').fill(String(PORT)); await rw.locator('#r-on').check()
  await rw.locator('.toolbar [data-key="save"]').click(); await p.waitForTimeout(800)
  await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click().catch(() => {})
  await p.waitForTimeout(1500)
  check('receiver window: «يعمل ✓» + this PC\'s IP and port', /يعمل/.test(await rw.locator('#r-state').textContent()) && (await rw.locator('#r-how').textContent()).includes(String(PORT)))
  const hs = await (await fetch(`http://127.0.0.1:${PORT}/iclock/cdata?SN=E2E1&options=all`)).text()
  check('device handshake answered', hs.includes('GET OPTION FROM: E2E1'))

  // 4. turn messages on (test mode, SMS fallback without a provider → both attempts logged)
  await p.evaluate(() => window.bridge.gateSettings({ enabled: true, testMode: true, testNumber: '0550000001', smsMode: 'fallback', schoolName: 'TEST-مدرسة' }))

  // 5. 600 punches from 3 devices: 599 unknown numbers (become students) + the late student
  const t5 = Date.now()
  const lines = []
  for (let i = 1; i <= 599; i++) lines.push(`${2000 + i}\t${ts(new Date(Date.now() - (600 - i) * 1000))}\t0\t1`)
  await Promise.all([0, 1, 2].map(async (d) => { for (const l of lines.filter((_, i) => i % 3 === d)) if ((await post(`E2E${d + 1}`, [l])) !== 'OK: 1') throw new Error('post') }))
  check('late student punches now', (await post('E2E1', [`3001\t${ts(new Date())}\t0\t1`])) === 'OK: 1')
  // drained + saved within the 10 s batch window
  let n = 0
  for (let i = 0; i < 40 && n < 600; i++) { await sleep(500); n = await count(p, 'SELECT COUNT(*) AS n FROM punches WHERE ts >= ?', [today]) }
  check('600 punches in the database', n === 600, `${n} after ${((Date.now() - t5) / 1000).toFixed(1)} s`)
  check('599 new numbers became students (with «انصراف بدون بصمة» and the school shift)', (await count(p, "SELECT COUNT(*) AS n FROM employees WHERE code BETWEEN '2001' AND '2599' AND no_punch_out = 1 AND shift_group_id = 900")) === 599)
  await sleep(11000)
  const ack = JSON.parse(fs.readFileSync(`${UD}/gate/journal/ack.json`, 'utf8'))
  const jsize = fs.statSync(`${UD}/gate/journal/${today}.jsonl`).size
  check('journal acknowledged after the save', ack.file === `${today}.jsonl` && ack.pos === jsize, `${ack.pos}/${jsize}`)

  // 6. the late notice (WhatsApp not linked yet → «غير مربوط», SMS has no provider → its error) is in the log
  await menu(p, 'المدرسة', 'رسائل أولياء الأمور')
  const gw = p.locator('[data-win="guardian-msgs"]')
  await p.waitForTimeout(4500)
  const log = await gw.locator('#g-log').textContent()
  check('late notice attempted for the late student (both channels logged)', log.includes('TEST-نورة') && log.includes('تأخير') && /واتساب/.test(log) && /SMS/.test(log), log.slice(0, 200))
  check('test-mode banner shown', await gw.locator('#g-test-banner').isVisible())
  check('switch shows «تعمل تلقائياً»', (await gw.locator('#g-on-label').textContent()).includes('تعمل'))
  const kp = await gw.locator('#g-kpis').textContent()
  check('today: 600 with school today, present counted', /600\s*دوام اليوم/.test(kp) && /600\s*بصموا/.test(kp), kp)
  // WhatsApp QR from the real WhatsApp servers (internet)
  let qr = false
  for (let i = 0; i < 30 && !qr; i++) { await sleep(1000); qr = (await gw.locator('#g-wa img').count()) === 1 }
  check('WhatsApp pairing QR shown', qr)
  // settings round trip, SMS secret masked
  await gw.locator('#g-sms-provider').selectOption('msegat'); await p.waitForTimeout(200)
  await gw.locator('[data-sms="userName"]').fill('school'); await gw.locator('[data-sms="apiKey"]').fill('SECRET-KEY-123'); await gw.locator('[data-sms="sender"]').fill('MSAR')
  await gw.locator('#g-after').fill('45')
  await gw.locator('.toolbar [data-key="save"]').click(); await p.waitForTimeout(600)
  await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click().catch(() => {})
  const st = await p.evaluate(() => window.bridge.gateStatus())
  check('settings saved; the SMS key never comes back in full', st.settings.absentAfter === 45 && st.settings.sms.userName === 'school' && st.settings.sms.apiKey.startsWith('••••') && !JSON.stringify(st).includes('SECRET-KEY-123'))
  check('the key is stored for sending', JSON.parse(fs.readFileSync(`${UD}/gate/settings.json`, 'utf8')).sms.apiKey === 'SECRET-KEY-123')
  // the employees (students) window: vocabulary
  await menu(p, 'البيانات الأساسية', 'الطلاب')
  await p.waitForTimeout(800)
  check('students window has no «موظف»', !(await p.locator('#desktop').textContent()).includes('موظف'))

  // 7. crash right after 200 more punches (before the 10 s save) → nothing lost
  const more = []
  for (let i = 1; i <= 200; i++) more.push(`${4000 + i}\t${ts(new Date(Date.now() - i * 1000))}\t0\t1`)
  check('200 more punches accepted', (await post('E2E2', more)) === 'OK: 200')
  await sleep(300)
  app.process().kill('SIGKILL')
  await sleep(1000)
  ;({ app, p } = await launch())
  await p.waitForSelector('text=شاشة الدخول', { timeout: 30000 })
  // drained at start-up, before anyone logs in
  let n2 = 0
  for (let i = 0; i < 30 && n2 < 800; i++) { await sleep(500); n2 = await count(p, 'SELECT COUNT(*) AS n FROM punches WHERE ts >= ?', [today]) }
  check('after a crash: all 800 punches are there (journal replay)', n2 === 800, String(n2))
  check('receiver back on its port after restart', (await (await fetch(`http://127.0.0.1:${PORT}/iclock/getrequest?SN=E2E1`)).text()) === 'OK')
  const st2 = await p.evaluate(() => window.bridge.gateStatus())
  check('no second late notice after the restart', st2.today.late === 1, String(st2.today.late))
  await app.close()
} catch (e) {
  fail++; console.log('✗ crashed:', e.message)
}
console.log(`\n${pass} passed, ${fail} failed`)
fs.rmSync(UD, { recursive: true, force: true }); fs.rmSync(HOME, { recursive: true, force: true })
process.exit(fail ? 1 : 0)
