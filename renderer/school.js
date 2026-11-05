// School edition («Masar Time — المدارس»): students instead of employees, live
// punches from the devices, and messages to guardians on late / absence.
//
// The heavy lifting is in the main process (lib/gate): it receives the punches,
// journals them and sends the messages even while this window is busy. Here we
//  • drain the journal into the database in batches (one save per batch, not per punch),
//  • tell the main process today's plan for every student (start, grace, leave),
//  • rename the vocabulary on screen and add the two school windows.

// ── vocabulary: employee → student, company → school, department → class ──
const Terms = (() => {
  const AR = 'ء-ي'
  const NB = '(^|[^' + AR + '])', NA = '(?![' + AR + '])'
  const PHRASES = [
    ['الإدارات والأقسام', 'المراحل والفصول'], ['مواعيد العمل', 'مواعيد الدوام'], ['أوقات العمل', 'مواعيد الدوام'], ['بيانات المؤسسه', 'بيانات المدرسة'],
    ['رقم الجوال', 'جوال ولي الأمر'], ['التليفون', 'جوال ولي الأمر'], ['Meena Time', 'Masar Time'],
  ]
  const RULES = [
    ...PHRASES.map(([a, b]) => [new RegExp(NB + a + NA, 'g'), (m, p) => p + b]),
    [new RegExp(NB + '(و|ف)?(بال|لل|كال|ال|ب|ل|ك)?موظف(ين|ون|ات|ة|ي|و|اً|ًا|ا)?(كم|هم|ها|ك|ه|نا)?' + NA, 'g'), (m, b, w = '', pre = '', suf = '', pron = '') => {
      let word = suf === 'ة' ? 'طالبة' : suf === 'ات' ? 'طالبات' : /^(اً|ًا|ا)$/.test(suf) ? 'طالباً' : suf ? 'طلاب' : 'طالب'
      if (pron && word === 'طالبة') word = 'طالبت'
      return b + w + pre + word + pron
    }],
    [new RegExp(NB + '(و|ف)?(بال|لل|ال)?(شرك|مؤسس)(ة|ه|ات)' + NA, 'g'), (m, b, w = '', pre = '', root, suf) => b + w + pre + (suf === 'ات' ? 'مدارس' : 'مدرسة')],
    [new RegExp(NB + '(و|ف)?(بال|لل|ال)(قسم|أقسام|اقسام)' + NA, 'g'), (m, b, w = '', pre, word) => b + w + pre + (word === 'قسم' ? 'فصل' : 'فصول')],
  ]
  const QUICK = /موظف|شرك|مؤسس|قسم|اقسام|أقسام|رقم الجوال|التليفون|مواعيد العمل|أوقات العمل|الإدارات|Meena Time/
  const fix = (s) => { if (!s || !QUICK.test(s)) return s; for (const [re, fn] of RULES) s = s.replace(re, fn); return s }
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, OPTION: 0 }
  const skip = (el) => { for (; el && el.nodeType === 1; el = el.parentElement) if (SKIP[el.tagName] || el.isContentEditable || el.hasAttribute('data-no-terms')) return true; return false }
  function walk(root) {
    if (root.nodeType === 3) { const n = fix(root.nodeValue); if (n !== root.nodeValue && !skip(root.parentElement)) root.nodeValue = n; return }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    for (let n = root.nodeType === 1 ? root : tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === 3) { const v = fix(n.nodeValue); if (v !== n.nodeValue && !skip(n.parentElement)) n.nodeValue = v }
      else for (const a of ['title', 'placeholder']) { const v = n.getAttribute(a); if (v) { const f = fix(v); if (f !== v) n.setAttribute(a, f) } }
    }
  }
  let queued = [], scheduled = false
  const mo = new MutationObserver((muts) => {
    for (const m of muts) m.type === 'characterData' ? queued.push(m.target) : m.addedNodes.forEach((n) => queued.push(n))
    if (!scheduled) { scheduled = true; Promise.resolve().then(() => { scheduled = false; const l = queued; queued = []; l.forEach(walk); const t = fix(document.title); if (t !== document.title) document.title = t }) }
  })
  return { fix, start() { walk(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true }) } }
})()

