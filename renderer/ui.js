// Apex Time permissions: a screen key is "<menu>/<item>"; the user's role grants per screen
// view (menu entry) · add · del · edit · print. A window opened from a menu item remembers
// its key and disables the toolbar buttons the role doesn't allow.
const Perm = {
  scope: null,
  ACTIONS: [['view', 'عرض'], ['add', 'إضافة'], ['del', 'حذف'], ['edit', 'تعديل'], ['print', 'طباعة']],
  BUTTONS: { new: ['add'], add: ['add'], save: ['add', 'edit'], del: ['del'], edit: ['edit'], print: ['print'], pdf: ['print'], excel: ['print'] },
  can(key, action = 'view') {
    if (!key || window.Session?.admin) return true
    return !!Session.rolePerms?.[key]?.[action]
  },
  // run a menu action with its screen key in scope (windows opened by it inherit the key)
  run(key, fn) { this.scope = key; try { return fn() } finally { this.scope = null } },
  apply(root, key) {
    if (!key || Session?.admin) return
    for (const b of root.querySelectorAll('.toolbar button[data-key]')) {
      const need = this.BUTTONS[b.dataset.key]
      if (need && !need.some((a) => this.can(key, a))) { b.disabled = true; b.dataset.permOff = '1'; b.title = 'غير مصرح لك بهذا الإجراء' }
    }
  },
}

