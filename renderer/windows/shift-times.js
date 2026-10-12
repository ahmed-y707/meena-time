// Apex «إعداد مواعيد العمل» (المواعيد of a shift group): a tab per weekday, and in each day
// «هذا اليوم أجازة», «عدد ساعات العمل» and الفترة الأولى … الرابعة × (تبدأ من · إلى · بداية الحضور ·
// نهاية الحضور · بداية الانصراف · نهاية الانصراف · التأخير · الخروج المبكر), with Apex's «هام جدا»
// note beside them. An open shift's day holds only أجازة + its working hours.
// «تكرار» copies the day shown to every day.
// Times are in order through the day; a time earlier than the one before it is on the next day,
// so a night period (22:00 → 06:00) needs no extra setting. Punch windows left empty are filled in:
// half-way to the neighbouring period, or 4 h before the first / after the last one.
const DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
const WIN_NAMES = ['الفترة الأولى', 'الفترة الثانية', 'الفترة الثالثة', 'الفترة الرابعة']
// [state key, shift_windows column, Apex header]
const COLS = [['b', 'check_in', 'تبدأ من'], ['e', 'check_out', 'إلى'], ['si', 'start_in', 'بداية الحضور'], ['ei', 'end_in', 'نهاية الحضور'],
  ['so', 'start_out', 'بداية الانصراف'], ['eo', 'end_out', 'نهاية الانصراف'], ['late', 'late_min', 'التأخير'], ['early', 'early_min', 'الخروج المبكر']]
const TIME_KEYS = ['b', 'e', 'si', 'ei', 'so', 'eo']
const isHHMM = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '')
const toMin = (t) => (isHHMM(t) ? +t.slice(0, 2) * 60 + +t.slice(3) : null)
const hm = (m) => Engine.hm(((m % 1440) + 1440) % 1440)
const MARGIN = 240 // minutes a first / last period's punch window reaches before its start / after its end
const NOTE = 'في حاله التعديل علي دوام . وهذا الدوام ارتبط بموظفين يجب الغاء الحركات والترحيل مره اخري وذلك لحساب ساعات العمل علي الدوام الجديد ( الدوام المعدل )'

