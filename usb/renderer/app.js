// Masar Time USB — screens: activation, home, pull from the flash drive, employees, the report, packages.
const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtDate = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
let BRAND = {}

function toast(text) {
  const t = $('#toast')
  t.textContent = text
  t.hidden = false
  clearTimeout(toast.h)
  toast.h = setTimeout(() => (t.hidden = true), 3500)
}

// ── activation ───────────────────────────────────────────
function showLock(st) {
  $('#shell').hidden = true
  const el = $('#lock')
  el.hidden = false
  el.innerHTML = `
    <div class="lockcard">
      <div class="logo"><img src="logo-white.png" alt=""></div>
      <h1>تفعيل ${esc(BRAND.product_ar)}</h1>
      <p class="sub">هذا البرنامج يحتاج مفتاح تفعيل خاص بهذا الجهاز قبل الاستخدام.</p>
      <label class="f">كود الجهاز</label>
      <div class="row" style="margin:6px 0 18px"><div class="code grow" id="lk-code">${esc(st.code)}</div>
        <button class="btn" id="lk-copy">نسخ</button></div>
      <label class="f" for="lk-key">مفتاح التفعيل</label>
      <textarea id="lk-key" placeholder="ألصق مفتاح التفعيل هنا" spellcheck="false"></textarea>
      <div class="err" id="lk-err">${st.error === 'damaged' ? 'ملف البيانات تالف أو لا يخص هذا الجهاز' : ''}</div>
      <div class="row"><button class="btn pri big" id="lk-go">تفعيل</button><span class="grow"></span><button class="btn" id="lk-quit">إغلاق البرنامج</button></div>
      <div class="callbox">${esc(BRAND.activation_note)}<br>
        هاتف: <b>${esc(BRAND.phone)}</b> — واتساب: <b>${esc(BRAND.phone)}</b><br>${esc(BRAND.legal_name)}</div>
    </div>`
  $('#lk-copy').onclick = () => { navigator.clipboard.writeText(st.code); toast('تم نسخ كود الجهاز') }
  $('#lk-quit').onclick = () => window.usb.quit()
  $('#lk-go').onclick = async () => {
    const key = $('#lk-key').value.trim()
    if (!key) return ($('#lk-err').textContent = 'ألصق مفتاح التفعيل أولاً')
    const r = await window.usb.activate(key)
    if (!r.ok) return ($('#lk-err').textContent = 'مفتاح التفعيل غير صحيح لهذا الجهاز — تأكد أنه خاص بكود الجهاز الظاهر أعلاه')
    el.hidden = true
    startShell()
    toast('تم تفعيل البرنامج بنجاح')
  }
}

// ── shell ────────────────────────────────────────────────
const PAGES = [
  { id: 'home', label: 'الرئيسية', render: renderHome },
  { id: 'pull', label: 'سحب من الفلاشة', render: renderPull },
  { id: 'emps', label: 'الموظفين', render: renderEmployees },
  { id: 'report', label: 'تقرير الحضور', render: renderReport },
  { id: 'pkgs', label: 'الباقات والترقية', render: renderPackages, cls: 'up' },
]
function go(id) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === id))
  const p = PAGES.find((x) => x.id === id)
  $('#page').innerHTML = ''
  p.render($('#page'))
}
function startShell() {
  $('#shell').hidden = false
  $('#b-product').textContent = BRAND.product_ar
  $('#b-company').textContent = `من ${BRAND.company}`
  $('#b-contact').innerHTML = `للدعم والترقية<br><b dir="ltr">${esc(BRAND.phone)}</b> · ${esc(BRAND.website)}`
  $('#tabs').innerHTML = PAGES.map((p) => `<button data-id="${p.id}" class="${p.cls || ''}">${esc(p.label)}</button>`).join('')
  $('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.id) }
  go('home')
}
const locked = (r) => { if (r && r.error === 'locked') { boot(); return true } return false }

// ── home ─────────────────────────────────────────────────
async function renderHome(el) {
  const s = await window.usb.summary()
  if (locked(s)) return
  el.innerHTML = `
    <h1>أهلاً بك</h1><p class="sub">اسحب حركات البصمة من الفلاشة، ثم اطبع تقرير الدخول والخروج.</p>
    <div class="stats">
      <div class="stat"><small>الموظفين</small><b>${s.employees}</b></div>
      <div class="stat"><small>الحركات المسجلة</small><b>${s.punches}</b></div>
      <div class="stat"><small>آخر سحب من الفلاشة</small><b style="font-size:18px">${s.lastImport ? fmtDate(s.lastImport.at) : 'لم يتم بعد'}</b></div>
    </div>
    <div class="card hero">
      <div class="grow"><h1>سحب الحركات من الفلاشة</h1>
        <p>صدّر الحركات من جهاز البصمة إلى الفلاشة، ركّبها في الكمبيوتر، ثم اضغط الزر.</p></div>
      <button class="btn pri big" id="h-pull">سحب من الفلاشة</button>
    </div>
    <div class="card hero">
      <div class="grow"><h1>تقرير الحضور</h1><p>${s.first ? `الحركات من ${fmtDate(s.first)} إلى ${fmtDate(s.last)}` : 'لا توجد حركات بعد'}</p></div>
      <button class="btn big" id="h-report">عرض التقرير</button>
    </div>
    ${upsell()}`
  $('#h-pull').onclick = () => go('pull')
  $('#h-report').onclick = () => go('report')
  bindUpsell(el)
}
function upsell() {
  return `<div class="upsell"><div class="grow"><b>تبغى تسحب الحركات تلقائياً عبر الشبكة؟</b><br>
    <span style="color:var(--muted)">نسخة الشبكة تضيف الدوامات والتأخير والإضافي والإجازات وأكثر من 15 تقرير.</span></div>
    <button class="btn pri" data-up>شوف الباقات</button></div>`
}
const bindUpsell = (el) => el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => go('pkgs')))

