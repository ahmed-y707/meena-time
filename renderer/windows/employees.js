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
  UI.openWindow('employees', 'الموظفين', { width: 1200 }, (body, win) => {
    let rows = [], q = '', dep = '', status = 'الكل', page = 1, size = 25
    const can = (a) => Perm.can(win.permKey, a)
    const I = empInfo()
    const deptOpts = depOptions()
    const bar = UI.el('<div class="toolbar list-bar"></div>')
    bar.append(UI.searchBox('بحث بالكود أو الاسم', (v) => { q = v; page = 1; draw() }))
    const filt = UI.el(`<div class="tb-filter"><select id="emp-dep" aria-label="الإدارة"><option value="">كل الإدارات</option><option value="0">بدون قسم</option>${deptOpts.map(([v, l]) => `<option value="${v}">${UI.esc(l)}</option>`).join('')}</select></div>`)
    filt.querySelector('select').addEventListener('change', (e) => { dep = e.target.value; page = 1; load() })
    bar.append(filt, UI.exportMenu('الموظفين', () => allTable()))
    bar.append(UI.toolbar([{ key: 'new', label: 'اضافة', icon: 'new', onClick: add }]).firstChild)
    const card = UI.el(`<div class="apex-card"><div class="grid-wrap"><table class="apex-table"><thead><tr><th>كود الموظف</th><th>اسم الموظف</th><th>الاسم الأجنبي</th><th>الوظيفة</th><th>الإدارة</th><th>القسم</th><th>الدوام</th><th>الحالة</th><th class="apex-col-actions"></th></tr></thead><tbody></tbody></table></div><div class="pager"></div></div>`)
    body.append(bar, card)
    const tbody = card.querySelector('tbody')
    function load() {
      const ids = dep === '0' ? 'AND e.department_id IS NULL AND e.section_id IS NULL'
        : dep ? `AND (e.department_id IN (${UI.deptIds(+dep)}) OR e.section_id IN (${UI.deptIds(+dep)}))` : ''
      rows = DB.all(`SELECT e.* FROM employees e WHERE 1 = 1 ${ids} ORDER BY CAST(e.code AS INTEGER), e.code`)
      draw()
    }
    const shown = () => {
      const s = q.toLowerCase()
      return !s ? rows : rows.filter((r) => [r.code, r.name_ar, r.name_en].some((v) => String(v ?? '').toLowerCase().includes(s)))
    }
    const rowHtml = (r) => {
      const x = I(r)
      return `<tr data-id="${r.id}"><td>${UI.esc(r.code)}</td><td><span class="apex-link">${UI.esc(r.name_ar)}</span></td><td dir="ltr" style="text-align:right">${UI.esc(r.name_en)}</td><td>${UI.esc(x.job)}</td><td>${UI.esc(x.dep)}</td><td>${UI.esc(x.sec)}</td><td>${UI.esc(x.shift)}</td><td>${UI.esc(r.status)}</td>
        <td class="apex-col-actions"><div class="row-acts">${can('edit') ? `<button type="button" class="apex-icon-edit" data-a="edit" title="تعديل" aria-label="تعديل">${ic('pencil')}</button>` : ''}${can('del') ? `<button type="button" class="apex-icon-delete" data-a="del" title="حذف" aria-label="حذف">${ic('trash-2')}</button>` : ''}${can('edit') ? `<button type="button" class="apex-icon-more" data-a="move" title="نقل الموظف الى قسم اخر" aria-label="نقل الموظف الى قسم اخر">${ic('ellipsis-vertical')}</button>` : ''}</div></td></tr>`
    }
    const allTable = () => {
      const t = card.querySelector('table').cloneNode(true)
      t.querySelector('tbody').innerHTML = shown().map(rowHtml).join('')
      return t
    }
    function draw() {
      const list = shown()
      const pageCount = Math.max(1, Math.ceil(list.length / size))
      page = Math.min(page, pageCount)
      const from = (page - 1) * size
      tbody.innerHTML = list.slice(from, from + size).map(rowHtml).join('') || `<tr><td class="empty" colspan="9">${UI.emptyState(rows.length ? undefined : 'لا يوجد موظفون')}</td></tr>`
      const pager = card.querySelector('.pager')
      pager.innerHTML = ''
      if (list.length > 5) pager.append(UI.pagination({ page, pageCount, pageSize: size, onPage: (p) => { page = p; draw() }, onSize: (n) => { size = n; page = 1; draw() } }))
    }
    // a new employee joins the department / section chosen in the filter
    function add() {
      const d = +dep > 0 && DB.one('SELECT id, parent_id FROM departments WHERE id = ?', [+dep])
      openEmployeeForm(null, load, d ? (d.parent_id ? { department_id: d.parent_id, section_id: d.id } : { department_id: d.id }) : {})
    }
    tbody.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a, r = rows.find((x) => String(x.id) === e.target.closest('tr[data-id]')?.dataset.id)
      if (!a || !r) return
      if (a === 'edit') openEmployeeForm(r, load)
      if (a === 'del') remove(r)
      if (a === 'move') moveEmployee(r)
    })
    tbody.addEventListener('dblclick', (e) => {
      const r = rows.find((x) => String(x.id) === e.target.closest('tr[data-id]')?.dataset.id)
      if (r && !e.target.closest('button') && can('edit')) openEmployeeForm(r, load)
    })
    async function moveEmployee(r) {
      if (WebSync.blocks('employees')) return
      let picked = null
      const pending = UI.dialog({ head: 'نقل الموظف الى قسم اخر', width: 480, cls: 'apex-dlg', bodyHtml: '<div id="mv-tree"></div>',
        buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => (picked ? d.close(true) : d.error('اختر القسم أو الإدارة')) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(false) }] })
      document.querySelector('#mv-tree').appendChild(UI.deptTree((id) => { picked = id }, { title: 'الأقسام والإدارات', apex: true, icons: true }))
      if (!(await pending)) return
      const d = DB.one('SELECT * FROM departments WHERE id = ?', [picked])
      DB.run('UPDATE employees SET department_id = ?, section_id = ? WHERE id = ?', d.parent_id ? [d.parent_id, d.id, r.id] : [d.id, null, r.id])
      DB.audit('نقل موظف', `${r.code} — ${r.name_ar}`, d.name_ar)
      await DB.flush()
      load()
    }
    async function remove(r) {
      if (WebSync.blocks('employees')) return
      if (!(await UI.confirm(`حذف الموظف «${r.name_ar}»؟`, 'تأكيد الحذف'))) return
      if (DB.one('SELECT 1 FROM punches WHERE emp_code = ? LIMIT 1', [r.code]) || DB.one('SELECT 1 FROM posted_attendance WHERE employee_id = ? LIMIT 1', [r.id]))
        return UI.message('للموظف حركات مسجلة — غيّر حالته إلى «منتهي»، أو استخدم «الغاء بيانات موظف»')
      DB.run('DELETE FROM employee_shifts WHERE employee_id = ?', [r.id])
      DB.run('DELETE FROM employees WHERE id = ?', [r.id])
      DB.audit('حذف موظف', `${r.code} — ${r.name_ar}`)
      await DB.flush()
      load()
    }
    load()
  })
}

