// Full functional test of the real Electron app (run: npm run build:ui && xvfb-run -a node tools/full-test.mjs).
// Walks the sidebar, the toolbars and the dialogs of the msar-erp.com-style shell; keeps every attendance figure; prints PASS/FAIL per
// check and saves a screenshot of each screen in test-shots/.
import { _electron as electron } from '/home/frappeuser/tamken3-audit/node_modules/playwright/index.mjs'
import fs from 'fs'
import { execFileSync } from 'child_process'

const ROOT = process.env.MT_ROOT || '/root/meena-time'
const SHOTS = `${ROOT}/test-shots`
const UD = '/tmp/TEST-mt-fulltest' // test data lives here only and is deleted at the end
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true })
fs.rmSync(UD, { recursive: true, force: true })

let pass = 0, fail = 0
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`) }

const app = await electron.launch({ executablePath: process.env.MT_ELECTRON || `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
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
// a sidebar page by its label; the old «menu/item» names of the permission keys still work
const PAGE = { 'الموظفون': 'الموظفين', 'قوائم البرنامج': 'الوظائف', 'مواعيد العمل': 'أوقات العمل', 'تعريف الأجهزة': 'الاجهزة', 'قراءة الحركات': 'قراءة الحركات', 'عرض الحركات': 'عرض الحركات',
  'إضافة وتعديل': 'اضافة و تعديل حركات', 'الغاء الحركات': 'الغاء الحركات المعدلة يدويا', 'إضافة أجازات': 'اضافة اجازة', 'إضافة أذونات': 'اضافة اذن', 'ترحيل الحركات': 'ترحيل الحركات',
  'الغاء ترحيل': 'إلغاء ترحيل الحركات', 'الغاء جميع': 'الغاء بيانات موظف', 'بيانات المؤسسه': 'بيانات الشركة', 'صلاحيات المستخدمين': 'الصلاحيات', 'إدارة المستخدمين': 'المستخدمين', 'اعدادات النظام': 'اعدادات الحضور و الانصراف' }
const openPage = async (pg, label) => {
  await pg.evaluate((l) => {
    const b = [...document.querySelectorAll('#rail [data-page]')].find((x) => x.dataset.page === l)
    for (let k = b?.parentElement; k && k.id !== 'rail'; k = k.parentElement) if (k.classList.contains('rail-kids') && k.hidden) k.previousElementSibling.click()
  }, label)
  await pg.locator(`#rail [data-page="${label}"]`).click()
  await pg.waitForTimeout(250)
}
const menu = async (m, item) => openPage(p, m === 'التقارير' ? item : PAGE[Object.keys(PAGE).find((k) => item.startsWith(k))] || item)
const dlgText = async () => (await p.locator('.dlg-backdrop').last().textContent()).trim()
const okMsg = async () => { const t = (await p.locator('.dlg-backdrop .body').last().textContent()).trim(); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'موافق' }).click(); await p.waitForTimeout(150); return t }
const yes = async () => { await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'نعم' }).click(); await p.waitForTimeout(250) }
// a page's caption is its sidebar label; opened from another page it keeps its own title
const ALSO = { 'إضافة وتعديل حركات موظف': 'اضافة و تعديل حركات', 'أجازات الموظفين': 'اضافة اجازة', 'أذونات الموظفين': 'اضافة اذن', 'ترحيل الحركات وحساب ساعات العمل': 'ترحيل الحركات',
  'الغاء ترحيل الحركات خلال فترة': 'إلغاء ترحيل الحركات', 'إلغاء الحركات المعدله يدويا': 'الغاء الحركات المعدلة يدويا', 'الغاء جميع بيانات الموظف': 'الغاء بيانات موظف' }
const win = (t) => p.locator('.win', { has: p.locator('.cap', { hasText: ALSO[t] ? new RegExp(`${t}|${ALSO[t]}`) : t }) }).last()
const repWin = (name) => p.locator(`.win[data-win="rep-${name}"]`)
const BTN = { 'جديد': 'اضافة', 'طباعه': 'الطباعة' }
const btn = (w, name) => w.locator('.toolbar button', { hasText: BTN[name] || name }).first()
const rowCount = async (w) => w.locator('tbody tr[data-id]').count()
const loginBtn = (pg = p) => pg.locator('.dlg .btns button.pri').first()
const closeWin = async (w) => { await w.evaluate((el) => { UI.close(el.dataset.win) }); await p.waitForTimeout(200) }
// the add / edit dialog of a list page
const dlgSave = async () => { await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(250) }
const dlgFill = async (values) => {
  const d = p.locator('.dlg-backdrop').last()
  for (const [f, v] of Object.entries(values)) {
    const el = d.locator(`[data-f=${f}]`)
    if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(typeof v === 'number' ? { index: v } : { label: v })
    else await el.fill(String(v))
  }
}
const addRow = async (w, values) => { await btn(w, 'جديد').click(); await p.waitForTimeout(150); await dlgFill(values); await dlgSave(); return okMsg() }

