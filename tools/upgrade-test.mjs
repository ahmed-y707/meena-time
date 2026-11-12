// User-level test of «USB edition → full program» on one PC, on the real windows:
//  1. Masar Time USB: activate, pull the flash drive, name an employee
//  2. Masar Time (full): first login, register → it offers to bring the USB edition's data → yes
//  3. the employees (with the name) and every punch are there; no second offer after a restart
//  4. «سحب من الفلاشة» in «قراءة الحركات» finds the same file (nothing new, all duplicates)
//  5. the «الدخول والخروج» report shows first in / last out per day
//   MT_USB_KEY=<USB key for this PC> MT_GOLD_LICENCE=<Gold code for this PC> MT_ATTLOG=<attlog.dat> node tools/upgrade-test.mjs
// Test data lives only in /tmp/TEST-up-* and is deleted at the end; screenshots in upgrade-shots/.
import { _electron as electron } from 'playwright'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const EL = path.join(ROOT, 'node_modules/electron/dist/electron')
const SHOTS = path.join(ROOT, 'upgrade-shots')
const USB_UD = '/tmp/TEST-up-usb', FULL_UD = '/tmp/TEST-up-full', FLASH = '/tmp/TEST-up-flash'
const ATTLOG = process.env.MT_ATTLOG
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true })
for (const d of [USB_UD, FULL_UD, FLASH]) fs.rmSync(d, { recursive: true, force: true })
fs.mkdirSync(FLASH, { recursive: true })
fs.copyFileSync(ATTLOG, path.join(FLASH, path.basename(ATTLOG)))

let pass = 0, fail = 0, n = 0
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`) }
const env = { ...process.env, MT_USB_ROOTS: FLASH, MT_USB_DATA_DIR: USB_UD }
const launch = async (args) => {
  const app = await electron.launch({ executablePath: EL, cwd: ROOT, args: [...args, '--no-sandbox'], env })
  const p = await app.firstWindow()
  await p.setViewportSize({ width: 1366, height: 768 })
  p.on('pageerror', (e) => check('no page error', false, e.message))
  return { app, p }
}
const snap = (p, name) => p.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`) })
const dlgText = (p) => p.locator('.dlg-backdrop').last().locator('.body').textContent()
const dlgBtn = async (p, name) => { await p.locator('.dlg-backdrop').last().getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(300) }

// 1. the USB edition
let { app, p } = await launch(['usb/main.js', `--user-data-dir=${USB_UD}`])
await p.waitForSelector('#lk-code')
await p.fill('#lk-key', process.env.MT_USB_KEY); await p.click('#lk-go'); await p.waitForSelector('#tabs button')
await p.locator('#tabs button', { hasText: 'سحب من الفلاشة' }).click(); await p.waitForSelector('.file')
await p.click('#p-go'); await p.waitForSelector('.result')
await p.locator('#tabs button', { hasText: 'الموظفين' }).click(); await p.waitForTimeout(300)
const nameIn = p.locator('tr[data-pin="5000"] input'); await nameIn.fill('TEST-موظف من الفلاشة'); await nameIn.press('Enter'); await p.waitForTimeout(400)
check('USB edition: 49 punches pulled, employee named', (await p.locator('#e-body tr[data-pin]').count()) === 8)
await app.close()

// 2. the full program on the same PC
;({ app, p } = await launch(['.', `--user-data-dir=${FULL_UD}`]))
await p.waitForSelector('.login-page #pass', { timeout: 20000 })
await p.locator('#user').fill('Admin'); await p.locator('#pass').fill(''); await p.locator('.dlg .btns button.pri').first().click(); await p.waitForTimeout(500)
await p.locator('#np1').fill('start1'); await p.locator('#np2').fill('start1'); await dlgBtn(p, 'حفظ'); await p.waitForTimeout(500)
check('full program: no offer while unregistered (a trial would cap the employees)', !(await p.locator('.dlg-backdrop').count()))
await p.evaluate(() => { openRegister() }); await p.waitForTimeout(300)
await p.locator('#lic').fill(process.env.MT_GOLD_LICENCE); await p.locator('.dlg').getByRole('button', { name: 'تسجيل' }).click(); await p.waitForTimeout(400)
check('full program: registered', /تم تسجيل البرنامج/.test(await dlgText(p))); await dlgBtn(p, 'موافق')
const offer = await dlgText(p)
check('after registering it offers the USB edition\'s data (8 employees, 49 punches)', /نسخة الفلاشة/.test(offer) && /8 موظف/.test(offer) && /49 حركة/.test(offer), offer)
await snap(p, 'upgrade-offer')
await dlgBtn(p, 'نعم')
const done = await dlgText(p)
check('the data is brought over', /تم نقل بيانات نسخة الفلاشة/.test(done) && /جديدة 49/.test(done), done)
await snap(p, 'upgrade-done'); await dlgBtn(p, 'موافق')
const db = await p.evaluate(() => ({ emps: DB.one('SELECT COUNT(*) AS n FROM employees').n, punches: DB.one('SELECT COUNT(*) AS n FROM punches').n,
  name: DB.one("SELECT name_ar FROM employees WHERE code = '5000'")?.name_ar }))
check('8 employees and 49 punches in the full program', db.emps === 8 && db.punches === 49, JSON.stringify(db))
check('the name typed in the USB edition came over', db.name === 'TEST-موظف من الفلاشة', db.name)

// 4. «سحب من الفلاشة» in «قراءة الحركات»
await p.evaluate(() => { openReadPunches() }); await p.waitForTimeout(400)
await p.locator('#rp-from').fill('2026-10-01'); await p.locator('#rp-to').fill('2026-10-31')
await p.locator('#rp-flash').click(); await p.waitForTimeout(800)
const rd = await p.locator('#rp-msg').textContent()
check('«سحب من الفلاشة» finds the attlog on the flash drive by itself (all 49 already in: duplicates)', /تمت قراءة 49 حركة/.test(rd) && /جديدة 0/.test(rd), rd)
check('the file found is listed', (await p.locator('#rp-flist').textContent()).includes(path.basename(ATTLOG)))
await snap(p, 'read-from-flash')

// 5. the «الدخول والخروج» report
await p.evaluate(() => { openReport('الدخول والخروج') }); await p.waitForTimeout(400)
const rw = p.locator('.win[data-win="rep-الدخول والخروج"]')
await rw.locator('#r-from').fill('2026-10-01'); await rw.locator('#r-to').fill('2026-10-31')
await rw.locator('.toolbar button', { hasText: 'موافق' }).first().click(); await p.waitForTimeout(600)
const row = await rw.evaluate((w) => [...w.querySelectorAll('table.rep tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim()))
  .find((c) => c[0] === '5000' && c[2] === '2026-10-04')?.join(' | ') || '')
check('report «الدخول والخروج»: 5000 on 2026-10-04 in 21:16 out 22:13', row.includes('21:16') && row.includes('22:13'), row)
await snap(p, 'report-in-out')
await app.close()

// 3b. a restart doesn't offer again
;({ app, p } = await launch(['.', `--user-data-dir=${FULL_UD}`]))
await p.waitForSelector('.login-page #pass', { timeout: 20000 })
await p.locator('#pass').fill('start1'); await p.locator('.dlg .btns button.pri').first().click(); await p.waitForTimeout(1200)
check('after a restart: no second offer', (await p.locator('#home').isVisible()) && !(await p.locator('.dlg-backdrop').count()))
await app.close()

for (const d of [USB_UD, FULL_UD, FLASH]) fs.rmSync(d, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed — screenshots in ${SHOTS}`)
process.exit(fail ? 1 : 0)