// Apex «الإعدادات» of an employee (the cog in «الموظفون»), in Apex's order and wording
const EMP_SETTINGS = [['ot_before', 'اتاحة احتساب الوقت الاضافى قبل الدوام'], ['ot_deduct_late', 'اتاحة خصم التاخير من الوقت الاضافى'],
  ['ot_holidays', 'اتاحة احتساب الاضافى ايام الاجازات'], ['ot_after', 'اتاحة احتساب الوقت الاضافى بعد الدوام'], ['no_punch_out', 'تسجيل حركة الانصراف تلقائيا']]
const EMP_SET_WARNING = 'في حاله التعديلات علي دوام الموظف او الاعدادات الخاصه به يجب إلغاء الحركات والترحيل مره اخرى وذلك للحساب علي اخر تعديل'

// the full employee form (Apex «الاعدادات»); `prefill` seeds a new employee from the list window
function openEmployeeForm(emp, onSaved, prefill = {}) {
  const isNew = !emp
  const e = emp ? { ...emp } : { status: 'نشط', ...Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== '' && v != null)) }
  const sel = (field, options) => `<select data-f="${field}"><option value=""></option>${options.map(([v, l]) =>
    `<option value="${UI.esc(v)}" ${String(v) === String(e[field] ?? '') ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}</select>`
  const txt = (field, attrs = '') => `<input type="text" data-f="${field}" value="${UI.esc(e[field] ?? '')}" ${attrs}>`
  const date = (field) => `<input type="date" data-f="${field}" value="${UI.esc(e[field] ?? '')}">`
  const chk = (field, label) => `<label class="chk"><input type="checkbox" data-f="${field}" ${e[field] ? 'checked' : ''}> ${label}</label>`
  const deps = opts('departments', 'WHERE parent_id IS NULL OR parent_id = ""')()
  const secs = opts('departments', 'WHERE parent_id IS NOT NULL AND parent_id <> ""')()

  UI.openWindow(`emp-${emp?.id || 'new'}`, isNew ? 'اضافة موظف' : `تعديل موظف — ${emp.name_ar}`, { width: 1000 }, (body, win) => {
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
      </div></fieldset>
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
  // like Apex, an employee has one shift: a change applies to every day not yet posted («ترحيل»)
  const shiftChanged = emp && String(v.shift_group_id) !== String(emp.shift_group_id)
  const F = ['code', 'name_ar', 'name_en', 'status', 'job_id', 'department_id', 'section_id', 'group_id', 'project_id', 'shift_group_id',
    'hire_date', 'gender', 'nationality_id', 'national_id', 'religion', 'birth_date', 'mobile', 'email', 'address',
    'ot_deduct_late', 'ot_before', 'ot_after', 'ot_holidays', 'no_punch_out', 'attendance_method', 'photo', 'task_id']
  const vals = F.map((f) => (v[f] === '' || v[f] === undefined ? null : v[f])) // the list window only sets some fields
  try {
    DB.run('BEGIN')
    if (emp) {
      DB.run(`UPDATE employees SET ${F.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...vals, emp.id])
      if (shiftChanged) {
        DB.run('DELETE FROM employee_shifts WHERE employee_id = ?', [emp.id])
        DB.run('INSERT INTO employee_shifts (employee_id, group_id, from_date) VALUES (?, ?, ?)', [emp.id, +v.shift_group_id, '2000-01-01'])
      }
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
  DB.audit(emp ? 'تعديل موظف' : 'إضافة موظف', `${v.code} — ${v.name_ar}`, shiftChanged ? 'تغيير الدوام' : '')
  await DB.flush()
  UI.message(emp ? 'تم الحفظ' : 'تمت إضافة الموظف')
  return v.code
}