// Tiny window manager + dialogs reproducing Apex Time's MDI desktop.
const UI = {
  wins: new Map(),
  z: 10,

  el(html) {
    const t = document.createElement('template')
    t.innerHTML = html.trim()
    return t.content.firstElementChild
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  },

  // Open (or focus) a child window. `render(body, win)` fills it.
  openWindow(id, title, { width = 560, height = 340 } = {}, render) {
    if (this.wins.has(id)) return this.focus(id)
    const desk = document.getElementById('desktop')
    const n = this.wins.size
    const win = this.el(`
      <section class="win" data-win="${this.esc(id)}" style="width:${width}px;height:${height}px;left:${Math.max(4, (innerWidth - width) / 2 + n * 24)}px;top:${Math.max(62, (innerHeight + 58 - height) / 2 + n * 24)}px">
        <div class="cap"><button class="x" title="إغلاق">✕</button>${this.esc(title)}</div>
        <div class="body" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
      </section>`)
    desk.appendChild(win)
    win.querySelector('.x').onclick = () => this.close(id)
    win.addEventListener('mousedown', () => this.focus(id))
    this.drag(win, win.querySelector('.cap'))
    const permKey = Perm.scope
    this.wins.set(id, { win, title, permKey })
    this.focus(id)
    this.renderStrip()
    render(win.querySelector('.body'), { close: () => this.close(id), permKey })
    Perm.apply(win, permKey)
  },
  focus(id) {
    const w = this.wins.get(id)
    if (!w) return
    w.win.style.zIndex = ++this.z
    this.active = id
    // Apex (MDI): only the active window shows; switching hides the others
    for (const [k, o] of this.wins) o.win.style.display = k === id ? '' : 'none'
    this.renderStrip()
  },
  close(id) {
    const w = this.wins.get(id)
    if (!w) return
    w.win.remove()
    this.wins.delete(id)
    if (this.active === id) {
      const next = [...this.wins.keys()].pop()
      if (next) return this.focus(next)
      this.active = undefined
    }
    this.renderStrip()
  },
  renderStrip() {
    // Apex hides its home screen while any window is open
    const home = document.getElementById('home')
    if (home) home.style.visibility = this.wins.size ? 'hidden' : ''
    const strip = document.getElementById('taskstrip')
    strip.innerHTML = ''
    for (const [id, w] of this.wins) {
      const b = this.el(`<button class="${id === this.active ? 'active' : ''}">${this.esc(w.title)}</button>`)
      b.onclick = () => this.focus(id)
      strip.appendChild(b)
    }
    // Apex's MDI ✕ at the far end of the strip closes the active window
    if (this.wins.size) {
      const x = this.el('<button class="strip-x" title="إغلاق">✕</button>')
      x.onclick = () => this.close(this.active)
      strip.appendChild(x)
    }
  },
  drag(win, handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return
      const sx = e.clientX, sy = e.clientY, ox = win.offsetLeft, oy = win.offsetTop
      const move = (ev) => { win.style.left = ox + ev.clientX - sx + 'px'; win.style.top = Math.max(46, oy + ev.clientY - sy) + 'px' }
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up) }
      addEventListener('mousemove', move)
      addEventListener('mouseup', up)
    })
  },

  // Toolbar button row — `buttons` = [{key, label, icon, onClick}]
  toolbar(buttons) {
    const bar = this.el('<div class="toolbar"></div>')
    for (const b of buttons) {
      const btn = this.el(`<button data-key="${b.key}">${ICONS[b.icon] || ''}<span>${this.esc(b.label)}</span></button>`)
      btn.onclick = b.onClick
      bar.appendChild(btn)
    }
    return bar
  },

  // Modal dialog in Apex's style; resolves when closed.
  // hideBehind: the active window hides while the dialog is open (one thing on screen at a time)
  dialog({ winbar, head, bodyHtml, buttons, width = 440, onOpen = null, foot = '', msg = false, btnsLeft = false, hideBehind = false, cls = '' }) {
    return new Promise((resolve) => {
      const back = this.el(`
        <div class="dlg-backdrop"><div class="dlg${msg ? ' msg' : ''}${btnsLeft ? ' btns-left' : ''}${cls ? ` ${cls}` : ''}" style="width:${width}px">
          ${winbar || msg ? `<div class="winbar">${this.esc(winbar || head)}</div>` : ''}
          ${msg ? '' : `<div class="head">${this.esc(head)}</div>`}
          <div class="body">${bodyHtml}</div>
          <div class="err"></div>
          <div class="btns"></div>
          <div class="foot">${this.esc(foot)}</div>
        </div></div>`)
      const behind = hideBehind && this.wins.get(this.active)?.win
      if (behind) behind.style.visibility = 'hidden'
      const done = (v) => { back.remove(); if (behind) behind.style.visibility = ''; resolve(v) }
      const api = { root: back, error: (m) => (back.querySelector('.err').textContent = m || ''), close: done }
      for (const b of buttons) {
        const btn = this.el(`<button>${ICONS[b.icon] || ''}<span>${this.esc(b.label)}</span></button>`)
        btn.onclick = () => b.onClick(api)
        back.querySelector('.btns').appendChild(btn)
      }
      document.body.appendChild(back)
      onOpen?.(api)
      back.querySelector('input:not([type=radio])')?.focus()
    })
  },

  // Apex Time report header: Arabic company name + activity (right, cyan box) · logo
  // (centre) · English name + activity (left, cyan box), then the title bar
  meta(k) { return DB.one('SELECT value FROM meta WHERE key = ?', [k])?.value || '' },
  // `inline`: the title sits in a cyan box beside the logo instead of a bar (Apex «التفصيلي»)
  letterhead(title, sub = '', { inline = false } = {}) {
    const m = (k) => this.meta(k)
    const logo = m('company_logo')
    return `<div class="rep-head apex${inline ? ' inline' : ''}">
        <div class="box r"><div class="co">${this.esc(m('company_name'))}</div><div class="act">${this.esc(m('company_activity'))}</div></div>
        <div class="logo">${logo ? `<img src="${logo}" alt="">` : ''}${inline ? `<span class="t">${this.esc(title)}</span>` : ''}</div>
        <div class="box l" dir="ltr"><div class="co">${this.esc(m('company_name_en'))}</div><div class="act">${this.esc(m('company_activity_en'))}</div></div>
      </div>
      ${inline ? '' : `<div class="rep-title">${this.esc(title)}</div><hr class="rep-rule">`}${sub ? `<div class="rep-sub">${sub}</div>` : ''}`
  },
  // Apex report footer: user + print time, then website / phone / fax / email
  reportFoot() {
    const m = (k) => this.esc(this.meta(k))
    const now = new Date()
    // Apex: print time on the right, «اسم المستخدم» on the left; a rule; then the contact line
    const h = now.getHours(), stamp = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
    return `<div class="rep-foot"><div class="u"><span dir="ltr">${stamp}</span><span><b>اسم المستخدم :</b> ${this.esc(Session.username)}</span></div>
      <div class="c" dir="ltr"><span><b>Website:</b> ${m('company_website')}</span><span><b>Phone:</b> ${m('company_phone')}</span><span><b>Fax:</b> ${m('company_fax')}</span><span><b>Email:</b> ${m('company_email')}</span></div></div>`
  },
  // standalone document (app CSS inlined) for printing / PDF
  docHtml(inner) {
    const css = [...document.styleSheets].map((ss) => { try { return [...ss.cssRules].map((r) => r.cssText).join('\n') } catch { return '' } }).join('\n')
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${css}</style></head>
      <body class="printing pdf"><div id="print-area" style="display:block">${inner}</div></body></html>`
  },
  // yyyy-mm-dd → yyyy/mm/dd in the visible text of a report (attributes keep the ISO dates)
  slashDates(html) { return html.replace(/>([^<]+)</g, (m, t) => '>' + t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$1/$2/$3') + '<') },
  // print; when it can't (no printer…) offer the same document as a PDF file instead
  async print(inner, title = 'Meena Time') {
    if (window.bridge.printHtml) {
      const res = await window.bridge.printHtml(this.docHtml(inner))
      if (!res?.error) return
      const pdf = await this.dialog({ head: 'تعذّرت الطباعة', msg: true, width: 420,
        bodyHtml: `<div class="msg-icon">i</div><div class="msg-text">${this.esc(res.error)}\nهل تريد حفظه كملف PDF بدلاً من ذلك؟</div>`,
        buttons: [{ label: 'حفظ PDF', icon: 'pdf', onClick: (d) => d.close(true) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(false) }] })
      if (!pdf) return
      const saved = await window.bridge.savePdf(`${title} ${Engine.today()}.pdf`, this.docHtml(inner))
      if (saved?.ok) this.message(`تم الحفظ: ${saved.path}`)
      else if (saved?.error) this.message(saved.error)
      return
    }
    const area = document.getElementById('print-area')
    area.innerHTML = inner
    document.body.classList.add('printing')
    window.print()
    document.body.classList.remove('printing')
  },

  // Print what a list window shows: its grid as a report table under the letterhead
  printGrid(title, root) {
    const t = root.querySelector('table.grid')?.cloneNode(true)
    if (!t) return
    t.className = 'rep'
    t.querySelectorAll('tr.new').forEach((tr) => tr.remove()) // the blank entry row
    t.querySelectorAll('select').forEach((x) => x.replaceWith(x.selectedIndex > 0 ? x.options[x.selectedIndex].text : ''))
    t.querySelectorAll('input[type=checkbox]').forEach((x) => x.replaceWith(x.checked ? '✓' : ''))
    t.querySelectorAll('input').forEach((x) => x.replaceWith(x.value))
    // drop the row-pointer column (empty header)
    const first = t.querySelector('thead th')
    if (first && !first.textContent.trim()) t.querySelectorAll('tr').forEach((tr) => tr.firstElementChild?.remove())
    if (!t.querySelector('tbody tr')) return this.message('لا توجد بيانات للطباعة')
    return this.print(this.letterhead(title) + this.slashDates(t.outerHTML) + this.reportFoot(), title)
  },

  // Our own drop-down list for <select>: the native popup doesn't open reliably
  // inside the MDI windows on Windows. The <select> keeps its value and fires
  // the usual input/change events; keyboard (arrows) still works natively.
  openSelect(sel) {
    this.closeSelect()
    const r = sel.getBoundingClientRect()
    const list = this.el('<div class="sel-pop" role="listbox"></div>')
    ;[...sel.options].forEach((o, i) => {
      const it = this.el(`<div class="sel-opt${i === sel.selectedIndex ? ' on' : ''}" role="option">${this.esc(o.text) || '&nbsp;'}</div>`)
      it.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.closeSelect()
        if (sel.selectedIndex !== i) {
          sel.selectedIndex = i
          sel.dispatchEvent(new Event('input', { bubbles: true }))
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        }
        sel.focus()
      })
      list.appendChild(it)
    })
    document.body.appendChild(list)
    const h = Math.min(list.scrollHeight, 240)
    const below = innerHeight - r.bottom > h + 4
    Object.assign(list.style, { left: r.left + 'px', minWidth: r.width + 'px', top: (below ? r.bottom : r.top - h) + 'px', maxHeight: '240px' })
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
    this.selPop = list
  },
  closeSelect() {
    this.selPop?.remove()
    this.selPop = null
  },

  // Apex's «الاقسام» tree: departments with their sections; «الكل» on top. onSelect(id|null)
  // apex: Apex's tree look (−/+ boxes, dotted lines, creation order, optional folder icons, no «الكل»)
  deptTree(onSelect, { title = 'الاقسام', all = true, apex = false, icons = false, none = false } = {}) {
    if (apex) return this.apexDeptTree(onSelect, { title, icons, none })
    const deps = DB.all('SELECT id, name_ar, parent_id FROM departments ORDER BY name_ar')
    const node = (d) => {
      const kids = deps.filter((x) => x.parent_id === d.id)
      return `<li><span class="tn" data-id="${d.id}">${this.esc(d.name_ar)}</span>${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`
    }
    const el = this.el(`<div class="dept-tree"><div class="tt">${this.esc(title)}</div><ul>${all ? '<li><span class="tn on" data-id="">الكل</span></li>' : ''}${deps.filter((d) => !d.parent_id).map(node).join('')}</ul></div>`)
    el.addEventListener('click', (e) => {
      const t = e.target.closest('.tn')
      if (!t) return
      el.querySelectorAll('.tn').forEach((x) => x.classList.toggle('on', x === t))
      onSelect(t.dataset.id ? +t.dataset.id : null, t.textContent)
    })
    return el
  },
  apexDeptTree(onSelect, { title, icons, none }) {
    const deps = DB.all('SELECT id, name_ar, parent_id FROM departments ORDER BY id')
    const FOLDER = '<svg class="ti" viewBox="0 0 16 16"><path d="M1 3h5l1.5 1.5H15V13H1z" fill="#7cc242" stroke="#4c8a1e" stroke-width=".8"/></svg>'
    const LEAF = '<svg class="ti" viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="#9be15d" stroke="#4c8a1e" stroke-width=".8"/></svg>'
    const node = (d) => {
      const kids = deps.filter((x) => x.parent_id === d.id)
      return `<li class="${kids.length ? 'open' : ''}">${kids.length ? '<span class="tog">−</span>' : ''}<span class="tn" data-id="${d.id}">${icons ? (d.parent_id ? LEAF : FOLDER) : ''}${this.esc(d.name_ar)}</span>${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`
    }
    // «بدون قسم»: employees not placed in any department yet (e.g. read from a device)
    const el = this.el(`<fieldset class="dept-tree apex-tree"><legend>${this.esc(title)}</legend><ul>${deps.filter((d) => !d.parent_id).map(node).join('')}${none ? '<li><span class="tn" data-id="0">بدون قسم</span></li>' : ''}</ul></fieldset>`)
    el.addEventListener('click', (e) => {
      const tog = e.target.closest('.tog')
      if (tog) { const li = tog.parentElement; li.classList.toggle('open'); tog.textContent = li.classList.contains('open') ? '−' : '+'; return }
      const t = e.target.closest('.tn')
      if (!t) return
      el.querySelectorAll('.tn').forEach((x) => x.classList.toggle('on', x === t))
      onSelect(+t.dataset.id, t.textContent)
    })
    el.selectFirst = () => el.querySelector('.tn')?.click()
    return el
  },
  // a department id → itself + its sections (for filtering employees)
  deptIds(id) { return id ? [id, ...DB.all('SELECT id FROM departments WHERE parent_id = ?', [id]).map((d) => d.id)] : null },
  confirm(text, head = 'تأكيد') {
    return this.dialog({ head, msg: true, bodyHtml: `<div class="msg-icon q">?</div><div class="msg-text">${this.esc(text)}</div>`, width: 380,
      buttons: [{ label: 'نعم', icon: 'ok', onClick: (d) => d.close(true) }, { label: 'لا', icon: 'cancel', onClick: (d) => d.close(false) }] })
  },
  message(text) {
    return this.dialog({ head: 'معلومات', msg: true, bodyHtml: `<div class="msg-icon">i</div><div class="msg-text">${this.esc(text)}</div>`, width: 360,
      buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => d.close(true) }] })
  },
}

// Apex shows dates as yyyy/mm/dd (yyyy-mm-dd inside grids) whatever the Windows region. The native date box keeps its
// value (yyyy-mm-dd) and calendar button; at rest its digits are drawn as yyyy/mm/dd (an SVG
// background over the hidden native text), while it has the focus it shows its own fields.
const DateFace = {
  paint(i) {
    if (i?.type !== 'date') return
    if (!i.value) { i.classList.remove('dt-face'); i.style.backgroundImage = ''; return }
    const cs = getComputedStyle(i)
    const esc = (t) => t.replace(/[&<>"']/g, '')
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='60'><text x='400' y='30' dominant-baseline='central' text-anchor='end'
      font-family='${esc(cs.fontFamily)}' font-size='${parseFloat(cs.fontSize) || 13}' font-weight='${cs.fontWeight}' fill='${cs.color}'>${i.closest('.grid') ? i.value : i.value.replaceAll('-', '/')}</text></svg>`
    Object.assign(i.style, { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundRepeat: 'no-repeat',
      backgroundPosition: `right ${(parseFloat(cs.paddingRight) || 0) + 3}px center` })
    i.classList.add('dt-face')
  },
  paintAll(root) { root.querySelectorAll?.('input[type=date]').forEach((i) => this.paint(i)) },
}
{
  // programmatic `input.value = …` repaints too
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  Object.defineProperty(HTMLInputElement.prototype, 'value', { ...d, set(v) { d.set.call(this, v); if (this.type === 'date' && this.isConnected) DateFace.paint(this) } })
  for (const ev of ['input', 'change']) document.addEventListener(ev, (e) => DateFace.paint(e.target), true)
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches('input[type=date]') ? DateFace.paint(n) : DateFace.paintAll(n)))))
    .observe(document.documentElement, { childList: true, subtree: true })
}