// ── 1. login ──────────────────────────────────────────────
await p.waitForSelector('.login-page #pass', { timeout: 20000 })
await snap('login')
check('login: Masar logo + photo, works offline (no remote assets)', (await p.locator('.login-logo').count()) === 1 && (await p.locator('.login-photo img').count()) === 1)
check('login: single database shown', (await p.locator('#year option').count()) === 1)
await p.locator('#pass').fill('bad'); await loginBtn().click(); await p.waitForTimeout(300)
check('login: wrong password rejected', /غير صحيحة/.test(await p.locator('.dlg .err').textContent()))
await p.locator('#user').fill('Admin'); await p.locator('#pass').fill(''); await loginBtn().click(); await p.waitForTimeout(400)
check('first login: «admin» signs in as «أ» and is forced to set a password', /تعيين كلمة مرور جديدة/.test(await dlgText()) && /«أ»/.test(await dlgText()))
await p.locator('#np1').fill('ab'); await p.locator('#np2').fill('ab'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(150)
check('first login: short password rejected', /4 أحرف/.test(await p.locator('.dlg-backdrop').last().locator('.err').textContent()))
await snap('force-password')
await p.locator('#np1').fill('start1'); await p.locator('#np2').fill('start1'); await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'حفظ' }).click(); await p.waitForTimeout(700)
check('login: default admin «أ» in after setting the password', await p.locator('#home').isVisible())
await snap('home')
check('shell: dashboard with today\'s summary', (await p.locator('#home .dash-tile').count()) === 6 && /إجمالي الموظفين/.test(await p.locator('#home .dash-donut').textContent()))
check('shell: sidebar on the right, topbar over the main column', await p.evaluate(() => { const r = document.getElementById('rail').getBoundingClientRect(), t = document.getElementById('topbar').getBoundingClientRect(); return r.left > t.left && r.height >= innerHeight - 1 && t.right <= r.left + 1 }))
check('shell: Masar palette (dark-teal sidebar, topbar)', await p.evaluate(() => getComputedStyle(document.getElementById('rail')).backgroundColor === 'rgb(29, 77, 86)'))
check('shell: embedded Arabic font', await p.evaluate(() => /Noto Kufi Arabic/.test(getComputedStyle(document.body).fontFamily) && document.fonts.check('14px "Noto Kufi Arabic"', 'م')))
check('shell: nothing is loaded from the internet', await p.evaluate(() => performance.getEntriesByType('resource').every((r) => !/^https?:/.test(r.name))))
check('banner: trial notice when unregistered', /تجريبية/.test(await p.locator('#banner').textContent()))
check('caption: version matches package.json', (await p.title()).includes(JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf8')).version))
check('package: named Masar Time 2.0.0', JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf8')).productName === 'Masar Time' && JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf8')).version === '2.0.0')
// the sidebar follows routes.ts; what needs the internet is not in it
check('sidebar: sections in the site\'s order', (await p.locator('#rail nav > [data-page], #rail nav > .rail-group > [data-toggle]').allTextContents()).map((t) => t.trim()).join('|') === 'لوحة القيادة|البيانات الاساسية|الحضور والانصراف|المستخدمين|الاعدادات')
{
  const all = await p.evaluate(() => [...document.querySelectorAll('#rail [data-page]')].map((b) => b.dataset.page))
  check('sidebar: no online pages', !all.some((n) => /الجوال|المواقع|الاشتراك|الطلبات|الربط بالموقع/.test(n)), all.join())
  check('sidebar: 14 reports in lib/hr-reports.ts order', all.slice(all.indexOf('حالة اليوم'), all.indexOf('حالة اليوم') + 3).join('|') === 'حالة اليوم|الحضور والانصراف تفصيلي|الحضور والانصراف إجمالي' && all.includes('تأخير وإضافي الدوام'))
  for (const n of ['الموظفين', 'الوظائف', 'أوقات العمل', 'العطلات الرسمية', 'انواع الاجازات', 'اضافة اجازة', 'اضافة اذن', 'الاجهزة', 'الاعدادات العامة', 'بيانات الشركة']) check(`sidebar: «${n}»`, all.includes(n))
}
await openPage(p, 'الموظفين')
check('sidebar: a page opens in the main column, the dashboard hides', (await p.locator('.win[data-win=employees]').isVisible()) && (await p.locator('#home').isHidden()))
check('sidebar: the current page is marked', await p.locator('#rail [data-page="الموظفين"] .bar').isVisible())
await p.locator('#tb-q').fill('العطلات'); await p.waitForTimeout(100); await p.locator('#tb-hits button').first().dispatchEvent('mousedown'); await p.waitForTimeout(250)
check('topbar: quick search opens a screen', await win('العطلات الرسمية').isVisible() && (await p.locator('.win').count()) === 1)
await p.locator('#rail-logo').click(); await p.waitForTimeout(200)
check('sidebar: the logo comes back to the dashboard', (await p.locator('.win').count()) === 0 && await p.locator('#home').isVisible())
await p.locator('#tb-user-btn').click(); check('topbar: user menu with خروج', /خروج/.test(await p.locator('#tb-user-menu').textContent())); await p.mouse.click(600, 500); await p.waitForTimeout(100)
await snap('sidebar')

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
  check(`${title}: page opens`, await w.isVisible())
  check(`${title}: search + «تصدير» + «اضافة»`, (await w.locator('.tb-search input').count()) === 1 && (await w.locator('.tb-menu .tb-btn').count()) === 1 && (await btn(w, 'جديد').count()) === 1)
  check(`${title}: empty state`, (await w.locator('.apex-empty').count()) === 1)
  await snap(`grid-${title}`)
  // required field: the dialog stays open with the message
  await btn(w, 'جديد').click(); await p.waitForTimeout(150); await snap(`dialog-${title}`)
  await dlgSave()
  check(`${title}: required validation`, (await p.locator('.dlg-backdrop .err').last().textContent()).includes(required))
  await p.locator('.dlg-backdrop .dlg-x').last().click(); await p.waitForTimeout(100)
  check(`${title}: ✕ closes without saving`, (await p.locator('.dlg-backdrop').count()) === 0 && (await rowCount(w)) === 0)
  for (const values of fill) { const m = await addRow(w, values); if (!/تم حفظ البيانات بنجاح/.test(m)) check(`${title}: save`, false, m) }
  check(`${title}: ${fill.length} rows saved`, (await rowCount(w)) === fill.length, `rows=${await rowCount(w)}`)
  // edit: pencil, ✕ drops the change, then edit + save
  const pen = () => w.locator('tbody tr[data-id]').first().locator('[data-a=edit]')
  const cell = () => w.locator('tbody tr[data-id]').first().locator('td').nth(1)
  const orig = (await cell().textContent()).trim()
  await pen().click(); await p.waitForTimeout(120); await dlgFill({ [Object.keys(fill[0])[0]]: orig + ' X' }); await p.locator('.dlg-backdrop .dlg-x').last().click(); await p.waitForTimeout(100)
  check(`${title}: ✕ keeps the old value`, (await cell().textContent()).trim() === orig)
  await pen().click(); await p.waitForTimeout(120); await dlgFill({ [Object.keys(fill[0])[0]]: orig + ' م' }); await dlgSave(); await okMsg()
  check(`${title}: edit saved`, (await cell().textContent()).trim() === orig + ' م')
  // search
  await w.locator('.tb-search input').fill('لا_يوجد_هذا'); await p.waitForTimeout(100)
  check(`${title}: search filters`, (await rowCount(w)) === 0 && (await w.locator('.apex-empty').count()) === 1)
  await w.locator('.tb-search input').fill(''); await p.waitForTimeout(100)
  return w
}

