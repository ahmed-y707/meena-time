// Login → home (4 tiles + trial notice) → Arabic menu bar, as in Apex Time.
const VERSION = '1.3.0'
const TRIAL_REPORTS = [
  'الحضور والانصراف تفصيلي',
  'الحضور والانصراف إجمالي',
  'حالة اليوم',
  'الحضور والانصراف بالحركات',
]
const soon = (name) => () => UI.message(`«${name}» — قيد الإنشاء`)

// Menu layout transcribed from the client's Apex Time video (2026-09-24).
const MENUS = [
  { label: 'ملف', icon: 'm_file', items: [['تسجيل الخروج', logout, 'i_logout'], ['انهاء البرنامج', () => window.close(), 'i_power']] },
  { label: 'البيانات الأساسية', icon: 'm_base', items: [
    ['قوائم البرنامج', openLists, 'i_list'], ['الإدارات والأقسام', openDepartments, 'i_dept'], ['المشاريع', openProjects, 'i_project'],
    ['مواعيد العمل', openShiftGroups, 'i_clock'], ['الموظفون', openEmployees, 'i_emp'], ['مجموعات الموظفين', openEmployeeGroups, 'i_groups'],
    ['تعريف الأجهزة', openDevices, 'i_device'], ['العطلات الرسمية', openHolidays, 'i_holiday'],
  ] },
  { label: 'الإجراءات', icon: 'm_proc', items: [
    ['قراءة الحركات (شبكة - ملف)', openReadPunches, 'i_read'], ['عرض الحركات', openViewPunches, 'i_view'], '-',
    ['إضافة وتعديل الحركات لموظف', openEditPunches, 'i_edit'], ['الغاء الحركات المعدله يدويا', () => openDeletePunches(['manual'], 'إلغاء الحركات المعدله يدويا'), 'i_cancel'],
    '-',
    ['إضافة أجازات لموظف', openLeaves, 'i_leave'], ['إضافة أذونات لموظف', openPermissions, 'i_perm'], '-',
    ['ترحيل الحركات', postPunches, 'i_post'], ['الغاء ترحيل الحركات', openUnpost, 'i_unpost'], '-', ['الغاء جميع بيانات الموظف بالنظام', purgeEmployee, 'i_purge'],
  ] },
  { label: 'التقارير', icon: 'm_rep', items: Object.keys(REPORTS).map((r) => [r, () => openReport(r), REPORT_ICONS[r] || 'r_doc']) },
  { label: 'الاعدادات', icon: 'm_set', items: [['بيانات المؤسسه', openCompany, 'i_company'],
    ['اعدادات المستخدمين', [['صلاحيات المستخدمين', openRoles, 'i_roles'], ['إدارة المستخدمين', openUsers, 'i_users']], 'i_users'], ['اعدادات النظام', openSystemSettings, 'i_settings'], '-',
    ['الربط بالموقع', openWebLinkLocked, 'i_link']] },
  { label: 'ادوات', icon: 'm_tools', items: [['تعديل بيانات الدخول', openChangeLogin, 'i_login']] }, // Apex: nothing else here (backups run daily on their own)
  { label: 'مساعده', icon: 'm_help', items: [['فهرس المحتويات', openGuide, 'i_book'], ['تسجيل المنتج', () => openRegister(), 'i_lock'], ['عن الشركة', async () => { const p = await window.bridge.paths(); UI.message(`Meena Time — الإصدار ${VERSION}\nمجلد البيانات: ${p.data}\nالنسخ الاحتياطية: ${p.backups} (نسخة تلقائية يومياً، آخر 30 نسخة)`) }, 'i_info']] },
]

let licence = { ok: false }
const Session = (window.Session = { userId: null, username: '', admin: false, perms: null })

function setCaption() {
  // Apex shows this line in the window's own title bar
  document.title = document.getElementById('caption-text').textContent =
    `Meena Time Ver. ${VERSION} (${licence.ok ? licence.edition : 'Trial'}) ${licence.ok ? 'Registered' : 'Unregistered'}${DB.year !== 'main' ? ` — ${DB.year}` : ''}`
}