// ── pull from the flash drive ────────────────────────────
async function renderPull(el) {
  el.innerHTML = `
    <h1>سحب من الفلاشة</h1><p class="sub">البرنامج يبحث تلقائياً في الفلاشة عن ملف الحركات (اسمه ينتهي بـ attlog.dat).</p>
    <div class="card">
      <div class="row"><button class="btn" id="p-scan">بحث في الفلاشة مرة ثانية</button><button class="btn" id="p-pick">اختيار ملف يدوياً</button>
        <span class="grow"></span><button class="btn pri big" id="p-go" disabled>سحب الملفات المحددة</button></div>
      <div id="p-list" style="margin-top:16px"></div>
      <div id="p-res"></div>
    </div>`
  let files = []
  const draw = () => {
    $('#p-list').innerHTML = files.length
      ? files.map((f, i) => `<label class="file"><input type="checkbox" data-i="${i}" ${f.on ? 'checked' : ''}>
          <div class="grow"><b>${esc(f.name)}</b>${f.serial ? ` — جهاز ${esc(f.serial)}` : ''}<div class="p">${esc(f.path)}</div></div>
          <small style="color:var(--muted)">${f.modified ? fmtDate(f.modified) : ''}</small></label>`).join('')
      : `<div class="empty">لم يتم العثور على ملف حركات.<br>ركّب الفلاشة اللي صدّرت عليها الحركات من جهاز البصمة ثم اضغط «بحث في الفلاشة مرة ثانية»،<br>أو اختر الملف يدوياً.</div>`
    $('#p-go').disabled = !files.some((f) => f.on)
    $('#p-list').querySelectorAll('input[data-i]').forEach((c) => (c.onchange = () => { files[+c.dataset.i].on = c.checked; $('#p-go').disabled = !files.some((f) => f.on) }))
  }
  const scan = async () => {
    $('#p-list').innerHTML = '<div class="empty">جاري البحث في الفلاشة…</div>'
    const r = await window.usb.scan()
    if (locked(r)) return
    files = r.files.map((f) => ({ ...f, on: true }))
    draw()
  }
  $('#p-scan').onclick = scan
  $('#p-pick').onclick = async () => {
    const r = await window.usb.pick()
    if (locked(r)) return
    for (const p of r.paths) if (!files.some((f) => f.path === p)) files.push({ path: p, name: p.split(/[\\/]/).pop(), on: true })
    draw()
  }
  $('#p-go').onclick = async () => {
    $('#p-go').disabled = true
    const r = await window.usb.importFiles(files.filter((f) => f.on).map((f) => f.path))
    if (locked(r)) return
    $('#p-res').innerHTML = r.results.map((x) => x.error
      ? `<div class="result err"><b>${esc(x.path.split(/[\\/]/).pop())}</b>: ${esc(x.error)}</div>`
      : `<div class="result"><b>${esc(x.path.split(/[\\/]/).pop())}</b>: تم سحب <b>${x.added}</b> حركة جديدة
          ${x.duplicates ? ` (و${x.duplicates} حركة كانت مسحوبة من قبل)` : ''}${x.newEmployees ? ` — أُضيف ${x.newEmployees} موظف جديد، اكتب أسماءهم في «الموظفين»` : ''}
          ${x.from ? `<br><small>الفترة: ${fmtDate(x.from)} إلى ${fmtDate(x.to)}</small>` : ''}</div>`).join('')
      + `<div class="row" style="margin-top:12px"><button class="btn pri" id="p-rep">عرض التقرير</button><button class="btn" id="p-emp">الموظفين</button></div>`
    $('#p-rep').onclick = () => go('report')
    $('#p-emp').onclick = () => go('emps')
    $('#p-go').disabled = false
  }
  scan()
}