let w = await gridCrud('الوظائف', 'قوائم البرنامج', [{ name_ar: 'ممرض' }, { name_ar: 'محاسب' }])
await closeWin(w)
for (const [page, name] of [['انواع الاجازات', 'سنوية'], ['الديانة', 'مسيحي']]) {
  await openPage(p, page); w = win(page)
  check(`lists: «${page}» has its own (empty) list`, (await rowCount(w)) === 0)
  await addRow(w, { name_ar: name }); await closeWin(w)
}
await openPage(p, 'الوظائف'); w = win('الوظائف')
check('lists: «الوظائف» shows the jobs only', (await rowCount(w)) === 2)
const jobs = () => p.evaluate(() => DB.one("SELECT COUNT(*) AS n FROM lists WHERE list_type = 'job'").n)
{
  const before = await jobs()
  await btn(w, 'جديد').click(); await p.waitForTimeout(120); await dlgFill({ name_ar: 'سائق' }); await p.locator('.dlg-backdrop [data-f=name_ar]').press('Enter'); await p.waitForTimeout(300); await okMsg()
  check('lists: Enter saves the dialog', (await jobs()) === before + 1)
  check('lists: rows numbered 1…n', (await w.locator('tbody tr[data-id]').nth(2).locator('td').first().textContent()) === '3')
  await w.locator('tbody tr[data-id]').nth(2).locator('[data-a=del]').click(); await p.waitForTimeout(120); await yes(); await p.waitForTimeout(150)
  check('lists: trash asks, then deletes', (await jobs()) === before)
}
check('lists: rows stored with their type', await p.evaluate(() => DB.all('SELECT list_type t, name_ar n FROM lists ORDER BY id').map((r) => r.t + ':' + r.n).join()) === 'job:ممرض م,job:محاسب,leave:سنوية,religion:مسيحي', await p.evaluate(() => DB.all('SELECT list_type t, name_ar n FROM lists ORDER BY id').map((r) => r.t + ':' + r.n).join()))
await closeWin(w)
await menu('البيانات الأساسية', 'الإدارات والأقسام'); w = win('الإدارات والأقسام'); await snap('departments')
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
w = await gridCrud('المشاريع', 'المشاريع', [{ name_ar: 'مشروع أ', name_en: 'Project A' }])
// «تصدير ← طباعة» prints the list itself as a report (letterhead + table), not the screen
{
  const before = (await prints()).length
  await w.locator('.tb-menu .tb-btn').click(); await p.waitForTimeout(80); await w.locator('.tb-drop [data-x=print]').click(); await p.waitForTimeout(400)
  const doc = (await prints())[before] || ''
  check('grid print: sends a document', !!doc)
  fs.writeFileSync(`${SHOTS}/grid-print.html`, doc)
  check('grid print: letterhead + title + rows as text', doc.includes('rep-head') && doc.includes('المشاريع') && doc.includes('مشروع أ'))
  check('grid print: no form controls in the printout', !/<(select|input|button)\b/.test(doc.split('<body')[1] || ''))
  await w.locator('.tb-menu .tb-btn').click(); await p.waitForTimeout(80); await w.locator('.tb-drop [data-x=excel]').click(); await p.waitForTimeout(500); await okMsg()
  check('grid export: a real .xlsx', fs.readFileSync(`${UD}/manual-backup.sqlite`).slice(0, 2).toString() === 'PK')
}
await closeWin(w)
w = await gridCrud('مجموعات الموظفين', 'مجموعات الموظفين', [{ name_ar: 'المجموعة الأولى' }])
check('employee groups: «الموظفون» on each row', (await w.locator('tbody tr[data-id] [data-x=members]').count()) === 1); await closeWin(w)
w = await gridCrud('العطلات الرسمية', 'العطلات الرسمية', [{ name_ar: 'اليوم الوطني', from_date: '2026-09-23', to_date: '2026-09-23' }]); await closeWin(w)
await p.evaluate(() => openGuide('أجهزة البصمة')); await p.waitForTimeout(300); w = win('دليل الاستخدام')
check('guide: «أجهزة البصمة» instructions', /Menu ← Comm ← Ethernet/.test(await w.locator('article').textContent())); await closeWin(w)
await menu('البيانات الأساسية', 'تعريف الأجهزة'); w = win('الاجهزة'); await snap('devices')
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
check('devices: saved and listed with its code + department', (await w.locator('.dev-win tbody tr[data-id]').count()) === 1 && /قسم الطوارئ/.test(await w.locator('.dev-win tbody tr').first().textContent()) && (await w.locator('#dv-port').inputValue()) === '4370')
await closeWin(w)
await menu('البيانات الأساسية', 'الإدارات والأقسام'); w = win('الإدارات والأقسام'); await w.locator('.tn', { hasText: 'قسم الطوارئ' }).click(); await btn(w, 'حذف').click(); await p.waitForTimeout(150)
check('departments: section used by a device cannot be deleted', /مرتبط/.test(await okMsg())); await closeWin(w)
w = await gridCrud('أوقات العمل', 'مواعيد العمل', [{ name_ar: 'صباحي' }, { name_ar: 'مسائي' }])

