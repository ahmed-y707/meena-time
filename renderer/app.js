// Login → msar-erp.com's shell: full-height sidebar (components/hr-shell/routes.ts, in its order, less
// what needs the internet), topbar, and one page at a time in the main column.
const VERSION = '2.0.0'
const TRIAL_REPORTS = [
  'الحضور والانصراف تفصيلي',
  'الحضور والانصراف إجمالي',
  'حالة اليوم',
  'الحضور والانصراف بالحركات',
]

// Permission keys ("<menu>/<item>") are kept as they were, so saved roles still apply.
const MENUS = [
  { label: 'ملف', items: [['تسجيل الخروج', logout], ['انهاء البرنامج', () => window.close()]] },
  { label: 'البيانات الأساسية', items: [['قوائم البرنامج', openLists], ['الإدارات والأقسام', openDepartments], ['المشاريع', openProjects],
    ['مواعيد العمل', openShiftGroups], ['الموظفون', openEmployees], ['مجموعات الموظفين', openEmployeeGroups], ['تعريف الأجهزة', openDevices], ['العطلات الرسمية', openHolidays]] },
  { label: 'الإجراءات', items: [['قراءة الحركات (شبكة - ملف)', openReadPunches], ['عرض الحركات', openViewPunches], ['إضافة وتعديل الحركات لموظف', openEditPunches],
    ['الغاء الحركات المعدله يدويا', () => openDeletePunches(['manual'], 'إلغاء الحركات المعدله يدويا')], ['إضافة أجازات لموظف', openLeaves], ['إضافة أذونات لموظف', openPermissions],
    ['ترحيل الحركات', postPunches], ['الغاء ترحيل الحركات', openUnpost], ['الغاء جميع بيانات الموظف بالنظام', purgeEmployee]] },
  { label: 'التقارير', items: Object.keys(REPORTS).map((r) => [r, () => openReport(r)]) },
  { label: 'الاعدادات', items: [['بيانات المؤسسه', openCompany], ['اعدادات المستخدمين', [['صلاحيات المستخدمين', openRoles], ['إدارة المستخدمين', openUsers]]],
    ['اعدادات النظام', openSystemSettings], ['نسخة احتياطية', openGeneralSettings], ['سجل الحركات', openAuditLog]] },
  { label: 'ادوات', items: [['تعديل بيانات الدخول', openChangeLogin]] },
  { label: 'مساعده', items: [['فهرس المحتويات', openGuide], ['تسجيل المنتج', () => openRegister()], ['عن الشركة', showAbout]] },
]
async function showAbout() {
  const p = await window.bridge.paths()
  UI.message(`Masar Time Ver. ${VERSION}\nبرنامج الحضور والانصراف\n\nقاعدة البيانات: ${p.data}\nالنسخ الاحتياطية: ${p.backups}`)
}

const B = 'البيانات الأساسية/', A = 'الإجراءات/', S = 'الاعدادات/'
// reports in lib/hr-reports.ts's order; those the site has no page for come last
const REPORT_ORDER = ['حالة اليوم', 'الحضور والانصراف تفصيلي', 'الحضور والانصراف إجمالي', 'أجازات الموظفين', 'التأخير عن بداية الدوام اليومي', 'الغياب خلال فترة',
  'التأخير عن الدوام خلال فترة', 'الموظفون', 'تأخير وإضافي الدوام', 'الحركات الغير مكتملة', 'أذونات الموظفين', 'بيان تأخير الموظفين', 'الحضور والانصراف بالحركات', 'مواعيد العمل']
