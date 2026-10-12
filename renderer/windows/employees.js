// «الموظفين»: a read-only list (search + toolbar) and the employee form window,
// fields taken from Apex's employee form (تعريف الموظف · معلومات الموظف ·
// معلومات شخصية · إعدادات إحتساب الإضافي). «كود الموظف» is also the employee's
// number on the fingerprint device.
const EMP_STATUSES = ['نشط', 'غير نشط', 'موقوف', 'منتهي']

// Apex «الموظفون»: الاقسام tree (right) · the selected department's list · «بيانات الموظف» form.
// «الاعدادات» (the cog) drops Apex's «الإعدادات» panel over the form: its warning and the five
// attendance options, saved with «حفظ». A double click on an employee opens the full form
// (status, dates, personal data, photo — Meena's extras).
function openEmployees() {
  UI.openWindow('employees', 'الموظفون', { width: 1084, height: 660 }, (body, win) => {
    let current = null, q = '', dep = null
    const bar = UI.toolbar([
      { key: 'help', label: 'مساعده', icon: 'help', onClick: () => UI.message('اختر الإدارة أو القسم من «الاقسام»، ثم «جديد» لموظف جديد أو اختر موظفاً من القائمة لتعديله، ثم «حفظ».\nزر «الاعدادات» يفتح باقي بيانات الموظف وإعدادات الحضور.') },
      { key: 'new', label: 'جديد', icon: 'new', onClick: () => { select(null); form.querySelector('[data-f=code]').focus() } },
      { key: 'save', label: 'حفظ', icon: 'save', onClick: save },
      { key: 'undo', label: 'إهمال', icon: 'undo', onClick: () => fill(current) },
      { key: 'del', label: 'حذف', icon: 'del', onClick: remove },
      { key: 'search', label: 'بحث', icon: 'search', onClick: search },
      { key: 'print', label: 'طباعه', icon: 'print', onClick: () => UI.printGrid('الموظفون', wrap) },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() },
    ])
    const sel = (field, options) => `<select data-f="${field}"><option value="">-</option>${options.map(([v, l]) => `<option value="${UI.esc(v)}">${UI.esc(l)}</option>`).join('')}</select>`
    const religions = [...new Set(['مسلم', 'غير مسلم', ...listOptions('religion')().map(([, n]) => n)])].map((n) => [n, n])
    const band = UI.el('<div class="band">الكل</div>')
    const wrap = UI.el(`<div class="grid-wrap"><table class="grid"><thead><tr><th style="width:16px"></th>
      <th style="width:150px">كود الموظف</th><th class="sorted">اسم الموظف عربي</th><th>اسم الموظف أجنبي</th></tr></thead><tbody></tbody></table></div>`)
    const form = UI.el(`<fieldset class="emp-form"><legend>بيانات الموظف</legend>
      <label>رقم الموظف <i class="req">*</i></label><div><input type="text" data-f="code" dir="ltr" class="code"></div>
      <label>الاعدادات</label><div class="set"><button type="button" id="emp-settings" title="اعدادات الحضور وباقي بيانات الموظف">${ICONS.gear}</button><span>لتعديل اعدادات الحضور للموظف</span></div>
      <label>اسم الموظف <i class="req">*</i></label><input type="text" data-f="name_ar">
      <label>الاسم الاجنبى</label><input type="text" data-f="name_en" dir="ltr">
      <label>أوقات العمل <i class="req">*</i></label>${sel('shift_group_id', opts('shift_groups')())}
      <label>الوظيفة</label>${sel('job_id', listOptions('job')())}
      <label>المشروع</label>${sel('project_id', opts('projects')())}
      <label>المهمة</label>${sel('task_id', listOptions('task')())}
      <label>الديانة</label>${sel('religion', religions)}
      <label>التليفون</label><input type="text" data-f="mobile" dir="ltr">
      <label>البريد الالكترونى</label><input type="text" data-f="email" dir="ltr" class="wide">
      <div class="emp-set" hidden><div class="es-cap"><button type="button" class="es-x" title="إغلاق">✕</button>الإعدادات</div>
        <div class="es-warn">${EMP_SET_WARNING}</div>
        ${EMP_SETTINGS.map(([f, l]) => `<label class="es-row"><input type="checkbox" data-f="${f}"> ${l}</label>`).join('')}</div>
    </fieldset>`)
    const unplaced = !!DB.one('SELECT 1 FROM employees WHERE department_id IS NULL AND section_id IS NULL LIMIT 1')
    const tree = UI.deptTree((id, name) => { dep = id; band.textContent = name; load() }, { title: 'الاقسام', apex: true, none: unplaced })
    const main = UI.el('<div class="emp-main"></div>')
    main.append(band, wrap, form)
    const layout = UI.el('<div class="emp-apex"></div>')
    layout.append(tree, main) // RTL: the tree on the right, as in Apex
    body.append(bar, layout)
    const tbody = wrap.querySelector('tbody')
    const values = () => Object.fromEntries([...form.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value.trim()]))
    // a new employee joins the department / section selected in the tree
    const placement = () => {
      const d = dep > 0 && DB.one('SELECT id, parent_id FROM departments WHERE id = ?', [dep])
      return d ? (d.parent_id ? { department_id: d.parent_id, section_id: d.id } : { department_id: d.id, section_id: null }) : {}
    }

    function fill(r) {
      form.querySelectorAll('[data-f]').forEach((i) => { if (i.type === 'checkbox') i.checked = !!r?.[i.dataset.f]; else i.value = r?.[i.dataset.f] ?? '' })
    }
    function select(r) {
      current = r
      tbody.querySelectorAll('tr').forEach((x) => x.classList.toggle('current', !!r && x.dataset.id === String(r.id)))
      fill(r)
    }
    function load(keepCode = current?.code) {
      const like = `%${q}%`
      const rows = DB.all(`SELECT e.* FROM employees e
        WHERE (? = '' OR e.code LIKE ? OR e.name_ar LIKE ? OR e.name_en LIKE ?) ${dep === 0 ? 'AND e.department_id IS NULL AND e.section_id IS NULL'
          : dep ? `AND (e.department_id IN (${UI.deptIds(dep)}) OR e.section_id IN (${UI.deptIds(dep)}))` : ''}
        ORDER BY CAST(e.code AS INTEGER), e.code`, [q, like, like, like])
      tbody.innerHTML = ''
      for (const r of rows) {
        const tr = UI.el(`<tr data-id="${r.id}"><td class="sel"></td><td class="center">${UI.esc(r.code)}</td><td>${UI.esc(r.name_ar)}</td><td dir="ltr" style="text-align:right">${UI.esc(r.name_en)}</td></tr>`)
        tr.addEventListener('mousedown', () => select(r))
        tr.addEventListener('dblclick', () => openEmployeeForm(r, load))
        tr.addEventListener('contextmenu', (ev) => { ev.preventDefault(); select(r); empMenu(ev, r) })
        tbody.appendChild(tr)
      }
      select(rows.find((r) => r.code === keepCode) || null)
    }
    async function save() {
      // as in Apex, an employee added here has no hire date (every day counts); the full form can set one
      const v = { ...(current || { status: 'نشط', religion: '', ...placement() }), ...values() }
      const code = await saveEmployee(current, v)
      if (code) load(code)
    }
    const setPanel = form.querySelector('.emp-set')
    form.querySelector('#emp-settings').onclick = () => { setPanel.hidden = !setPanel.hidden }
    setPanel.querySelector('.es-x').onclick = () => { setPanel.hidden = true }
    async function search() {
      const s = await UI.dialog({ head: 'بحث', width: 360,
        bodyHtml: `<div class="fields" style="grid-template-columns:110px 1fr"><label>الكود أو الاسم</label><input type="text" id="es-q" value="${UI.esc(q)}"></div>`,
        buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => d.close(d.root.querySelector('#es-q').value.trim()) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(null) }] })
      if (s === null) return
      q = s
      load()
    }

    function empMenu(ev, r) {
      document.querySelector('.ctx-menu')?.remove()
      const m = UI.el('<div class="ctx-menu"><button>نقل الموظف الى قسم اخر</button></div>')
      Object.assign(m.style, { left: ev.clientX + 'px', top: ev.clientY + 'px' })
      m.querySelector('button').onclick = () => { m.remove(); moveEmployee(r) }
      document.body.appendChild(m)
      setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off) } }), 0)
    }
    async function moveEmployee(r) {
      if (WebSync.blocks('employees')) return
      if (!Perm.can(win.permKey, 'edit')) return UI.message('غير مصرح لك بهذا الإجراء')
      let picked = null
      const pending = UI.dialog({ head: 'الأقسام والإدارات', width: 320, bodyHtml: '<div id="mv-tree"></div>',
        buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => (picked ? d.close(true) : d.error('اختر القسم أو الإدارة')) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(false) }] })
      document.querySelector('#mv-tree').appendChild(UI.deptTree((id) => { picked = id }, { title: 'الأقسام والإدارات', apex: true, icons: true }))
      if (!(await pending)) return
      const d = DB.one('SELECT * FROM departments WHERE id = ?', [picked])
      DB.run('UPDATE employees SET department_id = ?, section_id = ? WHERE id = ?', d.parent_id ? [d.parent_id, d.id, r.id] : [d.id, null, r.id])
      DB.audit('نقل موظف', `${r.code} — ${r.name_ar}`, d.name_ar)
      await DB.flush()
      load()
    }
    async function remove() {
      if (WebSync.blocks('employees')) return
      if (!current) return UI.message('اختر موظفاً')
      const ok = await UI.dialog({ head: 'تأكيد الحذف', bodyHtml: `<div>حذف الموظف «${UI.esc(current.name_ar)}»؟</div>`, width: 340,
        buttons: [{ label: 'نعم', icon: 'ok', onClick: (d) => d.close(true) }, { label: 'لا', icon: 'cancel', onClick: (d) => d.close(false) }] })
      if (!ok) return
      if (DB.one('SELECT 1 FROM punches WHERE emp_code = ? LIMIT 1', [current.code]) || DB.one('SELECT 1 FROM posted_attendance WHERE employee_id = ? LIMIT 1', [current.id]))
        return UI.message('للموظف حركات مسجلة — غيّر حالته إلى «منتهي»، أو استخدم «الغاء جميع بيانات الموظف بالنظام»')
      DB.run('DELETE FROM employee_shifts WHERE employee_id = ?', [current.id])
      DB.run('DELETE FROM employees WHERE id = ?', [current.id])
      DB.audit('حذف موظف', `${current.code} — ${current.name_ar}`)
      await DB.flush()
      load()
    }
    if (DB.one('SELECT 1 FROM departments LIMIT 1') || unplaced) tree.selectFirst()
    else load()
  })
}