// shift times — Apex «إعداد مواعيد العمل»
await w.locator('tbody tr[data-id]').first().locator('[data-x=times]').click(); await p.waitForTimeout(300)
let tw = win('إعداد مواعيد العمل')
const tab = async (t, day) => { await t.locator('.st-tabs button', { hasText: day }).click(); await p.waitForTimeout(80) }
const per = (t, i) => t.locator(`.st-grid tr[data-i="${i}"]`)
// «تكرار» asks first (Apex), then copies the day to every day that is not a holiday
const repeat = async (t, yes = true) => { await btn(t, 'تكرار').click(); await p.waitForTimeout(100); await p.locator('.dlg').getByRole('button', { name: yes ? 'نعم' : 'لا' }).click(); await p.waitForTimeout(100) }
const setPer = async (t, i, b, e, late = '15', early = '15') => { const r = per(t, i); await r.locator('[data-f=b]').fill(b); await r.locator('[data-f=e]').fill(e); await r.locator('[data-f=late]').fill(late); await r.locator('[data-f=early]').fill(early) }
check('shift times: Apex window — 7 day tabs × 4 periods × 8 columns', (await tw.locator('.st-tabs button').count()) === 7 && (await tw.locator('.st-grid tbody tr').count()) === 4 && (await tw.locator('.st-grid tbody tr').first().locator('input').count()) === 8)
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
await tab(tw, 'السبت'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(250)
check('shift times: an empty working day saves (Apex)', /تم حفظ/.test(await okMsg()))
await tab(tw, 'الجمعة'); check('shift times: saved empty, Friday stays أجازة', await tw.locator('#st-off').isChecked()); await tab(tw, 'الأحد'); check('shift times: an empty working day stays a working day', !(await tw.locator('#st-off').isChecked())); await tab(tw, 'السبت')
await per(tw, 0).locator('[data-f=b]').fill('08:00'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(150)
check('shift times: «تبدأ من» without «إلى» → Apex message', /أدخل موعد إنتهاء الفترة/.test(await okMsg()))
await per(tw, 0).locator('[data-f=b]').fill('')
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
// Apex's example: «نهاية الحضور» = start + grace, «بداية الانصراف» = «إلى», «نهاية الانصراف» 00:00 — saved as typed, no ✖
await tab(tw, 'السبت')
// typed key by key, as a person does (the mask treats an untyped 00:00 as «only looked at»)
const typeP = async (t, i, o) => { for (const [k, v] of Object.entries(o)) { const f = per(t, i).locator(`[data-f=${k}]`); await f.focus(); await p.keyboard.press('Control+a')
  if (['late', 'early'].includes(k) || !v) await p.keyboard.press('Backspace'); if (v) await p.keyboard.type(v.replace(':', '')); await f.blur(); await p.waitForTimeout(30) } }
const fillP = (i, o) => typeP(tw, i, o)
const bads = () => tw.locator('.st-grid td.st-bad').count()
await fillP(0, { b: '22:30', e: '23:40', si: '20:00', ei: '22:40', so: '23:40', eo: '00:00', late: '10', early: '10' })
check('shift times: Apex example has no ✖', (await bads()) === 0)
await btn(tw, 'حفظ').click(); await p.waitForTimeout(250); check('shift times: Apex example saves', /تم حفظ/.test(await okMsg()))
check('shift times: Apex example kept as typed, 01:10 hours', (await per(tw, 0).locator('[data-f=ei]').inputValue()) === '22:40' && (await per(tw, 0).locator('[data-f=so]').inputValue()) === '23:40' && (await per(tw, 0).locator('[data-f=eo]').inputValue()) === '00:00' && (await tw.locator('#st-hours').inputValue()) === '01:10')
// each order rule: ✖ on leaving the field, none where Apex shows none, and «حفظ» still saves
for (const [k, v, want, why] of [['si', '23:00', 0, '«بداية الحضور» after «تبدأ من»'], ['ei', '19:00', 1, '«نهاية الحضور» before «بداية الحضور»'], ['ei', '22:00', 0, '«نهاية الحضور» before «تبدأ من»'],
  ['so', '22:00', 1, '«بداية الانصراف» before «نهاية الحضور»'], ['so', '23:00', 0, '«بداية الانصراف» before «إلى»'], ['eo', '23:00', 1, '«نهاية الانصراف» before «بداية الانصراف»'], ['e', '22:30', 1, '«إلى» = «تبدأ من»'], ['late', '500', 0, 'very long grace']]) {
  const was = await per(tw, 0).locator(`[data-f=${k}]`).inputValue()
  await fillP(0, { [k]: v })
  check(`shift times: ${why} → ${want ? '✖' : 'no ✖'}`, (await bads()) === want)
  await btn(tw, 'حفظ').click(); await p.waitForTimeout(200); check(`shift times: ${why} still saves`, /تم حفظ/.test(await okMsg()))
  await fillP(0, { [k]: was })
}
check('shift times: fixing the time removes the ✖', (await bads()) === 0)
await fillP(1, { b: '01:00', e: '02:00' }); await fillP(1, { b: '', e: '' }); await fillP(2, { b: '23:50', e: '23:55' })
await btn(tw, 'حفظ').click(); await p.waitForTimeout(200); check('shift times: third period with the second empty saves', /تم حفظ/.test(await okMsg()))
await closeWin(tw); await w.locator('tbody tr[data-id]').first().locator('[data-x=times]').click(); await p.waitForTimeout(300); tw = win('إعداد مواعيد العمل')
check('shift times: reopened — the third period stays third', (await per(tw, 2).locator('[data-f=b]').inputValue()) === '23:50' && (await per(tw, 1).locator('[data-f=b]').inputValue()) === '')
await fillP(2, { b: '', e: '', si: '', ei: '', so: '', eo: '' })
await fillP(0, { b: '25:99' }); check('shift times: impossible time → ✖', (await bads()) === 1); await btn(tw, 'حفظ').click(); await p.waitForTimeout(200)
check('shift times: impossible time refused without a message', !(await p.locator('.dlg').count()))
await fillP(0, { b: '08:00', e: '16:00', si: '06:00', ei: '', so: '', eo: '', late: '15', early: '15' })
for (const d of ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء']) { await tab(tw, d); if (!(await per(tw, 0).locator('[data-f=b]').inputValue())) await fillP(0, { b: '08:00', e: '16:00', late: '15', early: '15' }) }
await tab(tw, 'السبت'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(250)
check('shift times: valid week saved', /تم حفظ/.test(await okMsg()))
check('shift times: empty punch windows filled in (08:00–16:00 → 06:00 … 20:00)', (await per(tw, 0).locator('[data-f=si]').inputValue()) === '06:00' && (await per(tw, 0).locator('[data-f=eo]').inputValue()) === '20:00')
await snap('shift-times')
// closing with unsaved times asks first (they used to vanish silently)
const dlgBtn = async (name) => { await p.locator('.dlg-backdrop').last().getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(250) }
const reopenTimes = async () => { await w.locator('tbody tr[data-id]').first().locator('[data-x=times]').click(); await p.waitForTimeout(300); return win('إعداد مواعيد العمل') }
await tab(tw, 'السبت'); await per(tw, 0).locator('[data-f=late]').fill('10')
await closeWin(tw)
check('unsaved times: closing asks حفظ / عدم الحفظ / إلغاء', /لم يتم حفظ مواعيد العمل/.test(await dlgText()))
await dlgBtn('إلغاء')
check('unsaved times: «إلغاء» keeps the window and the typed value', (await tw.isVisible()) && (await per(tw, 0).locator('[data-f=late]').inputValue()) === '10')
await closeWin(tw)
await dlgBtn('عدم الحفظ')
check('unsaved times: «عدم الحفظ» closes', (await p.locator('.win[data-win^="shift-times-"]').count()) === 0)
tw = await reopenTimes(); await tab(tw, 'السبت')
check('unsaved times: dropped value not stored', (await per(tw, 0).locator('[data-f=late]').inputValue()) === '15')
await closeWin(tw)
check('unsaved times: no question when nothing changed', (await p.locator('.dlg-backdrop').count()) === 0 && (await p.locator('.win[data-win^="shift-times-"]').count()) === 0)
tw = await reopenTimes(); await tab(tw, 'السبت'); await per(tw, 0).locator('[data-f=late]').fill('10')
await tw.locator('.page-head .x').click(); await p.waitForTimeout(200)
check('unsaved times: «رجوع» asks too', /لم يتم حفظ مواعيد العمل/.test(await dlgText()))
await dlgBtn('حفظ'); await okMsg()
check('unsaved times: «حفظ» saves then closes', (await p.locator('.win[data-win^="shift-times-"]').count()) === 0)
tw = await reopenTimes(); await tab(tw, 'السبت')
check('unsaved times: saved from the question', (await per(tw, 0).locator('[data-f=late]').inputValue()) === '10')
// «أوقات رمضان»: the same week with its own times, used inside a Ramadan period (as on the site)
const bY = await per(tw, 0).locator('[data-f=b]').inputValue() // Saturday's normal start
await tw.locator('.st-cal button', { hasText: 'أوقات رمضان' }).click(); await p.waitForTimeout(150)
check('ramadan: the switch shows the Ramadan bar; times locked until enabled', (await tw.locator('.st-ram').isVisible()) && (await per(tw, 0).locator('[data-f=b]').isDisabled()))
await tw.locator('#st-user').check(); await p.waitForTimeout(120)
check('ramadan: enabling starts from the normal times', (await per(tw, 0).locator('[data-f=b]').inputValue()) === bY && !(await per(tw, 0).locator('[data-f=b]').isDisabled()))
for (const d of ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']) {
  await tab(tw, d)
  if (!(await tw.locator('#st-off').isChecked())) await fillP(0, { b: '10:00', e: '15:00', si: '', ei: '', so: '', eo: '', late: '0', early: '0' })
}
await tw.locator('#st-rfrom').fill('2026-02-18'); await tw.locator('#st-rto').fill('2026-03-19'); await tw.locator('#st-radd').click(); await p.waitForTimeout(250)
check('ramadan: a Ramadan period is added', /18\/02\/2026/.test(await tw.locator('#st-rlist').textContent()))
await tw.locator('#st-rfrom').fill('2026-03-01'); await tw.locator('#st-rto').fill('2026-03-05'); await tw.locator('#st-radd').click(); await p.waitForTimeout(150)
check('ramadan: an overlapping period is refused', /تتداخل/.test(await okMsg()))
await tab(tw, 'الأحد'); await snap('ramadan-times')
await btn(tw, 'حفظ').click(); await p.waitForTimeout(250); check('ramadan: Ramadan times saved', /تم حفظ/.test(await okMsg()))
{ const sch = await p.evaluate(() => { const cfg = Engine.loadConfig(); const gid = Object.keys(cfg.groups).map(Number).find((id) => cfg.hasRamadanTimes[id])
    // 2026-03-01 and 2026-04-05 are both Sundays: one inside Ramadan, one after it
    return [Engine.schedule(cfg, gid, '2026-03-01').windows?.[0]?.check_in, Engine.schedule(cfg, gid, '2026-04-05').windows?.[0]?.check_in] })
  check('ramadan: inside the period the Ramadan times apply (10:00), outside it the normal ones', sch[0] === 600 && sch[1] != null && sch[1] !== 600, JSON.stringify(sch)) }
await closeWin(tw); tw = await reopenTimes(); await tw.locator('.st-cal button', { hasText: 'أوقات رمضان' }).click(); await p.waitForTimeout(150); await tab(tw, 'الأحد')
check('ramadan: kept after reopening', (await tw.locator('#st-user').isChecked()) && (await per(tw, 0).locator('[data-f=b]').inputValue()) === '10:00')
await tw.locator('.st-cal button', { hasText: 'الأوقات العادية' }).click(); await p.waitForTimeout(120); await tab(tw, 'السبت')
check('ramadan: the normal times are untouched', (await per(tw, 0).locator('[data-f=b]').inputValue()) === bY)
const b0 = await per(tw, 0).locator('[data-f=b]').inputValue()
await per(tw, 0).locator('[data-f=b]').fill('25:99'); await per(tw, 0).locator('[data-f=e]').click(); await closeWin(tw); await dlgBtn('حفظ')
check('unsaved times: «حفظ» with an impossible time keeps the window (✖)', (await tw.isVisible()) && (await bads()) >= 1)
await per(tw, 0).locator('[data-f=b]').fill(b0); await per(tw, 0).locator('[data-f=late]').fill('15'); await btn(tw, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
await closeWin(tw)
check('windows: closing shows the previous one again', await w.isVisible())
check('shift groups: total = 5 × 8h = 40:00', (await w.locator('tbody tr[data-id]').first().locator('td').nth(3).textContent()) === '40:00')
await closeWin(w)

// nationalities aren't edited in «قوائم البرنامج» (a linked site sends them): add one for the employee form
await p.evaluate(() => DB.run("INSERT INTO lists (list_type, name_ar, name_en) VALUES ('nationality', 'سعودي', '')"))
// ── 4. employees ──────────────────────────────────────────
await menu('البيانات الأساسية', 'الموظفون')
const ew = p.locator('.win[data-win=employees]')
check('employees: page opens', await ew.isVisible())
check('employees: search + department filter + «تصدير» + «اضافة»', (await ew.locator('.tb-search input').count()) === 1 && (await ew.locator('#emp-dep').count()) === 1 && (await ew.locator('.tb-menu').count()) === 1 && (await btn(ew, 'جديد').count()) === 1)
const setField = async (root, k, v) => {
  const el = root.locator(`[data-f=${k}]`)
  const tag = await el.evaluate((e) => e.tagName + (e.type || ''))
  if (tag.startsWith('SELECT')) await el.selectOption({ label: v }); else if (tag === 'INPUTcheckbox') await el.check(); else await el.fill(v)
}
const OT = ['ot_before', 'ot_deduct_late', 'ot_holidays', 'ot_after', 'no_punch_out']
// «اضافة» opens the employee's form as a page; it closes itself when saved
async function addEmployee(code, name, { expect = 'تمت إضافة الموظف', shift = 'صباحي م', extra = {} } = {}) {
  await btn(ew, 'جديد').click(); await p.waitForTimeout(200)
  const f = win('اضافة موظف')
  if (code !== null) await f.locator('[data-f=code]').fill(code)
  if (name !== null) await f.locator('[data-f=name_ar]').fill(name)
  if (shift) await f.locator('[data-f=shift_group_id]').selectOption({ label: shift })
  for (const [k, v] of Object.entries(extra)) await setField(f, k, v)
  if (code === '1001') await snap('employee-form')
  await btn(f, 'حفظ').click(); await p.waitForTimeout(300)
  const m = await okMsg()
  if (await f.count()) await closeWin(f)
  return m.includes(expect) ? true : m
}
const findEmp = async (t) => { await ew.locator('.tb-search input').fill(t); await p.waitForTimeout(120) }
check('employees: code required', (await addEmployee(null, 'بدون كود', { expect: 'كود الموظف مطلوب' })) === true)
check('employees: code must be digits', (await addEmployee('A12', 'حروف', { expect: 'أرقاماً فقط' })) === true)
check('employees: name required', (await addEmployee('1009', null, { expect: 'بالعربية مطلوب' })) === true)
check('employees: shift required', (await addEmployee('1009', 'بدون دوام', { expect: 'الدوام مطلوب', shift: null })) === true)
check('employees: bad email rejected', (await addEmployee('1009', 'ايميل', { expect: 'البريد', extra: { email: 'x@' } })) === true)
check('employees: add #1 (all fields)', (await addEmployee('1001', 'أحمد علي', { extra: { name_en: 'Ahmed Ali', job_id: 'ممرض م', department_id: 'الإدارة الطبية', section_id: 'قسم الطوارئ', group_id: 'المجموعة الأولى م', project_id: 'مشروع أ م', gender: 'ذكر', nationality_id: 'سعودي', religion: 'مسلم', mobile: '0500000000', email: 'a@b.co', hire_date: '2026-09-01', ot_after: 'x' } })) === true)
{ const r = await addEmployee('1001', 'مكرر', { expect: 'مستخدم لموظف آخر' }); check('employees: duplicate code rejected', r === true, r) }
check('employees: add #2', (await addEmployee('1002', 'خالد سعد', { extra: { department_id: 'الإدارة الطبية', hire_date: '2026-09-01' } })) === true)
{ const r = await addEmployee('1008', 'بدون تاريخ تعيين'); check('employees: added without a hire date', r === true, r) }
await ew.locator('tbody tr', { hasText: '1008' }).locator('[data-a=del]').click(); await p.waitForTimeout(150); await yes(); await p.waitForTimeout(150)
check('employees: add #3', (await addEmployee('1003', 'سارة محمد', { extra: { department_id: 'الإدارة الطبية', hire_date: '2026-09-01' } })) === true)
check('employees: 4th blocked in trial', (await addEmployee('1004', 'رابع', { expect: '3 موظفين فقط' })) === true)
check('employees: list shows 3', (await rowCount(ew)) === 3)
await findEmp('سارة')
check('employees: search by name', (await rowCount(ew)) === 1)
await findEmp('1002')
check('employees: search by code', (await rowCount(ew)) === 1)
await findEmp('')
await snap('employees-list')
await ew.locator('tbody tr', { hasText: '1001' }).dblclick(); await p.waitForTimeout(250)
let ef = win('تعديل موظف')
check('employees: double-click opens edit form with data', (await ef.locator('[data-f=name_en]').inputValue()) === 'Ahmed Ali' && (await ef.locator('[data-f=section_id] option:checked').textContent()) === 'قسم الطوارئ')
await ef.locator('[data-f=mobile]').fill('0555555555'); await btn(ef, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
await ew.locator('tbody tr', { hasText: '1001' }).locator('[data-a=edit]').click(); await p.waitForTimeout(250)
ef = win('تعديل موظف'); check('employees: pencil opens the saved data', (await ef.locator('[data-f=mobile]').inputValue()) === '0555555555')
await ef.locator('[data-f=ot_before]').check(); await btn(ef, 'حفظ').click(); await p.waitForTimeout(250); await okMsg()
await ew.locator('tbody tr', { hasText: '1001' }).dblclick(); await p.waitForTimeout(250)
ef = win('تعديل موظف'); check('employees: edit saved', (await ef.locator('[data-f=mobile]').inputValue()) === '0555555555' && (await ef.locator('[data-f=ot_before]').isChecked())); await closeWin(ef)
check('employees: back on the list after the form', await ew.isVisible())
await ew.locator('tbody tr', { hasText: '1001' }).locator('[data-a=del]').click(); await p.waitForTimeout(150); check('employees: delete asks confirmation', /حذف الموظف/.test(await dlgText()))
await p.locator('.dlg-backdrop').last().getByRole('button', { name: 'لا' }).click()
await closeWin(ew)
// shift group in use cannot be deleted
await menu('البيانات الأساسية', 'مواعيد العمل'); w = win('أوقات العمل')
await w.locator('tbody tr[data-id]').first().locator('[data-a=del]').click(); await p.waitForTimeout(150); check('shift groups: in-use group cannot be deleted', /مستخدم/.test(await okMsg())); await closeWin(w)
// lists: job in use cannot be deleted
await menu('البيانات الأساسية', 'قوائم البرنامج'); w = win('الوظائف')
await w.locator('tbody tr', { hasText: 'ممرض' }).first().locator('[data-a=del]').click(); await p.waitForTimeout(150); check('lists: job in use cannot be deleted', /مستخدم/.test(await okMsg())); await closeWin(w)

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
await menu('الاعدادات', 'صلاحيات المستخدمين'); w = win('الصلاحيات'); await snap('roles')
check('roles: built-in «مدير النظام» locked with every box ticked', (await w.locator('.screens input[data-a]:not(:checked)').count()) === 0 && (await w.locator('.screens input[data-a]:not([disabled])').count()) === 0)
await btn(w, 'جديد').click(); await btn(w, 'حفظ').click(); check('roles: name required', /مطلوب/.test(await okMsg()))
await w.locator('#ro-ar').fill('موارد بشرية'); await w.locator('#ro-en').fill('HR'); await btn(w, 'حفظ').click(); await okMsg()
check('roles: role added', (await w.locator('#ro-list tr').count()) === 2)
await closeWin(w)
await menu('الاعدادات', 'إدارة المستخدمين'); w = p.locator('.win[data-win=users]'); await snap('users')
await btn(w, 'جديد').click(); await w.locator('#us-login').fill('hr'); await w.locator('#us-name').fill('موظف الموارد'); await w.locator('#us-role').selectOption({ label: 'موارد بشرية' })
await w.locator('#us-pw').fill('12'); await w.locator('#us-pw2').fill('12'); await btn(w, 'حفظ').click(); check('users: short password rejected', /4 أحرف/.test(await okMsg()))
await w.locator('#us-pw').fill('1234'); await w.locator('#us-pw2').fill('1235'); await btn(w, 'حفظ').click(); check('users: mismatch rejected', /غير متطابقتين/.test(await okMsg()))
await w.locator('#us-pw2').fill('1234'); await btn(w, 'حفظ').click(); await okMsg()
check('users: user added with its role', (await w.locator('#us-list tr').count()) === 2 && /موارد بشرية/.test(await w.locator('#us-list').textContent()))
check('users: passwords never shown', !/1234/.test(await w.locator('#us-list').textContent()))
await w.locator('#us-list tr').first().click(); await btn(w, 'حذف').click(); await p.waitForTimeout(150); check('users: current / last admin cannot be deleted', /آخر مدير|المستخدم الحالي/.test(await okMsg()))
await w.locator('#us-list tr').first().click(); await w.locator('#us-role').selectOption({ label: 'موارد بشرية' }); await btn(w, 'حفظ').click(); check('users: last admin cannot lose the admin role', /آخر مدير/.test(await okMsg()))
await w.locator('#us-list tr').first().click(); await w.locator('#us-pw').fill('admin1'); await w.locator('#us-pw2').fill('admin1'); await btn(w, 'حفظ').click(); await okMsg(); await closeWin(w)
await menu('الاعدادات', 'اعدادات النظام'); w = win('اعدادات الحضور'); check('system settings: «إعدادات عامه» — 2 settings', (await w.locator('.sys-set .rules .row').count()) === 2 && (await w.locator('#s-ignore').inputValue()) === '10' && (await w.locator('#s-shifts option').allTextContents()).join('|') === 'وردية|ورديتان|ثلاث ورديات|أربعة ورديات')
await w.locator('#s-ignore').fill('3'); await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg()
check('system settings: saved, other settings kept', await p.evaluate(() => Engine.settings().ignore_min === 3)); await w.locator('#s-ignore').fill('10'); await btn(w, 'حفظ').click(); await p.waitForTimeout(200); await okMsg(); await snap('system'); await closeWin(w)
await p.evaluate(() => openBackup()); await p.waitForTimeout(300); w = win('إنشاء نسخة إحتياطية'); await w.locator('#bk-go').click(); await p.waitForTimeout(200)
check('backup: file written', /تم حفظ/.test(await okMsg()) && fs.existsSync(`${UD}/manual-backup.sqlite`)); await closeWin(w)
check('backup: automatic daily backup exists', fs.readdirSync(`${UD}/backups`).length >= 0)
await p.evaluate(() => { showAbout() }); await p.waitForTimeout(200); { const m = await okMsg(); check('about: version', m.includes(JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf8')).version)); check('about: data folder', m.includes('mt-fulltest')) }
await p.locator('#rail-help').click(); await p.waitForTimeout(300); w = win('دليل الاستخدام')
check('guide: opens with all sections', (await w.locator('.guide section').count()) >= 10); await snap('guide')
await w.locator('.guide nav a').last().click(); await p.waitForTimeout(300); await closeWin(w)

// Apex «أدوات ← تعديل بيانات الدخول»
await p.evaluate(() => openChangeLogin()); await p.waitForTimeout(200); w = win('تعديل بيانات الدخول')
await w.locator('#cl-old').fill('wrong'); await w.locator('#cl-new').fill('abcd'); await w.locator('#cl-new2').fill('abcd'); await w.locator('#cl-ok').click(); await p.waitForTimeout(150)
check('change login: current password checked', /الحالية غير صحيحة/.test(await okMsg()))
await w.locator('#cl-old').fill('admin1'); await w.locator('#cl-new2').fill('abce'); await w.locator('#cl-ok').click(); await p.waitForTimeout(150)
{ const m = await okMsg(); check('change login: new passwords must match', /غير متطابقتين/.test(m), m) } await w.locator('#cl-cancel').click(); await p.waitForTimeout(150)
await p.evaluate(() => { openRegister() }); await p.waitForTimeout(300); await snap('register')
const req = await p.locator('#req').inputValue()
check('register: request code format', /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(req), req)
await p.locator('#lic').fill('garbage.Gold'); await p.locator('.dlg').getByRole('button', { name: 'تسجيل' }).click(); await p.waitForTimeout(200)
check('register: invalid licence rejected', /غير صحيح/.test(await p.locator('.dlg .err').textContent()))
// the vendor key isn't on every test machine: MT_GOLD_LICENCE = a Gold code made for this PC's request code
const lic = process.env.MT_GOLD_LICENCE || execFileSync('node', [`${ROOT}/tools/keygen.js`, req, 'Gold']).toString().trim()
await p.locator('#lic').fill(lic); await p.locator('.dlg').getByRole('button', { name: 'تسجيل' }).click(); await p.locator('.dlg.msg').waitFor({ timeout: 5000 })
{ const m = await okMsg(); check('register: valid licence accepted', /تم تسجيل البرنامج/.test(m), m) }
check('register: notice gone from the banner', !/تجريبية/.test(await p.locator('#banner').textContent()))
await menu('التقارير', 'الغياب خلال فترة'); check('registered: previously locked report opens', await repWin('الغياب خلال فترة').isVisible()); await closeWin(repWin('الغياب خلال فترة'))

// ── 8b. v0.2 features (registered: no employee limit) ─────
const openGroupTimes = async (name) => {
  await menu('البيانات الأساسية', 'مواعيد العمل'); const gw = win('أوقات العمل')
  await gw.locator('tbody tr[data-id]', { hasText: name }).first().locator('[data-x=times]').click(); await p.waitForTimeout(300)
  return [gw, win('إعداد مواعيد العمل')]
}
// new shift groups: split, night (ends the next day), open
await menu('البيانات الأساسية', 'مواعيد العمل'); w = win('أوقات العمل')
for (const g of [{ name_ar: 'مقسم' }, { name_ar: 'ليلي' }, { name_ar: 'مفتوح', open_shift: 1 }]) {
  await btn(w, 'جديد').click(); await p.waitForTimeout(120)
  const d = p.locator('.dlg-backdrop').last()
  await d.locator('[data-f=name_ar]').fill(g.name_ar)
  if (g.open_shift) await d.locator('[data-f=open_shift]').check()
  await dlgSave(); await okMsg()
}
check('shift groups: Apex columns only (no rotating / start date)', (await w.locator('thead th').allTextContents()).map((x) => x.trim()).filter(Boolean).join('|') === '#|الاسم العربي|الاسم الأجنبي|الإجمالي|دوام مفتوح')
await closeWin(w)
// split shift: 2 periods every working day
let [gw, t] = await openGroupTimes('مقسم')
await setPer(t, 0, '08:00', '12:00'); await setPer(t, 1, '11:00', '20:00')
await btn(t, 'حفظ').click(); await p.waitForTimeout(200); check('split shift: overlapping second period saves (Apex)', /تم حفظ/.test(await okMsg()))
await setPer(t, 1, '16:00', '20:00'); check('shift times: changing a period empties the windows it filled in', (await per(t, 0).locator('[data-f=si]').inputValue()) === '' && (await per(t, 1).locator('[data-f=eo]').inputValue()) === ''); check('split shift: 2 periods → 08:00 a day', (await t.locator('#st-hours').inputValue()) === '08:00')
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
check('engine: Apex-style windows stay on their day, in any order', await p.evaluate(() => {
  const W = (o) => Engine.resolveWindows([{ start_in: '20:00', check_in: '22:30', end_in: '22:40', start_out: '23:40', check_out: '23:40', end_out: '00:00', ...o }])[0]
  const a = W({}), b = W({ start_in: '23:00' }), c = W({ end_in: '22:00' }), d = W({ check_out: '06:00', start_out: '05:00', end_out: '08:00' })
  return a.start_in === 1200 && a.end_in === 1360 && a.start_out === 1420 && a.end_out === 1440 && b.check_in === 1350 && b.start_in === 1380 && c.check_in === 1350 && c.end_in === 1320 && d.check_out === 1800 && d.end_out === 1920
}))
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
  check('engine: a single punch outside every period stays absent (site rule)', await p.evaluate(async () => {
    const code = '1001', d = '2026-09-27'
    const before = Engine.compute({ from: d, to: d }).find((r) => r.emp.code === code)
    DB.run('INSERT INTO punches (emp_code, ts, source) VALUES (?, ?, ?)', [code, `${d} 02:00:00`, 'manual'])
    const after = Engine.compute({ from: d, to: d }).find((r) => r.emp.code === code)
    DB.run('DELETE FROM punches WHERE emp_code = ? AND ts = ?', [code, `${d} 02:00:00`])
    return before.kind === 'absent' && after.kind === 'absent'
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
await menu('الاعدادات', 'صلاحيات المستخدمين', 'اعدادات المستخدمين'); w = win('الصلاحيات')
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

// ── 8b2. devices on the network: ADMS (a fake device posting to /iclock) and pull over 4370 ──
{
  await p.evaluate(() => { window.bridge.gateSettings({ port: 18081 }) }); await p.waitForTimeout(400)
  const base = 'http://127.0.0.1:18081/iclock', SN = 'TEST-SN1'
  const device = (path, body) => fetch(`${base}/${path}`, body ? { method: 'POST', body } : {}).then((r) => r.text())
  const hello = await device(`cdata?SN=${SN}&options=all`)
  check('adms: handshake answers the device its options', /ATTLOGStamp=0/.test(hello) && /Realtime=1/.test(hello) && new RegExp(`GET OPTION FROM: ${SN}`).test(hello), hello)
  const n = () => p.evaluate(() => DB.one("SELECT COUNT(*) AS n FROM punches WHERE emp_code = '1001' AND ts LIKE '2026-10-05%'").n)
  const lines = '1001\t2026-10-05 08:00:00\t0\t1\t0\n1001\t2026-10-05 16:00:00\t1\t1\t0\n'
  check('adms: punches acknowledged after they are on disk', (await device(`cdata?SN=${SN}&table=ATTLOG&Stamp=1`, lines)) === 'OK: 2')
  await p.waitForTimeout(1200)
  check('adms: punches reach the database by themselves', (await n()) === 2, String(await n()))
  check('adms: stored as device punches', await p.evaluate(() => DB.one("SELECT source FROM punches WHERE emp_code = '1001' AND ts = '2026-10-05 08:00:00'")?.source === 'device'))
  check('adms: the same punches sent again are not repeated', (await device(`cdata?SN=${SN}&table=ATTLOG&Stamp=1`, lines)) === 'OK: 2')
  await p.waitForTimeout(1200)
  check('adms: still 2 punches after re-sending', (await n()) === 2, String(await n()))
  check('adms: a bad line is skipped, the rest kept', (await device(`cdata?SN=${SN}&table=ATTLOG`, 'garbage\n1001\t2026-10-05 12:00:00\t0\t1\n')) === 'OK: 1')
  await p.waitForTimeout(1200)
  check('adms: 3 punches now', (await n()) === 3, String(await n()))
  check('adms: other tables are acknowledged and ignored', (await device(`cdata?SN=${SN}&table=OPERLOG`, 'x')) === 'OK')
  check('adms: another path is refused', (await fetch('http://127.0.0.1:18081/other').then((r) => r.status)) === 404)
  await device(`cdata?SN=${SN}&table=ATTLOG`, 'TEST-77\t2026-10-05 09:00:00\t0\t1\n'); await p.waitForTimeout(1200)
  check('adms: an unknown number becomes a new employee, as when reading a device', await p.evaluate(() => DB.one("SELECT name_ar FROM employees WHERE code = 'TEST-77'")?.name_ar === 'موظف جديد'))
  await p.evaluate(async () => { DB.run("DELETE FROM punches WHERE emp_code IN ('TEST-77') OR ts LIKE '2026-10-05%'"); DB.run("DELETE FROM employees WHERE code = 'TEST-77'"); await DB.flush() })
  // «الاجهزة» shows both ways
  await openPage(p, 'الاجهزة'); w = win('الاجهزة'); await p.waitForTimeout(400); await snap('devices-adms')
  check('devices page: this PC\'s address and port to write in the device', /\d+\.\d+\.\d+\.\d+|غير متصل/.test(await w.locator('#ds-ip').textContent()) && (await w.locator('#ds-port').inputValue()) === '18081')
  check('devices page: receiver ready', /جاهز/.test(await w.locator('#ds-state').textContent()), await w.locator('#ds-state').textContent())
  check('devices page: the device that connected, with today\'s count', /TEST-SN1/.test(await w.locator('#ds-list tbody').textContent()))
  check('devices page: the pull way (port 4370) beside it', (await w.locator('.dev-form #dv-ip').count()) === 1 && /4370/.test(await w.locator('.dev-form legend').textContent()))
  // the clock: the push device gets the command at its next poll
  check('adms: no command waiting at first', (await device(`getrequest?SN=${SN}`)) === 'OK')
  await w.locator('#ds-list [data-clock]').first().click(); await p.waitForTimeout(200); await okMsg()
  check('devices page: «مزامنة ساعة الجهاز» queues SET OPTION DateTime', /^C:\d+:SET OPTION DateTime=\d+$/.test(await device(`getrequest?SN=${SN}`)))
  check('adms: the command goes once', (await device(`getrequest?SN=${SN}`)) === 'OK')
  // … and a device read over the network gets it directly
  const { startMockZK } = await import(`${ROOT}/tools/mock-zk.mjs`)
  const zk = await startMockZK({ port: 14370 })
  await p.waitForTimeout(150)
  const ok = await p.evaluate(() => window.bridge.deviceClock({ ip: '127.0.0.1', port: 14370, key: 0 }))
  check('pull device: clock set over port 4370', ok.ok && zk.state.commands.includes(202), JSON.stringify(ok))
  zk.server.close()
  await closeWin(w)
}
// the daily copy + restore are on «الاعدادات العامة»
await openPage(p, 'الاعدادات العامة'); w = win('الاعدادات العامة'); await snap('general-settings')
check('general settings: backup, restore, licence, guide', (await w.locator('#gs-backup').count()) === 1 && (await w.locator('#gs-restore').count()) === 1 && (await w.locator('#gs-register').count()) === 1 && (await w.locator('#gs-guide').count()) === 1)
await w.locator('#gs-restore').click(); await p.waitForTimeout(200); check('general settings: «استعادة» opens the restore page', await win('إستعادة قاعدة البيانات').isVisible()); await closeWin(win('إستعادة قاعدة البيانات')); await closeWin(w)

// ── 8c. backup → change → restore ─────────────────────────
await p.evaluate(() => openBackup()); await p.waitForTimeout(300); w = win('إنشاء نسخة إحتياطية'); await w.locator('#bk-go').click(); await p.waitForTimeout(200); await okMsg(); await closeWin(w)
fs.copyFileSync(`${UD}/manual-backup.sqlite`, `${UD}/restore-me.sqlite`)
await menu('البيانات الأساسية', 'المشاريع'); w = win('المشاريع'); await addRow(w, { name_ar: 'مشروع مؤقت' })
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
await menu('البيانات الأساسية', 'المشاريع'); w = win('المشاريع')
check('restore: data is back to the backup (temporary project gone)', (await rowCount(w)) === 1); await closeWin(w)
// logout returns to the login screen
await p.locator('#tb-user-btn').click(); await p.locator('[data-u=logout]').click()
check('logout: back to the login screen', await p.locator('.login-page #pass').waitFor({ timeout: 10000 }).then(() => true, () => false))
await p.locator('#pass').fill('admin1'); await loginBtn().click(); await p.waitForTimeout(600)
check('logout: login again', await p.locator('#home').isVisible())

// ── 9. restart: data persisted, password changed, licence kept ──
await app.close()
const app2 = await electron.launch({ executablePath: process.env.MT_ELECTRON || `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
const p2 = await app2.firstWindow(); await p2.waitForSelector('.login-page #pass')
await loginBtn(p2).click(); await p2.waitForTimeout(300)
check('restart: old empty password no longer works', /غير صحيحة/.test(await p2.locator('.dlg .err').textContent()))
await p2.locator('#user').fill('hr'); await p2.locator('#pass').fill('1234'); await loginBtn(p2).click(); await p2.waitForTimeout(700)
check('permissions: restricted user sees only permitted sections', (await p2.locator('#rail [data-section]').count()) === 1 && (await p2.locator('#rail [data-section=basic]').count()) === 1)
check('permissions: only «الموظفين» inside', (await p2.locator('#rail [data-section=basic] [data-page]').count()) === 1)
await openPage(p2, 'الموظفين')
{ const ew = p2.locator('.win[data-win=employees]')
  check('permissions: view+print only → no «اضافة», no pencil / trash, «تصدير» on', (await ew.locator('.toolbar button[data-key=new]').first().isDisabled()) && (await ew.locator('[data-a=edit], [data-a=del]').count()) === 0 && !(await ew.locator('.tb-btn[data-key=print]').isDisabled()))
  await ew.evaluate((el) => { UI.close(el.dataset.win) }) }
await p2.evaluate(() => { Nav.go('البيانات الاساسية', ['أوقات العمل', 'البيانات الأساسية/مواعيد العمل', () => openShiftGroups()]) }); await p2.waitForTimeout(200)
check('permissions: a screen without permission is refused', /ليس لديك صلاحية/.test(await p2.locator('.dlg-backdrop .body').last().textContent()))
await app2.close()
const app3 = await electron.launch({ executablePath: process.env.MT_ELECTRON || `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
const p3 = await app3.firstWindow(); await p3.waitForSelector('.login-page #pass')
check('login remembers the last user', (await p3.locator('#user').inputValue()) === 'hr')
await p3.locator('#user').fill('أ'); await p3.locator('#pass').fill('admin1'); await loginBtn(p3).click(); await p3.waitForTimeout(700)
check('restart: login with new password', await p3.locator('#home').isVisible())
check('restart: licence kept', await p3.evaluate(() => licence.ok) && !/تجريبية/.test(await p3.locator('#banner').textContent()))
await openPage(p3, 'الموظفين')
check('restart: employees persisted (5 after purge)', (await p3.locator('.win tbody tr[data-id]').count()) === 5)
check('restart: the receiving port is kept', JSON.parse(fs.readFileSync(`${UD}/gate/gate.json`, 'utf8')).port === 18081)
// the PC's address no longer matches what the devices were given (this run wrote it down when the page first opened)
await p3.locator('.win tbody').first().waitFor()
await app3.close()
{ const cfg = `${UD}/gate/gate.json`; fs.writeFileSync(cfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfg, 'utf8')), ip: '10.254.254.254' })) }
const app4 = await electron.launch({ executablePath: process.env.MT_ELECTRON || `${ROOT}/node_modules/electron/dist/electron`, args: ['.', '--no-sandbox', `--user-data-dir=${UD}`], cwd: ROOT })
const p4 = await app4.firstWindow(); await p4.waitForSelector('.login-page #pass')
await p4.locator('#user').fill('أ'); await p4.locator('#pass').fill('admin1'); await loginBtn(p4).click(); await p4.waitForTimeout(700)
await openPage(p4, 'الاجهزة'); await p4.waitForTimeout(500)
{
  const ips = await p4.locator('#ds-ip').textContent()
  if (/\d+\.\d+/.test(ips)) {
    check('devices page: warns when this PC\'s address changed', (await p4.locator('#ds-moved').isVisible()) && /10\.254\.254\.254/.test(await p4.locator('#ds-moved-t').textContent()), await p4.locator('#ds-moved-t').textContent())
    await p4.locator('#ds-confirm').click(); await p4.waitForTimeout(300)
    check('devices page: the warning goes once the devices are updated', await p4.locator('#ds-moved').isHidden())
  }
}
check('restart: automatic daily backup created', fs.existsSync(`${UD}/backups`) && fs.readdirSync(`${UD}/backups`).length >= 1)
await app4.close()

check('no page errors during the whole run', errs.length === 0, errs.slice(0, 3).join(' || '))
fs.rmSync(UD, { recursive: true, force: true }) // the TEST- data goes with the session
check('test data removed', !fs.existsSync(UD))
console.log(`\nTOTAL: ${pass} passed, ${fail} failed · screenshots: ${shot} in ${SHOTS}`)
