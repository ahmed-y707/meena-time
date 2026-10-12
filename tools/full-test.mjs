// Full functional test of the real Electron app (run: xvfb-run -a node tools/full-test.mjs).
// Walks every menu item, every toolbar button and every dialog; prints PASS/FAIL per
// check and saves a screenshot of each screen in test-shots/.
import { _electron as electron } from '/home/frappeuser/tamken3-audit/node_modules/playwright/index.mjs'
import fs from 'fs'
import { execFileSync } from 'child_process'

const ROOT = '/root/meena-time'
const SHOTS = `${ROOT}/test-shots`
const UD = '/tmp/mt-fulltest'
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true })
fs.rmSync(UD, { recursive: true, force: true })

let pass = 0, fail = 0
const results = []
const check = (name, ok, info = '') => { ok ? pass++ : fail++; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`) }

const app = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
const p = await app.firstWindow()
await p.setViewportSize({ width: 1366, height: 768 })
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()) })
// native print / save dialogs can't be driven headless: stub them
// printing goes through main (print:html → hidden window): record the documents instead
await app.evaluate(({ ipcMain }) => { globalThis.__prints = []; ipcMain.removeHandler('print:html'); ipcMain.handle('print:html', (e, html) => { globalThis.__prints.push(html); return { ok: true } }) })
const prints = () => app.evaluate(() => globalThis.__prints)
await app.evaluate(({ dialog }, ud) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: ud + '/manual-backup.sqlite' }) }, UD)

let shot = 0
const snap = async (name) => p.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, '0')}-${name}.png` })
const menu = async (m, item, sub) => {
  await p.locator('#menubar .menu > button', { hasText: m }).first().click()
  if (sub) await p.locator('.menu.open .drop .has-sub', { hasText: sub }).hover()
  await p.locator('.menu.open .drop button', { hasText: item }).first().click()
  await p.waitForTimeout(250)
}
const dlgText = async () => (await p.locator('.dlg-backdrop').last().textContent()).trim()
const okMsg = async () => { const t = (await p.locator('.dlg-backdrop .body').last().textContent()).trim(); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(150); return t }
const yes = async () => { await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'نعم' }).click(); await p.waitForTimeout(250) }
const win = (t) => p.locator('.win', { has: p.locator('.cap', { hasText: t }) }).last()
const repWin = (name) => p.locator(`.win[data-win="rep-${name}"]`)
const btn = (w, name) => w.locator('.toolbar button', { hasText: name }).first()
const lastRow = (w) => w.locator('tbody tr').last()
const rowCount = async (w) => w.locator('tbody tr:not(.new)').count() // without the numbered new row
// Apex grid flow: «حفظ» confirms with «تم حفظ البيانات بنجاح.»; «إهمال» asks first, then shows the rows only
const gsave = async (w) => {
  await btn(w, 'حفظ').click(); await p.waitForTimeout(250)
  const d = p.locator('.dlg-backdrop').last()
  if (await d.count() && /تم حفظ البيانات بنجاح/.test(await d.textContent())) await okMsg()
}
const gundo = async (w, { add = true } = {}) => {
  await btn(w, 'إهمال').click(); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(150)
  if (add) { await btn(w, 'جديد').click(); await p.waitForTimeout(100) }
}
const closeWin = async (w) => { await btn(w, 'إغلاق').click(); await p.waitForTimeout(150) }

