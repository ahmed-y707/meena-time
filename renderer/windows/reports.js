// «التقارير» — Apex Time's report set and layouts (help manual 22–25, 34, 35 + its report
// templates). Every report: filter window (الفترة · الموظفون: قسم أو إدارة / أوقات عمل
// محددة / مجموعة محددة / أرقام الموظفين) → Engine rows → HTML under the company header,
// printed / saved as PDF / Excel. Trial: only TRIAL_REPORTS open, each printable 3 times.
const H = Engine.hm
const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] || 0), 0)
const byEmp = (rows) => {
  const m = new Map()
  for (const r of rows) { if (!m.has(r.emp.id)) m.set(r.emp.id, []); m.get(r.emp.id).push(r) }
  return [...m.values()]
}
const DAY_NAMES = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
const PERIOD_NAMES = ['الفترة الأولى', 'الفترة الثانية', 'الفترة الثالثة', 'الفترة الرابعة']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const esc = (v) => UI.esc(v ?? '')
const hmOrBlank = (m) => (m ? H(m) : '')

// employee details the Apex layouts print (job, department / section, project, shift)
function empInfo() {
  const lists = Object.fromEntries(DB.all('SELECT id, name_ar FROM lists').map((l) => [l.id, l.name_ar]))
  const deps = Object.fromEntries(DB.all('SELECT id, name_ar FROM departments').map((d) => [d.id, d.name_ar]))
  const projects = Object.fromEntries(DB.all('SELECT id, name_ar FROM projects').map((p) => [p.id, p.name_ar]))
  const shifts = Object.fromEntries(DB.all('SELECT id, name_ar FROM shift_groups').map((g) => [g.id, g.name_ar]))
  return (e) => ({ job: lists[e.job_id] || '', dep: deps[e.department_id] || '', sec: deps[e.section_id] || '', project: projects[e.project_id] || '', shift: shifts[e.shift_group_id] || '' })
}
// Apex «حالة اليوم» wording
function dayStatus(r, present = '') {
  if (r.kind === 'present') return present
  if (r.kind === 'absent') return 'غائب'
  if (r.kind === 'waiting') return 'في الانتظار'
  if (r.kind === 'leave') return r.status.replace('إجازة', 'أجازة')
  if (r.kind === 'holiday') return 'عطلة رسمية'
  return 'عطلة أسبوعية'
}
const redKinds = new Set(['absent', 'off', 'holiday'])
// «عدد ساعات الدوام» = time worked inside the schedule (total worked minus overtime)
const dutyMin = (r) => Math.max(0, (r.worked || 0) - (r.ot || 0))
const periodsOf = (r) => (r.windows?.length ? r.windows : r.in != null ? [{ in: r.in, out: r.out }] : [])