// Typing in fields, as in Apex:
//  • time fields (data-time) show 00:00 and are typed over digit by digit from the left (the
//    colon is skipped); Backspace steps back putting 0s. Left untouched, an empty one stays empty.
//  • number fields (data-num) take digits only.
//  • clicking into a text field selects its whole content, ready to be typed over.
const Typing = {
  isText: (i) => i?.tagName === 'INPUT' && ['text', 'password', 'search', ''].includes(i.type) && !i.readOnly && !i.disabled,
  set(i, v, caret) {
    i.value = v
    i.setSelectionRange(caret, caret)
    i.dispatchEvent(new Event('input', { bubbles: true }))
  },
  time(i, e) {
    const v = /^\d\d:\d\d$/.test(i.value) ? i.value : '00:00'
    const all = i.selectionStart === 0 && i.selectionEnd === i.value.length && i.value.length > 0
    let p = all ? 0 : i.selectionStart
    if (/^\d$/.test(e.key)) {
      e.preventDefault()
      if (p === 2) p = 3
      if (p > 4) return
      i.dataset.typed = '1'
      this.set(i, v.slice(0, p) + e.key + v.slice(p + 1), p + 1 === 2 ? 3 : p + 1)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      if (all) { i.dataset.wasEmpty = '1'; delete i.dataset.typed; return this.set(i, '00:00', 0) } // cleared: empty again unless typed
      i.dataset.typed = '1'
      if (e.key === 'Backspace') { if (p === 0) return; p -= p === 3 ? 2 : 1 }
      else if (p === 2) p = 3
      if (p > 4) return
      this.set(i, v.slice(0, p) + '0' + v.slice(p + 1), p)
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) e.preventDefault()
  },
}
document.addEventListener('keydown', (e) => {
  const i = e.target
  if (!Typing.isText(i)) return
  if (i.dataset.time != null) Typing.time(i, e)
  else if (i.dataset.num != null && e.key.length === 1 && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault()
}, true)
document.addEventListener('paste', (e) => {
  const i = e.target
  if (!Typing.isText(i) || (i.dataset.time == null && i.dataset.num == null)) return
  e.preventDefault()
  const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '')
  if (i.dataset.num != null) return Typing.set(i, d.slice(0, i.maxLength > 0 ? i.maxLength : undefined), d.length)
  const t = d.padStart(4, '0').slice(-4)
  i.dataset.typed = '1'
  Typing.set(i, `${t.slice(0, 2)}:${t.slice(2)}`, 5)
}, true)
document.addEventListener('focusin', (e) => {
  const i = e.target
  if (!Typing.isText(i)) return
  if (i.dataset.time != null) {
    i.dataset.wasEmpty = i.value ? '' : '1'
    delete i.dataset.typed
    if (!i.value) i.value = '00:00'
  }
  i.select()
}, true)
document.addEventListener('focusout', (e) => {
  const i = e.target
  if (i?.dataset?.time == null || !i.dataset.wasEmpty || i.dataset.typed) return
  if (i.value === '00:00') i.value = '' // only looked at: stays empty
}, true)
// a mouse click into an unfocused text field selects it all (the click would otherwise drop the caret)
document.addEventListener('mousedown', (e) => {
  const i = e.target
  if (!Typing.isText(i) || document.activeElement === i || e.button !== 0) return
  e.preventDefault()
  i.focus()
}, true)

document.addEventListener('mousedown', (e) => {
  const sel = e.target.closest?.('select')
  if (sel && !sel.multiple && !sel.disabled && sel.size <= 1) {
    e.preventDefault() // no native popup
    sel.focus()
    if (UI.selPop) UI.closeSelect()
    else UI.openSelect(sel)
  } else if (!e.target.closest?.('.sel-pop')) UI.closeSelect()
}, true)
addEventListener('keydown', (e) => { if (e.key === 'Escape') UI.closeSelect() })
addEventListener('blur', () => UI.closeSelect())
addEventListener('scroll', (e) => { if (e.target !== UI.selPop) UI.closeSelect() }, true)