// [label, permission key, open, icon]
const RAIL = [
  { id: 'dashboard', label: 'لوحة القيادة', icon: 'layout-dashboard' },
  { id: 'basic', label: 'البيانات الاساسية', icon: 'clipboard-list', items: [
    ['الموظفين', `${B}الموظفون`, () => openEmployees(), 'users'],
    ['الوظائف', `${B}قوائم البرنامج`, () => openList('job'), 'briefcase'],
    ['الإدارات والأقسام', `${B}الإدارات والأقسام`, () => openDepartments(), 'building-2'],
    ['أوقات العمل', `${B}مواعيد العمل`, () => openShiftGroups(), 'clock'],
    ['المشاريع', `${B}المشاريع`, () => openProjects(), 'folder-kanban'],
    ['المهام', `${B}قوائم البرنامج`, () => openList('task'), 'square-check'],
    ['مجموعات الموظفين', `${B}مجموعات الموظفين`, () => openEmployeeGroups(), 'users-round'],
    ['الجنسية', `${B}قوائم البرنامج`, () => openList('nationality'), 'globe'],
    ['العطلات الرسمية', `${B}العطلات الرسمية`, () => openHolidays(), 'calendar-days'],
    ['انواع الاجازات', `${B}قوائم البرنامج`, () => openList('leave'), 'umbrella'],
    ['الديانة', `${B}قوائم البرنامج`, () => openList('religion'), 'heart-handshake'],
    ['ملاحظات الحضور', `${B}قوائم البرنامج`, () => openList('att_note'), 'sticky-note'],
  ] },
  { id: 'attendance', label: 'الحضور والانصراف', icon: 'clock', items: [
    ['اضافة اجازة', `${A}إضافة أجازات لموظف`, () => openLeaves(), 'plus'],
    ['اضافة اذن', `${A}إضافة أذونات لموظف`, () => openPermissions(), 'mail-open'],
    ['قراءة الحركات', `${A}قراءة الحركات (شبكة - ملف)`, () => openReadPunches(), 'download'],
    ['عرض الحركات', `${A}عرض الحركات`, () => openViewPunches(), 'list'],
    ['اضافة و تعديل حركات', `${A}إضافة وتعديل الحركات لموظف`, () => openEditPunches(), 'activity'],
    ['الغاء الحركات المعدلة يدويا', `${A}الغاء الحركات المعدله يدويا`, () => openDeletePunches(['manual'], 'إلغاء الحركات المعدله يدويا'), 'file-minus'],
    ['ترحيل الحركات', `${A}ترحيل الحركات`, () => postPunches(), 'send'],
    ['إلغاء ترحيل الحركات', `${A}الغاء ترحيل الحركات`, () => openUnpost(), 'rotate-ccw'],
    ['الغاء بيانات موظف', `${A}الغاء جميع بيانات الموظف بالنظام`, () => purgeEmployee(), 'user-x'],
    { label: 'التقارير', icon: 'chart-column', children: REPORT_ORDER.map((r) => [r, `التقارير/${r}`, () => openReport(r)]) },
  ] },
  { id: 'users', label: 'المستخدمين', icon: 'user-cog', items: [
    ['المستخدمين', `${S}إدارة المستخدمين`, () => openUsers(), 'users'],
    ['الصلاحيات', `${S}صلاحيات المستخدمين`, () => openRoles(), 'shield-check'],
    ['حركات المستخدمين', `${S}سجل الحركات`, () => openAuditLog(), 'activity'],
  ] },
  { id: 'settings', label: 'الاعدادات', icon: 'settings', items: [
    ['اعدادات الحضور و الانصراف', `${S}اعدادات النظام`, () => openSystemSettings(), 'sliders-horizontal'],
    ['الاجهزة', `${B}تعريف الأجهزة`, () => openDevices(), 'fingerprint'],
    ['الاعدادات العامة', `${S}نسخة احتياطية`, () => openGeneralSettings(), 'settings'],
    ['بيانات الشركة', `${S}بيانات المؤسسه`, () => openCompany(), 'building'],
  ] },
]

let licence = { ok: false }
const Session = (window.Session = { userId: null, username: '', admin: false, perms: null })

function setCaption() {
  document.title = `Masar Time ${VERSION}${DB.year !== 'main' ? ` — ${DB.year}` : ''}`
  const v = document.getElementById('rail-version')
  if (v) v.textContent = `Masar Time ${VERSION}`
}

// the sidebar leaves whatever is open and goes to one page (an «unsaved changes» answered with إلغاء stays)
const Nav = (window.Nav = {
  section: null,
  active: null,
  async leave() {
    for (const id of [...UI.wins.keys()].reverse()) if (!(await UI.close(id))) return false
    return true
  },
  async go(sectionLabel, [label, key, fn]) {
    if (!(await this.leave())) return
    this.section = sectionLabel
    this.mark(label)
    if (!Perm.can(key)) return UI.message('ليس لديك صلاحية لهذه الشاشة')
    this.label = label
    try { Perm.run(key, fn) } finally { this.label = null }
  },
  async home() {
    if (await this.leave()) this.mark(null)
  },
  mark(label) {
    this.active = label
    if (!label) this.section = null
    document.querySelectorAll('#rail [data-page]').forEach((a) => {
      const on = a.dataset.page === (label ?? 'لوحة القيادة')
      a.classList.toggle('bg-[var(--apex-active)]', on)
      a.classList.toggle('font-bold', on)
      a.querySelector('.bar')?.toggleAttribute('hidden', !on)
    })
  },
})