const table = (head, rows, foot) => `<table class="rep"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="empty">لا توجد بيانات</td></tr>`}</tbody>
  ${foot ? `<tfoot><tr>${foot.map((c) => `<td>${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}</table>`
// Apex: «خلال الفترة من» … «إلى» … in the bordered box under the title
const period = (f) => `<span class="per"><b>خلال الفترة من</b> <span dir="ltr">${f.from}</span></span><span class="per"><b>إلى</b> <span dir="ltr">${f.to}</span></span>`
// Apex «التفصيلي» employee block: 4 columns × 2 rows (رقم/اسم · الوظيفه/الدوام · الإدارة/القسم · الفترة)
const empSub = (e, I, f) => `<div class="rep-sub emp-grid">
  <span><b>رقم الموظف:</b> ${esc(e.code)}</span><span><b>الوظيفه :</b> ${esc(I.job)}</span><span><b>الإدارة:</b> ${esc(I.dep)}</span><span><b>خلال الفترة من:</b> <span dir="ltr">${f.from}</span></span>
  <span><b>اسم الموظف:</b> ${esc(e.name_ar)}</span><span><b>الــدوام:</b> ${esc(I.shift)}</span><span><b>القســـم:</b> ${esc(I.sec)}</span><span><b>إلـــى:</b> <span dir="ltr">${f.to}</span></span></div>`

const REPORTS = {
  'مواعيد العمل': { noPeriod: true, build: () => {
    const rows = []
    const kind = (g) => (g.open_shift ? 'دوام مفتوح' : 'دوام عادي')
    for (const g of DB.all('SELECT * FROM shift_groups ORDER BY id')) {
      const ws = DB.all("SELECT * FROM shift_windows WHERE group_id = ? AND calendar = 'Y' ORDER BY slot, window_no", [g.id])
      if (!ws.length) rows.push([g.name_ar, kind(g), '—', '', '', '', ''])
      for (const w of ws) {
        const slot = DAY_NAMES[w.slot]
        if (w.is_off) rows.push([g.name_ar, kind(g), slot, 'أجازة', '', '', ''])
        else if (g.open_shift) rows.push([g.name_ar, kind(g), slot, `${H(w.required_min)} ساعة`, '', '', w.extends_next_day ? `ينتهي في اليوم التالي ${w.day_end}` : ''])
        else rows.push([g.name_ar, kind(g), slot, `${WIN_NAMES[w.window_no - 1]}`, w.check_in, w.check_out, `${w.late_min} / ${w.early_min}`])
      }
    }
    return { head: ['المجموعة', 'النوع', 'اليوم', 'الفترة', 'تبدأ من', 'إلى', 'التأخير / الخروج المبكر المسموح'], rows }
  } },
  'الموظفون': { noPeriod: true, build: () => {
    const I = empInfo()
    const emps = DB.all('SELECT * FROM employees ORDER BY CAST(code AS INTEGER), code')
    return { head: ['م', 'كود الموظف', 'إسم الموظف', 'الوظيفه', 'الإدارة', 'القسم', 'المشروع', 'الدوام', 'تاريخ التعيين', 'الحالة'],
      rows: emps.map((e, i) => { const x = I(e); return [i + 1, e.code, e.name_ar, x.job, x.dep, x.sec, x.project, x.shift, e.hire_date, e.status] }) }
  } },
  'الحركات الغير مكتملة': { build: (f) => {
    const rows = Engine.compute(f).filter((r) => r.missingOut)
    const byDay = new Map()
    for (const r of rows) (byDay.get(r.date) || byDay.set(r.date, []).get(r.date)).push(r)
    return { html: `<div class="rep-sub">${period(f)}</div>` + ([...byDay].map(([d, rs]) => `<table class="rep"><tbody><tr class="day-head"><td colspan="5">${DAY_NAMES[rs[0].day]} ${d}</td></tr>
      <tr><th>كود الموظف</th><th>إسم الموظف</th><th>القســـم</th><th>حضــور</th><th>إنصــراف</th></tr>
      ${rs.map((r) => `<tr><td>${esc(r.emp.code)}</td><td>${esc(r.emp.name_ar)}</td><td>${esc(r.emp.sec || r.emp.dep)}</td><td>${H(r.in)}</td><td class="red">لا يوجد</td></tr>`).join('')}</tbody></table>`).join('') || '<p class="empty">لا توجد بيانات</p>') }
  } },
  'التأخير عن بداية الدوام اليومي': { singleDay: true, build: (f) => {
    const rs = Engine.compute(f).filter((r) => r.late)
    return { html: `<div class="rep-sub"><span>تأخير يوم: <b>${DAY_NAMES[Engine.DAY_INDEX(f.from)]} ${f.from}</b></span></div>` +
      table(['م', 'كود الموظف', 'إسم الموظف', 'القسم', 'بداية الدوام', 'وقت الحضور', 'التأخير'],
        rs.map((r, i) => [i + 1, r.emp.code, r.emp.name_ar, r.emp.sec || r.emp.dep, r.windows?.[0]?.check_in != null ? H(r.windows[0].check_in % 1440) : '', H(r.in), H(r.late)])) }
  } },
  'التأخير عن الدوام خلال فترة': { build: (f) => {
    const groups = byEmp(Engine.compute(f)).filter((rs) => rs.some((r) => r.late || r.early))
    return { html: `<div class="rep-sub">${period(f)}</div>` + table(['م', 'كود الموظف', 'إسم الموظف', 'القسم', 'أيام التأخير', 'التأخير', 'أيام الخروج المبكر', 'الخروج المبكر', 'الإجمـــــــالي'],
      groups.map((rs, i) => [i + 1, rs[0].emp.code, rs[0].emp.name_ar, rs[0].emp.sec || rs[0].emp.dep, rs.filter((r) => r.late).length, H(sum(rs, 'late')), rs.filter((r) => r.early).length, H(sum(rs, 'early')), H(sum(rs, 'late') + sum(rs, 'early'))])) }
  } },
  'أجازات الموظفين': { build: (f) => {
    const rows = DB.all(`SELECT e.code, e.name_ar, t.name_ar type, l.from_date, l.to_date, l.notes FROM leaves l JOIN employees e ON e.id = l.employee_id
      LEFT JOIN lists t ON t.id = l.type_id WHERE l.to_date >= ? AND l.from_date <= ? ${f.employeeIds ? `AND e.id IN (${f.employeeIds.join(',') || 0})` : ''} ORDER BY l.from_date`, [f.from, f.to])
    return { html: `<div class="rep-sub">${period(f)}</div>` + table(['م', 'كود الموظف', 'إسم الموظف', 'الأجازات', 'البداية', 'النهاية', 'المدة', 'الوصف'],
      rows.map((x, i) => [i + 1, x.code, x.name_ar, x.type, x.from_date, x.to_date, Engine.diffDays(x.from_date, x.to_date) + 1, x.notes])) }
  } },
  // Apex «تقرير الحضور والانصراف التفصيلي»: one page per employee, a حضور/انصراف pair per period
  'الحضور والانصراف تفصيلي': { build: (f, S) => {
    const n = +S.report_shifts || 4, I = empInfo()
    const blocks = byEmp(Engine.compute(f)).map((rs) => {
      const e = rs[0].emp
      const head = `<tr><th rowspan="2">اليوم</th><th rowspan="2">التاريخ</th>${PERIOD_NAMES.slice(0, n).map((p) => `<th colspan="2">${p}</th>`).join('')}
        <th rowspan="2">عدد ساعات الدوام</th><th rowspan="2">عدد ساعات التأخير</th><th rowspan="2">عدد ساعات الإضافي</th><th rowspan="2">ساعات العمل</th><th rowspan="2">حالة اليوم</th></tr>
        <tr>${'<th>حضور</th><th>انصراف</th>'.repeat(n)}</tr>`
      const body = rs.map((r) => {
        const ps = periodsOf(r)
        // data-* = the engine's values for the day (exports / tests read these, not cell positions)
        const data = `data-emp="${esc(e.code)}" data-date="${r.date}" data-in="${H(r.in)}" data-out="${H(r.out)}" data-late="${hmOrBlank(r.late)}" data-early="${hmOrBlank(r.early)}" data-ot="${hmOrBlank(r.ot)}" data-worked="${hmOrBlank(r.worked)}" data-status="${esc(r.status)}"`
        return `<tr ${data}><td>${DAY_NAMES[r.day]}</td><td dir="ltr">${r.date}</td>${Array.from({ length: n }, (_, k) => `<td>${H(ps[k]?.in != null ? ps[k].in % 1440 : null)}</td><td>${H(ps[k]?.out != null ? ps[k].out % 1440 : null)}</td>`).join('')}
          <td>${hmOrBlank(dutyMin(r))}</td><td>${hmOrBlank(r.late + r.early)}</td><td>${hmOrBlank(r.ot)}</td><td>${hmOrBlank(r.worked)}</td><td class="${redKinds.has(r.kind) ? 'red' : ''}">${esc(dayStatus(r))}</td></tr>`
      }).join('')
      const foot = `<tr><td colspan="${2 + 2 * n}">الإجمالي</td><td>${H(rs.reduce((s, r) => s + dutyMin(r), 0))}</td><td>${H(sum(rs, 'late') + sum(rs, 'early'))}</td><td>${H(sum(rs, 'ot'))}</td><td>${H(sum(rs, 'worked'))}</td><td></td></tr>`
      return `<div class="rep-emp">${empSub(e, I(e), f)}<table class="rep"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>`
    })
    return { html: blocks.join('') || '<p class="empty">لا توجد بيانات</p>' }
  } },
  // Apex «تقرير الحضور والانصراف الإجمالي»: ساعات العمل · التأخير · الغياب (hours) · الإضافي
  'الحضور والانصراف إجمالي': { build: (f) => {
    const I = empInfo()
    const groups = byEmp(Engine.compute(f))
    const absentMin = (rs) => rs.filter((r) => r.kind === 'absent').reduce((s, r) => s + (r.scheduled || 0), 0)
    const rows = groups.map((rs, i) => { const e = rs[0].emp, x = I(e); return [i + 1, e.code, e.name_ar, x.job, x.sec || x.dep, H(sum(rs, 'worked')), hmOrBlank(sum(rs, 'late') + sum(rs, 'early')), hmOrBlank(absentMin(rs)), hmOrBlank(sum(rs, 'ot'))] })
    const all = groups.flat()
    return { html: `<div class="rep-sub">${period(f)}</div>` + table(['م', 'رقم الموظف', 'إسم الموظف', 'الوظيفة', 'القسم', 'ساعات العمل', 'التأخير', 'الغياب', 'الإضافي'], rows,
      ['', '', 'الإجمالي', '', '', H(sum(all, 'worked')), H(sum(all, 'late') + sum(all, 'early')), H(groups.reduce((s, rs) => s + absentMin(rs), 0)), H(sum(all, 'ot'))]) }
  } },
  // Apex «تقرير الغياب»: grouped by day
  'الغياب خلال فترة': { build: (f) => {
    const I = empInfo()
    const rows = Engine.compute(f).filter((r) => r.kind === 'absent')
    const byDay = new Map()
    for (const r of rows) (byDay.get(r.date) || byDay.set(r.date, []).get(r.date)).push(r)
    return { html: `<div class="rep-sub"><span>الغياب خلال الفترة من <b dir="ltr">${f.from}</b></span><span>إلى <b dir="ltr">${f.to}</b></span></div>` +
      ([...byDay].sort((a, b) => a[0].localeCompare(b[0])).map(([d, rs]) => `<table class="rep"><tbody><tr class="day-head"><td colspan="6">الغياب يوم ${DAY_NAMES[rs[0].day]} — ${d}</td></tr>
        <tr><th>كود الموظف</th><th>إسم الموظف</th><th>الإدارة</th><th>القسم</th><th>المشروع</th><th>الدوام</th></tr>
        ${rs.map((r) => { const x = I(r.emp); return `<tr><td>${esc(r.emp.code)}</td><td>${esc(r.emp.name_ar)}</td><td>${esc(x.dep)}</td><td>${esc(x.sec)}</td><td>${esc(x.project)}</td><td>${esc(r.shift || x.shift)}</td></tr>` }).join('')}</tbody></table>`).join('') || '<p class="empty">لا يوجد غياب</p>') }
  } },
  // Apex «تقرير حالة اليوم»: مواعيد العمل + حضور/انصراف per period + مداوم / غائب
  'حالة اليوم': { singleDay: true, build: (f, S) => {
    const n = +S.report_shifts || 4, I = empInfo()
    const rows = Engine.compute(f)
    const head = `<tr><th rowspan="2">م</th><th rowspan="2">رقم الموظف</th><th rowspan="2">اسم الموظف</th><th rowspan="2">الوظيفة</th><th rowspan="2">القسم</th><th rowspan="2">مواعيد العمل</th>
      ${PERIOD_NAMES.slice(0, n).map((p) => `<th colspan="2">${p}</th>`).join('')}<th rowspan="2">الدوام</th><th rowspan="2">التأخير</th><th rowspan="2">الإضافي</th><th rowspan="2">ساعات العمل</th><th rowspan="2">حالة اليوم</th></tr>
      <tr>${'<th>حضور</th><th>انصراف</th>'.repeat(n)}</tr>`
    const body = rows.map((r, i) => {
      const x = I(r.emp), ps = periodsOf(r)
      const status = dayStatus(r, 'مداوم')
      return `<tr><td>${i + 1}</td><td>${esc(r.emp.code)}</td><td>${esc(r.emp.name_ar)}</td><td>${esc(x.job)}</td><td>${esc(x.sec || x.dep)}</td><td>${esc(r.shift || x.shift)}</td>
        ${Array.from({ length: n }, (_, k) => `<td>${H(ps[k]?.in != null ? ps[k].in % 1440 : null)}</td><td>${H(ps[k]?.out != null ? ps[k].out % 1440 : null)}</td>`).join('')}
        <td>${hmOrBlank(dutyMin(r))}</td><td>${hmOrBlank(r.late + r.early)}</td><td>${hmOrBlank(r.ot)}</td><td>${hmOrBlank(r.worked)}</td><td class="${r.kind === 'absent' ? 'red' : ''}">${esc(status)}</td></tr>`
    }).join('')
    return { html: `<div class="rep-sub"><span><b>${DAY_NAMES[Engine.DAY_INDEX(f.from)]}</b></span><span dir="ltr"><b>${f.from}</b></span></div>` +
      `<table class="rep"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${11 + 2 * n}" class="empty">لا توجد بيانات</td></tr>`}</tbody></table>` }
  } },
  // Apex «بيان تأخير الموظفين»: a month, one coloured cell per day (colours from «إعدادات النظام»)
  // Apex «حركات الموظفين»: each day's punches
  'الحضور والانصراف بالحركات': { build: (f) => ({
    html: `<div class="rep-sub">${period(f)}</div>` + table(['كود الموظف', 'إسم الموظف', 'التاريخ', 'اليوم', 'الحركات', 'حالة اليوم'],
      Engine.compute(f).filter((r) => r.punches.length || r.kind === 'absent').map((r) => [r.emp.code, r.emp.name_ar, r.date, DAY_NAMES[r.day], r.punches.map(H).join('  ·  '), dayStatus(r, r.status)])),
  }) },
}