function buildMenu() {
  const bar = document.getElementById('menubar')
  bar.innerHTML = ''
  for (const m of MENUS) {
    const menu = UI.el(`<div class="menu"><button>${ICONS[m.icon]}<span>${m.label}</span></button><div class="drop"></div></div>`)
    const drop = menu.querySelector('.drop')
    // screen keys are "<menu>/<item>" — the same label can exist in two menus; a sub-menu
    // (Apex's «اعدادات المستخدمين ▸») shows when any of its items is allowed
    const open = ['تسجيل المنتج', 'عن الشركة', 'فهرس المحتويات', 'تعديل بيانات الدخول', 'تسجيل الخروج', 'انهاء البرنامج']
    const allowed = (label, fn) => Array.isArray(fn) ? fn.some(([l]) => allowed(l)) : open.includes(label) || Perm.can(`${m.label}/${label}`)
    const items = m.items.filter((it) => it === '-' || allowed(it[0], it[1])).filter((it, i, a) => !(it === '-' && (i === 0 || a[i - 1] === '-' || i === a.length - 1)))
    if (!items.some((it) => it !== '-')) continue
    const ico = (k) => (ICONS[k] || ICONS.item).replace('<svg', '<svg class="ico"')
    const itemButton = (label, fn, icon) => {
      const b = UI.el(`<button>${ico(icon)}<span>${label}</span></button>`)
      b.onclick = () => { closeMenus(); Perm.run(`${m.label}/${label}`, fn || soon(label)) }
      return b
    }
    for (const it of items) {
      if (it === '-') { drop.appendChild(UI.el('<hr>')); continue }
      const [label, fn, icon] = it
      if (Array.isArray(fn)) {
        const sub = UI.el(`<div class="sub"><button class="has-sub">${ico(icon)}<span>${label}</span><i>◂</i></button><div class="drop sub-drop"></div></div>`)
        for (const [l, f, ic] of fn.filter(([l]) => allowed(l))) sub.querySelector('.sub-drop').appendChild(itemButton(l, f, ic))
        drop.appendChild(sub)
      } else drop.appendChild(itemButton(label, fn, icon))
    }
    menu.querySelector(':scope > button').onclick = (e) => {
      e.stopPropagation()
      const was = menu.classList.contains('open')
      closeMenus()
      if (!was) menu.classList.add('open')
    }
    menu.addEventListener('mouseenter', () => { if (bar.querySelector('.menu.open') && !menu.classList.contains('open')) { closeMenus(); menu.classList.add('open') } })
    bar.appendChild(menu)
  }
  // Apex's round «home» button at the far end of the bar: closes every child window
  const home = UI.el(`<button class="home-btn" title="الرئيسية">${ICONS.home}</button>`)
  home.onclick = () => { [...UI.wins.keys()].forEach((id) => UI.close(id)); renderHome() } // and back to the 4 main tiles
  bar.appendChild(home)
  bar.hidden = false
}
const closeMenus = () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'))
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#menubar')) closeMenus() })

// Apex home: 4 tiles; each opens its own page of tiles (the round home button comes back here)
const HOME_PAGES = {
  setup: ['التجهيز', [['قوائم البرنامج', 'البيانات الأساسية/قوائم البرنامج', () => openLists(), 'i_list'],
    ['الأقسام والإدارات', 'البيانات الأساسية/الإدارات والأقسام', () => openDepartments(), 'i_dept'], ['المشاريع', 'البيانات الأساسية/المشاريع', () => openProjects(), 'i_project'],
    ['مواعيد العمل', 'البيانات الأساسية/مواعيد العمل', () => openShiftGroups(), 'i_clock'], ['الموظفون', 'البيانات الأساسية/الموظفون', () => openEmployees(), 'i_emp'],
    ['تعريف الأجهزة', 'البيانات الأساسية/تعريف الأجهزة', () => openDevices(), 'i_device'], ['المجموعات', 'البيانات الأساسية/مجموعات الموظفين', () => openEmployeeGroups(), 'i_groups'],
    ['العطلات الرسمية', 'البيانات الأساسية/العطلات الرسمية', () => openHolidays(), 'i_holiday']]],
  proc: ['الإجراءات', [['قراءة الحركات', 'الإجراءات/قراءة الحركات (شبكة - ملف)', () => openReadPunches(), 'i_read'],
    ['عرض الحركات', 'الإجراءات/عرض الحركات', () => openViewPunches(), 'i_view'], ['إضافة حركات', 'الإجراءات/إضافة وتعديل الحركات لموظف', () => openEditPunches(), 'i_edit'],
    ['إضافة أذونات', 'الإجراءات/إضافة أذونات لموظف', () => openPermissions(), 'i_perm'], ['إضافة أجازات', 'الإجراءات/إضافة أجازات لموظف', () => openLeaves(), 'i_leave'],
    ['ترحيل ساعات العمل', 'الإجراءات/ترحيل الحركات', () => postPunches(), 'i_post'], ['إلغاء ساعات العمل', 'الإجراءات/الغاء ترحيل الحركات', () => openUnpost(), 'i_unpost']]],
  reports: ['التقارير', [['الموظفون', 'الموظفون'], ['الحضور والانصراف تفصيلي', 'الحضور والانصراف تفصيلي'], ['الحضور والانصراف إجمالي', 'الحضور والانصراف إجمالي'],
    ['التأخير اليومي', 'التأخير عن بداية الدوام اليومي'], ['حالة اليوم', 'حالة اليوم'], ['تقرير الغياب', 'الغياب خلال فترة'], ['حركات الموظفين', 'الحضور والانصراف بالحركات'], ['الحركات الغير مكتملة', 'الحركات الغير مكتملة'],
    ['التأخير خلال فترة', 'التأخير عن الدوام خلال فترة'], ['الأجازات', 'أجازات الموظفين']].map(([l, r]) => [l, `التقارير/${r}`, () => openReport(r), REPORT_ICONS[r] || 'r_doc'])],
  users: ['المستخدمون', [['صلاحيات الإستخدام', 'الاعدادات/صلاحيات المستخدمين', () => openRoles(), 'i_roles'], ['المستخدمون', 'الاعدادات/إدارة المستخدمين', () => openUsers(), 'i_users'],
    ['بيانات الشركة', 'الاعدادات/بيانات المؤسسه', () => openCompany(), 'i_company'], ['الإعدادات العامة', 'الاعدادات/اعدادات النظام', () => openSystemSettings(), 'i_settings']]],
}
function renderHome(page = null) {
  const desk = document.getElementById('desktop')
  desk.querySelector('#home')?.remove()
  const guard = (l, fn) => () => (Perm.can(l) ? Perm.run(l, fn) : UI.message('ليس لديك صلاحية لهذه الشاشة'))
  if (page) {
    const [title, items] = HOME_PAGES[page]
    const sub = UI.el(`<div id="home" class="sub sub-${page}"><div class="title">${title}</div>
      <div class="tiles">${items.map(([l], i) => `<div class="tile" data-i="${i}">${ICONS[items[i][3]] || ''}<span>${l}</span></div>`).join('')}</div></div>`)
    sub.querySelectorAll('.tile').forEach((t) => { const [, key, fn] = items[+t.dataset.i]; t.onclick = guard(key, fn) })
    desk.prepend(sub)
    UI.renderStrip()
    return
  }
  const trial = licence.ok ? '' : `
    <div class="trial">${ICONS.key.replace('<svg', '<svg class="key"')}
      هذه النسخة تجريبية<br>
      كل مميزات النسخة متاحة ما عدا التقارير إلا التقارير الآتية<br>
      ${TRIAL_REPORTS.map((r, i) => `${i + 1}- ${r} (متاح 3 مرات طباعة فقط)`).join('<br>')}
    </div>`
  const home = UI.el(`<div id="home">
      <div class="title">الرئيسية</div>${trial}
      <div class="tiles">
        <div class="tile" data-t="users">${ICONS.people}<span>المستخدمون</span></div>
        <div class="tile" data-t="reports">${ICONS.reports}<span>التقارير</span></div>
        <div class="tile" data-t="proc">${ICONS.device}<span>الإجراءات</span></div>
        <div class="tile" data-t="setup">${ICONS.tools}<span>التجهيز</span></div>
      </div></div>`)
  home.querySelectorAll('.tile').forEach((t) => (t.onclick = () => renderHome(t.dataset.t)))
  desk.prepend(home)
  UI.renderStrip()
}