// components/hr-shell/icon-rail.tsx
function buildRail() {
  const rail = document.getElementById('rail')
  const row = 'relative flex h-10 w-full items-center gap-2.5 text-[14px] transition-colors text-white/85 hover:bg-white/10 hover:text-white'
  const allowed = (it) => Perm.can(it[1])
  const link = ([label, , , icon], depth) => `<button type="button" data-page="${UI.esc(label)}" class="${row}" style="padding-right:${44 + depth * 16}px;padding-left:16px">
      <span class="bar absolute inset-y-0 right-0 w-1 bg-[var(--masar-green)]" aria-hidden hidden></span>${icon ? ic(icon).replace('class="lucide"', 'class="lucide h-4 w-4 shrink-0 opacity-80"') : ''}<span class="truncate">${UI.esc(label)}</span></button>`
  const chev = ic('chevron-down').replace('class="lucide"', 'class="lucide chev h-4 w-4 shrink-0 opacity-60 transition-transform"')
  const sections = RAIL.map((s) => {
    if (!s.items) return `<button type="button" data-page="${s.label}" data-home class="relative flex h-12 w-full items-center gap-3 px-5 text-[15px] font-bold transition-colors hover:bg-white/10">
      <span class="bar absolute inset-y-0 right-0 w-1 bg-[var(--masar-green)]" aria-hidden hidden></span>${ic(s.icon).replace('class="lucide"', 'class="lucide h-5 w-5 shrink-0"')}<span class="truncate">${s.label}</span></button>`
    const items = s.items.map((it) => {
      if (!it.children) return allowed(it) ? link(it, 0) : ''
      const kids = it.children.filter(allowed)
      return kids.length ? `<div class="rail-group"><button type="button" data-toggle aria-expanded="false" class="${row}" style="padding-right:44px;padding-left:16px">${ic(it.icon).replace('class="lucide"', 'class="lucide h-4 w-4 shrink-0 opacity-80"')}<span class="flex-1 truncate text-start">${it.label}</span>${chev}</button><div class="rail-kids" hidden>${kids.map((k) => link(k, 1)).join('')}</div></div>` : ''
    }).join('')
    return items ? `<div class="rail-group" data-section="${s.id}"><button type="button" data-toggle aria-expanded="false" class="flex h-12 w-full items-center gap-3 px-5 text-[15px] font-bold transition-colors hover:bg-white/10 text-white/90">${ic(s.icon).replace('class="lucide"', 'class="lucide h-5 w-5 shrink-0"')}<span class="flex-1 truncate text-start">${s.label}</span>${chev}</button><div class="rail-kids bg-black/10 py-1" hidden>${items}</div></div>` : ''
  }).join('')
  rail.innerHTML = `<button type="button" id="rail-logo" class="flex h-[92px] shrink-0 items-center justify-center border-b border-white/10 px-6" aria-label="Masar Time">
      <img src="brand/masar-logo-white.png" alt="Masar Time" class="h-[54px] max-w-full w-auto object-contain"></button>
    <nav class="flex-1 overflow-y-auto py-3">${sections}</nav>
    <div class="shrink-0 border-t border-white/10 px-3 pt-3"><button type="button" id="rail-help" class="flex w-full items-center gap-2.5 rounded-lg bg-white/10 px-4 py-2.5 text-[14px] font-bold text-white transition hover:bg-white/[.16]">
      ${ic('circle-help').replace('class="lucide"', 'class="lucide h-[18px] w-[18px] text-[var(--masar-green)]"')}تحتاج مساعدة؟</button></div>
    <div class="shrink-0 px-5 py-3 text-[11.5px] leading-6 text-white/70"><div>آخر تحديث: <span id="rail-updated" class="text-white/90"></span></div><div id="rail-version"></div></div>`
  const pages = {}
  for (const s of RAIL) for (const it of s.items || []) { if (it.children) it.children.forEach((k) => { pages[k[0]] = [s.label, k] }); else pages[it[0]] = [s.label, it] }
  rail.querySelector('nav').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]')
    if (t) {
      const kids = t.nextElementSibling, open = kids.hidden
      kids.hidden = !open
      t.setAttribute('aria-expanded', open)
      t.querySelector('.chev')?.classList.toggle('rotate-180', open)
      return
    }
    const b = e.target.closest('[data-page]')
    if (!b) return
    if ('home' in b.dataset) return Nav.home()
    const [section, it] = pages[b.dataset.page]
    Nav.go(section, it)
  })
  rail.querySelector('#rail-logo').onclick = () => Nav.home()
  rail.querySelector('#rail-help').onclick = () => openGuide()
  const fmt = () => { rail.querySelector('#rail-updated').textContent = new Date().toLocaleString('ar-SA-u-nu-latn', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) }
  fmt(); setInterval(fmt, 60e3)
  Nav.mark(null)
  setCaption()
  return pages
}