// Apex «الموظفـــون» box: tick a criterion to enable its value
function empFilterHtml() {
  const opt = (rows) => rows.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')
  return `<fieldset class="fl-emp"><legend>الموظفـــون</legend>
        <label><input type="checkbox" id="rf-dep"> قســـم أو إدارة</label><select id="r-dep" disabled>${opt(depOptions())}</select>
        <label><input type="checkbox" id="rf-shift"> أوقات عمل محددة</label><select id="r-shift" disabled>${opt(DB.all('SELECT id, name_ar FROM shift_groups ORDER BY name_ar').map((g) => [g.id, g.name_ar]))}</select>
        <label><input type="checkbox" id="rf-group"> مجموعة محـددة</label><select id="r-group" disabled>${opt(DB.all('SELECT id, name_ar FROM employee_groups ORDER BY name_ar').map((g) => [g.id, g.name_ar]))}</select>
        <label><input type="checkbox" id="rf-codes"> أرقـام الموظفيـن</label><span class="codes"><span>مـن</span><input type="text" id="r-code-from" dir="ltr" disabled><span>إلـى</span><input type="text" id="r-code-to" dir="ltr" disabled></span>
      </fieldset>`
}
function wireEmpFilter(root) {
  for (const [chk, ...inputs] of [['#rf-dep', '#r-dep'], ['#rf-shift', '#r-shift'], ['#rf-group', '#r-group'], ['#rf-codes', '#r-code-from', '#r-code-to']]) {
    const c = root.querySelector(chk)
    c?.addEventListener('change', () => inputs.forEach((i) => { root.querySelector(i).disabled = !c.checked }))
  }
}
// the ticked criteria → reportEmployeeIds() input; null when the number range isn't numeric
function readEmpFilter(root) {
  const v = (id) => root.querySelector(id)?.value?.trim() || ''
  const on = (id) => !!root.querySelector(id)?.checked
  if (on('#rf-codes') && ((v('#r-code-from') && !/^\d+$/.test(v('#r-code-from'))) || (v('#r-code-to') && !/^\d+$/.test(v('#r-code-to'))))) return null
  return { dep: on('#rf-dep') && +v('#r-dep'), shift: on('#rf-shift') && +v('#r-shift'), group: on('#rf-group') && +v('#r-group'),
    codeFrom: on('#rf-codes') && v('#r-code-from'), codeTo: on('#rf-codes') && v('#r-code-to') }
}

