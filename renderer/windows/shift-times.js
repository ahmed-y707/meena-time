// Apex «إعداد مواعيد العمل» (المواعيد of a shift group): a tab per weekday, and in each day
// «هذا اليوم أجازة», «عدد ساعات العمل» and الفترة الأولى … الرابعة × (تبدأ من · إلى · بداية الحضور ·
// نهاية الحضور · بداية الانصراف · نهاية الانصراف · التأخير · الخروج المبكر), with Apex's «هام جدا»
// note beside them. An open shift's day holds only أجازة + its working hours.
// «تكرار» copies the day shown to every day.
// Saving follows Apex: it refuses only an impossible time (✖, no message) and «تبدأ من» without «إلى»
// («أدخل موعد إنتهاء الفترة»). Times out of order get Apex's red ✖ when leaving the field, and still save.
// An «إلى» earlier than «تبدأ من» is on the next day, so a night period (22:00 → 06:00) needs no extra
// setting. Punch windows left empty are filled in: half-way to the neighbouring period, or 4 h before
// the first / after the last one.
const DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
const WIN_NAMES = ['الفترة الأولى', 'الفترة الثانية', 'الفترة الثالثة', 'الفترة الرابعة']
// [state key, shift_windows column, Apex header]
const COLS = [['b', 'check_in', 'تبدأ من'], ['e', 'check_out', 'إلى'], ['si', 'start_in', 'بداية الحضور'], ['ei', 'end_in', 'نهاية الحضور'],
  ['so', 'start_out', 'بداية الانصراف'], ['eo', 'end_out', 'نهاية الانصراف'], ['late', 'late_min', 'التأخير'], ['early', 'early_min', 'الخروج المبكر']]
const TIME_KEYS = ['b', 'e', 'si', 'ei', 'so', 'eo']
const isHHMM = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '')
const toMin = (t) => (isHHMM(t) ? +t.slice(0, 2) * 60 + +t.slice(3) : null)
const hm = (m) => Engine.hm(((m % 1440) + 1440) % 1440)
// [field, the field before it]: leaving the field with a time not after that one shows the ✖
const ORDER = { e: 'b', ei: 'si', so: 'ei', eo: 'so' }
const MARGIN = 240 // minutes a first / last period's punch window reaches before its start / after its end
const NOTE = 'في حاله التعديل علي دوام . وهذا الدوام ارتبط بموظفين يجب الغاء الحركات والترحيل مره اخري وذلك لحساب ساعات العمل علي الدوام الجديد ( الدوام المعدل )'

