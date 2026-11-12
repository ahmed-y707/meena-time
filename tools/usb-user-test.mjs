// User-level test of Masar Time USB, on the real app window, as a technician / customer would use it.
// Every step is checked on what the SCREEN shows, with a screenshot in usb-shots/.
//   MT_USB_KEY=<activation key for this PC> MT_ATTLOG=<path to a device attlog.dat> node tools/usb-user-test.mjs
// Test data lives only in /tmp/TEST-usb-* and is deleted at the end.
import { _electron as electron } from 'playwright'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const SHOTS = path.join(ROOT, 'usb-shots')
const UD = '/tmp/TEST-usb-data'
const FLASH = '/tmp/TEST-usb-flash'
const KEY = process.env.MT_USB_KEY || ''
const ATTLOG = process.env.MT_ATTLOG
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true })
for (const d of [UD, FLASH]) fs.rmSync(d, { recursive: true, force: true })
fs.mkdirSync(FLASH, { recursive: true })

let pass = 0, fail = 0, n = 0
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`) }
const launch = async () => {
  const app = await electron.launch({ executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'), cwd: ROOT,
    args: ['usb/main.js', '--no-sandbox', `--user-data-dir=${UD}`], env: { ...process.env, MT_USB_ROOTS: FLASH } })
  const p = await app.firstWindow()
  await p.setViewportSize({ width: 1366, height: 768 })
  p.on('pageerror', (e) => check('no page error', false, e.message))
  await app.evaluate(({ dialog }, ud) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: ud + '/TEST-report.pdf' })
    dialog.showMessageBox = async () => ({ response: 0 })
  }, UD)
  p.on('dialog', (d) => d.accept()) // «حذف الموظف…؟» → yes
  return { app, p }
}
const snap = (p, name) => p.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`) })
const text = (p, sel = 'body') => p.locator(sel).innerText()
const tab = async (p, label) => { await p.locator('#tabs button', { hasText: label }).click(); await p.waitForTimeout(400) }

// 1. first start: locked, shows this PC's code
let { app, p } = await launch()
await p.waitForSelector('#lk-code')
const code = (await text(p, '#lk-code')).trim()
check('first start shows the activation screen with «كود الجهاز»', /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(code), code)
check('the activation screen shows the company phone', (await text(p)).includes('054 395 6061'))
await snap(p, 'activation-screen')

// 2. wrong key refused
await p.fill('#lk-key', 'AAAA' + KEY.slice(4))
await p.click('#lk-go'); await p.waitForTimeout(300)
check('a wrong key is refused', (await text(p, '#lk-err')).includes('غير صحيح'))
await snap(p, 'wrong-key')

// 3. right key (pasted with a line break in the middle, as from WhatsApp)
await p.fill('#lk-key', KEY.slice(0, 40) + '\n' + KEY.slice(40))
await p.click('#lk-go')
await p.waitForSelector('#tabs button')
check('the right key activates the program', await p.locator('#shell').isVisible())
await snap(p, 'home-empty')

// 4. pull from the flash drive
fs.copyFileSync(ATTLOG, path.join(FLASH, path.basename(ATTLOG)))
await tab(p, 'سحب من الفلاشة')
await p.waitForSelector('.file')
check('the attlog file on the flash drive is found by itself', (await text(p, '#p-list')).includes(path.basename(ATTLOG)))
await snap(p, 'flash-found')
await p.click('#p-go'); await p.waitForSelector('.result')
const res1 = await text(p, '#p-res')
console.log('   pull 1:', res1.replace(/\s+/g, ' ').slice(0, 160))
check('first pull adds every punch and creates the employees', /تم سحب\s*49\s*حركة/.test(res1) && /أُضيف\s*8\s*موظف/.test(res1), res1)
await snap(p, 'flash-pulled')
await p.click('#p-go'); await p.waitForTimeout(500)
const res2 = await text(p, '#p-res')
check('pulling the same file again adds nothing (no duplicates)', /تم سحب\s*0\s*حركة/.test(res2) && res2.includes('49 حركة كانت مسحوبة'), res2)

// 5. employees: give a name
await tab(p, 'الموظفين')
const row = p.locator('tr[data-pin="5000"] input')
await row.fill('TEST-موظف أول'); await row.press('Enter'); await p.waitForTimeout(400)
check('the employee list has the 8 fingerprint numbers', (await p.locator('#e-body tr[data-pin]').count()) === 8)
await snap(p, 'employees-named')

// 6. the report
await tab(p, 'تقرير الحضور')
await p.fill('#r-from', '2026-10-01'); await p.fill('#r-to', '2026-10-31')
await p.click('#r-go'); await p.waitForTimeout(500)
const rep = await text(p, '#r-out')
check('the report shows the name typed in «الموظفين»', rep.includes('TEST-موظف أول'))
const r5000 = await p.locator('tr', { hasText: '04/10/2026' }).filter({ hasText: '5000' }).first().innerText()
check('5000 on 04/10: in 21:16, out 22:13 (first and last punch of the day)', r5000.includes('21:16') && r5000.includes('22:13'), r5000)
const r3 = await p.evaluate(() => [...document.querySelectorAll('#r-out tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim()))
  .find((c) => c[0] === '3' && c[2] === '29/10/2026')?.join(' | ') || '')
check('a repeat within 5 minutes is not a خروج (pin 3: 20:32 then 20:34)', r3.includes('20:32') && r3.includes('لا يوجد'), r3)
await snap(p, 'report')
await p.click('#r-pdf'); await p.waitForTimeout(2500)
check('«حفظ PDF» writes the report', fs.existsSync(UD + '/TEST-report.pdf') && fs.statSync(UD + '/TEST-report.pdf').size > 5000)

// 7. packages / upgrade page
await tab(p, 'الباقات والترقية')
check('the packages page lists the 3 editions', (await p.locator('.pkg').count()) === 3)
await snap(p, 'packages')
await tab(p, 'الرئيسية')
await snap(p, 'home-with-data')

// 8. data at rest is encrypted
const dat = fs.readFileSync(path.join(UD, 'masar-usb.dat'))
check('the data file is encrypted (no names or times readable)', !dat.includes(Buffer.from('TEST-موظف')) && !dat.includes(Buffer.from('2026-10-04')))
await app.close()

// 9. restart: still activated, data kept
;({ app, p } = await launch())
await p.waitForSelector('#tabs button')
check('after restart: no activation needed, data still there', (await text(p, '.stats')).includes('49'))
await app.close()

// 10. a key copied from another PC does not open it
fs.writeFileSync(path.join(UD, 'activation.key'), 'X' + KEY.slice(1))
;({ app, p } = await launch())
await p.waitForSelector('#lk-code')
check('a changed / foreign key file locks the program again', await p.locator('#lock').isVisible())
await snap(p, 'locked-again')
await app.close()

for (const d of [UD, FLASH]) fs.rmSync(d, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed — screenshots in ${SHOTS}`)
process.exit(fail ? 1 : 0)