// «الموظفون» filter of every Apex report: any combination of department/section, shift,
// employee group and an employee-number range → the matching employee ids (null = all)
function reportEmployeeIds(q) {
  if (!q.dep && !q.shift && !q.group && !q.codeFrom && !q.codeTo) return null
  const where = [], args = []
  if (q.dep) {
    const ids = [q.dep, ...DB.all('SELECT id FROM departments WHERE parent_id = ?', [q.dep]).map((d) => d.id)]
    where.push(`(department_id IN (${ids.join(',')}) OR section_id IN (${ids.join(',')}))`)
  }
  if (q.shift) { where.push('shift_group_id = ?'); args.push(q.shift) }
  if (q.group) { where.push('group_id = ?'); args.push(q.group) }
  if (q.codeFrom) { where.push('CAST(code AS INTEGER) >= ?'); args.push(+q.codeFrom) }
  if (q.codeTo) { where.push('CAST(code AS INTEGER) <= ?'); args.push(+q.codeTo) }
  return DB.all(`SELECT id FROM employees WHERE ${where.join(' AND ')}`, args).map((e) => e.id)
}
function depOptions() {
  const all = DB.all('SELECT id, name_ar, parent_id FROM departments ORDER BY name_ar')
  const out = []
  for (const d of all.filter((x) => !x.parent_id)) {
    out.push([d.id, d.name_ar])
    for (const s of all.filter((x) => x.parent_id === d.id)) out.push([s.id, `— ${s.name_ar}`])
  }
  return out
}