function openShiftTimes(group, onSaved) {
  const g = DB.one('SELECT * FROM shift_groups WHERE id = ?', [group.id])
  const open = !!g.open_shift
  UI.openWindow(`shift-times-${g.id}`, 'إعداد مواعيد العمل', { width: 1060, height: open ? 420 : 520 }, (body, win) => {
    // one entry per weekday: { off, periods: [{ b, e, si, ei, so, eo, late, early }] × 4 } or, open shift, { off, hours }
    // «أوقات رمضان» (calendar R): the same week with its own times, used inside a Ramadan period
    const load = (cal) => DAYS.map((_, d) => {
      const rows = DB.all('SELECT * FROM shift_windows WHERE group_id = ? AND calendar = ? AND slot = ? ORDER BY window_no', [g.id, cal, d])
      const off = rows.length ? !!rows[0].is_off : d === 6
      if (open) return { off, hours: rows[0]?.required_min != null ? Engine.hm(rows[0].required_min) : '' }
      const live = rows.filter((r) => !r.is_off)
      return { off, periods: [0, 1, 2, 3].map((i) => { const r = live.find((x) => x.window_no === i + 1); return Object.fromEntries(COLS.map(([k, col]) => [k, r?.[col] != null ? String(r[col]) : k === 'late' || k === 'early' ? '0' : ''])) }) }
    })
    const C = { Y: { days: load('Y') }, R: { days: load('R') } }
    let useR = !!DB.one("SELECT 1 FROM shift_windows WHERE group_id = ? AND calendar = 'R' LIMIT 1", [g.id])
    if (!useR) C.R.days = JSON.parse(JSON.stringify(C.Y.days)) // a starting point: the normal times
    for (const k of ['Y', 'R']) { C[k].bad = DAYS.map(() => new Set()); C[k].autos = DAYS.map(() => new Set()) }
    let cal = 'Y'
    let cur = 0
    let days = C.Y.days
    let bad = C.Y.bad // the ✖ fields of each day, as "period:field"
    // punch windows the program filled in (not typed): they follow the period if its times change,
    // so a later edit can't leave them pointing at the old times
    let autos = C.Y.autos
    const useCal = (k) => { cal = k; days = C[k].days; bad = C[k].bad; autos = C[k].autos }
    const AUTO_KEYS = ['si', 'ei', 'so', 'eo'], COL_OF = { si: 'start_in', ei: 'end_in', so: 'start_out', eo: 'end_out' }
    function findAutos(i) {
      autos[i] = new Set()
      if (open || days[i].off) return
      const rows = windowsOf({ periods: days[i].periods.map((p) => ({ ...p, si: '', ei: '', so: '', eo: '' })) })
      if (!Array.isArray(rows)) return
      for (const w of rows) for (const k of AUTO_KEYS) if (w.check_in && w.check_out && days[i].periods[w.window_no - 1][k] === w[COL_OF[k]]) autos[i].add(`${w.window_no - 1}:${k}`)
    }
    // what is on disk — closing with anything else asks first (times used to vanish when the window was closed before «حفظ»)
    const snapshot = () => JSON.stringify({ Y: C.Y.days, R: useR ? C.R.days : null })
    let saved = snapshot()
    win.onClose(async () => {
      read()
      if (snapshot() === saved) return true
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
      { key: 'help', label: 'مساعده', icon: 'help', onClick: () => UI.message('حدد مواعيد كل يوم من تبويبه: لكل فترة «تبدأ من» و«إلى» وأوقات بداية ونهاية الحضور والانصراف والتأخير والخروج المبكر المسموح بالدقائق.\n«تكرار» يطبق مواعيد اليوم المعروض على كل الأيام، ثم «حفظ».\nحدد «هذا اليوم أجازة» لأيام العطلة الأسبوعية.') },
      { key: 'repeat', label: 'تكرار', icon: 'i_repeat', onClick: async () => {
        read()
        if (!(await UI.confirm('سيتم تكرار مواعيد العمل لجميع أيام الأسبوع عدا أيام الاجازات هل أنت متأكد؟'))) return
        const src = JSON.stringify(days[cur])
        days.forEach((d, i) => { if (i !== cur && !d.off) { days[i] = JSON.parse(src); bad[i] = new Set(bad[cur]); autos[i] = new Set(autos[cur]) } })
        draw()
      } },
      { key: 'save', label: 'حفظ', icon: 'save', onClick: save },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: () => win.close() },
    ])
    const view = UI.el(`<div class="st-apex">
      <div class="st-group">مواعيد عمل المجموعة '${UI.esc(g.name_ar)}'</div>
      <div class="st-cal"><button type="button" data-c="Y">الأوقات العادية</button><button type="button" data-c="R">أوقات رمضان</button></div>
      <div class="st-ram" hidden><label class="off"><input type="checkbox" id="st-user"> لهذا الدوام أوقات خاصة في رمضان</label>
        <div class="st-ramp"><b>فترات رمضان</b> <span class="hint">(لكل الدوامات)</span> <span id="st-rlist"></span>
          <span class="add">من <input type="date" id="st-rfrom"> إلى <input type="date" id="st-rto"> <button type="button" id="st-radd" class="mini">إضافة</button></span></div></div>
      <div class="st-tabs">${DAYS.map((d, i) => `<button type="button" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="st-day"><div class="band">إعدادات الدوام</div><div class="st-body"></div></div></div>`)
    body.append(bar, view)
    const $ = (q) => view.querySelector(q)
    view.querySelectorAll('.st-tabs button').forEach((b) => (b.onclick = () => { read(); cur = +b.dataset.d; draw() }))
    view.querySelectorAll('.st-cal button').forEach((b) => (b.onclick = () => { read(); useCal(b.dataset.c); draw() }))
    $('#st-user').onchange = () => { read(); useR = $('#st-user').checked; draw() }
    const ymd = (s) => (s || '').split('-').reverse().join('/')
    function drawRamadan() {
      const list = DB.all('SELECT * FROM ramadan_periods ORDER BY from_date')
      $('#st-rlist').innerHTML = list.length ? list.map((r) => `<span class="chip">${ymd(r.from_date)} – ${ymd(r.to_date)} <button type="button" data-rdel="${r.id}" title="حذف">×</button></span>`).join('')
        : '<span class="hint">لا توجد — أضف فترة رمضان ليتم استخدام أوقاته</span>'
      $('#st-rlist').querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
        if (!(await UI.confirm('حذف فترة رمضان هذه؟'))) return
        DB.run('DELETE FROM ramadan_periods WHERE id = ?', [+b.dataset.rdel]); DB.audit('حذف', 'فترات رمضان', b.dataset.rdel); await DB.flush(); drawRamadan()
      }))
    }
    $('#st-radd').onclick = async () => {
      const f = $('#st-rfrom').value, t = $('#st-rto').value
      if (!f || !t) return UI.message('اختر تاريخ بداية ونهاية رمضان')
      if (t < f) return UI.message('تاريخ النهاية قبل تاريخ البداية')
      if (DB.one('SELECT 1 FROM ramadan_periods WHERE from_date <= ? AND to_date >= ?', [t, f])) return UI.message('هذه الفترة تتداخل مع فترة رمضان موجودة')
      DB.run('INSERT INTO ramadan_periods (from_date, to_date) VALUES (?, ?)', [f, t]); DB.audit('إضافة', 'فترات رمضان', `${f} – ${t}`); await DB.flush()
      $('#st-rfrom').value = $('#st-rto').value = ''
      drawRamadan()
    }

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
      return b == null || e == null ? s : s + (e >= b ? e - b : e + 1440 - b)
    }, 0)
    function draw() {
      view.querySelectorAll('.st-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.d === cur))
      view.querySelectorAll('.st-cal button').forEach((b) => b.classList.toggle('on', b.dataset.c === cal))
      $('.st-ram').hidden = cal !== 'R'
      $('#st-user').checked = useR
      if (cal === 'R') drawRamadan()
      const locked = cal === 'R' && !useR
      const d = days[cur], dis = d.off || locked ? 'disabled' : ''
      const off = `<label class="off"><input type="checkbox" id="st-off" ${d.off ? 'checked' : ''} ${locked ? 'disabled' : ''}> هذا اليوم أجازة</label>`
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
      if (!open) for (const key of bad[cur]) mark(key, true)
    }
    function mark(key, on) {
      const [i, k] = key.split(':')
      view.querySelector(`tr[data-i="${i}"] [data-f=${k}]`)?.closest('td').classList.toggle('st-bad', on)
    }
    // Apex checks a field as the cursor leaves it (after the typing mask has settled)
    if (!open) $('.st-body').addEventListener('focusout', (ev) => {
      const k = ev.target.dataset?.f, tr = ev.target.closest?.('tr[data-i]')
      if (!tr || !TIME_KEYS.includes(k)) return
      setTimeout(() => {
        if (!ev.target.isConnected) return
        read()
        const p = days[cur].periods[+tr.dataset.i], key = `${tr.dataset.i}:${k}`, v = p[k]
        const before = ORDER[k] && p[ORDER[k]]
        const wrong = !!v && (!isHHMM(v) || (isHHMM(before) && toMin(v) <= toMin(before) && !(k === 'eo' && v === '00:00')))
        if (wrong) bad[cur].add(key); else bad[cur].delete(key)
        mark(key, wrong)
      })
    })
    if (!open) $('.st-body').addEventListener('input', (ev) => {
      read()
      const f = ev.target.dataset?.f, row = ev.target.closest?.('tr[data-i]')?.dataset.i
      if (AUTO_KEYS.includes(f)) autos[cur].delete(`${row}:${f}`)
      else if (f) { // a period's times changed: empty what was filled in from the old ones, «حفظ» fills it again
        for (const key of autos[cur]) {
          const [i, k] = key.split(':')
          view.querySelector(`tr[data-i="${i}"] [data-f=${k}]`).value = ''
          days[cur].periods[+i][k] = ''
          bad[cur].delete(key); mark(key, false)
        }
        autos[cur].clear()
      }
      $('#st-hours').value = Engine.hm(dayTotal(days[cur]))
    })

    // a working day's periods → the rows to store. Refuses only what Apex refuses: returns
    // { field: "period:key" } for an impossible time, { message } for «تبدأ من» without «إلى».
    function windowsOf(d) {
      for (const [i, p] of d.periods.entries()) {
        const k = TIME_KEYS.find((x) => p[x] && !isHHMM(p[x]))
        if (k) return { field: `${i}:${k}` }
        if (p.b && !p.e) return { message: 'أدخل موعد إنتهاء الفترة' }
      }
      // the periods that have both «تبدأ من» and «إلى», on one time line, to fill in empty punch windows
      let prev = null
      const abs = []
      d.periods.forEach((p, i) => {
        if (!p.b || !p.e) return
        let b = toMin(p.b), e = toMin(p.e)
        while (prev != null && b < prev) b += 1440
        e += b - (b % 1440)
        if (e < b) e += 1440
        abs.push({ i, p, b, e, late: +p.late || 0, early: +p.early || 0 })
        prev = b
      })
      const out = {}
      abs.forEach((a, n) => {
        const before = n ? Math.round((abs[n - 1].e + a.b) / 2) + 1 : a.b - MARGIN
        const after = n < abs.length - 1 ? Math.round((a.e + abs[n + 1].b) / 2) : a.e + MARGIN
        const mid = Math.min(Math.max(Math.round((a.b + a.e) / 2), a.b + a.late), a.e - a.early)
        const si = Math.max(before, a.b - MARGIN, n ? -Infinity : a.e - 1439)
        out[a.i] = { si: a.p.si || hm(si), ei: a.p.ei || hm(mid), so: a.p.so || hm(mid),
          eo: a.p.eo || hm(Math.min(after, (n ? abs[0].b - MARGIN : si) + 1439)), extended: n === abs.length - 1 && !a.p.eo && a.e + MARGIN >= 1440 ? 1 : 0 }
      })
      const rows = []
      d.periods.forEach((p, i) => {
        if (!TIME_KEYS.some((k) => p[k]) && !(+p.late || +p.early)) return
        const t = out[i] || { si: p.si, ei: p.ei, so: p.so, eo: p.eo, extended: 0 }
        rows.push({ window_no: i + 1, start_in: t.si || null, check_in: p.b || null, late_min: +p.late || 0, end_in: t.ei || null, start_out: t.so || null,
          early_min: +p.early || 0, check_out: p.e || null, end_out: t.eo || null, extended: t.extended })
      })
      // a working day left empty stays a working day, as in Apex (it just has no periods to work)
      return rows.length ? rows : [{ window_no: 1, late_min: 0, early_min: 0, extended: 0 }]
    }

    async function save() {
      if (WebSync.blocks('shift_groups')) return false
      read()
      const plans = {}
      for (const k of useR ? ['Y', 'R'] : ['Y']) {
        const plan = (plans[k] = [])
        for (const [i, d] of C[k].days.entries()) {
          if (d.off) { plan.push(null); continue }
          if (open) {
            if (!isHHMM(d.hours) || toMin(d.hours) === 0) { useCal(k); cur = i; draw(); UI.message(`${k === 'R' ? 'رمضان — ' : ''}${DAYS[i]}: عدد ساعات العمل بصيغة HH:MM`); return false }
            plan.push(toMin(d.hours))
            continue
          }
          const ws = windowsOf(d)
          if (ws.field) { useCal(k); cur = i; bad[i].add(ws.field); draw(); $(`tr[data-i="${ws.field.split(':')[0]}"] [data-f=${ws.field.split(':')[1]}]`)?.focus(); return false }
          if (ws.message) { useCal(k); cur = i; draw(); UI.message(ws.message); return false }
          plan.push(ws)
        }
      }
      const plan = plans.Y
      DB.run('BEGIN')
      DB.run('DELETE FROM shift_windows WHERE group_id = ?', [g.id])
      DB.run('DELETE FROM rotation_blocks WHERE group_id = ?', [g.id]) // a former rotating shift becomes a weekly one
      for (const [k, pl] of Object.entries(plans)) pl.forEach((p, d) => {
        if (p == null) return DB.run('INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off) VALUES (?, ?, ?, 1, 1)', [g.id, k, d])
        if (open) return DB.run('INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off, required_min, extends_next_day, day_end) VALUES (?, ?, ?, 1, 0, ?, 0, NULL)', [g.id, k, d, p])
        p.forEach((w) => DB.run(`INSERT INTO shift_windows (group_id, calendar, slot, window_no, is_off, start_in, check_in, late_min, end_in, start_out, early_min, check_out, end_out, extended)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [g.id, k, d, w.window_no, w.start_in ?? null, w.check_in ?? null, w.late_min, w.end_in ?? null, w.start_out ?? null, w.early_min, w.check_out ?? null, w.end_out ?? null, w.extended]))
      })
      const total = plan.reduce((s, p, d) => s + (p == null ? 0 : open ? p : dayTotal(C.Y.days[d])), 0)
      DB.run('UPDATE shift_groups SET total_minutes = ?, rotational = 0 WHERE id = ?', [total, g.id])
      DB.run('COMMIT')
      DB.audit('حفظ المواعيد', g.name_ar)
      await DB.flush()
      onSaved?.()
      UI.message('تم حفظ البيانات بنجاح.')
      // show the filled-in punch windows
      const was = cal
      for (const [k, pl] of Object.entries(plans)) {
        useCal(k)
        days.forEach((d, i) => { if (!open && pl[i]) pl[i].forEach((w) => Object.assign(d.periods[w.window_no - 1], { si: w.start_in || '', ei: w.end_in || '', so: w.start_out || '', eo: w.end_out || '' })); findAutos(i) })
      }
      useCal(was)
      draw()
      saved = snapshot()
      return true
    }
    for (const k of ['Y', 'R']) { useCal(k); days.forEach((_, i) => findAutos(i)) }
    useCal('Y')
    draw()
  })
}
