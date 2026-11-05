// «لوحة القيادة» (components/hr-dashboard-public.tsx): today's attendance from the local database.
// Shows while no page is open; the topbar's «الإدارة» picks a department.
const Dashboard = {
  department: null,
  CARDS: [
    ['present', 'الحضور', 'user-check', 'var(--apex-chart-present)'], ['absent', 'الغياب', 'user-x', 'var(--apex-chart-absent)'], ['leave', 'الاجازات', 'umbrella', 'var(--apex-chart-leave)'],
    ['holiday', 'عطلات رسمية', 'calendar-days', 'var(--apex-chart-neutral-icon)'], ['off', 'عطلة اسبوعية', 'calendar-days', 'var(--apex-chart-neutral-icon)'], ['waiting', 'في الانتظار', 'alarm-clock', 'var(--apex-amber)'],
  ],
  render() {
    const desk = document.getElementById('desktop')
    desk.querySelector('#home')?.remove()
    const today = Engine.today(), dep = this.department
    const rows = Engine.compute({ from: today, to: today, departmentId: dep })
    const count = (k) => rows.filter((r) => r.kind === k).length
    const total = DB.one(`SELECT COUNT(*) AS n FROM employees WHERE status = 'نشط' ${dep ? `AND (department_id IN (${UI.deptIds(dep)}) OR section_id IN (${UI.deptIds(dep)}))` : ''}`).n
    // donut
    const parts = this.CARDS.slice(0, 3).map(([k, , , c]) => [count(k), c]).filter(([n]) => n)
    const sum = parts.reduce((s, [n]) => s + n, 0) || 1, R = 70, L = 2 * Math.PI * R
    let at = 0
    const arcs = parts.map(([n, c]) => { const len = (n / sum) * L, a = `<circle cx="88" cy="88" r="${R}" fill="none" stroke="${c}" stroke-width="24" stroke-dasharray="${len} ${L - len}" stroke-dashoffset="${-at}"/>`; at += len; return a }).join('')
    // today's movements
    const who = dep ? `AND (e.department_id IN (${UI.deptIds(dep)}) OR e.section_id IN (${UI.deptIds(dep)}))` : ''
    const moves = DB.all(`SELECT p.ts, e.code, e.name_ar, e.photo FROM punches p JOIN employees e ON e.code = p.emp_code WHERE p.ts >= ? AND p.ts < ? ${who} ORDER BY p.ts DESC LIMIT 60`, [today, Engine.addDays(today, 1)])
    // per department
    const deps = DB.all("SELECT id, name_ar FROM departments WHERE parent_id IS NULL OR parent_id = '' ORDER BY name_ar")
    const STACK = [['present', 'var(--apex-chart-present)', 'حاضر'], ['absent', 'var(--apex-chart-absent)', 'غائب'], ['leave', 'var(--apex-chart-leave)', 'اجازة']]
    const bars = deps.map((d) => {
      const ids = UI.deptIds(d.id), mine = rows.filter((r) => ids.includes(r.emp.department_id) || ids.includes(r.emp.section_id))
      const n = mine.length
      return !n ? '' : `<div class="dash-bar"><div class="t"><span>${UI.esc(d.name_ar)}</span><span>${n}</span></div><div class="b">${STACK.map(([k, c, l]) => { const v = mine.filter((r) => r.kind === k).length; return v ? `<span title="${l}: ${v}" style="width:${(v / n) * 100}%;background:${c}"></span>` : '' }).join('')}</div></div>`
    }).join('')
    // last 10 days
    const days = Array.from({ length: 10 }, (_, i) => Engine.addDays(today, i - 9))
    const perDay = Object.fromEntries(DB.all(`SELECT substr(p.ts, 1, 10) AS d, COUNT(*) AS n FROM punches p JOIN employees e ON e.code = p.emp_code WHERE p.ts >= ? ${who} GROUP BY d`, [days[0]]).map((r) => [r.d, r.n]))
    const top = Math.max(1, ...days.map((d) => perDay[d] || 0))
    const home = UI.el(`<div id="home" class="dash" data-testid="hr-dashboard">
      <div class="dash-row">
        <div class="dash-panel dash-donut"><div class="dring"><svg viewBox="0 0 176 176" width="176" height="176" style="transform:rotate(-90deg)"><circle cx="88" cy="88" r="${R}" fill="none" stroke="var(--apex-chart-grid)" stroke-width="24"/>${arcs}</svg>
          <div class="mid"><span>إجمالي الموظفين</span><span id="dash-total">${total}</span></div></div></div>
        <div class="dash-panel dash-sum"><h2>ملخص حضور اليوم</h2><div class="dash-tiles">${this.CARDS.map(([k, l, i, c]) => `<button type="button" class="dash-tile" data-k="${k}"><span class="i" style="color:${c}">${ic(i)}</span><span class="l">${l}</span><span class="n" style="color:${c}">${count(k)}</span></button>`).join('')}</div></div>
      </div>
      <div class="dash-2">
        <div class="dash-panel"><h2>حركات اليوم</h2><div class="dash-moves">${moves.length ? `<table><thead><tr><th style="width:60px">الصورة</th><th style="width:90px">كود الموظف</th><th>الاسم</th><th style="width:120px">الحركة</th></tr></thead><tbody>${moves.map((m) => `<tr><td><span class="av">${m.photo ? `<img src="${m.photo}" alt="">` : ic('user')}</span></td><td>${UI.esc(m.code)}</td><td>${UI.esc(m.name_ar)}</td><td dir="ltr" style="text-align:right">${m.ts.slice(11, 16)}</td></tr>`).join('')}</tbody></table>` : '<div class="none">لا توجد حركات</div>'}</div></div>
        <div class="dash-panel"><h2>ملخص الحضور في الإدارات</h2><div class="dash-bars">${bars || '<div class="none">لا توجد بيانات</div>'}</div><div class="dash-legend">${STACK.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div></div>
      </div>
      <div class="dash-panel"><h2>حركات اخر 10 ايام</h2><div class="dash-trend">${days.map((d) => `<div class="c"><span class="n">${perDay[d] || 0}</span><div class="v" style="height:${((perDay[d] || 0) / top) * 80}%"></div><span dir="ltr">${d.slice(8)}/${d.slice(5, 7)}</span></div>`).join('')}</div></div>
    </div>`)
    home.querySelectorAll('.dash-tile').forEach((b) => (b.onclick = () => this.show(b.dataset.k, rows)))
    desk.prepend(home)
  },
  // a tile lists its employees
  show(kind, rows) {
    const [, label] = this.CARDS.find(([k]) => k === kind)
    const list = rows.filter((r) => r.kind === kind)
    UI.dialog({ head: `عرض ${label}`, x: true, width: 760, cls: 'apex-dlg', buttons: [],
      bodyHtml: `<div class="grid-wrap" style="max-height:60vh;width:100%"><table class="apex-table"><thead><tr><th>كود الموظف</th><th>الاسم</th><th>الدوام</th><th>الحضور</th></tr></thead><tbody>${list.map((r) => `<tr><td>${UI.esc(r.emp.code)}</td><td>${UI.esc(r.emp.name_ar)}</td><td>${UI.esc(r.shift)}</td><td dir="ltr" style="text-align:right">${r.in != null ? Engine.hm(r.in % 1440) : ''}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">لا توجد بيانات</td></tr>`}</tbody></table></div>` })
  },
}