// ── today's plan for every student → the main process ──
function buildRoster(date = Engine.today()) {
  const cfg = Engine.loadConfig()
  const hist = {}
  for (const s of DB.all('SELECT employee_id, group_id, from_date FROM employee_shifts WHERE from_date <= ? ORDER BY from_date', [date])) hist[s.employee_id] = s.group_id
  const holiday = !!DB.one('SELECT 1 FROM holidays WHERE ? BETWEEN from_date AND to_date', [date])
  const onLeave = new Set(DB.all('SELECT employee_id FROM leaves WHERE ? BETWEEN from_date AND to_date', [date]).map((r) => r.employee_id))
  const students = {}
  for (const e of DB.all("SELECT id, code, name_ar, mobile, shift_group_id FROM employees WHERE status = 'نشط'")) {
    const sch = Engine.schedule(cfg, hist[e.id] ?? e.shift_group_id, date)
    const w = sch.kind === 'windows' ? sch.windows[0] : null
    students[e.code] = { n: e.name_ar, p: e.mobile || '', s: w ? w.check_in : null, g: w ? +w.late_min || 0 : 0, x: onLeave.has(e.id) ? 1 : 0 }
  }
  const first = {}
  for (const r of DB.all('SELECT emp_code, MIN(ts) AS t FROM punches WHERE ts >= ? AND ts < ? GROUP BY emp_code', [date, Engine.addDays(date, 1)]))
    first[r.emp_code] = +r.t.slice(11, 13) * 60 + +r.t.slice(14, 16)
  return { date, holiday, students, first }
}

const School = {
  async start() {
    if (!window.bridge.noTerms) Terms.start() // MASAR_NO_TERMS=1: the base program's own test suite
    // students never punch out: «انصراف بدون بصمة» for every student, however added
    // (form, import, or a new number at the device) — else the day counts as incomplete
    DB.run(`CREATE TRIGGER IF NOT EXISTS school_no_punch_out AFTER INSERT ON employees
      BEGIN UPDATE employees SET no_punch_out = 1 WHERE id = NEW.id; END`)
    if (!DB.one("SELECT 1 FROM meta WHERE key = 'school_init'")) {
      DB.run('UPDATE employees SET no_punch_out = 1')
      DB.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('school_init', '1')")
      await DB.flush()
    }
    window.bridge.onGateChanged?.(() => this.onChanged?.()) // WhatsApp state → the open page
    await this.sendRoster()
    setInterval(() => this.sendRoster(), 5 * 60e3) // new day, edited shifts / leaves / students
  },

  async sendRoster() { try { await window.bridge.gateRoster(buildRoster()) } catch (e) { console.error('roster', e) } },

  // after Gate.drain: a new number at the device gets the school's usual shift, so late / absence apply right away
  async newStudents() {
    const g = DB.one('SELECT shift_group_id AS g FROM employees WHERE shift_group_id IS NOT NULL GROUP BY shift_group_id ORDER BY COUNT(*) DESC LIMIT 1')?.g
      ?? DB.one('SELECT id AS g FROM shift_groups ORDER BY id LIMIT 1')?.g
    if (g != null) { DB.run("UPDATE employees SET shift_group_id = ? WHERE shift_group_id IS NULL AND name_ar = 'موظف جديد'", [g]); await DB.flush() }
    await this.sendRoster()
  },
}

