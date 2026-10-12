// «البيانات الأساسية» screens built on openGridWindow — one config each.
const opts = (table, where = '') => () =>
  DB.all(`SELECT id, name_ar FROM ${table} ${where} ORDER BY name_ar`).map((r) => [r.id, r.name_ar])
const inUse = (table, field, id, what) =>
  DB.one(`SELECT 1 FROM ${table} WHERE ${field} = ? LIMIT 1`, [id]) ? `لا يمكن الحذف: مستخدم في ${what}` : null

// Apex «نوع القائمة»: الوظائف · المهام · الديانة · ملاحظات الحضور · نوع الاجازة. Nationalities and
// permission categories are not edited here (a linked site sends its own).
const LIST_TYPES = [['job', 'الوظائف'], ['task', 'المهام'], ['religion', 'الديانة'], ['att_note', 'ملاحظات الحضور'], ['leave', 'نوع الاجازة']]
const listOptions = (type) => () => DB.all('SELECT id, name_ar FROM lists WHERE list_type = ? ORDER BY name_ar', [type]).map((r) => [r.id, r.name_ar])
const hhmm = (m) => `${String(Math.floor((m || 0) / 60)).padStart(2, '0')}:${String((m || 0) % 60).padStart(2, '0')}`

function openLists() {
  let type = 'job'
  openGridWindow({
    id: 'lists', title: 'قوائم البرنامج', table: 'lists', orderBy: 'id', width: 950, height: 440,
    buttons: ['new', 'save', 'undo', 'del', 'close'], idLabel: 'رقم البند', seqNo: true, // all list types share one table: number each list 1…n
    help: 'اختر نوع القائمة من «نوع القائمة» ثم أدخل الاسم (عربي أو انجليزي) واضغط «حفظ».',
    scope: () => ({ where: 'list_type = ?', params: [type], fixed: { list_type: type } }),
    caption: () => LIST_TYPES.find(([k]) => k === type)[1],
    side: (ctx) => {
      const el = UI.el(`<fieldset class="list-types"><legend>نوع القائمة</legend>${LIST_TYPES.map(([k, l]) => `<div class="lt ${k === type ? 'on' : ''}" data-k="${k}">${l}</div>`).join('')}</fieldset>`)
      el.addEventListener('click', (e) => {
        const t = e.target.closest('.lt'); if (!t) return
        type = t.dataset.k
        el.querySelectorAll('.lt').forEach((x) => x.classList.toggle('on', x === t))
        ctx.reload()
      })
      return el
    },
    columns: [
      { field: 'name_ar', label: 'اسم البند عربي', required: true },
      { field: 'name_en', label: 'اسم البند انجليزي', type: 'en' },
    ],
    beforeDelete: (r) => {
      if (type === 'religion') return DB.one('SELECT 1 FROM employees WHERE religion = ? LIMIT 1', [r.name_ar]) ? 'لا يمكن الحذف: مستخدم في بيانات الموظفين' : null
      const use = { job: ['employees', 'job_id'], nationality: ['employees', 'nationality_id'], leave: ['leaves', 'type_id'], permission: ['permissions', 'type_id'] }[type]
      return use ? inUse(use[0], use[1], r.id, use[0] === 'employees' ? 'بيانات الموظفين' : 'الإجازات/الأذونات') : null
    },
  })
}