// ── employees ────────────────────────────────────────────
async function renderEmployees(el) {
  const list = await window.usb.employees()
  if (locked(list)) return
  el.innerHTML = `
    <h1>الموظفين</h1><p class="sub">الموظفون يُضافون تلقائياً من رقم البصمة عند السحب. اكتب اسم كل موظف ليظهر في التقرير.</p>
    <div class="card">
      <div class="row" style="margin-bottom:12px"><input type="text" id="e-q" placeholder="بحث بالرقم أو الاسم" style="width:280px"></div>
      <div class="tablewrap"><table><thead><tr><th class="num" style="width:120px">رقم البصمة</th><th>اسم الموظف</th><th class="num" style="width:130px">عدد الحركات</th><th class="num" style="width:140px">آخر حركة</th><th style="width:90px"></th></tr></thead>
      <tbody id="e-body"></tbody></table></div>
    </div>`
  const draw = () => {
    const q = $('#e-q').value.trim()
    const rows = list.filter((e) => !q || e.pin.includes(q) || e.name.includes(q))
    $('#e-body').innerHTML = rows.length ? rows.map((e) => `<tr data-pin="${esc(e.pin)}"><td class="num">${esc(e.pin)}</td>
      <td><input type="text" value="${esc(e.name)}" placeholder="اكتب اسم الموظف"></td><td class="num">${e.punches}</td><td class="num">${fmtDate(e.last)}</td>
      <td><button class="btn danger" data-del>حذف</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${list.length ? 'لا توجد نتائج' : 'لا يوجد موظفين بعد — اسحب الحركات من الفلاشة أولاً'}</td></tr>`
    $('#e-body').querySelectorAll('tr[data-pin]').forEach((tr) => {
      const pin = tr.dataset.pin
      const inp = tr.querySelector('input')
      inp.onchange = async () => { await window.usb.rename(pin, inp.value); list.find((e) => e.pin === pin).name = inp.value.trim(); toast('تم حفظ الاسم') }
      inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur() }
      tr.querySelector('[data-del]').onclick = async () => {
        if (!confirm(`حذف الموظف رقم ${pin} وكل حركاته؟`)) return
        await window.usb.remove(pin)
        list.splice(list.findIndex((e) => e.pin === pin), 1)
        draw()
        toast('تم حذف الموظف')
      }
    })
  }
  $('#e-q').oninput = draw
  draw()
}