function openShiftTimes(group, onSaved) {
  const g = DB.one('SELECT * FROM shift_groups WHERE id = ?', [group.id])
  const open = !!g.open_shift
  UI.openWindow(`shift-times-${g.id}`, 'إعداد مواعيد العمل', { width: 1060, height: open ? 360 : 440 }, (body, win) => {
    // one entry per weekday: { off, periods: [{ b, e, si, ei, so, eo, late, early }] × 4 } or, open shift, { off, hours }
    const days = DAYS.map((_, d) => {
      const rows = DB.all("SELECT * FROM shift_windows WHERE group_id = ? AND calendar = 'Y' AND slot = ? ORDER BY window_no", [g.id, d])
      const off = rows.length ? !!rows[0].is_off : d === 6
      if (open) return { off, hours: rows[0]?.required_min != null ? Engine.hm(rows[0].required_min) : '' }
      const live = rows.filter((r) => !r.is_off)
      return { off, periods: [0, 1, 2, 3].map((i) => Object.fromEntries(COLS.map(([k, col]) => [k, live[i]?.[col] != null ? String(live[i][col]) : k === 'late' || k === 'early' ? '0' : '']))) }
    })
    let cur = 0

    const bar = UI.toolbar([
      { key: 'help', label: 'مساعده', icon: 'help', onClick: () => UI.message('حدد مواعيد كل يوم من تبويبه: لكل فترة «تبدأ من» و«إلى» وأوقات بداية ونهاية الحضور والانصراف والتأخير والخروج المبكر المسموح بالدقائق.\n«تكرار» يطبق مواعيد اليوم المعروض على كل الأيام، ثم «حفظ».\nحدد «هذا اليوم أجازة» لأيام العطلة الأسبوعية.') },
      { key: 'repeat', label: 'تكرار', icon: 'i_repeat', onClick: async () => {
        read()
        if (!(await UI.confirm('سيتم تكرار مواعيد العمل لجميع أيام الأسبوع عدا أيام الاجازات هل أنت متأكد؟'))) return
        const src = JSON.stringify(days[cur])
        days.forEach((d, i) => { if (i !== cur && !d.off) days[i] = JSON.parse(src) })
        draw()
      } },
      { key: 'save', label: 'حفظ', icon: 'save', onClick: save },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() },
    ])
    const view = UI.el(`<div class="st-apex">
      <div class="st-group">مواعيد عمل المجموعة '${UI.esc(g.name_ar)}'</div>
      <div class="st-tabs">${DAYS.map((d, i) => `<button type="button" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="st-day"><div class="band">إعدادات الدوام</div><div class="st-body"></div></div></div>`)
    body.append(bar, view)
    const $ = (q) => view.querySelector(q)
    view.querySelectorAll('.st-tabs button').forEach((b) => (b.onclick = () => { read(); cur = +b.dataset.d; draw() }))

    // the shown day's inputs → state
    function read() {
      const d = days[cur], box = $('.st-body')
      d.off = box.querySelector('#st-off').checked
      if (open) { d.hours = box.querySelector('#st-hours').value.trim(); return }
      box.querySelectorAll('tr[data-i]').forEach((tr) => {
        const p = d.periods[+tr.dataset.i]
        for (const [k] of COLS) p[k] = tr.querySelector(`[data-f=${k}]`).value.trim()
      })
    }
    const dayTotal = (d) => d.periods.reduce((s, p) => {
      const b = toMin(p.b), e = toMin(p.e)
      return b == null || e == null ? s : s + (e > b ? e - b : e + 1440 - b)
    }, 0)
    function draw() {
      view.querySelectorAll('.st-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.d === cur))
      const d = days[cur], dis = d.off ? 'disabled' : ''
      const off = `<label class="off"><input type="checkbox" id="st-off" ${d.off ? 'checked' : ''}> هذا اليوم أجازة</label>`
      $('.st-body').innerHTML = open
        ? `<div class="st-row">${off}<label class="hrs">عدد ساعات العمل <input type="text" id="st-hours" data-time dir="ltr" maxlength="5" value="${UI.esc(d.hours)}" ${dis}></label></div>`
        : `<div class="st-main"><div>
          <div class="st-row">${off}<label class="hrs">عدد ساعات العمل <input type="text" id="st-hours" dir="ltr" readonly value="${Engine.hm(dayTotal(d))}"></label></div>
          <table class="st-grid"><thead><tr><th></th>${COLS.map(([, , h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
          ${d.periods.map((p, i) => `<tr data-i="${i}"><th>${WIN_NAMES[i]}</th>${COLS.map(([k]) =>
            `<td><input type="text" data-f="${k}" ${k === 'late' || k === 'early' ? 'data-num maxlength="3"' : 'data-time maxlength="5"'} dir="ltr" value="${UI.esc(p[k])}" ${dis}></td>`).join('')}</tr>`).join('')}
          </tbody></table></div>
          <div class="st-note"><b>هام جدا</b><p>${NOTE}</p></div></div>`
      $('#st-off').addEventListener('change', () => { read(); draw() })
    }
    if (!open) $('.st-body').addEventListener('input', () => { read(); $('#st-hours').value = Engine.hm(dayTotal(days[cur])) })

    // a working day's periods → the engine's windows (or an error message)
    function windowsOf(d, name) {
      const ps = d.periods.map((p, i) => ({ ...p, i })).filter((p) => TIME_KEYS.some((k) => p[k]))
      if (!ps.length) return `${name}: أدخل مواعيد الفترة الأولى أو حدد «هذا اليوم أجازة»`
      if (ps.some((p, k) => p.i !== k)) return `${name}: أدخل الفترات بالترتيب بدون ترك فترة فارغة بينها`
      // check format, put «تبدأ من» / «إلى» on one time line (past midnight → +1440)
      let last = -1
      const abs = []
      for (const p of ps) {
        const where = `${name} — ${WIN_NAMES[p.i]}`
        if (!isHHMM(p.b) || !isHHMM(p.e)) return `${where}: «تبدأ من» و«إلى» بصيغة HH:MM`
        for (const k of ['si', 'ei', 'so', 'eo']) if (p[k] && !isHHMM(p[k])) return `${where}: الوقت بصيغة HH:MM`
        if (!/^\d{1,3}$/.test(p.late || '0') || !/^\d{1,3}$/.test(p.early || '0')) return `${where}: التأخير والخروج المبكر بالدقائق`
        let b = toMin(p.b), e = toMin(p.e)
        if (b <= last) return `${where}: الأوقات يجب أن تكون متتالية`
        if (e <= b) e += 1440
        abs.push({ p, where, b, e, late: +p.late || 0, early: +p.early || 0 })
        last = e
      }
      if (abs.at(-1).e - abs[0].b >= 1440) return `${name}: مدة الدوام أكثر من 24 ساعة`
      if (abs.slice(0, -1).some((a) => a.e >= 1440)) return `${name}: الفترة الأخيرة فقط يمكن أن تنتهي في اليوم التالي`
      // the punch windows: entered, or filled in
      const near = (m, ref) => { while (m < ref - 720) m += 1440; while (m > ref + 720) m -= 1440; return m }
      const out = []
      for (const [i, a] of abs.entries()) {
        const before = i ? Math.round((abs[i - 1].e + a.b) / 2) + 1 : a.b - MARGIN
        const after = i < abs.length - 1 ? Math.round((a.e + abs[i + 1].b) / 2) : a.e + MARGIN
        const mid = Math.min(Math.max(Math.round((a.b + a.e) / 2), a.b + a.late), a.e - a.early)
        const t = {
          si: a.p.si ? near(toMin(a.p.si), a.b) : Math.max(before, a.b - MARGIN, i ? -Infinity : a.e - 1439),
          ei: a.p.ei ? near(toMin(a.p.ei), a.b) : mid,
          so: a.p.so ? near(toMin(a.p.so), a.e) : mid,
        }
        t.eo = a.p.eo ? near(toMin(a.p.eo), a.e) : Math.min(after, (i ? out[0].si : t.si) + 1439)
        if (a.b + a.late >= a.e - a.early) return `${a.where}: التأخير والخروج المبكر أكبر من مدة الفترة`
        if (t.si > a.b) return `${a.where}: «بداية الحضور» يجب أن تكون قبل «تبدأ من»`
        if (t.ei <= a.b + a.late) return `${a.where}: «نهاية الحضور» يجب أن تكون بعد «تبدأ من» + التأخير`
        if (t.so < t.ei) return `${a.where}: «بداية الانصراف» لا يمكن أن يكون قبل «نهاية الحضور»`
        if (t.so >= a.e - a.early) return `${a.where}: «بداية الانصراف» يجب أن تكون قبل «إلى» - الخروج المبكر`
        if (t.eo < a.e) return `${a.where}: «نهاية الانصراف» لا يمكن أن يكون قبل «إلى»`
        if (i && t.si <= out[i - 1].eo) return `${a.where}: «بداية الحضور» لا يمكن أن يكون قبل «نهاية الانصراف» للفترة السابقة`
        out.push({ ...t, a })
      }
      if (out.at(-1).eo - out[0].si >= 1440) return `${name}: من «بداية الحضور» إلى «نهاية الانصراف» أكثر من 24 ساعة`
      return out.map(({ a, si, ei, so, eo }, i) => ({ start_in: hm(si), check_in: hm(a.b), late_min: a.late, end_in: hm(ei), start_out: hm(so), early_min: a.early,
        check_out: hm(a.e), end_out: hm(eo), extended: i === out.length - 1 && eo >= 1440 ? 1 : 0 }))
    }

    async function save() {
      if (WebSync.blocks('shift_groups')) return
      read()
      const plan = []
      for (const [i, d] of days.entries()) {
        if (d.off) { plan.push(null); continue }
        if (open) {
          if (!isHHMM(d.hours) || toMin(d.hours) === 0) { cur = i; draw(); return UI.message(`${DAYS[i]}: عدد ساعات العمل بصيغة HH:MM`) }
          plan.push(toMin(d.hours))
          continue
        }
        const ws = windowsOf(d, DAYS[i])
        if (typeof ws === 'string') { cur = i; draw(); return UI.message(ws) }
        plan.push(ws)
      }
      DB.run('BEGIN')
      DB.run('DELETE FROM shift_windows WHERE group_id = ?', [g.id])
      DB.run('DELETE FROM rotation_blocks WHERE group_id = ?', [g.id]) // a former rotating shift becomes a weekly one
      plan.forEach((p, d) => {
        if (p == null) return DB.run("INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off) VALUES (?, 'Y', ?, 1, 1)", [g.id, d])
        if (open) return DB.run("INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off, required_min, extends_next_day, day_end) VALUES (?, 'Y', ?, 1, 0, ?, 0, NULL)", [g.id, d, p])
        p.forEach((w, i) => DB.run(`INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off, start_in, check_in, late_min, end_in, start_out, early_min, check_out, end_out, extended)
          VALUES (?, 'Y', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [g.id, d, i + 1, w.start_in, w.check_in, w.late_min, w.end_in, w.start_out, w.early_min, w.check_out, w.end_out, w.extended]))
      })
      const total = plan.reduce((s, p, d) => s + (p == null ? 0 : open ? p : dayTotal(days[d])), 0)
      DB.run('UPDATE shift_groups SET total_minutes = ?, rotational = 0 WHERE id = ?', [total, g.id])
      DB.run('COMMIT')
      DB.audit('حفظ المواعيد', g.name_ar)
      await DB.flush()
      onSaved?.()
      UI.message('تم حفظ البيانات بنجاح.')
      // show the filled-in punch windows
      days.forEach((d, i) => { if (!open && plan[i]) plan[i].forEach((w, k) => Object.assign(d.periods[k], { si: w.start_in, ei: w.end_in, so: w.start_out, eo: w.end_out })) })
      draw()
    }
    draw()
  })
}