// Apex «قوائم الأقسام والإدارات»: a tree (right) and the record (left). Viewing: the selected node's
// data; «رئيسي» adds a إدارة, «جديد» a قسم under the selected إدارة (adding: only حفظ / إهمال);
// حفظ confirms and selects the saved node; إهمال asks, then drops the changes. Numbers as in Apex:
// a إدارة is 1, 2, 3…, its sections 11, 12… (21, 22… under the second).
function openDepartments() {
  UI.openWindow('departments', 'قوائم الأقسام والإدارات', { width: 830, height: 540 }, (body, win) => {
    let cur = null      // the record shown: a department row, or {parent_id} while adding
    let adding = false, dirty = false
    const bar = UI.toolbar([
      { key: 'main', label: 'رئيسي', icon: 'i_dept', onClick: () => startAdd(null) },
      { key: 'new', label: 'جديد', icon: 'new', onClick: () => {
        if (!cur?.id) return UI.message('حدد الإدارة التي يتبعها القسم من الشجرة، أو اضغط «رئيسي» لإدارة جديدة')
        startAdd(cur.parent_id || cur.id)
      } },
      { key: 'save', label: 'حفظ', icon: 'save', onClick: save },
      { key: 'undo', label: 'إهمال', icon: 'undo', onClick: undo },
      { key: 'del', label: 'حذف', icon: 'del', onClick: remove },
      { key: 'print', label: 'طباعه', icon: 'print', onClick: print },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: async () => { if (!(adding || dirty) || (await askDrop())) win.close() } },
    ])
    const view = UI.el(`<div class="dept-win"><div class="dw-tree"></div>
      <div class="fields dw-form"><label>رقم القسم أو الإدارة</label><input type="text" id="dw-id" readonly>
        <label>الإسم العربي</label><input type="text" id="dw-ar"><label>الإسم الأجنبي</label><input type="text" id="dw-en" dir="ltr"></div></div>`)
    body.append(bar, view)
    const $ = (q) => view.querySelector(q)
    const all = () => DB.all('SELECT * FROM departments ORDER BY id')
    // Apex numbering: roots by order of creation, sections = parent number + position
    function codes(deps = all()) {
      const c = {}
      deps.filter((d) => !d.parent_id).forEach((d, i) => {
        c[d.id] = String(i + 1)
        deps.filter((x) => x.parent_id === d.id).forEach((x, k) => { c[x.id] = c[d.id] + (k + 1) })
      })
      return c
    }
    const FOLDER = '<svg class="ti" viewBox="0 0 16 16"><path d="M1 3h5l1.5 1.5H15V13H1z" fill="#7cc242" stroke="#4c8a1e" stroke-width=".8"/></svg>'
    const LEAF = '<svg class="ti" viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="#9be15d" stroke="#4c8a1e" stroke-width=".8"/></svg>'
    function tree(selId) {
      const deps = all()
      const node = (d) => {
        const kids = deps.filter((x) => x.parent_id === d.id)
        return `<li class="${kids.length ? 'open' : ''}">${kids.length ? '<span class="tog">−</span>' : ''}<span class="tn" data-id="${d.id}">${d.parent_id ? LEAF : FOLDER}${UI.esc(d.name_ar)}</span>${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`
      }
      const t = UI.el(`<div class="dept-tree apex-tree"><ul>${deps.filter((d) => !d.parent_id).map(node).join('')}</ul></div>`)
      t.addEventListener('click', async (e) => {
        const tog = e.target.closest('.tog')
        if (tog) { const li = tog.parentElement; li.classList.toggle('open'); tog.textContent = li.classList.contains('open') ? '−' : '+'; return }
        const n = e.target.closest('.tn')
        if (!n || adding) return // while adding, حفظ or إهمال first (as in Apex)
        if (dirty && !(await askDrop())) return
        show(+n.dataset.id)
      })
      $('.dw-tree').replaceChildren(t)
      mark(selId)
    }
    const mark = (id) => view.querySelectorAll('.apex-tree .tn').forEach((x) => x.classList.toggle('on', +x.dataset.id === id))
    function sync() {
      const off = adding ? { main: 1, new: 1, del: 1, print: 1, close: 0, save: 0, undo: 0 } : { main: 0, new: 0, del: !cur?.id, print: 0, close: 0, save: !dirty, undo: !dirty }
      for (const b of bar.querySelectorAll('button[data-key]')) b.disabled = !!off[b.dataset.key] || !!b.dataset.permOff
      $('#dw-ar').disabled = $('#dw-en').disabled = !cur
    }
    function show(id) {
      cur = id ? DB.one('SELECT * FROM departments WHERE id = ?', [id]) : null
      adding = dirty = false
      $('#dw-id').value = cur ? codes()[cur.id] : ''
      $('#dw-ar').value = cur?.name_ar || ''
      $('#dw-en').value = cur?.name_en || ''
      mark(cur?.id)
      sync()
    }
    function startAdd(parentId) {
      const deps = all(), c = codes(deps)
      const siblings = deps.filter((d) => (d.parent_id || null) === parentId).length
      cur = { parent_id: parentId }
      adding = true; dirty = false
      $('#dw-id').value = (parentId ? c[parentId] : '') + (siblings + 1)
      $('#dw-ar').value = ''; $('#dw-en').value = ''
      sync()
      $('#dw-ar').focus()
    }
    for (const f of ['#dw-ar', '#dw-en']) $(f).addEventListener('input', () => { if (!adding) { dirty = true; sync() } })
    const askDrop = () => UI.dialog({ head: 'تأكيد', msg: true, bodyHtml: '<div class="msg-icon">i</div><div class="msg-text">سيتم حذف جميع التعديلات، هل أنت متأكد؟</div>', width: 360,
      buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => d.close(true) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(false) }] })
    async function undo() {
      if (!(await askDrop())) return
      const back = adding ? (cur.parent_id || all()[0]?.id) : cur?.id
      show(back || null)
    }
    async function save() {
      if (!cur) return
      if (WebSync.blocks('departments')) return
      const ar = $('#dw-ar').value.trim(), en = $('#dw-en').value.trim()
      if (!ar) return UI.message('الإسم العربي مطلوب')
      if (DB.one("SELECT 1 FROM departments WHERE name_ar = ? AND COALESCE(parent_id, 0) = COALESCE(?, 0) AND id <> ?", [ar, cur.parent_id || null, cur.id || 0]))
        return UI.message('الاسم مكرر في نفس المستوى')
      let id = cur.id
      if (id) DB.run('UPDATE departments SET name_ar = ?, name_en = ? WHERE id = ?', [ar, en, id])
      else { DB.run('INSERT INTO departments (name_ar, name_en, parent_id) VALUES (?, ?, ?)', [ar, en, cur.parent_id || null]); id = DB.one('SELECT last_insert_rowid() AS id').id }
      DB.audit('الأقسام والإدارات', ar)
      await DB.flush()
      await UI.message('تم حفظ البيانات بنجاح.')
      tree(id); show(id)
    }
    async function remove() {
      if (!cur?.id) return UI.message('حدد الإدارة أو القسم من الشجرة')
      if (WebSync.blocks('departments')) return
      if (DB.one('SELECT 1 FROM departments WHERE parent_id = ? LIMIT 1', [cur.id])) return UI.message('لا يمكن الحذف: توجد أقسام تابعة لهذه الإدارة')
      if (DB.one('SELECT 1 FROM employees WHERE department_id = ? OR section_id = ? LIMIT 1', [cur.id, cur.id])) return UI.message('لا يمكن حذف السجل لانه مرتبط بعمليات اخري (موظفين)')
      if (DB.one('SELECT 1 FROM devices WHERE department_id = ? LIMIT 1', [cur.id])) return UI.message('لا يمكن حذف السجل لانه مرتبط بعمليات اخري (أجهزة)')
      if (!(await UI.confirm(`حذف «${cur.name_ar}»؟`))) return
      DB.run('DELETE FROM departments WHERE id = ?', [cur.id])
      DB.audit('حذف قسم/إدارة', cur.name_ar)
      await DB.flush()
      const parent = cur.parent_id
      tree(null); show(parent || all()[0]?.id || null)
    }
    function print() {
      const deps = all(), c = codes(deps)
      const rows = deps.filter((d) => !d.parent_id).flatMap((d) => [d, ...deps.filter((x) => x.parent_id === d.id)])
      UI.print(UI.letterhead('الأقسام والإدارات') + `<table class="rep"><thead><tr><th>الرقم</th><th>الإسم العربي</th><th>الإسم الأجنبي</th></tr></thead><tbody>${
        rows.map((d) => `<tr><td>${c[d.id]}</td><td>${d.parent_id ? '&nbsp;&nbsp;&nbsp;' : ''}${UI.esc(d.name_ar)}</td><td>${UI.esc(d.name_en || '')}</td></tr>`).join('')}</tbody></table>` + UI.reportFoot(), 'الأقسام والإدارات')
    }
    // opens on the first إدارة, as Apex does
    const first = all().find((d) => !d.parent_id)
    tree(first?.id); show(first?.id || null)
  })
}