// components/hr-shell/topbar.tsx (its «فرع:» filter is the department filter of the dashboard here)
function buildTopbar(pages) {
  const top = document.getElementById('topbar')
  const logo = UI.meta('company_logo')
  const deps = DB.all('SELECT id, name_ar FROM departments WHERE parent_id IS NULL OR parent_id = "" ORDER BY name_ar')
  top.innerHTML = `<div class="flex h-[60px] items-center gap-3 bg-[var(--masar-ink-2)] px-3 text-white shadow-[0_2px_8px_rgba(0,0,0,.12)] md:px-5">
    <div id="tb-user" class="relative shrink-0"><button type="button" id="tb-user-btn" aria-haspopup="menu" class="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10">
      <span class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/25">${ic('circle-user-round').replace('class="lucide"', 'class="lucide h-8 w-8 text-white/90"')}</span>
      <span class="hidden max-w-[150px] truncate text-[14px] font-bold sm:inline">${UI.esc(Session.username)}</span>${ic('chevron-down').replace('class="lucide"', 'class="lucide h-4 w-4 opacity-70"')}</button>
      <div id="tb-user-menu" role="menu" hidden class="absolute right-0 top-[calc(100%+6px)] w-56 overflow-hidden rounded-lg bg-white text-slate-700 shadow-xl ring-1 ring-black/5">
        <div class="border-b border-slate-100 px-4 py-3"><div class="truncate text-[14px] font-bold text-slate-800">${UI.esc(Session.username)}</div><div class="text-[12px] text-slate-500">${Session.admin ? 'مدير النظام' : 'مستخدم'}</div></div>
        ${[['change', 'تعديل بيانات الدخول', 'key-round'], ['about', 'عن البرنامج', 'circle-help'], ['logout', 'خروج', 'log-out'], ['quit', 'انهاء البرنامج', 'x']].map(([k, l, i]) => `<button type="button" role="menuitem" data-u="${k}" class="flex w-full items-center gap-2 px-4 py-2.5 text-[13.5px] hover:bg-slate-50">${ic(i).replace('class="lucide"', 'class="lucide h-4 w-4"')}${l}</button>`).join('')}
      </div></div>
    <label class="hidden shrink-0 items-center gap-1.5 text-[14px] md:flex">${ic('map-pin').replace('class="lucide"', 'class="lucide h-4 w-4 opacity-80"')}<span class="opacity-85">الإدارة:</span>
      <select id="tb-dep" aria-label="الإدارة" class="tb-select max-w-[190px] cursor-pointer bg-transparent font-bold outline-none"><option value="">كل الإدارات</option>${deps.map((d) => `<option value="${d.id}">${UI.esc(d.name_ar)}</option>`).join('')}</select></label>
    <div class="flex-1"></div>
    <div class="relative hidden w-[300px] md:block"><input id="tb-q" placeholder="بحث هنا..." aria-label="بحث" class="h-10 w-full rounded-md bg-[var(--masar-ink)] pe-10 ps-3 text-[14px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/55 focus:ring-white/30">
      ${ic('search').replace('class="lucide"', 'class="lucide pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/70"')}
      <div id="tb-hits" hidden class="absolute inset-x-0 top-[calc(100%+6px)] overflow-hidden rounded-lg bg-white py-1 text-slate-700 shadow-xl ring-1 ring-black/5"></div></div>
    <div class="hidden shrink-0 items-center gap-1.5 text-[14px] font-bold xl:flex">مسار تايم - النظام الذكي</div>
    ${logo ? `<span class="flex h-10 shrink-0 items-center rounded-md bg-white px-2 shadow-sm"><img src="${logo}" alt="" class="h-8 max-w-[90px] w-auto object-contain md:max-w-[140px]"></span>` : ''}
  </div>`
  const $ = (s) => top.querySelector(s)
  const menu = $('#tb-user-menu')
  $('#tb-user-btn').onclick = () => { menu.hidden = !menu.hidden }
  document.addEventListener('mousedown', (e) => { if (!$('#tb-user').contains(e.target)) menu.hidden = true })
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('[data-u]')?.dataset.u
    menu.hidden = true
    if (k === 'change') Nav.leave().then((ok) => ok && openChangeLogin())
    if (k === 'about') showAbout()
    if (k === 'logout') logout()
    if (k === 'quit') window.close()
  })
  $('#tb-dep').addEventListener('change', (e) => { Dashboard.department = +e.target.value || null; Nav.home().then(() => renderHome()) })
  // quick search over every screen
  const names = Object.keys(pages).filter((n) => Perm.can(pages[n][1][1]))
  const q = $('#tb-q'), hits = $('#tb-hits')
  const go = (n) => { q.value = ''; hits.hidden = true; Nav.go(pages[n][0], pages[n][1]) }
  q.addEventListener('input', () => {
    const v = q.value.trim(), found = v ? names.filter((n) => n.includes(v)).slice(0, 8) : []
    hits.innerHTML = found.map((n) => `<button type="button" class="block w-full px-4 py-2 text-start text-[13.5px] hover:bg-slate-50">${UI.esc(n)}</button>`).join('')
    hits.hidden = !found.length
  })
  hits.addEventListener('mousedown', (e) => { const b = e.target.closest('button'); if (b) go(b.textContent) })
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && hits.firstChild) go(hits.firstChild.textContent) })
  q.addEventListener('blur', () => setTimeout(() => { hits.hidden = true }, 150))
}

// the trial notice, where the site shows its subscription banner
function renderBanner() {
  const el = document.getElementById('banner')
  const days = licence.daysLeft
  el.innerHTML = licence.trial
    ? `<div class="sub-banner">${ic('triangle-alert')}<span>نسخة تجريبية كاملة المميزات — تنتهي يوم ${UI.esc(licence.expires)}، متبقي ${days} ${days > 10 || days < 3 ? 'يوم' : 'أيام'}. للاشتراك تواصل معنا على واتساب <b dir="ltr">0535322228</b></span></div>`
    : licence.ok ? '' : `<div class="sub-banner">${ic('triangle-alert')}<span>هذه النسخة تجريبية: كل المميزات متاحة ما عدا التقارير إلا: ${TRIAL_REPORTS.join('، ')} (متاح 3 مرات طباعة فقط).</span><button type="button" id="ban-reg">تسجيل المنتج</button></div>`
  el.querySelector('#ban-reg')?.addEventListener('click', () => openRegister())
}
function renderHome() {
  renderBanner()
  Dashboard.render()
  UI.renderStrip()
}