// ── report ───────────────────────────────────────────────
let lastReport = null
async function renderReport(el) {
  const emps = await window.usb.employees()
  if (locked(emps)) return
  const now = new Date()
  el.innerHTML = `
    <h1>تقرير الحضور</h1><p class="sub">وقت دخول وخروج كل موظف في كل يوم.</p>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <label class="f">من تاريخ<input type="date" id="r-from" value="${iso(new Date(now.getFullYear(), now.getMonth(), 1))}"></label>
        <label class="f">إلى تاريخ<input type="date" id="r-to" value="${iso(now)}"></label>
        <label class="f">الموظف<select id="r-emp"><option value="">كل الموظفين</option>${emps.map((e) => `<option value="${esc(e.pin)}">${esc(e.pin)} — ${esc(e.name || 'بدون اسم')}</option>`).join('')}</select></label>
        <button class="btn pri" id="r-go">عرض</button>
        <span class="grow"></span>
        <button class="btn" id="r-print" disabled>طباعة</button><button class="btn" id="r-pdf" disabled>حفظ PDF</button>
      </div>
    </div>
    <div class="card" id="r-out"><div class="empty">اختر الفترة ثم اضغط «عرض»</div></div>`
  $('#r-go').onclick = async () => {
    const f = { from: $('#r-from').value, to: $('#r-to').value, pin: $('#r-emp').value || null }
    if (f.from && f.to && f.from > f.to) return toast('تاريخ البداية بعد تاريخ النهاية')
    const rows = await window.usb.report(f)
    if (locked(rows)) return
    lastReport = { f, rows }
    $('#r-out').innerHTML = rows.length ? `<div class="tablewrap">${reportTable(rows)}</div><p class="sub" style="margin:12px 0 0">${rows.length} يوم حضور</p>`
      : '<div class="empty">لا توجد حركات في هذه الفترة</div>'
    $('#r-print').disabled = $('#r-pdf').disabled = !rows.length
  }
  $('#r-print').onclick = async () => { const r = await window.usb.print(printDoc()); if (r && r.ok === false && r.error) toast(r.error) }
  $('#r-pdf').onclick = async () => { const r = await window.usb.pdf(printDoc(), `تقرير الحضور ${lastReport.f.from} - ${lastReport.f.to}.pdf`); if (r.ok) toast('تم حفظ الملف') }
  $('#r-go').click()
}
function reportTable(rows) {
  let html = '<table><thead><tr><th class="num">رقم البصمة</th><th>اسم الموظف</th><th class="num">التاريخ</th><th>اليوم</th><th class="num">الدخول</th><th class="num">الخروج</th></tr></thead><tbody>'
  let cur = null
  for (const r of rows) {
    if (r.pin !== cur) { cur = r.pin; html += `<tr class="grp"><td colspan="6">${esc(r.pin)} — ${esc(r.name || 'بدون اسم')}</td></tr>` }
    html += `<tr><td class="num">${esc(r.pin)}</td><td>${esc(r.name)}</td><td class="num">${fmtDate(r.date)}</td><td>${esc(r.day)}</td>
      <td class="num">${esc(r.in)}</td><td class="num ${r.out ? '' : 'miss'}">${r.out ? esc(r.out) : 'لا يوجد'}</td></tr>`
  }
  return html + '</tbody></table>'
}
function printDoc() {
  const { f, rows } = lastReport
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    body{font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#1f2d30;margin:0}
    .h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1d4d56;padding-bottom:8px;margin-bottom:10px}
    .h b{font-size:18px;color:#1d4d56}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #c9d6d8;padding:5px 7px;text-align:right}th{background:#e8f0f1}
    td.n,th.n{text-align:center;direction:ltr}tr.g td{background:#f1f7f6;font-weight:bold}
    thead{display:table-header-group}tr{page-break-inside:avoid}
    .f{margin-top:12px;font-size:10px;color:#6b7f83;text-align:center}</style></head><body>
    <div class="h"><div><b>تقرير الحضور والانصراف</b><br>الفترة من ${fmtDate(f.from)} إلى ${fmtDate(f.to)}</div>
      <div style="text-align:left">${esc(BRAND.product_ar)}<br>طُبع في ${fmtDate(iso(new Date()))}</div></div>
    ${reportTable(rows).replace(/class="num( miss)?"/g, 'class="n"').replace(/class="grp"/g, 'class="g"')}
    <div class="f">${esc(BRAND.product)} — ${esc(BRAND.legal_name)} — ${esc(BRAND.phone)} — ${esc(BRAND.website)}</div></body></html>`
}

// ── packages ─────────────────────────────────────────────
function renderPackages(el) {
  el.innerHTML = `
    <h1>الباقات والترقية</h1><p class="sub">نسختك الحالية مجانية مع جهاز البصمة. للترقية تواصل مع ${esc(BRAND.company)}.</p>
    <div class="pkgs">${(BRAND.packages || []).map((p) => `<div class="pkg ${p.highlight ? 'hl' : ''}">
      ${p.current ? '<span class="tag cur">نسختك الحالية</span>' : p.highlight ? '<span class="tag">الأكثر طلباً</span>' : ''}
      <h3>${esc(p.name)}</h3><div class="price">${esc(p.price)}</div><ul>${p.features.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
    <div class="card" style="margin-top:16px"><h1>${esc(BRAND.legal_name)}</h1>
      <p style="line-height:2;margin:8px 0 0">هاتف وواتساب: <b dir="ltr">${esc(BRAND.phone)}</b><br>الموقع: <b dir="ltr">${esc(BRAND.website)}</b>
      ${BRAND.email ? `<br>البريد: <b dir="ltr">${esc(BRAND.email)}</b>` : ''}<br>${esc(BRAND.address)}</p></div>`
}

// ── start ────────────────────────────────────────────────
async function boot() {
  BRAND = await window.usb.brand()
  document.title = BRAND.product
  const st = await window.usb.status()
  if (!st.ok) return showLock(st)
  $('#lock').hidden = true
  startShell()
}
boot()