function openProjects() {
  openGridWindow({
    id: 'projects', title: 'المشـــاريع', table: 'projects', width: 760,
    buttons: ['new', 'save', 'undo', 'del', 'print', 'close'], idLabel: 'كود المشروع',
    columns: [{ field: 'name_ar', label: 'اسم المشـــروع عربى', required: true }, { field: 'name_en', label: 'اسم المشــــروع انجليزى', type: 'en' }],
    beforeDelete: (r) => inUse('employees', 'project_id', r.id, 'بيانات الموظفين'),
  })
}

function openEmployeeGroups() {
  openGridWindow({
    id: 'employee-groups', title: 'مجموعات الموظفين', table: 'employee_groups', width: 760,
    buttons: ['members', 'new', 'save', 'undo', 'del', 'print', 'close'],
    // Apex: «الموظفون» (or double-click) opens the members screen
    extraButtons: [{ key: 'members', label: 'الموظفون', icon: 'people', onClick: (ctx) => {
      const r = ctx.currentRow
      if (!r || !r.id) return UI.message('اختر مجموعة محفوظة أولاً')
      openGroupMembers(r)
    } }],
    onRowOpen: (r) => r.id && openGroupMembers(r),
    columns: [{ field: 'name_ar', label: 'الاسم العربي', required: true }, { field: 'name_en', label: 'الاسم الأجنبي', type: 'en' }],
    beforeDelete: (r) => inUse('employees', 'group_id', r.id, 'بيانات الموظفين'),
  })
}