// ── «رسائل أولياء الأمور» — a page in the shell ──
function openGuardianMessages() {
  UI.openWindow('guardian-msgs', 'رسائل أولياء الأمور', { width: 1100 }, (body) => {
    const view = UI.el(`<div class="school-page">
      <div class="sc-top">
        <fieldset class="sc-wa"><legend>١ — ربط واتساب المدرسة</legend><div class="wa-body" id="g-wa"></div>
          <div class="sc-btns"><button type="button" id="g-wa-restart">${ic('refresh-cw')}<span>إعادة الاتصال</span></button><button type="button" id="g-wa-logout">${ic('log-out')}<span>فصل الرقم وربط رقم آخر</span></button></div></fieldset>
        <fieldset><legend>٢ — تشغيل الرسائل</legend>
          <label class="sc-switch"><input type="checkbox" id="g-on"> <span id="g-on-label"></span></label>
          <div class="sc-kpis" id="g-kpis"></div>
          <div class="sc-btns"><button type="button" id="g-absence">${ic('user-x')}<span>فحص الغياب الآن</span></button></div></fieldset>
      </div>
      <div class="sc-banner" id="g-test-banner" hidden>${ic('triangle-alert')}<span>وضع التجربة مفعّل: كل الرسائل تذهب إلى رقم التجربة <b dir="ltr" id="g-test-no"></b> ولا تصل لأولياء الأمور.</span></div>
      <fieldset><legend>الإعدادات</legend>
        <div class="sc-cols">
          <div class="sc-form">
            <label class="chk"><input type="checkbox" id="g-late"> رسالة تأخير (أول بصمة بعد بداية الدوام + السماح)</label>
            <div class="row"><label class="chk"><input type="checkbox" id="g-absent"> رسالة غياب بعد بداية الدوام بـ (دقيقة)</label><input type="text" id="g-after" class="num" dir="ltr" data-num maxlength="3"></div>
            <div class="row"><label>اسم المدرسة في آخر الرسالة</label><input type="text" id="g-school"></div>
            <label class="chk"><input type="checkbox" id="g-wa-on"> الإرسال بواتساب</label>
            <div class="row"><label>رسائل SMS</label><select id="g-sms-mode"><option value="off">بدون SMS</option><option value="fallback">SMS إذا فشل واتساب</option><option value="always">SMS مع واتساب</option><option value="only">SMS فقط</option></select></div>
            <div id="g-sms-box"><div class="row"><label>مزوّد SMS</label><select id="g-sms-provider"></select></div><div id="g-sms-fields"></div></div>
            <div class="row"><label class="chk"><input type="checkbox" id="g-test"> وضع التجربة — رقم التجربة</label><input type="text" id="g-test-number" dir="ltr" placeholder="05xxxxxxxx"></div>
          </div>
          <div class="sc-form">
            <p class="hint">المتغيرات: {name} الاسم · {date} التاريخ · {day} اليوم · {time} وقت البصمة · {minutes} دقائق التأخير · {cutoff} وقت فحص الغياب · {school} المدرسة</p>
            <label class="ta">نص رسالة التأخير<textarea id="g-tpl-late" rows="4"></textarea></label>
            <label class="ta">نص رسالة الغياب<textarea id="g-tpl-absent" rows="4"></textarea></label>
            <div class="row"><label>رسالة تجربة إلى</label><input type="text" id="g-test-phone" dir="ltr" placeholder="05xxxxxxxx"><button type="button" id="g-test-send">${ic('send')}<span>إرسال</span></button></div>
            <p class="hint" id="g-test-result"></p>
          </div>
        </div>
      </fieldset>
      <fieldset><legend>آخر الرسائل</legend><div class="grid-wrap"><table class="grid"><thead><tr><th>الوقت</th><th>النوع</th><th>الطالب</th><th>الجوال</th><th>القناة</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody id="g-log"></tbody></table></div></fieldset>
    </div>`)
    const bar = UI.toolbar([{ key: 'save', label: 'حفظ', icon: 'save', onClick: save }])
    body.append(bar, view)
    const $ = (s) => view.querySelector(s)
    let st = null, loaded = false
    const TYPES = { late: 'تأخير', absent: 'غياب', test: 'تجربة', 'absent-run': 'فحص الغياب' }

    function fields(s) {
      const p = st.providers[$('#g-sms-provider').value] || { fields: [] }
      $('#g-sms-fields').innerHTML = p.fields.map(([k, l]) => `<div class="row"><label>${UI.esc(l)}</label><input type="text" data-sms="${k}" dir="ltr" value="${UI.esc((s.sms || {})[k] || '')}"></div>`).join('')
    }
    function fill(s) {
      $('#g-late').checked = s.late; $('#g-absent').checked = s.absent; $('#g-after').value = s.absentAfter
      $('#g-school').value = s.schoolName; $('#g-wa-on').checked = s.whatsapp; $('#g-sms-mode').value = s.smsMode
      $('#g-test').checked = s.testMode; $('#g-test-number').value = s.testNumber
      $('#g-tpl-late').value = s.tplLate; $('#g-tpl-absent').value = s.tplAbsent
      $('#g-sms-provider').innerHTML = Object.entries(st.providers).map(([k, p]) => `<option value="${k}">${UI.esc(p.label)}</option>`).join('')
      $('#g-sms-provider').value = (s.sms || {}).provider || 'none'
      fields(s)
      $('#g-sms-box').hidden = s.smsMode === 'off'
    }
    $('#g-sms-mode').onchange = () => { $('#g-sms-box').hidden = $('#g-sms-mode').value === 'off' }
    $('#g-sms-provider').onchange = () => fields(st.settings)

    function render() {
      const w = st.whatsapp, s = st.settings, t = st.today
      $('#g-wa').innerHTML = !s.whatsapp || s.smsMode === 'only' ? '<span class="sc-state">واتساب غير مفعّل (من الإعدادات)</span>'
        : w.status === 'connected' ? `<span class="sc-state ok">متصل ✓</span>${w.me ? `<div>الرقم: <b dir="ltr">+${UI.esc(w.me)}</b></div>` : ''}`
        : w.status === 'qr' && w.qr ? `<img alt="رمز الربط" src="${w.qr}"><ol><li>في جوال المدرسة: واتساب ← الأجهزة المرتبطة ← ربط جهاز</li><li>وجّه الكاميرا إلى الرمز</li></ol>`
        : `<span class="sc-state">جاري التحضير…</span><p class="hint">${w.error ? UI.esc(w.error) + ' — ' : ''}يظهر رمز الربط خلال دقيقة (يلزم إنترنت)</p>`
      $('#g-on').checked = s.enabled
      $('#g-on-label').textContent = s.enabled ? 'الرسائل تعمل تلقائياً' : 'الرسائل متوقفة'
      const k = (v, l, c = '') => `<div class="sc-kpi ${c}"><b>${v}</b><span>${l}</span></div>`
      $('#g-kpis').innerHTML = t.holiday ? '<p class="hint">اليوم إجازة رسمية — لا تُرسل رسائل</p>'
        : k(t.schoolToday, 'دوام اليوم') + k(t.present, 'بصموا') + k(t.late, 'رسائل تأخير', 'amber') + k(t.absentSent, 'رسائل غياب', 'red') + k(t.noPhone, 'بدون جوال', 'grey') + (t.queue ? k(t.queue, 'في الانتظار') : '')
      $('#g-test-banner').hidden = !s.testMode
      $('#g-test-no').textContent = s.testNumber || '—'
      if (!loaded) { fill(s); loaded = true }
    }
    async function refresh() {
      if (!view.isConnected) { clearInterval(timer); return }
      st = await window.bridge.gateStatus()
      render()
    }
    async function loadLog() {
      if (!view.isConnected) return
      const rows = await window.bridge.gateLog(200)
      $('#g-log').innerHTML = rows.length ? rows.map((r) => `<tr><td dir="ltr">${UI.esc(new Date(r.at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td>
        <td>${TYPES[r.type] || UI.esc(r.type)}${r.test ? ' (تجربة)' : ''}</td><td>${UI.esc(r.name || '')}</td><td dir="ltr">${UI.esc(r.phone || '')}</td>
        <td>${r.channel === 'whatsapp' ? 'واتساب' : r.channel === 'sms' ? 'SMS' : ''}</td><td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'تم' : 'لم يتم'}</td><td class="msg">${UI.esc(r.text || '')}</td></tr>`).join('')
        : '<tr><td colspan="7" class="empty">لا توجد رسائل بعد</td></tr>'
    }
    async function save() {
      const after = $('#g-after').value.trim()
      if (!/^\d{1,3}$/.test(after)) return UI.message('دقائق الغياب: رقم من 0 إلى 720')
      const sms = { provider: $('#g-sms-provider').value }
      view.querySelectorAll('[data-sms]').forEach((i) => { sms[i.dataset.sms] = i.value.trim() })
      st = await window.bridge.gateSettings({
        late: $('#g-late').checked, absent: $('#g-absent').checked, absentAfter: +after, schoolName: $('#g-school').value.trim(),
        whatsapp: $('#g-wa-on').checked, smsMode: $('#g-sms-mode').value, sms, testMode: $('#g-test').checked,
        testNumber: $('#g-test-number').value.trim(), tplLate: $('#g-tpl-late').value, tplAbsent: $('#g-tpl-absent').value,
      })
      DB.audit('رسائل أولياء الأمور', 'حفظ الإعدادات')
      loaded = false; render()
      UI.message('تم حفظ الإعدادات')
    }
    $('#g-on').onchange = async (e) => { st = await window.bridge.gateSettings({ enabled: e.target.checked }); render() }
    $('#g-wa-restart').onclick = async () => { st = await window.bridge.gateWa('restart'); render() }
    $('#g-wa-logout').onclick = async () => { if (await UI.confirm('فصل رقم واتساب الحالي؟ ستحتاج لمسح رمز جديد.')) { st = await window.bridge.gateWa('logout'); render() } }
    $('#g-absence').onclick = async () => { await School.sendRoster(); const n = await window.bridge.gateAbsence(); UI.message(n ? `أضيفت ${n} رسالة غياب إلى الطابور` : 'لا توجد رسائل غياب جديدة'); loadLog() }
    $('#g-test-send').onclick = async () => {
      const out = $('#g-test-result'); out.textContent = 'جاري الإرسال…'
      const r = await window.bridge.gateTest($('#g-test-phone').value.trim())
      out.textContent = r ? (r.ok ? 'تم الإرسال ✓' : 'لم يتم: ' + r.text) : ''
      loadLog()
    }
    School.onChanged = () => { if (view.isConnected) refresh() }
    const timer = setInterval(() => { refresh(); loadLog() }, 4000)
    refresh().then(loadLog)
  })
}