// Apex «الإعدادات» of an employee (the cog in «الموظفون»), in Apex's order and wording
const EMP_SETTINGS = [['ot_before', 'اتاحة احتساب الوقت الاضافى قبل الدوام'], ['ot_deduct_late', 'اتاحة خصم التاخير من الوقت الاضافى'],
  ['ot_holidays', 'اتاحة احتساب الاضافى ايام الاجازات'], ['ot_after', 'اتاحة احتساب الوقت الاضافى بعد الدوام'], ['no_punch_out', 'تسجيل حركة الانصراف تلقائيا']]
const EMP_SET_WARNING = 'في حاله التعديلات علي دوام الموظف او الاعدادات الخاصه به يجب إلغاء الحركات والترحيل مره اخرى وذلك للحساب علي اخر تعديل'

// the full employee form (Apex «الاعدادات»); `prefill` seeds a new employee from the list window
function openEmployeeForm(emp, onSaved, prefill = {}) {
  const isNew = !emp
  const e = emp ? { ...emp } : { status: 'نشط', hire_date: new Date().toISOString().slice(0, 10), ...Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== '' && v != null)) }
  const sel = (field, options) => `<select data-f="${field}"><option value=""></option>${options.map(([v, l]) =>
    `<option value="${UI.esc(v)}" ${String(v) === String(e[field] ?? '') ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}</select>`
  const txt = (field, attrs = '') => `<input type="text" data-f="${field}" value="${UI.esc(e[field] ?? '')}" ${attrs}>`
  const date = (field) => `<input type="date" data-f="${field}" value="${UI.esc(e[field] ?? '')}">`
  const chk = (field, label) => `<label class="chk"><input type="checkbox" data-f="${field}" ${e[field] ? 'checked' : ''}> ${label}</label>`
  const deps = opts('departments', 'WHERE parent_id IS NULL OR parent_id = ""')()
  const secs = opts('departments', 'WHERE parent_id IS NOT NULL AND parent_id <> ""')()

  UI.openWindow(`emp-${emp?.id || 'new'}`, isNew ? 'اضافة موظف' : `تعديل موظف — ${emp.name_ar}`, { width: 820, height: 520 }, (body, win) => {
    const bar = UI.toolbar([
      { key: 'save', label: 'حفظ', icon: 'save', onClick: save },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() },
    ])
    const form = UI.el(`<div class="form">
      <fieldset><legend>تعريف الموظف</legend><div class="with-photo"><div class="grid2">
        <label>كود الموظف (رقم الموظف على جهاز البصمة) *</label>${txt('code', 'dir="ltr"')}
        <label>حالة الموظف</label>${sel('status', EMP_STATUSES.map((s) => [s, s]))}
        <label>اسم الموظف بالعربية *</label>${txt('name_ar')}
        <label>اسم الموظف بالانجليزية</label>${txt('name_en', 'dir="ltr"')}
        <label>طريقة الحضور</label>${sel('attendance_method', [['بصمة', 'بصمة'], ['بصمة وجه', 'بصمة وجه'], ['بطاقة', 'بطاقة'], ['يدوي', 'يدوي']])}
      </div><div class="photo" title="اضغط لاختيار صورة">${e.photo ? `<img src="${e.photo}">` : '<span>صورة الموظف</span>'}
        <input type="file" accept="image/*" hidden><button type="button" class="rm" ${e.photo ? '' : 'hidden'}>إزالة</button></div></div></fieldset>
      <fieldset><legend>معلومات الموظف</legend><div class="grid2">
        <label>الوظيفة</label>${sel('job_id', listOptions('job')())}
        <label>المهمة</label>${sel('task_id', listOptions('task')())}
        <label>تاريخ التعيين</label>${date('hire_date')}
        <label>الإدارة</label>${sel('department_id', deps)}
        <label>القسم</label>${sel('section_id', secs)}
        <label>المجموعة</label>${sel('group_id', opts('employee_groups')())}
        <label>المشروع</label>${sel('project_id', opts('projects')())}
        <label>الدوام *</label>${sel('shift_group_id', opts('shift_groups')())}
      </div>${emp ? `<div class="hist"><b>سجل الدوام:</b> ${DB.all('SELECT s.from_date, g.name_ar FROM employee_shifts s LEFT JOIN shift_groups g ON g.id = s.group_id WHERE s.employee_id = ? ORDER BY s.from_date', [emp.id])
        .map((h) => `${UI.esc(h.name_ar)} من ${h.from_date}`).join(' ← ') || '—'}</div>` : ''}</fieldset>
      <fieldset><legend>معلومات شخصية</legend><div class="grid2">
        <label>الجنس</label>${sel('gender', [['ذكر', 'ذكر'], ['أنثى', 'أنثى']])}
        <label>الجنسية</label>${sel('nationality_id', listOptions('nationality')())}
        <label>رقم الهوية</label>${txt('national_id', 'dir="ltr"')}
        <label>الديانة</label>${sel('religion', [...new Set(['مسلم', 'غير مسلم', ...listOptions('religion')().map(([, n]) => n), e?.religion].filter(Boolean))].map((n) => [n, n]))}
        <label>تاريخ الميلاد</label>${date('birth_date')}
        <label>رقم الجوال</label>${txt('mobile', 'dir="ltr"')}
        <label>البريد الالكتروني</label>${txt('email', 'dir="ltr"')}
        <label>العنوان</label>${txt('address')}
      </div></fieldset>
      <fieldset><legend>إعدادات إحتساب الإضافي</legend><div class="checks">
        ${chk('ot_deduct_late', 'خصم التأخير من الوقت الإضافي')}
        ${chk('ot_before', 'حساب الوقت الإضافي قبل الدوام')}
        ${chk('ot_after', 'حساب الوقت الإضافي بعد الدوام')}
        ${chk('ot_holidays', 'إضافة ساعات العمل أيام الأجازات')}
        ${chk('no_punch_out', 'تسجيل خروج بدون بصمة')}
      </div></fieldset>
    </div>`)
    body.append(bar, form)
    // photo: resized to 240px JPEG and stored inline with the employee
    let photo = e.photo || null
    const box = form.querySelector('.photo'), fileIn = box.querySelector('input[type=file]'), rm = box.querySelector('.rm')
    const showPhoto = () => { box.querySelector('img, span')?.remove(); box.prepend(photo ? Object.assign(document.createElement('img'), { src: photo }) : Object.assign(document.createElement('span'), { textContent: 'صورة الموظف' })); rm.hidden = !photo }
    box.addEventListener('click', (ev) => { if (ev.target !== rm) fileIn.click() })
    rm.addEventListener('click', () => { photo = null; showPhoto() })
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0]
      if (!f) return
      if (f.size > 8 * 1024 * 1024) return UI.message('حجم الصورة كبير (الحد 8 ميجابايت)')
      // read as a data: URL — the page's CSP allows data: images, not blob:
      const src = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(f) })
      const img = src && (await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src }))
      if (!img) return UI.message('الملف ليس صورة صالحة')
      const k = Math.min(1, 240 / Math.max(img.width, img.height))
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) })
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      photo = c.toDataURL('image/jpeg', 0.85)
      showPhoto()
    })

    async function save() {
      const v = { ...e }
      form.querySelectorAll('[data-f]').forEach((i) => (v[i.dataset.f] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value.trim()))
      v.photo = photo
      const code = await saveEmployee(emp, v)
      if (!code) return
      onSaved?.(code)
      win.close()
    }
  })
}

// validate + insert/update one employee (both employee screens); returns its code, or null
async function saveEmployee(emp, v) {
  if (WebSync.blocks('employees')) return null
  if (!v.code) return void UI.message('كود الموظف مطلوب')
  if (!/^\d{1,9}$/.test(v.code)) return void UI.message('كود الموظف يجب أن يكون أرقاماً فقط (نفس رقمه على جهاز البصمة)')
  if (!v.name_ar) return void UI.message('اسم الموظف بالعربية مطلوب')
  if (!v.shift_group_id) return void UI.message('الدوام مطلوب')
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return void UI.message('البريد الالكتروني غير صحيح')
  if (!emp && !(await Trial.canAddEmployee())) return null
  // a shift change applies from a chosen date; earlier days keep the old shift
  let shiftFrom = null
  if (emp && String(v.shift_group_id) !== String(emp.shift_group_id)) {
    shiftFrom = await UI.dialog({
      head: 'تغيير الدوام', width: 420,
      bodyHtml: `<div class="fields" style="grid-template-columns:150px 1fr"><label>يبدأ الدوام الجديد من</label><input type="date" id="sf" value="${Engine.today()}"></div>
        <div style="font-size:12px;padding:0 4px">الأيام قبل هذا التاريخ تُحسب على الدوام السابق.</div>`,
      buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => { const x = d.root.querySelector('#sf').value; x ? d.close(x) : d.error('اختر التاريخ') } },
        { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(null) }],
    })
    if (!shiftFrom) return null
    if (Engine.isPosted(shiftFrom)) return void UI.message('هذا التاريخ داخل فترة مرحّلة — اختر تاريخاً بعدها')
  }
  const F = ['code', 'name_ar', 'name_en', 'status', 'job_id', 'department_id', 'section_id', 'group_id', 'project_id', 'shift_group_id',
    'hire_date', 'gender', 'nationality_id', 'national_id', 'religion', 'birth_date', 'mobile', 'email', 'address',
    'ot_deduct_late', 'ot_before', 'ot_after', 'ot_holidays', 'no_punch_out', 'attendance_method', 'photo', 'task_id']
  const vals = F.map((f) => (v[f] === '' || v[f] === undefined ? null : v[f])) // the list window only sets some fields
  try {
    DB.run('BEGIN')
    if (emp) {
      DB.run(`UPDATE employees SET ${F.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...vals, emp.id])
      if (shiftFrom) DB.run('INSERT OR REPLACE INTO employee_shifts (employee_id, group_id, from_date) VALUES (?, ?, ?)', [emp.id, +v.shift_group_id, shiftFrom])
    } else {
      DB.run(`INSERT INTO employees (${F.join(', ')}) VALUES (${F.map(() => '?').join(', ')})`, vals)
      const id = DB.one('SELECT last_insert_rowid() AS id').id
      DB.run('INSERT INTO employee_shifts (employee_id, group_id, from_date) VALUES (?, ?, ?)', [id, +v.shift_group_id, v.hire_date || '2000-01-01'])
    }
    DB.run('COMMIT')
  } catch (err) {
    DB.run('ROLLBACK')
    return void UI.message(/UNIQUE/.test(err?.message ?? err) ? `كود الموظف ${v.code} مستخدم لموظف آخر` : `تعذّر الحفظ: ${err?.message ?? err}`)
  }
  DB.audit(emp ? 'تعديل موظف' : 'إضافة موظف', `${v.code} — ${v.name_ar}`, shiftFrom ? `دوام جديد من ${shiftFrom}` : '')
  await DB.flush()
  UI.message(emp ? 'تم الحفظ' : 'تمت إضافة الموظف')
  return v.code
}
