// Apex Time «إعداد مواعيد العمل» (المواعيد of a shift group), as Apex does it: «الدوام ينتهي اليوم التالي»
// + «نهاية اليوم» for the whole group, a tab per weekday, and in each day «هذا اليوم أجازة», «عدد ساعات العمل»
// and الفترة الأولى … الرابعة × (تبدأ من · إلى · التأخير المسموح · الخروج المبكر المسموح). An open shift's day
// holds only أجازة + its working hours. «تكرار» copies the day shown to every working day.
// Like Apex, saving never argues with the user: a period without both times is ignored, a working day with
// no period is a day off, and the punch windows the engine needs are worked out here, never typed:
//   in-window  = from 4 h before «تبدأ من» (or half-way from the previous period) to the middle of the period
//   out-window = from the middle of the period to 4 h after «إلى» (or half-way to the next period); the
//   last period runs to «نهاية اليوم» on the next day when the shift ends the next day, else to midnight.
const DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
const WIN_NAMES = ['الفترة الأولى', 'الفترة الثانية', 'الفترة الثالثة', 'الفترة الرابعة']
// [state key, shift_windows column, Apex header]
const COLS = [['b', 'check_in', 'تبدأ من'], ['e', 'check_out', 'إلى'], ['late', 'late_min', 'التأخير المسموح'], ['early', 'early_min', 'الخروج المبكر المسموح']]
const isHHMM = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '')
const toMin = (t) => (isHHMM(t) ? +t.slice(0, 2) * 60 + +t.slice(3) : null)
const hm = (m) => Engine.hm(((m % 1440) + 1440) % 1440)
const MARGIN = 240 // minutes a first / last period's punch window reaches before its start / after its end
const mins = (v) => Math.min(999, Math.max(0, parseInt(v, 10) || 0))

// a working day's periods → the engine's windows ([] = nothing usable → day off)
function apexWindows(periods, ext, dayEnd) {
  const abs = []
  let base = 0
  for (const p of periods) {
    if (!isHHMM(p.b) || !isHHMM(p.e)) continue
    let b = toMin(p.b) + base
    if (abs.length && b < abs.at(-1).e && ext && base === 0) { base = 1440; b += 1440 } // a later period after midnight
    if (abs.length && b < abs.at(-1).e) b = abs.at(-1).e // overlapping periods: this one starts where the last ended
    let e = toMin(p.e) + base
    while (e <= b) e += 1440
    abs.push({ b, e, late: mins(p.late), early: mins(p.early) })
  }
  const end = ext && isHHMM(dayEnd) ? 1440 + toMin(dayEnd) : null
  return abs.map((a, i) => {
    const prev = abs[i - 1], next = abs[i + 1]
    // every time must follow the one before it (the engine reads a time that goes back as the next day)
    const si = prev ? Math.min(a.b, Math.round((prev.e + a.b) / 2) + (a.b > prev.e ? 1 : 0)) : Math.max(a.b < 1440 ? 0 : 1440, a.b - MARGIN)
    const eo = next ? Math.max(a.e, Math.round((a.e + next.b) / 2))
      : end != null ? Math.max(a.e, end) : a.e < 1440 ? Math.max(a.e, Math.min(a.e + MARGIN, 1439)) : a.e + MARGIN
    const mid = Math.min(Math.max(Math.round((a.b + a.e) / 2), a.b + a.late), a.e)
    return { start_in: hm(si), check_in: hm(a.b), late_min: a.late, end_in: hm(mid), start_out: hm(mid), early_min: a.early,
      check_out: hm(a.e), end_out: hm(eo), extended: !next && eo >= 1440 ? 1 : 0, _min: a.e - a.b }
  })
}