// Apex «الموظفون لمجموعة محددة»: employees without a group ⇄ this group's members.
// Double-click moves a row; إضافة / إضافة الكل / حذف / حذف الكل / بحث below.
function openGroupMembers(group) {
  UI.openWindow('group-members', 'الموظفون لمجموعة محددة', { width: 900, height: 520 }, (body, win) => {
    let q = ''
    const bar = UI.toolbar([{ key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() }])
    const list = (id, head) => `<div class="gm-list"><div class="gm-head">${UI.esc(head)}</div><div class="grid-wrap"><table class="grid">
      <thead><tr><th style="width:110px">رقم الموظف</th><th>اسم الموظف</th></tr></thead><tbody id="${id}"></tbody></table></div></div>`
    const view = UI.el(`<div class="group-members"><div class="gm-cols">${list('gm-free', 'الموظفون')}${list('gm-in', group.name_ar)}</div>
      <div class="gm-btns">
        <button data-a="add">${ICONS.new || ''}<span>إضافة</span></button><button data-a="addall">${ICONS.people || ''}<span>إضافة الكل</span></button>
        <button data-a="del">${ICONS.del || ''}<span>حذف</span></button><button data-a="delall">${ICONS.del || ''}<span>حذف الكل</span></button>
        <button data-a="find">${ICONS.search || ''}<span>بحث</span></button><span class="gm-q"></span></div></div>`)
    body.append(bar, view)
    const $ = (s) => view.querySelector(s)
    const sel = { free: null, in: null }
    const set = (ids, gid) => {
      if (!ids.length || WebSync.blocks('employees')) return
      DB.run(`UPDATE employees SET group_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [gid, ...ids])
      DB.audit(gid ? 'إضافة لمجموعة موظفين' : 'حذف من مجموعة موظفين', group.name_ar, `${ids.length} موظف`)
      DB.flush(); load()
    }
    function fill(tb, rows, key) {
      tb.innerHTML = rows.map((e) => `<tr data-id="${e.id}"><td class="center">${UI.esc(e.code)}</td><td class="center">${UI.esc(e.name_ar)}</td></tr>`).join('')
        || '<tr><td colspan="2" class="empty">لا يوجد</td></tr>'
      tb.querySelectorAll('tr[data-id]').forEach((tr) => {
        tr.addEventListener('mousedown', () => { sel[key] = +tr.dataset.id; tb.querySelectorAll('tr').forEach((x) => x.classList.toggle('current', x === tr)) })
        tr.addEventListener('dblclick', () => set([+tr.dataset.id], key === 'free' ? group.id : null))
      })
    }
    const ids = (tb) => [...$(tb).querySelectorAll('tr[data-id]')].map((tr) => +tr.dataset.id)
    function load() {
      const like = `%${q}%`, flt = "AND (? = '' OR code LIKE ? OR name_ar LIKE ?) ORDER BY CAST(code AS INTEGER), code"
      sel.free = sel.in = null
      fill($('#gm-free'), DB.all(`SELECT id, code, name_ar FROM employees WHERE (group_id IS NULL OR group_id = '') AND status = 'نشط' ${flt}`, [q, like, like]), 'free')
      fill($('#gm-in'), DB.all(`SELECT id, code, name_ar FROM employees WHERE group_id = ? ${flt}`, [group.id, q, like, like]), 'in')
      $('.gm-q').textContent = q ? `بحث: ${q}` : ''
    }
    view.querySelector('.gm-btns').addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a
      if (a === 'add') sel.free ? set([sel.free], group.id) : UI.message('حدد الموظف من قائمة «الموظفون»')
      else if (a === 'del') sel.in ? set([sel.in], null) : UI.message('حدد الموظف من قائمة المجموعة')
      else if (a === 'addall') set(ids('#gm-free'), group.id)
      else if (a === 'delall') set(ids('#gm-in'), null)
      else if (a === 'find') {
        const v = await UI.dialog({ head: 'بحث', width: 360, bodyHtml: '<div class="fields" style="grid-template-columns:110px 1fr"><label>رقم أو اسم الموظف</label><input type="text" id="gm-s"></div>',
          buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => d.close(d.root.querySelector('#gm-s').value.trim()) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(null) }] })
        if (v !== null) { q = v; load() }
      }
    })
    load()
  })
}

function openHolidays() {
  openGridWindow({
    id: 'holidays', title: 'قائمة العطلات الرسمية', table: 'holidays', orderBy: 'from_date', width: 900,
    buttons: ['new', 'save', 'undo', 'del', 'print', 'close'],
    columns: [
      { field: 'name_ar', label: 'الاسم العربي', required: true },
      { field: 'name_en', label: 'الاسم الأجنبي', type: 'en' },
      { field: 'from_date', label: 'بداية الأجازة', type: 'date', width: 150, required: true },
      { field: 'to_date', label: 'نهاية الأجازة', type: 'date', width: 150, required: true },
    ],
  })
}

// Apex «اعدادات الجهاز»: record form (كود · القسم · اسم الجهاز · نوع الاتصال | IP · Port) above the device grid.
// Apex «اعدادات الجهاز»: كود · القسم · اسم الجهاز · نوع الجهاز · نوع الاتصال, and the box of the chosen
// connection — TCP / IP: IP + Port · Serial: COM + Baud · Modem: COM + Baud + Phone + Dial mode.
// Meena reads ZKTeco devices over TCP / IP (communication key 0, the device default, as Apex);
// the other types / connections are kept for the record and read through «قراءة ملف الحركات».
const DEVICE_TYPES = [[1, 'ZKTeco'], [2, 'Timmy ZX_DF02'], [3, 'Timmy TM_F630'], [4, 'Timmy TM-AI06']]
const CONN_TYPES = ['TCP / IP', 'Serial', 'Modem']
// why a device can't be read over the network by Meena (null = it can)
function deviceNotReadable(d) {
  if ((d.machine_type || 1) !== 1) return `${d.name}: القراءة من الجهاز مباشرة متاحة لأجهزة ZKTeco فقط — استخدم «قراءة ملف الحركات» بملف من الجهاز`
  if ((d.conn_type || 'TCP / IP') !== 'TCP / IP') return `${d.name}: القراءة من الجهاز مباشرة عبر TCP / IP فقط — استخدم «قراءة ملف الحركات» بملف من الجهاز`
  if (!d.ip) return `${d.name}: لم يتم تحديد IP الجهاز`
  return null
}
function openDevices() {
  UI.openWindow('devices', 'اعدادات الجهاز', { width: 840, height: 520 }, (body, win) => {
    let cur = null
    const deps = () => DB.all('SELECT id, name_ar FROM departments ORDER BY name_ar')
    const bar = UI.toolbar([
      { key: 'new', label: 'جديد', icon: 'new', onClick: () => { edit({}); $('#dv-name').focus() } },
      { key: 'del', label: 'حذف', icon: 'del', onClick: remove },
      { key: 'save', label: 'حفظ', icon: 'save', onClick: save },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() },
    ])
    const view = UI.el(`<div class="dev-win"><fieldset><legend>إعدادات الجهاز</legend>
      <div class="fields dv-main"><label>كود الجهاز <b class="req">*</b></label><input type="text" id="dv-id" readonly>
        <label>القسم</label><div class="dv-dep"><input type="text" id="dv-dep" readonly><button id="dv-pick" title="اختيار القسم">…</button></div>
        <label>اسم الجهاز <b class="req">*</b></label><input type="text" id="dv-name">
        <label>نوع الجهاز <b class="req">*</b></label><select id="dv-type"><option value="">-</option>${DEVICE_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <label>نوع الاتصال</label><select id="dv-conn"><option value=""></option>${CONN_TYPES.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div class="dv-box">
        <div class="fields dv-net" data-conn="TCP / IP"><label>IP</label><input type="text" id="dv-ip" dir="ltr"><label>Port</label><input type="text" id="dv-port" data-num dir="ltr"></div>
        <div class="fields dv-net" data-conn="Serial"><label>COM</label><input type="text" id="dv-scom" dir="ltr"><label>Baud Rate</label><input type="text" id="dv-sbaud" data-num dir="ltr"></div>
        <div class="fields dv-net" data-conn="Modem"><label>COM</label><input type="text" id="dv-mcom" dir="ltr"><label>Baud Rate</label><input type="text" id="dv-mbaud" data-num dir="ltr">
          <label>Phone</label><input type="text" id="dv-mphone" data-num dir="ltr"><label>Dial Mode</label><select id="dv-mdial"><option>Tone</option><option>Pulse</option></select></div>
      </div>
    </fieldset>
    <div class="grid-wrap"><table class="grid"><thead><tr><th style="width:18px"></th><th style="width:90px">الكود</th><th>اسم الجهاز</th><th>القسم</th></tr></thead><tbody></tbody></table></div></div>`)
    body.append(bar, view)
    const $ = (s) => view.querySelector(s)
    const tb = view.querySelector('tbody')
    // only the chosen connection's box shows (none until one is chosen)
    const showConn = () => view.querySelectorAll('.dv-net').forEach((b) => { b.hidden = b.dataset.conn !== $('#dv-conn').value })
    $('#dv-conn').addEventListener('change', showConn)
    function edit(d) {
      cur = d
      // a new device shows the number it will get
      $('#dv-id').value = d.id || (DB.one('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM devices').n)
      $('#dv-dep').value = d.department_id ? `${deps().find((x) => x.id === d.department_id)?.name_ar || ''}:${d.department_id}` : ''
      $('#dv-dep').dataset.id = d.department_id || ''
      $('#dv-name').value = d.name || ''
      $('#dv-type').value = d.machine_type || ''
      $('#dv-conn').value = d.id ? d.conn_type || '' : ''
      $('#dv-ip').value = d.ip || ''
      $('#dv-port').value = d.port || ''
      $('#dv-scom').value = d.s_com || ''; $('#dv-sbaud').value = d.s_baud || (d.id ? '' : 115200)
      $('#dv-mcom').value = d.m_com || ''; $('#dv-mbaud').value = d.m_baud || (d.id ? '' : 115200)
      $('#dv-mphone').value = d.m_phone || ''; $('#dv-mdial').value = d.m_dial || 'Tone'
      showConn()
      tb.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('current', +tr.dataset.id === d.id))
      bar.querySelector('[data-key=del]')?.toggleAttribute('disabled', !d.id)
    }
    function load(selId) {
      const list = DB.all('SELECT v.*, d.name_ar AS dep FROM devices v LEFT JOIN departments d ON d.id = v.department_id ORDER BY v.id')
      tb.innerHTML = list.map((d) => `<tr data-id="${d.id}"><td class="sel"></td><td class="center">${d.id}</td><td class="center">${UI.esc(d.name)}</td><td class="center">${UI.esc(d.dep || '')}</td></tr>`).join('')
        || '<tr><td colspan="4" class="empty">لا توجد أجهزة — «جديد» لإضافة جهاز</td></tr>'
      tb.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('mousedown', () => edit(list.find((d) => d.id === +tr.dataset.id))))
      edit(list.find((d) => d.id === selId) || list[0] || {})
    }
    $('#dv-pick').onclick = async () => {
      const r = await UI.dialog({ head: 'القسم', width: 320, bodyHtml: '<div class="dv-tree"></div>',
        buttons: [{ label: 'بدون قسم', icon: 'cancel', onClick: (d) => d.close({ id: null }) }],
        onOpen: (d) => d.root.querySelector('.dv-tree').append(UI.deptTree((id, name) => id && d.close({ id, name }), { title: 'الاقسام', apex: true, icons: true })) })
      if (r) { $('#dv-dep').value = r.id ? `${r.name}:${r.id}` : ''; $('#dv-dep').dataset.id = r.id || '' }
    }
    async function save() {
      if (!cur) return
      const name = $('#dv-name').value.trim(), type = +$('#dv-type').value || null, conn = $('#dv-conn').value
      const ip = $('#dv-ip').value.trim(), port = $('#dv-port').value.trim() || '4370'
      if (!name) return UI.message('اسم الجهاز مطلوب')
      if (!type) return UI.message('نوع الجهاز مطلوب')
      if (conn === 'TCP / IP') {
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some((n) => +n > 255)) return UI.message('أدخل عنوان IP صحيح للجهاز (مثال 192.168.1.201)')
        if (!/^\d+$/.test(port) || +port < 1 || +port > 65535) return UI.message('Port: رقم من 1 إلى 65535')
      }
      if (conn === 'Serial' && !$('#dv-scom').value.trim()) return UI.message('COM مطلوب')
      if (conn === 'Modem' && (!$('#dv-mcom').value.trim() || !$('#dv-mphone').value.trim())) return UI.message('COM ورقم الهاتف مطلوبان')
      const f = { name, machine_type: type, conn_type: conn, department_id: +$('#dv-dep').dataset.id || null,
        ip: conn === 'TCP / IP' ? ip : null, port: conn === 'TCP / IP' ? +port : null,
        s_com: $('#dv-scom').value.trim(), s_baud: $('#dv-sbaud').value.trim(), m_com: $('#dv-mcom').value.trim(), m_baud: $('#dv-mbaud').value.trim(),
        m_phone: $('#dv-mphone').value.trim(), m_dial: $('#dv-mdial').value }
      const k = Object.keys(f), v = Object.values(f)
      if (cur.id) DB.run(`UPDATE devices SET ${k.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`, [...v, cur.id])
      else { DB.run(`INSERT INTO devices (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, v); cur.id = DB.one('SELECT last_insert_rowid() AS id').id }
      DB.audit('تعريف الأجهزة', name, conn === 'TCP / IP' ? ip : conn)
      await DB.flush()
      load(cur.id)
      UI.message('تم الحفظ')
    }
    async function remove() {
      if (!cur?.id) return UI.message('حدد الجهاز من الجدول')
      if (!(await UI.confirm(`حذف الجهاز «${cur.name}»؟`))) return
      DB.run('DELETE FROM devices WHERE id = ?', [cur.id])
      DB.audit('حذف جهاز', cur.name)
      await DB.flush()
      load(null)
    }
    load(null)
  })
}

function openShiftGroups() {
  openGridWindow({
    id: 'shift-groups', title: 'مجموعات أوقات الدوام', table: 'shift_groups',
    help: 'أدخل اسم المجموعة ثم «حفظ»، وحدد مواعيدها من زر «المواعيد».',
    columns: [
      { field: 'name_ar', label: 'الاسم العربي', required: true },
      { field: 'name_en', label: 'الاسم الأجنبي', type: 'en' },
      { field: 'total_minutes', label: 'الإجمالي', type: 'readonly', width: 80, format: hhmm },
      { field: 'open_shift', label: 'دوام مفتوح', type: 'check', width: 90 },
    ],
    width: 860,
    extraButtons: [{ key: 'times', label: 'المواعيد', icon: 'clock', viewOnly: true, onClick: (ctx) => {
      const r = ctx.currentRow
      if (!r || !r.id) return UI.message('اختر مجموعة محفوظة أولاً')
      openShiftTimes(r, ctx.reload)
    } }],
    onRowOpen: (r, ctx) => r.id && openShiftTimes(r, ctx.reload),
    beforeDelete: (r) => inUse('employee_shifts', 'group_id', r.id, 'بيانات الموظفين (حالياً أو سابقاً)'),
    onDeleteRow: (r) => {
      DB.run('DELETE FROM shift_windows WHERE group_id = ?', [r.id])
      DB.run('DELETE FROM rotation_blocks WHERE group_id = ?', [r.id])
      DB.run('DELETE FROM shift_groups WHERE id = ?', [r.id])
    },
  })
}