async function openRegister() {
  const st = await window.bridge.licenceStatus()
  await UI.dialog({
    winbar: 'تسجيل المنتج', head: 'تسجيل المنتج', width: 898, btnsLeft: true,
    bodyHtml: `
      <div class="fields" style="grid-template-columns:120px 1fr">
        <label>كود الطلب</label><input type="text" id="req" readonly dir="ltr" value="${UI.esc(st.requestCode)}">
        <label>كود الترخيص</label><input type="text" id="lic" dir="ltr" placeholder="${st.ok ? 'البرنامج مسجل' : ''}">
      </div>
      <div style="width:64px;height:64px">${ICONS.lock}</div>`,
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

async function login() {
  const names = (await window.bridge.dbNames?.()) || ['main']
  const last = localStorage.getItem('mt-last-user') || 'أ'
  return UI.dialog({
    head: 'شاشة الدخول', width: 534,
    foot: `Meena Time Ver. ${VERSION} ${licence.ok ? 'Registered' : 'Unregistered'}`,
    // another database: remember the choice and restart on it (each database has its own users)
    onOpen: (d) => d.root.querySelector('#year').addEventListener('change', async (e) => {
      if (await window.bridge.useDb(e.target.value)) window.bridge.relaunch()
    }),
    bodyHtml: `
      <div class="fields">
        <label>قاعدة البيانات</label><select id="year" ${names.length > 1 ? '' : 'disabled'}>${names.map((n) => `<option value="${UI.esc(n)}" ${n === DB.year ? 'selected' : ''}>${UI.esc(dbLabel(n))}</option>`).join('')}</select>
        <label>اسم المستخدم</label><input type="text" id="user" value="${UI.esc(last)}">
        <label>كلمة المرور</label><input type="password" id="pass">
        <label>الواجهة</label>
        <div class="lang"><label style="color:inherit;font-weight:normal"><input type="radio" name="lang" checked> عربي</label>
          <label style="color:inherit;font-weight:normal"><input type="radio" name="lang" disabled> English</label></div>
      </div>
      <div class="avatar">${ICONS.avatar}</div>`,
    buttons: [
      { label: 'موافق', icon: 'ok', onClick: async (d) => {
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
      { label: 'الغاء', icon: 'cancel', onClick: () => window.close() },
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
  setCaption()
  await login()
  document.getElementById('statusbar').innerHTML = `المستخدم: <b>${UI.esc(Session.username)}</b>`
  buildMenu()
  renderHome()
  WebSync.init()
  AutoRead.restart()
})()