function openShiftTimes(group, onSaved) {
  const g = DB.one('SELECT * FROM shift_groups WHERE id = ?', [group.id])
  const open = !!g.open_shift
  UI.openWindow(`shift-times-${g.id}`, 'إعداد مواعيد العمل', { width: 1060, height: open ? 400 : 470 }, (body, win) => {
    const all = DB.all("SELECT * FROM shift_windows WHERE group_id = ? AND calendar = 'Y' ORDER BY slot, window_no", [g.id])
    // «الدوام ينتهي اليوم التالي» / «نهاية اليوم»: the group's, or read back from its windows
    const extRow = all.find((r) => r.extends_next_day || r.extended)
    const head = { ext: !!(g.extended ?? extRow), end: g.day_end || extRow?.day_end || (extRow?.extended ? extRow.end_out : '') || '' }
    // one entry per weekday: { off, periods: [{ b, e, late, early }] × 4 } or, open shift, { off, hours }
    const days = DAYS.map((_, d) => {
      const rows = all.filter((r) => r.slot === d)
      const off = rows.length ? !!rows[0].is_off : d === 6
      if (open) return { off, hours: rows[0]?.required_min != null ? Engine.hm(rows[0].required_min) : '' }
      const live = rows.filter((r) => !r.is_off)
      return { off, periods: [0, 1, 2, 3].map((i) => Object.fromEntries(COLS.map(([k, col]) => [k, live[i]?.[col] != null ? String(live[i][col]) : k === 'late' || k === 'early' ? '0' : '']))) }
    })
    let cur = 0
    const state = () => JSON.stringify([head, days])
    // what is on disk — closing with anything else asks first (times used to vanish when the window was closed before «حفظ»)
    let saved = state()
    win.onClose(async () => {
      read()
      if (state() === saved) return true
      UI.focus(`shift-times-${g.id}`)
      const ans = await UI.dialog({ head: 'تأكيد', msg: true, width: 420,
        bodyHtml: '<div class="msg-icon q">?</div><div class="msg-text">لم يتم حفظ مواعيد العمل. هل تريد حفظ التغييرات قبل الإغلاق؟</div>',
        buttons: [{ label: 'حفظ', icon: 'save', onClick: (d) => d.close('save') }, { label: 'عدم الحفظ', icon: 'close', onClick: (d) => d.close('drop') },
          { label: 'إلغاء', icon: 'cancel', onClick: (d) => d.close('cancel') }] })
      if (ans === 'drop') return true
      if (ans === 'save') return save()
      return false
    })

    const bar = UI.toolbar([
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
      <div class="st-next"><label><input type="checkbox" id="st-ext" ${head.ext ? 'checked' : ''}> الدوام ينتهي اليوم التالي</label>
        <label>نهاية اليوم <input type="text" id="st-end" data-time dir="ltr" maxlength="5" value="${UI.esc(head.end)}" ${head.ext ? '' : 'disabled'}></label></div>
      <div class="st-tabs">${DAYS.map((d, i) => `<button type="button" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="st-day"><div class="band">إعدادات الدوام</div><div class="st-body"></div></div></div>`)
    body.append(bar, view)
    const $ = (q) => view.querySelector(q)
    view.querySelectorAll('.st-tabs button').forEach((b) => (b.onclick = () => { read(); cur = +b.dataset.d; draw() }))
    $('#st-ext').addEventListener('change', () => { $('#st-end').disabled = !$('#st-ext').checked })

    // the shown day's inputs → state
    function read() {
      head.ext = $('#st-ext').checked
      head.end = $('#st-end').value.trim()
      const d = days[cur], box = $('.st-body')
      d.off = box.querySelector('#st-off').checked
      if (open) { d.hours = box.querySelector('#st-hours').value.trim(); return }
      box.querySelectorAll('tr[data-i]').forEach((tr) => {
        const p = d.periods[+tr.dataset.i]
        for (const [k] of COLS) p[k] = tr.querySelector(`[data-f=${k}]`).value.trim()
      })
    }
    const dayTotal = (d) => apexWindows(d.periods, head.ext, head.end).reduce((s, w) => s + w._min, 0)
    function draw() {
      view.querySelectorAll('.st-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.d === cur))
      const d = days[cur], dis = d.off ? 'disabled' : ''
      const off = `<label class="off"><input type="checkbox" id="st-off" ${d.off ? 'checked' : ''}> هذا اليوم أجازة</label>`
      $('.st-body').innerHTML = open
        ? `<div class="st-row">${off}<label class="hrs">عدد ساعات العمل <input type="text" id="st-hours" data-time dir="ltr" maxlength="5" value="${UI.esc(d.hours)}" ${dis}></label></div>`
        : `<div class="st-row">${off}<label class="hrs">عدد ساعات العمل <input type="text" id="st-hours" dir="ltr" readonly value="${Engine.hm(dayTotal(d))}"></label></div>
          <table class="st-grid"><thead><tr><th></th>${COLS.map(([, , h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
          ${d.periods.map((p, i) => `<tr data-i="${i}"><th>${WIN_NAMES[i]}</th>${COLS.map(([k]) =>
            `<td><input type="text" data-f="${k}" class="${k === 'late' || k === 'early' ? 'wide' : ''}" ${k === 'late' || k === 'early' ? 'data-num maxlength="3"' : 'data-time maxlength="5"'} dir="ltr" value="${UI.esc(p[k])}" ${dis}></td>`).join('')}</tr>`).join('')}
          </tbody></table>`
      $('#st-off').addEventListener('change', () => { read(); draw() })
    }
    if (!open) $('.st-body').addEventListener('input', () => { read(); $('#st-hours').value = Engine.hm(dayTotal(days[cur])) })

    async function save() {
      if (WebSync.blocks('shift_groups')) return false
      read()
      const ext = head.ext, end = ext && isHHMM(head.end) ? head.end : null
      const plan = days.map((d) => {
        if (d.off) return null
        if (open) return isHHMM(d.hours) && toMin(d.hours) > 0 ? toMin(d.hours) : null
        const ws = apexWindows(d.periods, ext, end)
        return ws.length ? ws : null
      })
      DB.run('BEGIN')
      DB.run('DELETE FROM shift_windows WHERE group_id = ?', [g.id])
      DB.run('DELETE FROM rotation_blocks WHERE group_id = ?', [g.id]) // a former rotating shift becomes a weekly one
      plan.forEach((p, d) => {
        if (p == null) return DB.run("INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off) VALUES (?, 'Y', ?, 1, 1)", [g.id, d])
        if (open) return DB.run("INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off, required_min, extends_next_day, day_end) VALUES (?, 'Y', ?, 1, 0, ?, ?, ?)", [g.id, d, p, end ? 1 : 0, end])
        p.forEach((w, i) => DB.run(`INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off, start_in, check_in, late_min, end_in, start_out, early_min, check_out, end_out, extended)
          VALUES (?, 'Y', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [g.id, d, i + 1, w.start_in, w.check_in, w.late_min, w.end_in, w.start_out, w.early_min, w.check_out, w.end_out, w.extended]))
      })
      const total = plan.reduce((s, p) => s + (p == null ? 0 : open ? p : p.reduce((t, w) => t + w._min, 0)), 0)
      DB.run('UPDATE shift_groups SET total_minutes = ?, rotational = 0, extended = ?, day_end = ? WHERE id = ?', [total, ext ? 1 : 0, ext ? head.end || null : null, g.id])
      DB.run('COMMIT')
      DB.audit('حفظ المواعيد', g.name_ar)
      await DB.flush()
      onSaved?.()
      UI.message('تم حفظ البيانات بنجاح.')
      // a day with nothing usable became a day off, as Apex shows it
      days.forEach((d, i) => { if (plan[i] == null) d.off = true })
      draw()
      saved = state()
      return true
    }
    draw()
  })
}