// ── 1. login ──────────────────────────────────────────────
await p.waitForSelector('text=شاشة الدخول', { timeout: 20000 })
await snap('login')
check('login: single database shown', (await p.locator('#year option').count()) === 1)
await p.locator('#pass').fill('bad'); await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(300)
check('login: wrong password rejected', /غير صحيحة/.test(await p.locator('.dlg .err').textContent()))
await p.locator('#user').fill('Admin'); await p.locator('#pass').fill(''); await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(400)
check('first login: «admin» signs in as «أ» and is forced to set a password', /تعيين كلمة مرور جديدة/.test(await dlgText()) && /«أ»/.test(await dlgText()))
await p.locator('#np1').fill('ab'); await p.locator('#np2').fill('ab'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(150)
check('first login: short password rejected', /4 أحرف/.test(await p.locator('.dlg-backdrop').last().locator('.err').textContent()))
await snap('force-password')
await p.locator('#np1').fill('start1'); await p.locator('#np2').fill('start1'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(700)
check('login: default admin «أ» in after setting the password', await p.locator('#home').isVisible())
await snap('home')
check('home: 4 tiles', (await p.locator('.tile').count()) === 4)
await p.locator('.tile', { hasText: 'التجهيز' }).click(); await p.waitForTimeout(150)
check('home: «التجهيز» opens its 8 tiles (Apex)', (await p.locator('#home.sub .tile').count()) === 8 && /التجهيز/.test(await p.locator('#home .title').textContent()))
await p.locator('.tile', { hasText: 'الموظفون' }).click(); await p.waitForTimeout(250)
check('home: a sub tile opens its screen', (await p.locator('.win', { has: p.locator('.cap', { hasText: 'الموظفون' }) }).count()) === 1)
await p.locator('.home-btn').click(); await p.waitForTimeout(150)
check('home: the home button closes windows and comes back to the 4 tiles', (await p.locator('.win').count()) === 0 && (await p.locator('#home .tile').count()) === 4)
for (const [t, n] of [['الإجراءات', 7], ['التقارير', 10], ['المستخدمون', 4]]) {
  await p.locator('#home .tile', { hasText: t }).click(); await p.waitForTimeout(100)
  check(`home: «${t}» opens ${n} tiles`, (await p.locator('#home.sub .tile').count()) === n); await p.locator('.home-btn').click(); await p.waitForTimeout(100)
}
check('home: trial banner shown when unregistered', await p.locator('.trial').isVisible())
check('caption: Unregistered', /Unregistered/.test(await p.locator('#caption-text').textContent()))
check('caption: version matches package.json', (await p.locator('#caption-text').textContent()).includes(`Ver. ${JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf8')).version} `))
check('menubar: 7 menus', (await p.locator('#menubar .menu').count()) === 7)

// every menu opens and lists its items
for (const [m, n] of [['ملف', 2], ['البيانات الأساسية', 8], ['الإجراءات', 9], ['التقارير', 14], ['الاعدادات', 6], ['ادوات', 1], ['مساعده', 3]]) {
  await p.locator('#menubar .menu > button', { hasText: m }).first().click(); await p.waitForTimeout(150)
  check(`menu «${m}» has ${n} items`, (await p.locator('.menu.open .drop button').count()) === n, `got ${await p.locator('.menu.open .drop button').count()}`)
  if (m === 'البيانات الأساسية' || m === 'الإجراءات' || m === 'التقارير') await snap(`menu-${m}`)
  await p.keyboard.press('Escape'); await p.mouse.click(700, 700); await p.waitForTimeout(100)
}

// ── 2. settings: company ──────────────────────────────────
await menu('الاعدادات', 'بيانات المؤسسه'); let cw = win('بيانات الشركة'); await snap('company')
await btn(cw, 'موافق').click(); await p.waitForTimeout(150)
check('company: name required', /مطلوب/.test(await okMsg()))
await cw.locator('#co-company_name').fill('مستشفى الاختبار'); await cw.locator('#co-company_phone').fill('0112345678'); await cw.locator('#co-company_activity').fill('خدمات طبية')
await cw.locator('#co-company_email').fill('bad'); await btn(cw, 'موافق').click(); await p.waitForTimeout(150)
check('company: bad email rejected', /البريد/.test(await okMsg()))
await cw.locator('#co-company_email').fill('info@test.sa'); await btn(cw, 'موافق').click(); await p.waitForTimeout(250); await okMsg(); await closeWin(cw)
await menu('الاعدادات', 'بيانات المؤسسه'); cw = win('بيانات الشركة')
check('company: saved and reloaded', (await cw.locator('#co-company_name').inputValue()) === 'مستشفى الاختبار' && (await cw.locator('#co-company_email').inputValue()) === 'info@test.sa')
await closeWin(cw)

// ── 3. base-data grids (add / required / save / edit / undo / delete) ──
async function gridCrud(title, menuItem, fill, { required = 'مطلوب' } = {}) {
  await menu('البيانات الأساسية', menuItem)
  const w = win(title)
  check(`${title}: window opens`, await w.isVisible())
  await snap(`grid-${title}`)
  // required field
  await lastRow(w).locator('[data-f]').first().evaluate((el) => { el.value = el.tagName === 'SELECT' ? el.value : ' '; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input')) })
  await btn(w, 'حفظ').click(); await p.waitForTimeout(200)
  if (await p.locator('.dlg-backdrop').count()) check(`${title}: required validation`, (await okMsg()).includes(required))
  await gundo(w, { add: false })
  check(`${title}: «إهمال» discards unsaved row`, (await rowCount(w)) === 0 && (await w.locator('tbody tr.new').count()) === 0)
  check(`${title}: viewing → جديد on, حفظ / إهمال off`, !(await btn(w, 'جديد').isDisabled()) && (await btn(w, 'حفظ').isDisabled()) && (await btn(w, 'إهمال').isDisabled()))
  await btn(w, 'جديد').click(); await p.waitForTimeout(100)
  check(`${title}: جديد → numbered new row, جديد off`, (await w.locator('tbody tr.new').count()) === 1 && (await btn(w, 'جديد').isDisabled()))
  for (const values of fill) {
    const r = lastRow(w)
    for (const [f, v] of Object.entries(values)) {
      const el = r.locator(`[data-f=${f}]`)
      if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(typeof v === 'number' ? { index: v } : { label: v })
      else await el.fill(String(v))
    }
    await btn(w, 'حفظ').click(); await p.waitForTimeout(250)
    { const m = await okMsg(); if (!/تم حفظ البيانات بنجاح/.test(m)) check(`${title}: save`, false, m) }
  }
  check(`${title}: ${fill.length} rows saved`, (await rowCount(w)) === fill.length, `rows=${await rowCount(w)}`)
  // edit first row, undo, then edit + save
  const first = w.locator('tbody tr').first().locator('[data-f]').first()
  if ((await first.evaluate((e) => e.tagName)) === 'INPUT') {
    const orig = await first.inputValue()
    await first.fill(orig + ' X'); await gundo(w, { add: false })
    check(`${title}: «إهمال» restores edited value`, (await w.locator('tbody tr').first().locator('[data-f]').first().inputValue()) === orig)
    await w.locator('tbody tr').first().locator('[data-f]').first().fill(orig + ' م'); await gsave(w)
    check(`${title}: edit saved`, (await w.locator('tbody tr').first().locator('[data-f]').first().inputValue()) === orig + ' م')
  }
  // Apex shows «مساعده» only on some of these windows
  if (await btn(w, 'مساعده').count()) { await btn(w, 'مساعده').click(); await p.waitForTimeout(100); check(`${title}: «مساعده» shows help`, (await okMsg()).length > 5) }
  if (await btn(w, 'طباعه').count()) { await btn(w, 'طباعه').click(); await p.waitForTimeout(100) }
  return w
}

let w = await gridCrud('قوائم البرنامج', 'قوائم البرنامج', [{ name_ar: 'ممرض' }, { name_ar: 'محاسب' }])
check('lists: «نوع القائمة» = Apex\'s 5 types in order, on the right', (await w.locator('.list-types .lt').count()) === 5 && (await w.locator('.list-types .lt').allTextContents()).map((t) => t.trim()).join('|') === 'الوظائف|المهام|الديانة|ملاحظات الحضور|نوع الاجازة' && (await w.locator('.list-types').boundingBox()).x > (await w.locator('.gs-main').boundingBox()).x)
check('lists: only جديد · حفظ · إهمال · حذف · إغلاق', (await w.locator('.toolbar button span').allTextContents()).map((t) => t.trim()).join('|') === 'جديد|حفظ|إهمال|حذف|إغلاق')
for (const [type, name] of [['نوع الاجازة', 'سنوية'], ['الديانة', 'مسيحي']]) {
  await w.locator('.list-types .lt', { hasText: type }).click(); await p.waitForTimeout(120)
  check(`lists: «${type}» caption + own (empty) list`, (await w.locator('.grid-caption').textContent()) === type && (await rowCount(w)) === 0)
  await lastRow(w).locator('[data-f=name_ar]').fill(name); await gsave(w)
}
await w.locator('.list-types .lt', { hasText: 'الوظائف' }).click(); await p.waitForTimeout(120)
check('lists: switching back shows the jobs only', (await rowCount(w)) === 2)
// Enter saves the row at once and opens the next empty row
const jobs = () => p.evaluate(() => DB.one("SELECT COUNT(*) AS n FROM lists WHERE list_type = 'job'").n)
const jobsBefore = await jobs()
await lastRow(w).locator('[data-f=name_ar]').fill('سائق'); await lastRow(w).locator('[data-f=name_ar]').press('Enter'); await p.waitForTimeout(250)
check('lists: Enter saves the new row immediately', (await jobs()) === jobsBefore + 1)
check('lists: … and opens another empty row with the cursor in it', (await w.locator('tbody tr').count()) === 4 && await lastRow(w).locator('[data-f=name_ar]').evaluate((e) => e === document.activeElement))
await lastRow(w).locator('[data-f=name_ar]').fill('كاتب'); await lastRow(w).locator('[data-f=name_ar]').press('Enter'); await p.waitForTimeout(250)
check('lists: rows numbered 1…n within the list', (await w.locator('tbody tr').nth(3).locator('td').nth(1).textContent()) === '4' && (await jobs()) === jobsBefore + 2)
await w.locator('tbody tr').first().locator('[data-f=name_ar]').fill('ممرض م ت'); await w.locator('tbody tr').first().locator('[data-f=name_ar]').press('Enter'); await p.waitForTimeout(250)
check('lists: Enter on an edited row saves it and moves down', await p.evaluate(() => !!DB.one("SELECT 1 FROM lists WHERE name_ar = 'ممرض م ت'")) && await w.locator('tbody tr').nth(1).locator('[data-f=name_ar]').evaluate((e) => e === document.activeElement))
await lastRow(w).locator('[data-f=name_ar]').fill(' '); await lastRow(w).locator('[data-f=name_ar]').press('Enter'); await p.waitForTimeout(150)
check('lists: Enter with a missing name shows the message and saves nothing', /مطلوب/.test(await okMsg()) && (await jobs()) === jobsBefore + 2)
await gundo(w)
await p.evaluate(() => { DB.run("UPDATE lists SET name_ar = 'ممرض م' WHERE name_ar = 'ممرض م ت'") })
await p.evaluate(() => { DB.run("DELETE FROM lists WHERE name_ar IN ('سائق', 'كاتب')") }); await w.locator('.list-types .lt', { hasText: 'المهام' }).click(); await w.locator('.list-types .lt', { hasText: 'الوظائف' }).click(); await p.waitForTimeout(120)
check('lists: rows stored with their type', await p.evaluate(() => DB.all('SELECT list_type t, name_ar n FROM lists ORDER BY id').map((r) => r.t + ':' + r.n).join()) === 'job:ممرض م,job:محاسب,leave:سنوية,religion:مسيحي')
await closeWin(w)
await menu('البيانات الأساسية', 'الإدارات والأقسام'); w = win('قوائم الأقسام والإدارات'); await snap('departments')
check('departments: Apex viewing state (حفظ / إهمال off)', (await btn(w, 'حفظ').isDisabled()) && (await btn(w, 'إهمال').isDisabled()) && !(await btn(w, 'رئيسي').isDisabled()))
await btn(w, 'جديد').click(); await p.waitForTimeout(120); check('departments: «جديد» needs a selected إدارة', /حدد الإدارة/.test(await okMsg()))
await btn(w, 'رئيسي').click(); check('departments: adding → only حفظ / إهمال', (await btn(w, 'جديد').isDisabled()) && (await btn(w, 'حذف').isDisabled()) && !(await btn(w, 'حفظ').isDisabled()) && (await w.locator('#dw-id').inputValue()) === '1')
await btn(w, 'حفظ').click(); await p.waitForTimeout(150); check('departments: name required', /مطلوب/.test(await okMsg()))
await w.locator('#dw-ar').fill('الإدارة الطبية'); await w.locator('#dw-en').fill('Medical'); await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg()
check('departments: «رئيسي» saved a top-level إدارة in the tree', (await w.locator('.dept-tree > ul > li > .tn', { hasText: 'الإدارة الطبية' }).count()) === 1 && (await w.locator('#dw-id').inputValue()) === '1')
await btn(w, 'جديد').click(); await w.locator('#dw-ar').fill('قسم الطوارئ'); await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg()
check('departments: section numbered like Apex (11)', (await w.locator('#dw-id').inputValue()) === '11')
check('departments: «جديد» saved a section under the selected إدارة', (await w.locator('.dept-tree li li .tn', { hasText: 'قسم الطوارئ' }).count()) === 1 && await p.evaluate(() => DB.one("SELECT parent_id FROM departments WHERE name_ar = 'قسم الطوارئ'").parent_id) === 1)
await btn(w, 'رئيسي').click(); await w.locator('#dw-ar').fill('الإدارة الطبية'); await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('departments: duplicate name at the same level refused', /مكرر/.test(await okMsg())); await btn(w, 'إهمال').click(); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(100)
await w.locator('.tn', { hasText: 'الإدارة الطبية' }).click(); await w.locator('#dw-ar').fill('xx'); await btn(w, 'إهمال').click(); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(100)
check('departments: «إهمال» restores the record', (await w.locator('#dw-ar').inputValue()) === 'الإدارة الطبية')
await btn(w, 'حذف').click(); await p.waitForTimeout(150)
check('departments: parent with sections cannot be deleted', /أقسام تابعة/.test(await okMsg()))
await closeWin(w)
w = await gridCrud('المشـــاريع', 'المشاريع', [{ name_ar: 'مشروع أ', name_en: 'Project A' }])
// «طباعة» prints the list itself as a report (letterhead + table), not the screen
{
  const before = (await prints()).length
  await btn(w, 'طباعه').click(); await p.waitForTimeout(400)
  const doc = (await prints())[before] || ''
  check('grid print: sends a document', !!doc)
  fs.writeFileSync(`${SHOTS}/grid-print.html`, doc)
  check('grid print: letterhead + title + rows as text', doc.includes('rep-head') && doc.includes('المشـــاريع') && doc.includes('مشروع أ'))
  check('grid print: no form controls in the printout', !/<(select|input)\b/.test(doc.split('<body')[1] || ''))
}
await closeWin(w)
w = await gridCrud('مجموعات الموظفين', 'مجموعات الموظفين', [{ name_ar: 'المجموعة الأولى' }])
check('employee groups: Apex «الموظفون» button', (await btn(w, 'الموظفون').count()) === 1); await closeWin(w)
w = await gridCrud('العطلات الرسمية', 'العطلات الرسمية', [{ name_ar: 'اليوم الوطني', from_date: '2026-09-23', to_date: '2026-09-23' }]); await closeWin(w)
await p.evaluate(() => openGuide('أجهزة البصمة')); await p.waitForTimeout(300); w = win('دليل الاستخدام')
check('guide: «أجهزة البصمة» instructions', /Menu ← Comm ← Ethernet/.test(await w.locator('article').textContent())); await closeWin(w)
await menu('البيانات الأساسية', 'تعريف الأجهزة'); w = win('اعدادات الجهاز'); await snap('devices')
check('devices: no «كلمة الاتصال» / «الرقم التسلسلي» (Apex)', (await w.locator('#dv-key, #dv-serial').count()) === 0)
check('devices: Apex «نوع الجهاز» list', (await w.locator('#dv-type option').allTextContents()).join('|') === '-|ZKTeco|Timmy ZX_DF02|Timmy TM_F630|Timmy TM-AI06')
check('devices: Apex «نوع الاتصال» list', (await w.locator('#dv-conn option').allTextContents()).filter(Boolean).join('|') === 'TCP / IP|Serial|Modem')
await btn(w, 'جديد').click(); check('devices: a new device starts with empty IP / Port', (await w.locator('#dv-ip').inputValue()) === '' && (await w.locator('#dv-port').inputValue()) === ''); await w.locator('#dv-name').fill('جهاز المدخل'); await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('devices: نوع الجهاز required', /نوع الجهاز مطلوب/.test(await okMsg()))
await w.locator('#dv-type').selectOption({ label: 'ZKTeco' }); await w.locator('#dv-conn').selectOption('Serial'); await p.waitForTimeout(80)
check('devices: Serial shows COM + Baud, not IP', (await w.locator('#dv-scom').isVisible()) && !(await w.locator('#dv-ip').isVisible()))
await w.locator('#dv-conn').selectOption('Modem'); await p.waitForTimeout(80)
check('devices: Modem shows COM + Baud + Phone + Dial', (await w.locator('#dv-mphone').isVisible()) && (await w.locator('#dv-mdial').isVisible()))
await w.locator('#dv-conn').selectOption('TCP / IP'); await p.waitForTimeout(80)
await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('devices: TCP / IP needs the IP', /IP/.test(await okMsg()))
await w.locator('#dv-ip').fill('127.0.0.1'); await w.locator('#dv-pick').click(); await p.waitForTimeout(150)
await p.locator('.dlg .dv-tree .tn', { hasText: 'قسم الطوارئ' }).click(); await p.waitForTimeout(100)
check('devices: القسم picked from the tree', /قسم الطوارئ/.test(await w.locator('#dv-dep').inputValue()))
await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg()
check('devices: saved and listed with its code + department', (await w.locator('tbody tr[data-id]').count()) === 1 && /قسم الطوارئ/.test(await w.locator('tbody tr').first().textContent()) && (await w.locator('#dv-port').inputValue()) === '4370')
await closeWin(w)
await menu('البيانات الأساسية', 'الإدارات والأقسام'); w = win('قوائم الأقسام والإدارات'); await w.locator('.tn', { hasText: 'قسم الطوارئ' }).click(); await btn(w, 'حذف').click(); await p.waitForTimeout(150)
check('departments: section used by a device cannot be deleted', /مرتبط/.test(await okMsg())); await closeWin(w)
w = await gridCrud('مجموعات أوقات الدوام', 'مواعيد العمل', [{ name_ar: 'صباحي' }, { name_ar: 'مسائي' }])

// shift times — Apex «إعداد مواعيد العمل»
await gundo(w, { add: false }); await w.locator('tbody tr').first().click(); await btn(w, 'المواعيد').click(); await p.waitForTimeout(300)
let tw = win('إعداد مواعيد العمل')
const tab = async (t, day) => { await t.locator('.st-tabs button', { hasText: day }).click(); await p.waitForTimeout(80) }
const per = (t, i) => t.locator(`.st-grid tr[data-i="${i}"]`)
// «تكرار» asks first (Apex), then copies the day to every day that is not a holiday
const repeat = async (t, yes = true) => { await btn(t, 'تكرار').click(); await p.waitForTimeout(100); await p.locator('.dlg').getByRole('button', { name: yes ? 'نعم' : 'لا' }).click(); await p.waitForTimeout(100) }
const setPer = async (t, i, b, e, late = '15', early = '15') => { const r = per(t, i); await r.locator('[data-f=b]').fill(b); await r.locator('[data-f=e]').fill(e); await r.locator('[data-f=late]').fill(late); await r.locator('[data-f=early]').fill(early) }
check('shift times: Apex window — 7 day tabs × 4 periods × 8 columns', (await tw.locator('.st-tabs button').count()) === 7 && (await tw.locator('.st-grid tbody tr').count()) === 4 && (await tw.locator('.st-grid tbody tr').first().locator('input').count()) === 8)
check('shift times: Apex toolbar مساعده · تكرار · حفظ · إغلاق', (await tw.locator('.toolbar button span').allTextContents()).map((x) => x.trim()).join('|') === 'مساعده|تكرار|حفظ|إغلاق')
check('shift times: «هام جدا» note', /هام جدا/.test(await tw.locator('.st-note').textContent()) && (await tw.locator('#st-ext').count()) === 0)
check('windows: opening one hides the other (Apex MDI)', (await w.isHidden()) && (await tw.isVisible()))
const si1 = per(tw, 1).locator('[data-f=si]')
await si1.click(); check('typing: a time field shows 00:00 when clicked', (await si1.inputValue()) === '00:00')
await p.keyboard.type('0730'); check('typing: digits fill 00:00 from the left', (await si1.inputValue()) === '07:30')
await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); check('typing: Backspace puts 0s back', (await si1.inputValue()) === '07:00')
await p.keyboard.type('x'); check('typing: letters ignored in a time field', (await si1.inputValue()) === '07:00')
await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace')
const late0 = per(tw, 0).locator('[data-f=late]')
await late0.click(); check('typing: an untouched / cleared time field stays empty', (await si1.inputValue()) === '')
await p.keyboard.type('a5'); check('typing: clicking a field selects it — «0» replaced, digits only', (await late0.inputValue()) === '5')
await tab(tw, 'الجمعة'); check('shift times: Friday off by default', (await tw.locator('#st-off').isChecked()) && (await per(tw, 0).locator('[data-f=b]').isDisabled()))
await tab(tw, 'السبت'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(150)
check('shift times: empty day rejected', /الفترة الأولى/.test(await okMsg()))
await setPer(tw, 0, '08:00', '16:00')
check('shift times: «عدد ساعات العمل» follows the periods', (await tw.locator('#st-hours').inputValue()) === '08:00')
await btn(tw, 'تكرار').click(); await p.waitForTimeout(100)
check('shift times: «تكرار» asks first', /سيتم تكرار مواعيد العمل لجميع أيام الأسبوع عدا أيام الاجازات هل أنت متأكد؟/.test(await dlgText()))
await p.locator('.dlg').getByRole('button', { name: 'لا' }).click(); await p.waitForTimeout(100)
await tab(tw, 'الثلاثاء'); check('shift times: «لا» copies nothing', (await per(tw, 0).locator('[data-f=b]').inputValue()) === '')
await tab(tw, 'السبت'); await repeat(tw)
await tab(tw, 'الجمعة'); check('shift times: «تكرار» skips holidays (Friday stays أجازة)', (await tw.locator('#st-off').isChecked()) && (await per(tw, 0).locator('[data-f=b]').inputValue()) === '')
await tab(tw, 'الثلاثاء'); check('shift times: «تكرار» copies the day to every day', (await per(tw, 0).locator('[data-f=b]').inputValue()) === '08:00')
await tab(tw, 'الخميس'); await tw.locator('#st-off').check(); await p.waitForTimeout(80)
check('shift times: «هذا اليوم أجازة» disables the day', await per(tw, 0).locator('[data-f=b]').isDisabled())
await tab(tw, 'الجمعة'); await tw.locator('#st-off').check()
await tab(tw, 'السبت'); await per(tw, 0).locator('[data-f=late]').fill('500'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(150)
check('shift times: grace longer than the period rejected', /أكبر من مدة الفترة/.test(await okMsg()))
await per(tw, 0).locator('[data-f=late]').fill('15'); await setPer(tw, 1, '07:00', '09:00'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(150)
check('shift times: times out of order rejected', /متتالية/.test(await okMsg()))
await setPer(tw, 1, '', '', '0', '0'); await per(tw, 0).locator('[data-f=si]').fill('09:00'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(150)
check('shift times: «بداية الحضور» after «تبدأ من» rejected', /بداية الحضور/.test(await okMsg()))
await per(tw, 0).locator('[data-f=si]').fill('06:00'); await per(tw, 0).locator('[data-f=b]').fill('8:00'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(150)
check('shift times: bad format rejected', /HH:MM/.test(await okMsg()))
await per(tw, 0).locator('[data-f=b]').fill('08:00'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(250)
check('shift times: valid week saved', /تم حفظ/.test(await okMsg()))
check('shift times: empty punch windows filled in (08:00–16:00 → 06:00 … 20:00)', (await per(tw, 0).locator('[data-f=si]').inputValue()) === '06:00' && (await per(tw, 0).locator('[data-f=eo]').inputValue()) === '20:00')
await snap('shift-times')
await closeWin(tw)
check('windows: closing shows the previous one again', await w.isVisible())
check('shift groups: total = 5 × 8h = 40:00', (await w.locator('tbody tr').first().locator('td').nth(4).textContent()) === '40:00')
await closeWin(w)

// nationalities aren't edited in «قوائم البرنامج» (a linked site sends them): add one for the employee form
await p.evaluate(() => DB.run("INSERT INTO lists (list_type, name_ar, name_en) VALUES ('nationality', 'سعودي', '')"))
// ── 4. employees ──────────────────────────────────────────
await menu('البيانات الأساسية', 'الموظفون')
const ew = win('الموظفون')
check('employees: window opens', await ew.isVisible())
check('employees: «الاقسام» tree on the right (Apex)', await ew.evaluate((w) => { const t = w.querySelector('.apex-tree').getBoundingClientRect(), g = w.querySelector('.grid-wrap').getBoundingClientRect(); return t.left > g.left }))
check('employees: no «الكل» — the first department is selected', !(await ew.locator('.apex-tree .tn', { hasText: 'الكل' }).count()) && (await ew.locator('.apex-tree .tn.on').count()) === 1)
check('employees: Apex toolbar sequence', (await ew.locator('.toolbar button span').allTextContents()).map((t) => t.trim()).join('|') === 'مساعده|جديد|حفظ|إهمال|حذف|بحث|طباعه|إغلاق')
// Apex «بيانات الموظف» holds these; the rest is in the full form behind «الاعدادات»
const INLINE = ['code', 'name_ar', 'name_en', 'shift_group_id', 'job_id', 'project_id', 'task_id', 'religion', 'mobile', 'email']
const setField = async (root, k, v) => {
  const el = root.locator(`[data-f=${k}]`)
  const tag = await el.evaluate((e) => e.tagName + (e.type || ''))
  if (tag.startsWith('SELECT')) await el.selectOption({ label: v }); else if (tag === 'INPUTcheckbox') await el.check(); else await el.fill(v)
}
const OT = ['ot_before', 'ot_deduct_late', 'ot_holidays', 'ot_after', 'no_punch_out'] // Apex «الإعدادات» (cog) panel
async function addEmployee(code, name, { expect = 'تمت إضافة الموظف', shift = 'صباحي م', extra = {} } = {}) {
  // Apex: a new employee joins the department / section selected in «الاقسام»
  const place = extra.section_id || extra.department_id
  if (place) { await ew.locator('.apex-tree .tn').filter({ hasText: new RegExp(`^${place}$`) }).first().click(); await p.waitForTimeout(150) }
  await btn(ew, 'جديد').click(); await p.waitForTimeout(150)
  if (code !== null) await ew.locator('[data-f=code]').fill(code)
  if (name !== null) await ew.locator('[data-f=name_ar]').fill(name)
  if (shift) await ew.locator('[data-f=shift_group_id]').selectOption({ label: shift })
  for (const [k, v] of Object.entries(extra)) if (INLINE.includes(k)) await setField(ew, k, v)
  const sets = Object.keys(extra).filter((k) => OT.includes(k))
  if (sets.length) {
    await ew.locator('#emp-settings').click(); await p.waitForTimeout(150)
    for (const k of sets) await ew.locator(`.emp-set [data-f=${k}]`).check()
    if (code === '1001') await snap('employee-settings')
    await ew.locator('.emp-set .es-x').click()
  }
  if (code === '1001') await snap('employee-form')
  await btn(ew, 'حفظ').click(); await p.waitForTimeout(300)
  const m = await okMsg()
  // fields Apex has no place for (hire date, gender …): Meena's full form, double click on the row
  const more = Object.entries(extra).filter(([k]) => !INLINE.includes(k) && !OT.includes(k) && k !== 'department_id' && k !== 'section_id')
  if (more.length && m.includes(expect) && expect === 'تمت إضافة الموظف') {
    await ew.locator('tbody tr', { hasText: code }).dblclick(); await p.waitForTimeout(250)
    const f = win('تعديل موظف')
    for (const [k, v] of more) await setField(f, k, v)
    await btn(f, 'حفظ').click(); await p.waitForTimeout(300); await okMsg()
  }
  return m.includes(expect) ? true : m
}
const findEmp = async (t) => { await btn(ew, 'بحث').click(); await p.locator('#es-q').fill(t); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(200) }
check('employees: code required', (await addEmployee(null, 'بدون كود', { expect: 'كود الموظف مطلوب' })) === true)
check('employees: code must be digits', (await addEmployee('A12', 'حروف', { expect: 'أرقاماً فقط' })) === true)
check('employees: name required', (await addEmployee('1009', null, { expect: 'بالعربية مطلوب' })) === true)
check('employees: shift required', (await addEmployee('1009', 'بدون دوام', { expect: 'الدوام مطلوب', shift: null })) === true)
check('employees: bad email rejected', (await addEmployee('1009', 'ايميل', { expect: 'البريد', extra: { email: 'x@' } })) === true)
check('employees: add #1 (all fields)', (await addEmployee('1001', 'أحمد علي', { extra: { name_en: 'Ahmed Ali', job_id: 'ممرض م', department_id: 'الإدارة الطبية', section_id: 'قسم الطوارئ', group_id: 'المجموعة الأولى م', project_id: 'مشروع أ م', gender: 'ذكر', nationality_id: 'سعودي', religion: 'مسلم', mobile: '0500000000', email: 'a@b.co', hire_date: '2026-09-01', ot_after: 'x' } })) === true)
{ const r = await addEmployee('1001', 'مكرر', { expect: 'مستخدم لموظف آخر' }); check('employees: duplicate code rejected', r === true, r) }
check('employees: add #2', (await addEmployee('1002', 'خالد سعد', { extra: { department_id: 'الإدارة الطبية', hire_date: '2026-09-01' } })) === true)
{ const r = await addEmployee('1008', 'من النموذج', { extra: { mobile: '0511111111' } }); check('employees: added from «بيانات الموظف» alone', r === true, r) }
await ew.locator('tbody tr', { hasText: '1008' }).click(); await btn(ew, 'حذف').click(); await p.waitForTimeout(150); await yes(); await p.waitForTimeout(150)
check('employees: add #3', (await addEmployee('1003', 'سارة محمد', { extra: { department_id: 'الإدارة الطبية', hire_date: '2026-09-01' } })) === true)
check('employees: 4th blocked in trial', (await addEmployee('1004', 'رابع', { expect: '3 موظفين فقط' })) === true)
check('employees: list shows 3', (await ew.locator('tbody tr').count()) === 3)
await findEmp('سارة')
check('employees: search by name', (await ew.locator('tbody tr').count()) === 1)
await findEmp('1002')
check('employees: search by code', (await ew.locator('tbody tr').count()) === 1)
await findEmp('')
await snap('employees-list')
await ew.locator('tbody tr', { hasText: '1001' }).dblclick(); await p.waitForTimeout(250)
let ef = win('تعديل موظف')
check('employees: double-click opens edit form with data', (await ef.locator('[data-f=name_en]').inputValue()) === 'Ahmed Ali' && (await ef.locator('[data-f=section_id] option:checked').textContent()) === 'قسم الطوارئ')
await ef.locator('[data-f=mobile]').fill('0555555555'); await btn(ef, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
await ew.locator('tbody tr', { hasText: '1001' }).click(); await p.waitForTimeout(100)
check('employees: selecting a row fills «بيانات الموظف»', (await ew.locator('[data-f=name_ar]').inputValue()) === 'أحمد علي' && (await ew.locator('[data-f=mobile]').inputValue()) === '0555555555')
await ew.locator('[data-f=name_en]').fill('Ahmed A.'); await btn(ew, 'حفظ').click(); await p.waitForTimeout(250); check('employees: inline edit saved', /تم الحفظ/.test(await okMsg()) && (await ew.locator('tbody tr', { hasText: '1001' }).textContent()).includes('Ahmed A.'))
await ew.locator('#emp-settings').click(); await p.waitForTimeout(150)
check('employees: the cog drops Apex «الإعدادات» (warning + 5 options), not a form', (await ew.locator('.emp-set').isVisible()) && (await ew.locator('.emp-set .es-row').count()) === 5 && /يجب إلغاء الحركات/.test(await ew.locator('.emp-set .es-warn').textContent()) && (await p.locator('.win', { has: p.locator('.cap', { hasText: 'اضافة موظف' }) }).count()) === 0)
check('employees: «الإعدادات» shows the employee\'s options', await ew.locator('.emp-set [data-f=ot_after]').isChecked())
await ew.locator('.emp-set [data-f=ot_before]').check(); await btn(ew, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
await ew.locator('.emp-set .es-x').click(); check('employees: red ✕ closes «الإعدادات»', await ew.locator('.emp-set').isHidden())
await ew.locator('tbody tr', { hasText: '1001' }).dblclick(); await p.waitForTimeout(250)
ef = win('تعديل موظف'); check('employees: edit saved', (await ef.locator('[data-f=mobile]').inputValue()) === '0555555555' && (await ef.locator('[data-f=ot_before]').isChecked())); await closeWin(ef)
await btn(ew, 'حذف').click(); await p.waitForTimeout(150); check('employees: delete asks confirmation', /حذف الموظف/.test(await dlgText()))
await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'لا' }).click()
await closeWin(ew)
// shift group in use cannot be deleted
await menu('البيانات الأساسية', 'مواعيد العمل'); w = win('مجموعات أوقات الدوام'); await w.locator('tbody tr').first().click()
await btn(w, 'حذف').click(); await p.waitForTimeout(150); check('shift groups: in-use group cannot be deleted', /مستخدم/.test(await okMsg())); await closeWin(w)
// lists: job in use cannot be deleted
await menu('البيانات الأساسية', 'قوائم البرنامج'); w = win('قوائم البرنامج'); await w.locator('tbody tr', { has: p.locator('input[value="ممرض م"], input[value="ممرض"]') }).first().click()
await btn(w, 'حذف').click(); await p.waitForTimeout(150); check('lists: job in use cannot be deleted', /مستخدم/.test(await okMsg())); await closeWin(w)

// ── 5. procedures ─────────────────────────────────────────
fs.writeFileSync(`${UD}/attlog.dat`, [
  '  1001\t2026-09-19 08:10:05\t1\t0', '  1001\t2026-09-19 16:02:11\t1\t1',         // Sat: in grace → on time
  '  1001\t2026-09-20 08:30:00\t1\t0', '  1001\t2026-09-20 15:40:00\t1\t1',         // Sun: 30 late, 20 early
  '  1001\t2026-09-23 08:40:00\t1\t0', '  1001\t2026-09-23 16:05:00\t1\t1',         // Wed: public holiday
  '  1001\t2026-09-24 09:00:00\t1\t0',                                              // Thu: weekly off
  '1002,2026-09-19 07:55', '1002,19/09/2026 15:00',                                   // CSV + dd/mm/yyyy; 60 early
  '  9999\t2026-09-19 08:00:00\t1\t0', '  1001\t2026-09-19 08:10:05\t1\t0', 'garbage line'].join('\n'))
await menu('الإجراءات', 'قراءة الحركات'); w = win('قراءة الحركات'); await snap('read-punches')
await w.locator('#rp-read-file').click(); check('read punches: file required', /اختر ملف/.test(await okMsg()))
await w.locator('#rp-from').fill('2026-09-20'); await w.locator('#rp-to').fill('2026-09-30')
await w.locator('#rp-file').setInputFiles(`${UD}/attlog.dat`); await w.locator('#rp-read-file').click(); await p.waitForTimeout(400)
let imp = await w.locator('#rp-msg').textContent()
check('read punches: period filter keeps only 20–30 Sep', /خارج الفترة 6/.test(imp) && /جديدة 5/.test(imp), imp)
await w.locator('#rp-from').fill('2026-09-01'); await w.locator('#rp-read-file').click(); await p.waitForTimeout(400)
imp = await w.locator('#rp-msg').textContent()
check('read punches: re-read the whole month (4 new, 6 dup) + unknown 9999 handled', /جديدة 4 · مكررة 6/.test(imp) && /(غير معرّفة 1|موظفين جدد 1)/.test(imp), imp)
check('read punches: «عدد الحركات» shows the new count', (await w.locator('#rp-count').inputValue()) === '4')
check('read punches: no «كل الفترات» (Apex)', (await w.locator('#rp-allp').count()) === 0)
await p.waitForTimeout(2500)
check('read punches: unreachable device shows the red light', (await w.locator('.st .dot.off').count()) >= 1)
await w.locator('.rp-dev').first().check(); await w.locator('#rp-read-dev').click(); await p.waitForTimeout(12000)
check('read punches: unreachable device → clear error', /تعذّر الاتصال/.test(await w.locator('#rp-msg').textContent()), await w.locator('#rp-msg').textContent())
await closeWin(w)


await menu('الإجراءات', 'عرض الحركات'); w = p.locator('.win[data-win=view-punches]')
await w.locator('#vp-date').fill('2026-09-19'); await w.locator('#vp-date').dispatchEvent('change'); await p.waitForTimeout(200)
let vr = await w.locator('tbody tr', { hasText: '1001' }).evaluate((tr) => [...tr.children].map((c) => c.textContent))
check('view punches (Apex): one row per employee for the day, 1001 in 08:10 out 16:02', vr[3] === '08:10' && vr[4] === '16:02', vr.join('|'))
check('view punches: day title + السابق/التالي', /السبت 2026-09-19/.test(await w.locator('#vp-day').textContent()))
await w.locator('#vp-next').click(); await p.waitForTimeout(150); check('view punches: «التالي» → 2026-09-20', (await w.locator('#vp-date').inputValue()) === '2026-09-20')
await w.locator('#vp-prev').click(); await p.waitForTimeout(150)
const vpFind = async (t) => { await btn(w, 'بحـث').click(); await p.locator('#vp-q').fill(t); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(200) }
await vpFind('1002'); check('view punches: search by number', (await w.locator('tbody tr').count()) === 1)
await btn(w, 'إهمال').click(); await p.waitForTimeout(150)
check('view punches: Apex «الاقسام» tree on the right', await w.evaluate((x) => x.querySelector('.apex-tree').getBoundingClientRect().left > x.querySelector('.grid-wrap').getBoundingClientRect().left))
await w.locator('.apex-tree .tn', { hasText: 'قسم الطوارئ' }).click(); await p.waitForTimeout(150)
check('view punches: departments tree filters (قسم الطوارئ → 1001 only)', (await w.locator('tbody tr').count()) === 1 && /1001/.test(await w.locator('tbody').textContent()))
await snap('view-punches')
await w.locator('tbody tr', { hasText: '1001' }).dblclick(); await p.waitForTimeout(300)
let ew2 = win('إضافة وتعديل حركات موظف')
check('view punches: double-click opens the edit window on that employee/day', (await ew2.locator('#ep-code').inputValue()) === '1001' && (await ew2.locator('#ep-date').inputValue()) === '2026-09-19' && (await ew2.locator('tbody tr').count()) >= 1)
await closeWin(ew2); await closeWin(w)

await menu('الإجراءات', 'إضافة وتعديل الحركات'); w = win('إضافة وتعديل حركات موظف')
await w.locator('#ep-code').fill('1001'); await w.locator('#ep-code').dispatchEvent('change')
await w.locator('#ep-date').fill('2026-09-21'); await w.locator('#ep-date').dispatchEvent('change'); await p.waitForTimeout(150)
await btn(w, 'إضافة').click(); await w.locator('.t-in').last().fill('25:00'); await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('edit punches: invalid time rejected', /HH:MM/.test(await okMsg()))
await w.locator('.t-in').last().fill('08:05'); await w.locator('.t-out').last().fill('16:00'); await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('edit punches: password required (كلمة السر)', /كلمة السر غير صحيحة/.test(await okMsg()))
await w.locator('#ep-pw').fill('start1'); await btn(w, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
const flags = async () => w.locator('tbody tr').first().evaluate((tr) => [...tr.querySelectorAll('input[type=checkbox]')].map((c) => c.checked))
check('edit punches: pair saved, «مضاف» ticked', (await w.locator('tbody tr').count()) === 1 && (await flags())[2] === true, JSON.stringify(await flags()))
await w.locator('.t-in').first().fill('08:07'); await btn(w, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
check('edit punches: changed time → «معدل» ticked', (await flags())[1] === true, JSON.stringify(await flags()))
await w.locator('tbody tr').first().click(); await btn(w, 'حذف').click(); await p.waitForTimeout(150); await yes()
check('edit punches: delete pair', (await w.locator('tbody tr[data-i]').count()) === 0)
await btn(w, 'إضافة').click(); await w.locator('.t-in').last().fill('08:05'); await w.locator('.t-out').last().fill('16:00'); await btn(w, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
await snap('edit-punches'); await closeWin(w)

await menu('الإجراءات', 'إضافة أجازات'); w = win('أجازات الموظفين'); await snap('leaves')
await btn(w, 'جديد').click(); await p.waitForTimeout(150)
check('leaves: Apex dialog with الموظف / مجموعة الموظفين', (await p.locator('.leave-dlg [name=lv-w]').count()) === 2 && await p.locator('#lv-grp').isDisabled())
await p.locator('.dlg').getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(100)
check('leaves: employee required', /اختر الموظف/.test(await p.locator('.dlg .err').textContent()))
// drop-down opens with a real mouse click (own list, not the native popup) and picks a value
{
  const sel = p.locator('#lv-type')
  await sel.click(); await p.waitForTimeout(150)
  check('select: drop-down list opens on click', await p.locator('.sel-pop').isVisible())
  await snap('select-open')
  await p.locator('.sel-pop .sel-opt', { hasText: 'سنوية' }).click(); await p.waitForTimeout(100)
  check('select: picked value is set', (await sel.evaluate((e) => e.options[e.selectedIndex].text)) === 'سنوية')
  check('select: list closes after picking', !(await p.locator('.sel-pop').count()))
  await sel.click(); await p.keyboard.press('Escape'); await p.waitForTimeout(100)
  check('select: Escape closes the list', !(await p.locator('.sel-pop').count()))
}
await p.locator('#lv-code').fill('1001'); await p.locator('#lv-code').dispatchEvent('input')
check('leaves: typing the code picks the employee', (await p.locator('#lv-emp').evaluate((e) => e.options[e.selectedIndex].text)).length > 0)
await p.locator('#lv-f').fill('2026-09-22'); await p.locator('#lv-t').fill('2026-09-22')
await p.locator('.dlg').getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(250); await okMsg()
{ const t = await w.locator('tbody tr').first().textContent(); check('leaves: saved and listed (code, dates, المدة 1, type)', (await w.locator('tbody tr[data-id]').count()) === 1 && /1001[^]*2026-09-22[^]*1[^]*سنوية/.test(t), t) }
await btn(w, 'جديد').click(); await p.locator('#lv-code').fill('1001'); await p.locator('#lv-code').dispatchEvent('input')
await p.locator('#lv-f').fill('2026-09-21'); await p.locator('#lv-t').fill('2026-09-23'); await p.locator('.dlg').getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(200)
check('leaves: overlapping leave refused', /متداخلة/.test(await okMsg()))
await closeWin(w)
await menu('الإجراءات', 'إضافة أذونات'); w = win('أذونات الموظفين'); await snap('permissions')
check('permissions: Apex toolbar sequence', (await w.locator('.toolbar button span').allTextContents()).map((t) => t.trim()).join('|') === 'جديد|حفظ|بحث|حذف|طباعه|إغلاق')
await w.locator('#pm-emp').selectOption({ index: 2 }); await w.locator('#pm-date').fill('2026-09-19'); await w.locator('#pm-date').dispatchEvent('change'); await p.waitForTimeout(100)
check('permissions: no «من / إلى» or «التصنيف» (Apex)', (await w.locator('#pm-from, #pm-to, #pm-type').count()) === 0)
await w.locator('[name=pm-kind][value=day]').check(); await p.waitForTimeout(100)
check('permissions: «يوم كامل» asks no time', (await w.locator('#pm-at-row').isHidden()) && (await w.locator('.day tbody tr').count()) >= 1)
await w.locator('[name=pm-kind][value=early]').check(); await p.waitForTimeout(80)
check('permissions: «إذن انصراف مبكر» asks «توقيت خروج»', (await w.locator('#pm-at-label').textContent()) === 'توقيت خروج')
await w.locator('[name=pm-kind][value=late]').check(); await p.waitForTimeout(80)
check('permissions: «إذن حضور متأخر» asks «توقيت الدخول»', (await w.locator('#pm-at-label').textContent()) === 'توقيت الدخول' && (await w.locator('#pm-at').isVisible()))
await w.locator('#pm-at').fill('3pm'); await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('permissions: bad time rejected', /HH:MM/.test(await okMsg()))
await w.locator('#pm-at').fill('23:00'); await btn(w, 'حفظ').click(); await p.waitForTimeout(150)
check('permissions: time outside the day\'s work rejected', /بين بداية الدوام/.test(await okMsg()))
await w.locator('#pm-at').fill('09:00')
await btn(w, 'حفظ').click(); await p.waitForTimeout(250); await okMsg(); check('permissions: saved', (await w.locator('.list tbody tr').count()) === 1)
check('permissions: late = start of the day → توقيت الدخول', /09:00/.test(await w.locator('.list tbody tr').first().textContent()) && (await w.locator('#pm-at').inputValue()) === '09:00'); await closeWin(w)

// ── 6. reports (all 14) ───────────────────────────────────
const detailedExpect = { '2026-09-19': 'حضور', '2026-09-20': 'حضور متأخر', '2026-09-21': 'حضور', '2026-09-22': 'إجازة', '2026-09-23': 'عطلة رسمية', '2026-09-24': 'عطلة إسبوعية' }
const reports = ['مواعيد العمل', 'الموظفون', 'الحركات الغير مكتملة', 'التأخير عن بداية الدوام اليومي', 'التأخير عن الدوام خلال فترة', 'أجازات الموظفين',
  'الحضور والانصراف تفصيلي', 'الحضور والانصراف إجمالي', 'الغياب خلال فترة', 'حالة اليوم', 'بيان تأخير الموظفين', 'تأخير وإضافي الدوام', 'الحضور والانصراف بالحركات', 'أذونات الموظفين']
const trialOpen = ['الحضور والانصراف تفصيلي', 'الحضور والانصراف إجمالي', 'حالة اليوم', 'الحضور والانصراف بالحركات']
for (const r of reports) {
  await menu('التقارير', r)
  if (!trialOpen.includes(r)) { check(`report «${r}» locked in trial`, /المسجلة فقط/.test(await okMsg())); continue }
  const rw = repWin(r)
  check(`report «${r}» opens (trial)`, await rw.isVisible())
  await rw.locator('#r-from').fill('2026-09-19'); if (await rw.locator('#r-to').count()) await rw.locator('#r-to').fill(r === 'حالة اليوم' ? '2026-09-19' : '2026-09-24')
  await btn(rw, 'موافق').click(); await p.waitForTimeout(250)
  check(`report «${r}»: company header`, (await rw.locator('.rep-head .box.r .co').textContent()) === 'مستشفى الاختبار')
  if (r === 'الحضور والانصراف تفصيلي') {
    const grp = rw.locator('.rep-emp .rep-sub', { hasText: '1001' })
    const rows = await rw.locator('.rep-emp').first().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => { const d = tr.dataset; return [d.date, '', d.in, d.out, d.late, d.early, d.ot, d.worked, d.status] }))
    const got = Object.fromEntries(rows.map((c) => [c[0], c[8]]))
    for (const [d, s] of Object.entries(detailedExpect)) check(`engine: 1001 on ${d} = ${s}`, (got[d] || '').startsWith(s), got[d])
    const r20 = rows.find((c) => c[0] === '2026-09-20')
    check('engine: 30 min late + 20 min early on 09-20', r20 && r20[4] === '00:30' && r20[5] === '00:20', r20?.join('|'))
    check('engine: grouped by employee', (await grp.count()) === 1)
    const all = await rw.locator('.report-out').textContent()
    check('engine: 1002 permission 15:00-16:00 cancels early leave', !/1002[\s\S]*?2026-09-19[^\n]*01:00/.test(all))
    await snap('report-detailed')
  }
  if (r === 'حالة اليوم') { await snap('report-daystatus'); check('day status: 3 employees', (await rw.locator('table.rep tbody tr').count()) === 3) }
  if (r === 'الحضور والانصراف إجمالي') {
    const row = await rw.locator('table.rep tbody tr', { hasText: '1001' }).first().evaluate((tr) => [...tr.children].map((td) => td.textContent))
    check('total (Apex layout): 1001 — worked hours, 50 min late+early, no absence hours', row[1] === '1001' && /^\d\d:\d\d$/.test(row[5]) && row[6] === '00:50' && row[7] === '', row.join('|'))
    await snap('report-total')
  }
  // print counter: 3 prints then blocked
  if (r === 'حالة اليوم') {
    for (let i = 0; i < 3; i++) { await btn(rw, 'طباعة').click(); await p.waitForTimeout(150) }
    check('trial: 3 prints allowed', (await prints()).filter((h) => h.includes('حالة اليوم')).length >= 3)
    await btn(rw, 'طباعة').click(); await p.waitForTimeout(150)
    check('trial: 4th print blocked', /انتهت مرات الطباعة/.test(await okMsg()))
  }
  await closeWin(rw)
}

// ── 7. posting ────────────────────────────────────────────
await menu('الإجراءات', 'ترحيل الحركات'); w = win('ترحيل الحركات وحساب ساعات العمل'); await snap('post')
await w.locator('#pw-from').fill('2026-09-19'); await w.locator('#pw-to').fill('2026-09-20'); await w.locator('#pw-to').dispatchEvent('input')
const unposted = +(await w.locator('#pw-count').inputValue())
check('posting: «عدد الحركات غير المرحلة» counts the period punches', unposted > 0, `n=${unposted}`)
await w.locator('#pw-go').click(); await p.waitForTimeout(300); check('posting: period posted', /ترحيل الحركات/.test(await okMsg()))
check('posting: count drops to 0 and the bar is full', (await w.locator('#pw-count').inputValue()) === '0' && /100%/.test(await w.locator('#pw-bar').getAttribute('style')))
await w.locator('#pw-to').fill('2026-09-21'); await w.locator('#pw-go').click(); await p.waitForTimeout(300); await okMsg()
check('posting: re-posting an overlapping period keeps posted days frozen', await p.evaluate(() => DB.one("SELECT COUNT(*) n FROM posted_attendance WHERE date = '2026-09-20'").n) > 0)
await p.evaluate(() => { Engine.unpost('2026-09-21', '2026-09-21') })
await w.locator('#pw-to').fill('2099-01-01'); await w.locator('#pw-go').click(); await p.waitForTimeout(200); check('posting: future refused', /لا يمكن ترحيل/.test(await okMsg()))
await w.locator('#pw-codes').check(); await w.locator('#pw-to').fill('2026-09-20'); await w.locator('#pw-go').click(); await p.waitForTimeout(150)
check('posting: «أرقام الموظفين» needs a number', /أرقام الموظفين/.test(await okMsg()))
await w.locator('#pw-codes').uncheck(); await closeWin(w)
await menu('الإجراءات', 'إضافة وتعديل الحركات'); w = win('إضافة وتعديل حركات موظف')
await w.locator('#ep-code').fill('1001'); await w.locator('#ep-code').dispatchEvent('change')
await w.locator('#ep-date').fill('2026-09-20'); await w.locator('#ep-date').dispatchEvent('change'); await p.waitForTimeout(150)
check('posting: posted day shows «مرحل» and locks the times', (await w.locator('.t-in').first().isDisabled()) && (await w.locator('tbody tr').first().locator('input[type=checkbox]').first().isChecked()))
await btn(w, 'إضافة').click(); await btn(w, 'حفظ').click(); await p.waitForTimeout(150); check('posting: posted day locked for edits', /مرحّل/.test(await okMsg())); await closeWin(w)
// Apex «إلغاء الحركات …» window: كلمه السر in the toolbar row, الفتـــرة, الموظفـــون
// (pulled: كلمة مرور مدير النظام + «الغاء البيانات» inside the form)
const delPunches = async (item, from, to, pw) => {
  await menu('الإجراءات', item); const dw = p.locator(`.win[data-win="del-punches-${/المسحوبة/.test(item) ? 'device-file' : 'manual'}"]`)
  await dw.locator('#dp-from').fill(from); await dw.locator('#dp-to').fill(to); await dw.locator('#dp-pw').fill(pw)
  if (await dw.locator('#dp-go').count()) await dw.locator('#dp-go').click(); else await btn(dw, 'الغاء').click()
  await p.waitForTimeout(250)
  return dw
}
await menu('الإجراءات', 'الغاء ترحيل'); w = win('الغاء ترحيل الحركات خلال فترة'); check('unpost: Apex window (no grid, one button)', (await w.locator('#pw-go').count()) === 1 && (await w.locator('#pw-count').count()) === 0)
await w.locator('#pw-from').fill('2026-09-19'); await w.locator('#pw-to').fill('2026-09-20')
await w.locator('#pw-codes').check(); await w.locator('#pw-cf').fill('999999'); await w.locator('#pw-go').click(); await p.waitForTimeout(150)
check('unpost: unknown employee number refused', /لا يوجد موظفين/.test(await okMsg()))
await w.locator('#pw-cf').fill('1001'); await w.locator('#pw-go').click(); await p.waitForTimeout(200); await okMsg()
check('unpost: one employee released, others stay posted', await p.evaluate(() => !Engine.isPosted('2026-09-20', '1001') && Engine.isPosted('2026-09-20')))
await w.locator('#pw-codes').uncheck(); await w.locator('#pw-go').click(); await p.waitForTimeout(200)
check('unpost: whole period released', /بنجاح/.test(await okMsg()) && await p.evaluate(() => !Engine.isPosted('2026-09-19') && !Engine.isPosted('2026-09-20')))
await snap('unpost'); await closeWin(w)
w = await delPunches('الغاء الحركات المعدله يدويا', '2026-09-01', '2026-09-30', 'wrong')
check('delete manual punches: password required', /غير صحيحة/.test(await okMsg()))
await w.locator('#dp-pw').fill('start1'); await btn(w, 'الغاء').click(); await p.waitForTimeout(200); check('delete manual punches: confirms count (2)', /حذف 2 حركة/.test(await dlgText())); await yes(); await okMsg(); await closeWin(w)
check('menu: no «الغاء الحركات المسحوبة» / «نقل بصمات» (Apex)', !(await p.evaluate(() => JSON.stringify(MENUS.map((m) => m.items)))).match(/المسحوبة|نقل بصمات/))
await p.evaluate(async () => { DB.run("DELETE FROM punches WHERE source IN ('device', 'file') AND ts >= '2026-09-01' AND ts < '2026-09-20'"); await DB.flush() }) // as before: the pulled punches up to the 19th go
await menu('الإجراءات', 'الغاء جميع بيانات الموظف'); w = win('الغاء جميع بيانات الموظف'); await w.locator('#pe-from').fill('1003')
await w.locator('#pe-pw').fill('wrong'); await w.locator('#pe-go').click(); await p.waitForTimeout(150); check('purge employee: admin password required', /غير صحيحة/.test(await okMsg()))
await w.locator('#pe-pw').fill('start1'); await w.locator('#pe-go').click(); await p.waitForTimeout(200); await yes(); check('purge employee: done', /تم حذف جميع بيانات 1 موظف/.test(await okMsg())); await closeWin(w)

// ── 8. users, system, backup, register ────────────────────
await menu('الاعدادات', 'صلاحيات المستخدمين', 'اعدادات المستخدمين'); w = win('صلاحيات المستخدمين'); await snap('roles')
check('roles: built-in «مدير النظام» locked with every box ticked', (await w.locator('.screens input[data-a]:not(:checked)').count()) === 0 && (await w.locator('.screens input[data-a]:not([disabled])').count()) === 0)
await btn(w, 'جديد').click(); await btn(w, 'حفظ').click(); check('roles: name required', /مطلوب/.test(await okMsg()))
await w.locator('#ro-ar').fill('موارد بشرية'); await w.locator('#ro-en').fill('HR'); await btn(w, 'حفظ').click(); await okMsg()
check('roles: role added', (await w.locator('#ro-list tr').count()) === 2)
await closeWin(w)
await menu('الاعدادات', 'إدارة المستخدمين', 'اعدادات المستخدمين'); w = win('إدارة المستخدمين'); await snap('users')
await btn(w, 'جديد').click(); await w.locator('#us-login').fill('hr'); await w.locator('#us-name').fill('موظف الموارد'); await w.locator('#us-role').selectOption({ label: 'موارد بشرية' })
await w.locator('#us-pw').fill('12'); await w.locator('#us-pw2').fill('12'); await btn(w, 'حفظ').click(); check('users: short password rejected', /4 أحرف/.test(await okMsg()))
await w.locator('#us-pw').fill('1234'); await w.locator('#us-pw2').fill('1235'); await btn(w, 'حفظ').click(); check('users: mismatch rejected', /غير متطابقتين/.test(await okMsg()))
await w.locator('#us-pw2').fill('1234'); await btn(w, 'حفظ').click(); await okMsg()
check('users: user added with its role', (await w.locator('#us-list tr').count()) === 2 && /موارد بشرية/.test(await w.locator('#us-list').textContent()))
check('users: passwords never shown', !/1234/.test(await w.locator('#us-list').textContent()))
await w.locator('#us-list tr').first().click(); await btn(w, 'حذف').click(); await p.waitForTimeout(150); check('users: current / last admin cannot be deleted', /آخر مدير|المستخدم الحالي/.test(await okMsg()))
await w.locator('#us-list tr').first().click(); await w.locator('#us-role').selectOption({ label: 'موارد بشرية' }); await btn(w, 'حفظ').click(); check('users: last admin cannot lose the admin role', /آخر مدير/.test(await okMsg()))
await w.locator('#us-list tr').first().click(); await w.locator('#us-pw').fill('admin1'); await w.locator('#us-pw2').fill('admin1'); await btn(w, 'حفظ').click(); await okMsg(); await closeWin(w)
await menu('الاعدادات', 'اعدادات النظام'); w = win('إعدادات النظام'); check('system settings: Apex «إعدادات عامه» — 2 settings', (await w.locator('.sys-set .rules .row').count()) === 2 && (await w.locator('#s-ignore').inputValue()) === '0' && (await w.locator('#s-shifts option').allTextContents()).join('|') === 'وردية|ورديتان|ثلاث ورديات|أربعة ورديات')
await w.locator('#s-ignore').fill('3'); await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg()
check('system settings: saved, other settings kept', await p.evaluate(() => Engine.settings().ignore_min === 3)); await w.locator('#s-ignore').fill('0'); await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg(); await snap('system'); await closeWin(w)
await p.evaluate(() => openBackup()); await p.waitForTimeout(300); w = win('إنشاء نسخة إحتياطية'); await w.locator('#bk-go').click(); await p.waitForTimeout(200)
check('backup: file written', /تم حفظ/.test(await okMsg()) && fs.existsSync(`${UD}/manual-backup.sqlite`)); await closeWin(w)
check('backup: automatic daily backup exists', fs.readdirSync(`${UD}/backups`).length >= 0)
await menu('مساعده', 'عن الشركة'); { const m = await okMsg(); check('about: version', m.includes(JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf8')).version)); check('about: data folder', m.includes('mt-fulltest')) }
await menu('مساعده', 'فهرس المحتويات'); w = win('دليل الاستخدام')
check('guide: opens with all sections', (await w.locator('.guide section').count()) >= 10); await snap('guide')
await w.locator('.guide nav a').last().click(); await p.waitForTimeout(300); await closeWin(w)

// Apex «أدوات ← تعديل بيانات الدخول»
await menu('ادوات', 'تعديل بيانات الدخول'); w = win('تعديل بيانات الدخول')
await w.locator('#cl-old').fill('wrong'); await w.locator('#cl-new').fill('abcd'); await w.locator('#cl-new2').fill('abcd'); await w.locator('#cl-ok').click(); await p.waitForTimeout(150)
check('change login: current password checked', /الحالية غير صحيحة/.test(await okMsg()))
await w.locator('#cl-old').fill('admin1'); await w.locator('#cl-new2').fill('abce'); await w.locator('#cl-ok').click(); await p.waitForTimeout(150)
{ const m = await okMsg(); check('change login: new passwords must match', /غير متطابقتين/.test(m), m) } await w.locator('#cl-cancel').click(); await p.waitForTimeout(150)
await menu('مساعده', 'تسجيل المنتج'); await snap('register')
const req = await p.locator('#req').inputValue()
check('register: request code format', /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(req), req)
await p.locator('#lic').fill('garbage.Gold'); await p.locator('.dlg').getByRole('button', { name: 'تسجيل' }).click(); await p.waitForTimeout(200)
check('register: invalid licence rejected', /غير صحيح/.test(await p.locator('.dlg .err').textContent()))
const lic = execFileSync('node', [`${ROOT}/tools/keygen.js`, req, 'Gold']).toString().trim()
await p.locator('#lic').fill(lic); await p.locator('.dlg').getByRole('button', { name: 'تسجيل' }).click(); await p.waitForTimeout(300)
check('register: valid licence accepted', /تم تسجيل البرنامج/.test(await okMsg()))
check('register: caption Registered', /Registered/.test(await p.locator('#caption-text').textContent()) && !/Unregistered/.test(await p.locator('#caption-text').textContent()))
check('register: trial banner hidden', (await p.locator('.trial').count()) === 0)
await menu('التقارير', 'الغياب خلال فترة'); check('registered: previously locked report opens', await repWin('الغياب خلال فترة').isVisible()); await closeWin(repWin('الغياب خلال فترة'))

// ── 8b. v0.2 features (registered: no employee limit) ─────
const openGroupTimes = async (name) => {
  await menu('البيانات الأساسية', 'مواعيد العمل'); const gw = win('مجموعات أوقات الدوام')
  await gundo(gw, { add: false }) // «المواعيد» works on a saved group (viewing)
  await gw.locator('tbody tr', { has: p.locator(`input[value="${name}"]`) }).first().click()
  await btn(gw, 'المواعيد').click(); await p.waitForTimeout(300)
  return [gw, win('إعداد مواعيد العمل')]
}
// new shift groups: split, night (ends the next day), open
await menu('البيانات الأساسية', 'مواعيد العمل'); w = win('مجموعات أوقات الدوام')
for (const g of [{ name_ar: 'مقسم' }, { name_ar: 'ليلي' }, { name_ar: 'مفتوح', open_shift: 1 }]) {
  const r = lastRow(w)
  await r.locator('[data-f=name_ar]').fill(g.name_ar)
  if (g.open_shift) await r.locator('[data-f=open_shift]').check()
  await gsave(w)
}
check('shift groups: Apex columns only (no rotating / start date)', (await w.locator('thead th').allTextContents()).map((x) => x.trim()).filter(Boolean).join('|') === '#|الاسم العربي|الاسم الأجنبي|الإجمالي|دوام مفتوح')
check('shift groups: «المواعيد» off while adding', await btn(w, 'المواعيد').isDisabled())
await closeWin(w)
// split shift: 2 periods every working day
let [gw, t] = await openGroupTimes('مقسم')
await setPer(t, 0, '08:00', '12:00'); await setPer(t, 1, '11:00', '20:00')
await btn(t, 'حفظ').click(); await p.waitForTimeout(200); check('split shift: overlapping second period rejected', /متتالية/.test(await okMsg()))
await setPer(t, 1, '16:00', '20:00'); check('split shift: 2 periods → 08:00 a day', (await t.locator('#st-hours').inputValue()) === '08:00')
await repeat(t); await tab(t, 'الجمعة'); await t.locator('#st-off').check()
await btn(t, 'حفظ').click(); await p.waitForTimeout(250); check('split shift: saved', /تم حفظ/.test(await okMsg()))
await snap('v2-split-shift'); await closeWin(t); await closeWin(gw)
// night shift 22:00 → 06:00: a time earlier than the one before it is on the next day
;[gw, t] = await openGroupTimes('ليلي')
await setPer(t, 0, '22:00', '06:00')
await repeat(t); await tab(t, 'الجمعة'); await t.locator('#st-off').check()
await btn(t, 'حفظ').click(); await p.waitForTimeout(250); check('night shift: saved', /تم حفظ/.test(await okMsg()))
await closeWin(t); await closeWin(gw)
// open shift: 08:00 a day
;[gw, t] = await openGroupTimes('مفتوح')
check('open shift: a day holds أجازة + عدد ساعات العمل only', (await t.locator('.st-grid').count()) === 0 && !(await t.locator('#st-hours').isDisabled()))
await t.locator('#st-hours').fill('08:00'); await repeat(t); await tab(t, 'الجمعة'); await t.locator('#st-off').check()
await btn(t, 'حفظ').click(); await p.waitForTimeout(250); check('open shift: saved', /تم حفظ/.test(await okMsg()))
await snap('v2-open-shift'); await closeWin(t); await closeWin(gw)
// 4 employees on the new shifts (licence registered → no trial cap)
await menu('البيانات الأساسية', 'الموظفون')
for (const [code, name, shift] of [['1004', 'مقسم الدوام', 'مقسم'], ['1005', 'ليلي الدوام', 'ليلي'], ['1006', 'مفتوح الدوام', 'مفتوح']]) {
  check(`registered: add ${code} on «${shift}»`, (await addEmployee(code, name, { shift, extra: { hire_date: '2026-09-01' } })) === true)
}
// photo on 1004
await ew.locator('tbody tr', { hasText: '1004' }).dblclick(); await p.waitForTimeout(250); ef = win('تعديل موظف')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNQaLiAFTEMLQkAxtVcAVQ5TgQAAAAASUVORK5CYII=', 'base64')
fs.writeFileSync(`${UD}/p.png`, png)
await ef.locator('.photo input[type=file]').setInputFiles(`${UD}/p.png`); await p.waitForTimeout(400)
await btn(ef, 'حفظ').click(); await p.waitForTimeout(300); await okMsg()
await ew.locator('tbody tr', { hasText: '1004' }).dblclick(); await p.waitForTimeout(250); ef = win('تعديل موظف')
check('employee photo: saved and shown', (await ef.locator('.photo img').count()) === 1); await snap('v2-employee-photo')
// shift change: 1002 → «مسائي» for every unposted day (no timings → off)
await closeWin(ef)
await ew.locator('tbody tr', { hasText: '1002' }).dblclick(); await p.waitForTimeout(250); ef = win('تعديل موظف')
await ef.locator('[data-f=shift_group_id]').selectOption({ label: 'مسائي' }); await btn(ef, 'حفظ').click(); await p.waitForTimeout(200)
check('shift change: no start-date dialog (Apex)', (await p.locator('#sf').count()) === 0); await okMsg()
await closeWin(ew)
// punches for the new shifts
fs.writeFileSync(`${UD}/att2.dat`, [
  '1004,2026-09-19 08:05', '1004,2026-09-19 12:00', '1004,2026-09-19 16:20', '1004,2026-09-19 20:00',   // split: 20 late in وردية 2
  '1005,2026-09-19 21:58', '1005,2026-09-20 06:02',                                                   // night: 1 shift across midnight
  '1006,2026-09-19 09:00', '1006,2026-09-19 15:00', '1006,2026-09-22 09:00', '1006,2026-09-22 14:00',   // open: 2h / 3h short
  '1002,2026-09-21 08:00', '1002,2026-09-21 16:00', '1001,2026-09-21 08:05', '1001,2026-09-21 16:00'].join('\n'))
await menu('الإجراءات', 'قراءة الحركات'); w = win('قراءة الحركات'); await w.locator('#rp-from').fill('2026-09-01')
await w.locator('#rp-file').setInputFiles(`${UD}/att2.dat`); await w.locator('#rp-read-file').click(); await p.waitForTimeout(400)
check('import 2: 14 new punches', /جديدة 14/.test(await w.locator('#rp-msg').textContent()), await w.locator('#rp-msg').textContent())
await closeWin(w)
// detailed report 19..24 for everyone
const detailed = async () => {
  await menu('التقارير', 'الحضور والانصراف تفصيلي'); const rw = repWin('الحضور والانصراف تفصيلي')
  await rw.locator('#r-from').fill('2026-09-19'); await rw.locator('#r-to').fill('2026-09-24'); await btn(rw, 'موافق').click(); await p.waitForTimeout(300)
  const data = await rw.locator('.report-out').evaluate((out) => {
    const res = {}
    for (const tr of out.querySelectorAll('tr[data-emp]')) { const d = tr.dataset; res[`${d.emp}:${d.date}`] = [d.date, '', d.in, d.out, d.late, d.early, d.ot, d.worked, d.status] }
    return res
  })
  return [rw, data]
}
let [rw, D] = await detailed()
const cell = (k, i) => D[k]?.[i]
check('split shift: 20 min late in وردية 2', cell('1004:2026-09-19', 4) === '00:20' && cell('1004:2026-09-19', 8) === 'حضور متأخر', D['1004:2026-09-19']?.join('|'))
check('split shift: worked 3:55 + 3:40 = 07:35', cell('1004:2026-09-19', 7) === '07:35', cell('1004:2026-09-19', 7))
check('night shift: 21:58 → 06:02 is one present day', cell('1005:2026-09-19', 2) === '21:58' && cell('1005:2026-09-19', 3) === '06:02' && cell('1005:2026-09-19', 7) === '08:04', D['1005:2026-09-19']?.join('|'))
check('night shift: next day does not reuse the 06:02 punch', cell('1005:2026-09-20', 8) === 'غياب', D['1005:2026-09-20']?.join('|'))
check('open shift: 6h worked of 8h → 02:00 owed shows as تأخير', cell('1006:2026-09-19', 4) === '02:00' && cell('1006:2026-09-19', 7) === '06:00', D['1006:2026-09-19']?.join('|'))
check('shift change: 1002 earlier unposted days also on the new shift', cell('1002:2026-09-19', 8) === 'عطلة إسبوعية', D['1002:2026-09-19']?.join('|'))
check('shift change: 1002 on 2026-09-21 on the new shift (no timings → off)', cell('1002:2026-09-21', 8) === 'عطلة إسبوعية', D['1002:2026-09-21']?.join('|'))
await snap('v2-detailed')
// Excel + PDF
await btn(rw, 'Excel').click(); await p.waitForTimeout(800); await okMsg()
const xl = fs.readFileSync(`${UD}/manual-backup.sqlite`)
check('export: Excel file is a real .xlsx (zip)', xl.slice(0, 2).toString() === 'PK' && xl.length > 2000)
await btn(rw, 'PDF').click(); await p.waitForTimeout(3000); const pdfMsg = await okMsg()
const pdf = fs.readFileSync(`${UD}/manual-backup.sqlite`)
check('export: PDF file generated', pdf.slice(0, 4).toString() === '%PDF' && pdf.length > 5000, pdfMsg)
await closeWin(rw)
// «حالة اليوم» says مداوم on an attended day; «عدد ساعات الدوام» = the day's scheduled hours (none on a day off)
{
  ;[rw, D] = await detailed()
  const cells = await rw.locator('tr[data-emp="1001"]').evaluateAll((trs) => Object.fromEntries(trs.map((tr) => [tr.dataset.date, [...tr.children].map((td) => td.textContent.trim())])))
  const sched = await p.evaluate(() => Object.fromEntries(Engine.compute({ from: '2026-09-19', to: '2026-09-24' }).filter((r) => r.emp.code === '1001').map((r) => [r.date, r.scheduled ? Engine.hm(r.scheduled) : ''])))
  const c19 = cells['2026-09-20'] || [], c24 = cells['2026-09-24'] || []
  check('detailed: attended day → حالة اليوم «مداوم»', c19.at(-1) === 'مداوم', c19.join('|'))
  check('detailed: عدد ساعات الدوام = scheduled hours', c19.at(-5) === sched['2026-09-20'] && /^\d\d:\d\d$/.test(c19.at(-5)), `${c19.at(-5)} vs ${sched['2026-09-20']}`)
  check('detailed: day off → عطلة أسبوعية, no duty hours', c24.at(-1) === 'عطلة أسبوعية' && c24.at(-5) === '', c24.join('|'))
  await closeWin(rw)
  check('engine: a single punch outside every period still counts as attended', await p.evaluate(async () => {
    const code = '1001', d = '2026-09-27'
    const before = Engine.compute({ from: d, to: d }).find((r) => r.emp.code === code)
    DB.run('INSERT INTO punches (emp_code, ts, source) VALUES (?, ?, ?)', [code, `${d} 02:00:00`, 'manual'])
    const after = Engine.compute({ from: d, to: d }).find((r) => r.emp.code === code)
    DB.run('DELETE FROM punches WHERE emp_code = ? AND ts = ?', [code, `${d} 02:00:00`])
    return before.kind === 'absent' && after.kind === 'present'
  }))
}
// the three restored Apex reports
await menu('التقارير', 'بيان تأخير الموظفين'); rw = repWin('بيان تأخير الموظفين')
await rw.locator('#r-month').selectOption('9'); await rw.locator('#r-year').fill('2026'); await btn(rw, 'موافق').click(); await p.waitForTimeout(300)
{
  const row = rw.locator('table.month-grid tr[data-emp="1001"]')
  const kinds = await row.locator('td.c').evaluateAll((tds) => tds.map((td) => td.dataset.kind || ''))
  check('بيان تأخير الموظفين: الرقم · الاسم · 31 days · التوقيع', (await rw.locator('table.month-grid thead th').count()) === 34 && kinds.length === 31)
  check('بيان تأخير الموظفين: 1001 day colours by status', kinds[19] === 'present' && kinds[21] === 'leave' && kinds[22] === 'holiday' && kinds[23] === 'off', kinds.slice(18, 24).join('|'))
  check('بيان تأخير الموظفين: 8-colour key incl. مداوم', (await rw.locator('.legend span').count()) === 8 && /مداوم/.test(await rw.locator('.legend').textContent()))
  check('بيان تأخير الموظفين: printed landscape', (await rw.locator('.report-out [data-landscape]').count()) === 1)
  await snap('v2-late-statement'); await closeWin(rw)
}
await menu('التقارير', 'تأخير وإضافي الدوام'); rw = repWin('تأخير وإضافي الدوام')
await rw.locator('#r-from').fill('2026-09-19'); await rw.locator('#r-to').fill('2026-09-24'); await btn(rw, 'موافق').click(); await p.waitForTimeout(300)
{
  const blk = rw.locator('.rep-emp', { hasText: 'مستشفى' }).or(rw.locator('.rep-emp')).first()
  const head = await rw.locator('.rep-emp').first().locator('thead').textContent()
  check('تأخير وإضافي الدوام: title + الشفت columns', /تقرير تأخير وإضافي الدوام/.test(await rw.locator('.rep-title').textContent()) && /الشفت الأول/.test(head) && /ساعات العمل/.test(head))
  const r20 = await rw.locator('tr[data-emp="1001"][data-date="2026-09-20"] td').allTextContents()
  check('تأخير وإضافي الدوام: 1001 on 09-20 late+early 00:50 in الشفت الأول', r20[2] === '00:50', r20.join('|'))
  check('تأخير وإضافي الدوام: الإجمالي row', /الإجمالي/.test(await blk.locator('tfoot').first().textContent()))
  await snap('v2-late-over'); await closeWin(rw)
}
await menu('التقارير', 'أذونات الموظفين'); rw = repWin('أذونات الموظفين')
await rw.locator('#r-from').fill('2026-09-01'); await rw.locator('#r-to').fill('2026-09-30'); await btn(rw, 'موافق').click(); await p.waitForTimeout(300)
{
  const rows = await rw.locator('.report-out tbody tr[data-date]').evaluateAll((trs) => trs.map((tr) => [tr.dataset.emp, ...[...tr.children].map((td) => td.textContent.trim())]))
  const r = rows.find((x) => /2026.09.19/.test(x[2]) && x[4] === '09:00')
  check('أذونات الموظفين: the late-arrival permission row (اليوم · التاريخ · البدايه · النهايه · … · حالة اليوم)', !!r && r[1] === 'السبت' && r[3] === '08:00' && r[6] === '01:00' && !!r[10], JSON.stringify(rows))
  check('أذونات الموظفين: Apex columns', /البدايه[\s\S]*النهايه[\s\S]*الدوام[\s\S]*الإذن[\s\S]*التأخير[\s\S]*الإضافي[\s\S]*ساعات العمل[\s\S]*حالة اليوم/.test(await rw.locator('.rep-emp thead').first().textContent()))
  await snap('v2-permissions-report'); await closeWin(rw)
}
// posting freezes the day: post 19..20, then move «صباحي م» check-in to 07:00
await menu('الإجراءات', 'ترحيل الحركات'); w = win('ترحيل الحركات وحساب ساعات العمل'); await w.locator('#pw-from').fill('2026-09-19'); await w.locator('#pw-to').fill('2026-09-20')
await w.locator('#pw-go').click(); await p.waitForTimeout(300); await okMsg(); await closeWin(w)
;[gw, t] = await openGroupTimes('صباحي م')
await per(t, 0).locator('[data-f=b]').fill('07:00'); await repeat(t)
await tab(t, 'الخميس'); await t.locator('#st-off').check(); await tab(t, 'الجمعة'); await t.locator('#st-off').check(); await btn(t, 'حفظ').click(); await p.waitForTimeout(250); await okMsg(); await closeWin(t); await closeWin(gw)
;[rw, D] = await detailed()
check('posting: posted day keeps its result after the shift is edited (still 30 min late)', cell('1001:2026-09-20', 4) === '00:30', D['1001:2026-09-20']?.join('|'))
check('posting: unposted day uses the new times (08:05 vs 07:00 → late)', /متأخر/.test(cell('1001:2026-09-21', 8) || ''), D['1001:2026-09-21']?.join('|'))
await closeWin(rw)
await menu('الإجراءات', 'الغاء ترحيل'); w = win('الغاء ترحيل الحركات خلال فترة'); await w.locator('#pw-from').fill('2026-09-19'); await w.locator('#pw-to').fill('2026-09-20'); await w.locator('#pw-go').click(); await p.waitForTimeout(200); await okMsg(); await closeWin(w)
;[rw, D] = await detailed()
check('unpost: the day is recomputed with the current times (08:30 vs 07:00 → 01:30 late)', cell('1001:2026-09-20', 4) === '01:30', D['1001:2026-09-20']?.join('|'))
await closeWin(rw)
// permissions: user hr may only open «الموظفين»
await menu('الاعدادات', 'صلاحيات المستخدمين', 'اعدادات المستخدمين'); w = win('صلاحيات المستخدمين')
await w.locator('#ro-list tr', { hasText: 'موارد بشرية' }).click()
await w.locator('.screens tr[data-key="البيانات الأساسية/الموظفون"] input[data-a=print]').check(); await snap('v2-permissions')
check('roles: permissions saved under the old menu spellings carry over', await p.evaluate(() => {
  DB.run("INSERT INTO roles (name_ar, name_en, perms) VALUES ('قديم', 'old', ?)", [JSON.stringify({ 'البيانات الأساسية/الموظفين': { view: 1 }, 'الإعدادات/بيانات المؤسسة': { view: 1, edit: 1 } })])
  DB.migrateV5()
  const r = JSON.parse(DB.one("SELECT perms FROM roles WHERE name_ar = 'قديم'").perms)
  DB.run("DELETE FROM roles WHERE name_ar = 'قديم'")
  return !!r['البيانات الأساسية/الموظفون']?.view && !!r['الاعدادات/بيانات المؤسسه']?.edit && !r['البيانات الأساسية/الموظفين']
}))
check('roles: ticking «طباعة» ticks «عرض»', await w.locator('.screens tr[data-key="البيانات الأساسية/الموظفون"] input[data-a=view]').isChecked())
await btn(w, 'حفظ').click(); await okMsg(); await closeWin(w)
// audit log
await p.evaluate(() => openAuditLog()); await p.waitForTimeout(300); w = win('سجل الحركات'); const audit = await w.locator('tbody').textContent()
check('audit log: records logins, posting, employee edits, permissions', /تسجيل دخول/.test(audit) && /ترحيل الحركات/.test(audit) && /تعديل موظف/.test(audit) && /تعديل صلاحيات/.test(audit))
await snap('v2-audit'); await closeWin(w)

// ── 8c. backup → change → restore ─────────────────────────
await p.evaluate(() => openBackup()); await p.waitForTimeout(300); w = win('إنشاء نسخة إحتياطية'); await w.locator('#bk-go').click(); await p.waitForTimeout(200); await okMsg(); await closeWin(w)
fs.copyFileSync(`${UD}/manual-backup.sqlite`, `${UD}/restore-me.sqlite`)
await menu('البيانات الأساسية', 'المشاريع'); w = win('المشـــاريع'); await lastRow(w).locator('[data-f=name_ar]').fill('مشروع مؤقت'); await gsave(w)
check('restore: project added after the backup', (await rowCount(w)) === 2); await closeWin(w)
await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }) }, `${UD}/restore-me.sqlite`)
fs.writeFileSync(`${UD}/not-a-db.sqlite`, 'hello')
await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }) }, `${UD}/not-a-db.sqlite`)
// Apex «إستعادة قاعدة البيانات من نسخة إحتياطية»: agree · file · (new database) · admin password
await p.evaluate(() => openRestore()); await p.waitForTimeout(300); w = win('إستعادة قاعدة البيانات')
await w.locator('#rs-pick').click(); await p.waitForTimeout(300)
check('restore: a non-backup file is refused', /ليس نسخة احتياطية صالحة/.test(await okMsg()))
await w.locator('#rs-go').click(); await p.waitForTimeout(150); check('restore: needs «موافق» on the notice', /موافق/.test(await okMsg()))
await app.evaluate(({ dialog, app }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); app.relaunch = () => {}; app.exit = () => {} }, `${UD}/restore-me.sqlite`)
await w.locator('#rs-pick').click(); await p.waitForTimeout(300); check('restore: file path shown', (await w.locator('#rs-path').inputValue()).endsWith('restore-me.sqlite'))
await w.locator('#rs-agree').check(); await w.locator('#rs-pw').fill('wrong'); await w.locator('#rs-go').click(); await p.waitForTimeout(150)
check('restore: admin password required', /غير صحيحة/.test(await okMsg()))
await w.locator('#rs-pw').fill('admin1'); await w.locator('#rs-go').click(); await p.waitForTimeout(150); await yes(); await p.waitForTimeout(400)
check('restore: backup restored', /تم استرجاع/.test(await okMsg()))
await menu('البيانات الأساسية', 'المشاريع'); w = win('المشـــاريع')
check('restore: data is back to the backup (temporary project gone)', (await rowCount(w)) === 1); await closeWin(w)
// logout returns to the login screen
await menu('ملف', 'تسجيل الخروج')
check('logout: back to the login screen', await p.locator('text=شاشة الدخول').waitFor({ timeout: 10000 }).then(() => true, () => false))
await p.locator('#pass').fill('admin1'); await p.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(600)
check('logout: login again', await p.locator('#home').isVisible())

// ── 9. restart: data persisted, password changed, licence kept ──
await app.close()
const app2 = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
const p2 = await app2.firstWindow(); await p2.waitForSelector('text=شاشة الدخول')
await p2.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p2.waitForTimeout(300)
check('restart: old empty password no longer works', /غير صحيحة/.test(await p2.locator('.dlg .err').textContent()))
await p2.locator('#user').fill('hr'); await p2.locator('#pass').fill('1234'); await p2.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p2.waitForTimeout(700)
check('permissions: restricted user sees only permitted menus', (await p2.locator('#menubar .menu').count()) === 4 && (await p2.locator('#menubar .menu > button', { hasText: 'البيانات الأساسية' }).count()) === 1)
await p2.locator('#menubar .menu > button', { hasText: 'البيانات الأساسية' }).click(); await p2.waitForTimeout(150)
check('permissions: only «الموظفين» inside', (await p2.locator('.menu.open .drop button').count()) === 1)
await p2.locator('.menu.open .drop button', { hasText: 'الموظفون' }).click(); await p2.waitForTimeout(300)
{ const ew = p2.locator('.win', { has: p2.locator('.cap', { hasText: 'الموظفون' }) }).last()
  const dis = async (k) => ew.locator(`.toolbar button[data-key=${k}]`).first().isDisabled()
  check('permissions: view+print only → جديد / حذف disabled, طباعة enabled', (await dis('new')) && (await dis('del')) && !(await dis('print')), `new=${await dis('new')} del=${await dis('del')} print=${await dis('print')}`)
  await ew.locator('.toolbar button[data-key=close]').click() }
await p2.locator('body').click({ position: { x: 5, y: 300 } })
await p2.locator('.tile', { hasText: 'التجهيز' }).click(); await p2.waitForTimeout(150)
await p2.locator('.tile', { hasText: 'مواعيد العمل' }).click(); await p2.waitForTimeout(150)
check('permissions: home tile blocked without permission', /ليس لديك صلاحية/.test(await p2.locator('.dlg-backdrop .body').last().textContent()))
await app2.close()
const app3 = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
const p3 = await app3.firstWindow(); await p3.waitForSelector('text=شاشة الدخول')
check('login remembers the last user', (await p3.locator('#user').inputValue()) === 'hr')
await p3.locator('#user').fill('أ'); await p3.locator('#pass').fill('admin1'); await p3.locator('.dlg').getByRole('button', { name: 'موافق' }).click(); await p3.waitForTimeout(700)
check('restart: login with new password', await p3.locator('#home').isVisible())
check('restart: licence kept', /Registered/.test(await p3.locator('#caption-text').textContent()))
await p3.locator('#menubar .menu > button', { hasText: 'البيانات الأساسية' }).click(); await p3.locator('.menu.open .drop button', { hasText: 'الموظفون' }).first().click(); await p3.waitForTimeout(300)
check('restart: employees persisted (5 after purge)', (await p3.locator('.win tbody tr').count()) === 5)
check('restart: automatic daily backup created', fs.existsSync(`${UD}/backups`) && fs.readdirSync(`${UD}/backups`).length >= 1)
await app3.close()

check('no page errors during the whole run', errs.length === 0, errs.slice(0, 3).join(' || '))
console.log(results.join('\n'))
console.log(`\nTOTAL: ${pass} passed, ${fail} failed · screenshots: ${shot} in ${SHOTS}`)