// Punches pushed by devices on the network (lib/gate): into the database, then acknowledged
const Gate = {
  running: false,
  init() {
    if (!window.bridge.gateDrain) return
    window.bridge.onGate(() => this.drain())
    setInterval(() => this.drain(), 15e3) // in case a nudge was missed
    this.drain()
  },
  async drain() {
    if (this.running) return
    this.running = true
    try {
      const bySerial = Object.fromEntries(DB.all("SELECT id, serial FROM devices WHERE IFNULL(serial, '') <> ''").map((d) => [d.serial.trim(), d.id]))
      for (;;) {
        const { rows, next } = await window.bridge.gateDrain(5000)
        if (!rows.length) { if (next) await window.bridge.gateAck(next); break }
        const bySn = {}
        for (const r of rows) (bySn[r.sn || ''] ||= []).push({ code: r.c, ts: r.t })
        for (const [sn, list] of Object.entries(bySn)) await storePunches(list, 'device', bySerial[sn] ?? null)
        await window.bridge.gateAck(next) // storePunches has saved them: only now may the journal forget
        if (rows.length < 5000) break
      }
      if (document.querySelector('#home')?.style.display !== 'none') Dashboard.render()
    } catch (e) { console.error('gate', e) } finally { this.running = false }
  },
}

async function openRegister() {
  const st = await window.bridge.licenceStatus()
  await UI.dialog({
    head: 'تسجيل المنتج', width: 640, btnsLeft: true,
    bodyHtml: `
      <div class="fields" style="grid-template-columns:120px 1fr">
        <label>كود الطلب</label><input type="text" id="req" readonly dir="ltr" value="${UI.esc(st.requestCode)}">
        <label>كود الترخيص</label><input type="text" id="lic" dir="ltr" placeholder="${st.ok ? 'البرنامج مسجل' : ''}">
      </div>
`,
    buttons: [
      { label: 'إسترجاع ترخيص', icon: 'restore', onClick: async (d) => {
        const s = await window.bridge.licenceStatus()
        d.error(s.ok ? 'الترخيص الحالي صالح' : 'لا يوجد ترخيص محفوظ على هذا الجهاز')
      } },
      { label: 'تسجيل', icon: 'register', onClick: async (d) => {
        const code = d.root.querySelector('#lic').value.trim()
        if (!code) return d.error('أدخل كود الترخيص')
        const r = await window.bridge.register(code)
        if (!r.ok) return d.error('كود الترخيص غير صحيح لهذا الجهاز')
        licence = r
        setCaption()
        renderHome()
        d.close(true)
        UI.message('تم تسجيل البرنامج بنجاح')
      } },
      { label: 'إغلاق', icon: 'cancel', onClick: (d) => d.close(false) },
    ],
  })
}