// Apex's window captions for the reports it has under another wording
const REPORT_TITLES = {
  'الحضور والانصراف تفصيلي': 'تقرير الحضور والانصراف التفصيلي',
  'الحضور والانصراف إجمالي': 'تقرير الحضور والانصراف الإجمالي',
  'حالة اليوم': 'تقرير حالة اليوم',
  'الغياب خلال فترة': 'تقرير الغياب',
}
// titles Apex prints on these reports
const REPORT_PRINT_TITLES = { 'الغياب خلال فترة': 'تقرير الغياب' }
const REPORT_ICONS = {
  'مواعيد العمل': 'r_doc', 'الموظفون': 'i_emp', 'الحركات الغير مكتملة': 'r_basket', 'التأخير عن بداية الدوام اليومي': 'i_clock',
  'التأخير عن الدوام خلال فترة': 'r_cal', 'أجازات الموظفين': 'i_holiday', 'الحضور والانصراف تفصيلي': 'r_pen', 'الحضور والانصراف إجمالي': 'i_edit',
  'الغياب خلال فترة': 'r_note', 'حالة اليوم': 'r_cal', 'الحضور والانصراف بالحركات': 'i_view',
}

function openReport(name) {
  const def = REPORTS[name]
  if (!licence.ok && !TRIAL_REPORTS.includes(name)) return UI.message('هذا التقرير متاح في النسخة المسجلة فقط — سجّل البرنامج من «مساعده ← تسجيل المنتج»')
  UI.openWindow(`rep-${name}`, REPORT_TITLES[name] || name, { width: 1060, height: 600 }, (body, win) => {
    const today = Engine.today()
    const opt = (rows) => rows.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')
    const periodHtml = def.noPeriod ? '' : def.month
      ? `<fieldset class="fl-per"><legend>الفتـــرة</legend><label>شهر</label><select id="r-month">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i === +today.slice(5, 7) - 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <label>السنة</label><input type="text" id="r-year" dir="ltr" value="${today.slice(0, 4)}" maxlength="4"></fieldset>`
      : `<fieldset class="fl-per"><legend>الفتـــرة</legend><label>مـــن</label><input type="date" id="r-from" value="${def.singleDay ? today : monthStart()}">
          <label>إلـــى</label><input type="date" id="r-to" value="${today}"></fieldset>`
    const empHtml = def.noPeriod ? '' : empFilterHtml()
    const filters = UI.el(`<div class="rep-filters">${periodHtml}${empHtml}<span class="trial-note"></span></div>`)
    const out = UI.el('<div class="report-out"></div>')
    const bar = UI.toolbar([
      { key: 'show', label: 'موافق', icon: 'ok', onClick: show },
      { key: 'print', label: 'طباعة', icon: 'print', onClick: () => output('print') },
      { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: () => output('pdf') },
      { key: 'excel', label: 'Excel', icon: 'excel', onClick: () => output('excel') },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() },
    ])
    body.append(bar, filters, out)
    wireEmpFilter(filters)
    let html = ''
    const note = () => {
      if (licence.ok) return
      const n = DB.one('SELECT n FROM print_counts WHERE report = ?', [name])?.n || 0
      filters.querySelector('.trial-note').textContent = `نسخة تجريبية — متبقي ${Math.max(0, 3 - n)} مرات طباعة`
    }
    // long periods can take a few seconds: paint «جاري الحساب…» before computing
    function show() {
      out.innerHTML = '<p class="empty">جاري الحساب…</p>'
      return new Promise((done) => setTimeout(() => { compute(); done() }, 30))
    }
    function compute() {
      const v = (id) => filters.querySelector(id)?.value?.trim() || ''
      const on = (id) => !!filters.querySelector(id)?.checked
      let from = v('#r-from'), to = def.singleDay ? v('#r-to') || from : v('#r-to')
      if (def.month) {
        const y = +v('#r-year'), m = +v('#r-month')
        if (!(y >= 2000 && y <= 2100)) { out.innerHTML = ''; return UI.message('سنة غير صحيحة') }
        from = `${y}-${String(m).padStart(2, '0')}-01`
        to = Engine.addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1)
      }
      if (!def.noPeriod && (!from || !to || from > to)) { out.innerHTML = ''; return UI.message('فترة غير صحيحة') }
      const q = readEmpFilter(filters)
      if (!q) { out.innerHTML = ''; return UI.message('أرقام الموظفين: أرقام فقط') }
      const f = { from, to, employeeIds: def.noPeriod ? null : reportEmployeeIds(q) }
      const S = Engine.settings()
      const res = def.build(f, S)
      html = UI.letterhead(res.title || REPORT_PRINT_TITLES[name] || REPORT_TITLES[name] || name, '', { inline: name === 'الحضور والانصراف تفصيلي' }) +
        (res.html ?? (res.grouped ? res.groups.map((g) => `<div class="rep-group">${esc(g.title)}</div>${table(res.head, g.rows, g.foot)}`).join('') || '<p class="empty">لا توجد بيانات</p>'
          : table(res.head, res.rows))) + UI.reportFoot()
      html = UI.slashDates(html) // Apex prints dates as yyyy/mm/dd
      out.innerHTML = html
    }
    // print / PDF / Excel all count as one «طباعة» against the trial allowance
    async function output(kind) {
      if (!html) await show()
      if (!html) return
      if (!licence.ok) {
        const n = DB.one('SELECT n FROM print_counts WHERE report = ?', [name])?.n || 0
        if (n >= 3) return UI.message('انتهت مرات الطباعة المتاحة لهذا التقرير في النسخة التجريبية')
        DB.run('INSERT INTO print_counts (report, n) VALUES (?, 1) ON CONFLICT(report) DO UPDATE SET n = n + 1', [name])
        await DB.flush()
        note()
      }
      const file = `${name} ${Engine.today()}`
      if (kind === 'excel') {
        const wb = XLSX.utils.book_new()
        out.querySelectorAll('table.rep').forEach((t, i) => {
          const ws = XLSX.utils.table_to_sheet(t, { raw: true })
          ws['!RTL'] = true
          // one sheet per table; names must be unique and ≤ 31 characters
          let title = (out.querySelectorAll('.rep-group')[i]?.textContent || name).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 26)
          if (wb.SheetNames.includes(title)) title = `${title.slice(0, 22)} (${i + 1})`
          XLSX.utils.book_append_sheet(wb, ws, title || `ورقة ${i + 1}`)
        })
        if (!wb.SheetNames.length) return UI.message('لا توجد بيانات للتصدير')
        wb.Workbook = { Views: [{ RTL: true }] }
        const res = await window.bridge.saveFile(`${file}.xlsx`, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), 'xlsx')
        if (res?.ok) UI.message(`تم الحفظ: ${res.path}`)
        return
      }
      if (kind === 'pdf') {
        const res = await window.bridge.savePdf(`${file}.pdf`, UI.docHtml(html))
        if (res?.ok) UI.message(`تم الحفظ: ${res.path}`)
        else if (res?.error) UI.message(res.error)
        return
      }
      await UI.print(html, name)
    }
    note()
    show()
  })
}