// trial over / clock turned back / trial build without a code: nothing opens until a valid code is entered
const LOCK_TEXT = {
  expired: 'انتهت الفترة التجريبية لهذا البرنامج',
  clock: 'تم تغيير تاريخ أو وقت الجهاز إلى الخلف — أعد ضبط التاريخ والوقت الصحيحين ثم أعد فتح البرنامج',
  nokey: 'هذه النسخة تحتاج كود ترخيص من موزّع البرنامج قبل التشغيل',
}
async function lockScreen(st) {
  document.querySelectorAll('.dlg-backdrop:not(.lock)').forEach((b) => b.remove())
  if (document.querySelector('.dlg-backdrop.lock')) return
  await UI.dialog({
    head: 'البرنامج مقفل', width: 640, btnsLeft: true, cls: 'lock-dlg',
    onOpen: (d) => d.root.classList.add('lock'),
    bodyHtml: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="font-weight:bold">${UI.esc(LOCK_TEXT[st.reason] || LOCK_TEXT.expired)}</div>
        <div>بياناتك محفوظة على الجهاز كما هي. للاشتراك تواصل معنا على واتساب <b dir="ltr">0535322228</b> واضغط «نسخ كود الطلب» وأرسله لنا، ثم ألصق الكود الذي نرسله لك هنا.</div>
        <div class="fields" style="grid-template-columns:120px 1fr">
          <label>كود الطلب</label><input type="text" id="req" readonly dir="ltr" value="${UI.esc(st.requestCode)}">
          <label>كود الترخيص</label><input type="text" id="lic" dir="ltr">
        </div>
      </div>`,
    buttons: [
      { label: 'نسخ كود الطلب', icon: 'restore', onClick: (d) => {
        const i = d.root.querySelector('#req'); i.select(); document.execCommand('copy')
        d.error('تم نسخ كود الطلب — ألصقه في رسالة واتساب')
      } },
      { label: 'تسجيل', icon: 'register', onClick: async (d) => {
        const code = d.root.querySelector('#lic').value.trim()
        if (!code) return d.error('أدخل كود الترخيص')
        const r = await window.bridge.register(code)
        if (!r.ok && !r.locked) return d.error('كود الترخيص غير صحيح لهذا الجهاز')
        if (r.locked) return d.error(LOCK_TEXT[r.reason] || LOCK_TEXT.expired)
        licence = r
        d.close(true)
      } },
      { label: 'إغلاق البرنامج', icon: 'cancel', onClick: () => window.bridge.quit ? window.bridge.quit() : window.close() },
    ],
  })
}

async function login() {
  const names = (await window.bridge.dbNames?.()) || ['main']
  const last = localStorage.getItem('mt-last-user') || 'أ'
  return UI.dialog({
    head: 'تسجيل الدخول', width: 440, cls: 'login-dlg',
    foot: `Masar Time ${VERSION}`,
    // another database: remember the choice and restart on it (each database has its own users)
    onOpen: (d) => {
      d.root.querySelector('#year').addEventListener('change', async (e) => {
        if (await window.bridge.useDb(e.target.value)) window.bridge.relaunch()
      })
      d.root.classList.add('login-page')
      d.root.prepend(UI.el('<div class="login-photo"><img src="brand/login-photo.webp" alt=""></div>'))
      d.root.querySelector('.dlg').prepend(UI.el('<img class="login-logo" src="brand/masar-logo-white.png" alt="Masar Time">'))
      d.root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !d.root.querySelector('.dlg-backdrop')) d.root.querySelector('.btns .pri')?.click() })
      d.root.querySelector(names.length > 1 ? '#year' : '#pass').focus()
    },
    bodyHtml: `
      <div class="login-fields">
        <label class="lf" ${names.length > 1 ? '' : 'hidden'}>${ic('database')}<select id="year" aria-label="قاعدة البيانات" ${names.length > 1 ? '' : 'disabled'}>${names.map((n) => `<option value="${UI.esc(n)}" ${n === DB.year ? 'selected' : ''}>${UI.esc(dbLabel(n))}</option>`).join('')}</select></label>
        <label class="lf">${ic('user')}<input type="text" id="user" placeholder="اسم المستخدم" aria-label="اسم المستخدم" value="${UI.esc(last)}"></label>
        <label class="lf">${ic('lock')}<input type="password" id="pass" placeholder="كلمة المرور" aria-label="كلمة المرور"></label>
      </div>`,
    buttons: [
      { label: 'تسجيل الدخول', icon: 'ok', onClick: async (d) => {
        const user = d.root.querySelector('#user').value.trim()
        const pass = d.root.querySelector('#pass').value
        // «admin» (any case) also signs in as the built-in administrator «أ», as in Apex Time
        const u = DB.one('SELECT * FROM users WHERE username = ?', [user])
          || (user.toLowerCase() === 'admin' ? DB.one("SELECT * FROM users WHERE username = 'أ'") : null)
        if (!u || !(await checkPassword(u.password, pass))) {
          DB.audit('محاولة دخول فاشلة', user)
          return d.error('اسم المستخدم أو كلمة المرور غير صحيحة')
        }
        Session.userId = u.id
        Session.username = u.username
        const role = DB.one('SELECT * FROM roles WHERE id = ?', [u.role_id]) || {}
        Session.roleId = role.id || null
        Session.admin = !!role.builtin
        Session.rolePerms = JSON.parse(role.perms || '{}')
        try { localStorage.setItem('mt-last-user', u.username) } catch {}
        // an empty password (first start) must be changed before going on
        if (!pass) {
          d.root.style.display = 'none'
          const ok = await forcePasswordChange(u)
          if (!ok) { d.root.style.display = ''; return d.error('يجب تعيين كلمة مرور للمتابعة') }
        } else if (!u.password?.startsWith('sha256$')) DB.run('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(pass), u.id])
        DB.audit('تسجيل دخول', u.username)
        await DB.flush()
        d.close(true)
      } },
    ],
  })
}

// Apex «تعديل بيانات الدخول»: pick the user, its current password, the new one twice
function openChangeLogin() {
  UI.openWindow('change-login', 'تعديل بيانات الدخول', { width: 651, height: 250 }, (body, win) => {
    const users = DB.all('SELECT id, username FROM users ORDER BY username')
    const eye = (id) => `<span class="pw"><input type="password" id="${id}"><button type="button" class="eye" data-for="${id}" title="إظهار">👁</button></span>`
    const view = UI.el(`<div class="change-login">
      <div class="fields">
        <label>اسم المستخدم</label><select id="cl-user"><option value="">إختر</option>${users.map((u) => `<option value="${u.id}" ${u.id === Session.userId ? 'selected' : ''}>${UI.esc(u.username)}</option>`).join('')}</select>
        <label>كلمة المرور الحالية</label>${eye('cl-old')}
        <label>كلمة المرور الجديدة</label>${eye('cl-new')}
        <label>تأكيد كلمة المرور الجديدة</label>${eye('cl-new2')}
        <span></span><div class="btns"><button type="button" id="cl-ok">${ICONS.ok}<span>موافق</span></button><button type="button" id="cl-cancel">${ICONS.cancel}<span>الغاء</span></button></div>
      </div><div class="avatar">${ICONS.avatar}</div></div>`)
    body.append(view)
    view.querySelectorAll('.eye').forEach((b) => (b.onclick = () => { const i = view.querySelector('#' + b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password' }))
    view.querySelector('#cl-cancel').onclick = () => win.close()
    view.querySelector('#cl-ok').onclick = async () => {
      const u = DB.one('SELECT * FROM users WHERE id = ?', [+view.querySelector('#cl-user').value])
      if (!u) return UI.message('اختر المستخدم')
      if (!(await checkPassword(u.password, view.querySelector('#cl-old').value))) return UI.message('كلمة المرور الحالية غير صحيحة')
      const a = view.querySelector('#cl-new').value, b = view.querySelector('#cl-new2').value
      if (a.length < 4) return UI.message('كلمة المرور 4 أحرف على الأقل')
      if (a !== b) return UI.message('كلمتا المرور غير متطابقتين')
      DB.run('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(a), u.id])
      DB.audit('تعديل بيانات الدخول', u.username)
      await DB.flush()
      win.close()
      UI.message('تم تعديل كلمة المرور')
    }
  })
}

function forcePasswordChange(u) {
  return UI.dialog({
    head: 'تعيين كلمة مرور جديدة', width: 430,
    bodyHtml: `<div style="flex:1;display:flex;flex-direction:column;gap:8px"><div style="font-size:12px">لحماية بياناتك، عيّن كلمة مرور للمستخدم «${UI.esc(u.username)}» قبل المتابعة.</div>
      <div class="fields" style="grid-template-columns:110px 1fr"><label>كلمة المرور</label><input type="password" id="np1"><label>تأكيد</label><input type="password" id="np2"></div></div>`,
    buttons: [
      { label: 'حفظ', icon: 'save', onClick: async (d) => {
        const a = d.root.querySelector('#np1').value, b = d.root.querySelector('#np2').value
        if (a.length < 4) return d.error('كلمة المرور 4 أحرف على الأقل')
        if (a !== b) return d.error('كلمتا المرور غير متطابقتين')
        DB.run('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(a), u.id])
        DB.audit('تعيين كلمة مرور', u.username)
        await DB.flush()
        d.close(true)
      } },
      { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(false) },
    ],
  })
}

async function logout() {
  DB.audit('تسجيل خروج', Session.username)
  await DB.flush()
  location.reload()
}

const dbLabel = (n) => (n === 'main' ? 'قاعدة البيانات الرئيسية' : n)

// Apex «إنشاء قاعدة البيانات»: a new, empty copy of the program's database next to the
// current one; pick it later from «قاعدة البيانات» on the login screen.
function openCreateDb() {
  if (!Session.admin) return UI.message('انشاء قواعد البيانات لمدير النظام فقط')
  if (!licence.ok) return UI.message('انشاء أكثر من قاعدة بيانات متاح في النسخة المسجلة فقط')
  UI.openWindow('create-db', 'إنشاء قاعدة البيانات', { width: 760, height: 360 }, (body, win) => {
    const bar = UI.toolbar([{ key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() }])
    const view = UI.el(`<div class="create-db"><div class="side">إنشاء قاعدة بيانات جديدة</div>
      <fieldset><legend>قاعدة بيانات جديدة</legend>
        <div class="warn">هذه العملية ستؤدي إلى إنشاء نسخة جديدة من قاعدة البيانات</div>
        <div class="fields"><label>قاعدة البيانات الحالية</label><input type="text" id="cd-cur" readonly value="${UI.esc(dbLabel(DB.year))}">
          <label>قاعدة البيانات الجديدة</label><input type="text" id="cd-name" maxlength="40">
          <label>كلمة مرور مدير النظام</label><input type="password" id="cd-pw"></div>
        <button id="cd-go">${ICONS.save || ''}<span>إنشاء</span></button></fieldset></div>`)
    body.append(bar, view)
    const $ = (s) => view.querySelector(s)
    $('#cd-go').onclick = async () => {
      const name = $('#cd-name').value.trim()
      if (!name) return UI.message('اكتب اسم قاعدة البيانات الجديدة')
      if (/[\\/:*?"<>|.]/.test(name) || /^\d{4}$/.test(name) || name === 'main') return UI.message('اسم قاعدة البيانات غير صالح (لا يحتوي على \\ / : * ? " < > | . وليس سنة من 4 أرقام فقط)')
      const u = DB.one('SELECT password FROM users WHERE id = ?', [Session.userId])
      if (!u || !(await checkPassword(u.password, $('#cd-pw').value))) return UI.message('كلمة مرور مدير النظام غير صحيحة')
      const res = await window.bridge.createDb(name, new Uint8Array(0))
      if (!res.ok) return UI.message(res.error)
      DB.audit('انشاء قاعدة بيانات', name)
      await DB.flush()
      $('#cd-pw').value = ''
      const go = await UI.confirm(`تم انشاء قاعدة البيانات «${name}» بنجاح. الانتقال إليها الآن؟ (اسم المستخدم «أ» بدون كلمة مرور)`)
      if (go && (await window.bridge.useDb(name))) window.bridge.relaunch()
    }
  })
}

// Apex «إستعادة قاعدة البيانات من نسخة إحتياطية»: agree to the notice, pick the file, name the
// database to create from it (left empty: the current data is replaced), admin password.
function openRestore() {
  if (!Session.admin) return UI.message('استرجاع النسخ الاحتياطية لمدير النظام فقط')
  UI.openWindow('restore', 'إستعادة قاعدة البيانات من نسخة إحتياطية', { width: 820, height: 470 }, (body, win) => {
    let bytes = null
    const bar = UI.toolbar([{ key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() }])
    const view = UI.el(`<div class="create-db restore-db"><div class="side">إستعادة قاعدة البيانات من نسخة إحتياطية</div><div class="col">
      <fieldset class="notice"><div>عزيزي المستخدم:</div><div class="warn">يرجى ملاحظة أنه في حالة إستعادة قاعدة البيانات من نسخة إحتياطية سابقة فإنه سوف يتم إنشاء قاعدة بيانات جديدة بنفس البيانات الموجودة في قاعدة البيانات السابقة (اترك «قاعدة البيانات الجديدة» فارغة لاستبدال البيانات الحالية).</div>
        <label class="agree"><input type="checkbox" id="rs-agree"> موافق</label></fieldset>
      <fieldset><legend>بيانات قاعدة البيانات</legend>
        <div class="fields"><label>قاعدة البيانات الحالية</label><input type="text" readonly value="${UI.esc(dbLabel(DB.year))}">
          <label>مكان ملف النسخة الاحتياطية</label><span class="file"><input type="text" id="rs-path" readonly dir="ltr"><button type="button" id="rs-pick">...</button></span>
          <label>قاعدة البيانات الجديدة</label><input type="text" id="rs-name" maxlength="40">
          <label>كلمة مرور مدير النظام</label><input type="password" id="rs-pw"></div>
        <button id="rs-go">${ICONS.i_restore}<span>إستعادة</span></button></fieldset></div></div>`)
    body.append(bar, view)
    const $ = (q) => view.querySelector(q)
    $('#rs-pick').onclick = async () => {
      const f = await window.bridge.pickDb()
      if (!f) return
      if (!DB.isBackup(f.bytes)) { bytes = null; $('#rs-path').value = ''; return UI.message('الملف ليس نسخة احتياطية صالحة من البرنامج') }
      bytes = f.bytes
      $('#rs-path').value = f.path
    }
    $('#rs-go').onclick = async () => {
      if (!$('#rs-agree').checked) return UI.message('اقرأ الملاحظة ثم اختر «موافق»')
      if (!bytes) return UI.message('اختر ملف النسخة الاحتياطية')
      const u = DB.one('SELECT password FROM users WHERE id = ?', [Session.userId])
      if (!u || !(await checkPassword(u.password, $('#rs-pw').value))) return UI.message('كلمة مرور مدير النظام غير صحيحة')
      const name = $('#rs-name').value.trim()
      if (name) {
        if (!licence.ok) return UI.message('انشاء أكثر من قاعدة بيانات متاح في النسخة المسجلة فقط')
        if (/[\\/:*?"<>|.]/.test(name) || /^\d{4}$/.test(name) || name === 'main') return UI.message('اسم قاعدة البيانات غير صالح (لا يحتوي على \\ / : * ? " < > | . وليس سنة من 4 أرقام فقط)')
        const res = await window.bridge.createDb(name, new Uint8Array(bytes))
        if (!res.ok) return UI.message(res.error)
        DB.audit('استعادة نسخة احتياطية', `${$('#rs-path').value} → ${name}`)
        await DB.flush()
        const go = await UI.confirm(`تم إنشاء قاعدة البيانات «${name}» من النسخة الاحتياطية. الانتقال إليها الآن؟`)
        if (go && (await window.bridge.useDb(name))) window.bridge.relaunch()
        return
      }
      if (!(await UI.confirm('سيتم استبدال كل البيانات الحالية بمحتوى النسخة الاحتياطية. متابعة؟'))) return
      if (!(await DB.restore(bytes))) return UI.message('الملف ليس نسخة احتياطية صالحة من البرنامج')
      await UI.message('تم استرجاع النسخة الاحتياطية — سيتم إعادة تشغيل البرنامج')
      window.bridge.relaunch()
    }
  })
}

;(async function start() {
  await DB.init()
  await DB.open()
  licence = await window.bridge.licenceStatus()
  if (licence.locked) await lockScreen(licence)
  setCaption()
  await login()
  document.getElementById('shell').hidden = false
  buildTopbar(buildRail())
  renderHome()
  WebSync.init()
  AutoRead.restart()
  Gate.init()
  // a trial that ends while the program is open locks it too
  setInterval(async () => {
    const st = await window.bridge.licenceStatus()
    if (st.locked) { await lockScreen(st); licence = st.ok ? st : await window.bridge.licenceStatus() }
    else if (st.ok !== licence.ok || st.daysLeft !== licence.daysLeft) licence = st
    setCaption(); renderHome()
  }, 10 * 60e3)
})()
