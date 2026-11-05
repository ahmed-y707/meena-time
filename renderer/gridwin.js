// A list page (components/hr/generic-list-page.tsx): search + «تصدير» + «اضافة» above a table with
// pencil / trash on each row and page buttons below; adding and editing happen in a dialog.
//
// cfg = {
//   id, title, table, orderBy?, help?,
//   columns: [{ field, label, type: 'text'|'en'|'check'|'select'|'date'|'time'|'readonly',
//               options?: () => [[value, label]], format?: (v,row) => string, required?, virtual? }],
//   extraButtons?: [{ key, label, icon, onClick(ctx), viewOnly? }], // viewOnly: an action of a row
//   idLabel?: string,                                       // caption of the number column (default «#»)
//   seqNo?: true,                                           // number the rows 1…n instead of showing the id
//   beforeDelete?: (row) => string|null,                    // return a message to block
//   onRowOpen?: (row, ctx) => void,                         // double-click
//   deleteOnly?: true,                                      // list with delete only (no add/edit)
//   onDeleteRow?: (row) => void,                            // custom delete (inside the transaction)
//   validate?: (row) => string|null,                        // check before saving
//   afterSave?: () => void,
//   scope?: () => ({ where, params, fixed }),               // show a subset; «fixed» fields go into new rows
// }
function openGridWindow(cfg) {
  UI.openWindow(cfg.id, cfg.title, { width: 1200 }, (body, win) => {
    const cols = cfg.columns
    const saveCols = cols.filter((c) => c.type !== 'readonly' && !c.virtual)
    let rows = [], q = '', page = 1, size = 25, current = null
    const can = (a) => Perm.can(win.permKey, a)

    const load = () => {
      const fields = ['id', ...new Set(cols.filter((c) => !c.virtual).map((c) => c.field))].join(', ')
      const sc = cfg.scope?.() || {}
      rows = DB.all(`SELECT ${fields} FROM ${cfg.table} ${sc.where ? `WHERE ${sc.where}` : ''} ORDER BY ${cfg.orderBy || 'id'}`, sc.params || [])
      draw()
    }
    const ctx = { get currentRow() { return current }, reload: load, win }

    // a cell as it reads in the table / the search
    const optionsOf = {}
    const text = (c, r) => {
      const v = r[c.field]
      if (c.format) return c.format(v, r) ?? ''
      if (c.type === 'select') return ((optionsOf[c.field] ||= c.options?.() || []).find(([x]) => String(x) === String(v ?? '')) || [])[1] ?? ''
      if (c.type === 'check') return v ? '✓' : ''
      if (c.type === 'date' && v) return String(v).split('-').reverse().join('/')
      return v ?? ''
    }

    const bar = UI.el('<div class="toolbar list-bar"></div>')
    bar.append(UI.searchBox('بحث', (v) => { q = v; page = 1; draw() }))
    bar.append(UI.exportMenu(cfg.title, () => allTable()))
    for (const b of cfg.extraButtons || []) if (!b.viewOnly) bar.append(UI.toolbar([{ ...b, onClick: () => b.onClick(ctx) }]).firstChild)
    if (!cfg.deleteOnly) bar.append(UI.toolbar([{ key: 'new', label: 'اضافة', icon: 'new', onClick: () => edit(null) }]).firstChild)
    const head = cols.map((c) => `<th>${UI.esc(c.label)}</th>`).join('')
    const card = UI.el(`<div class="apex-card"><div class="grid-wrap"><table class="apex-table"><thead><tr><th style="width:${cfg.idLabel ? 110 : 60}px">${UI.esc(cfg.idLabel || '#')}</th>${head}<th class="apex-col-actions"></th></tr></thead><tbody></tbody></table></div><div class="pager"></div></div>`)
    body.append(bar, card)
    const tbody = card.querySelector('tbody')

    const shown = () => {
      const s = q.toLowerCase()
      return !s ? rows : rows.filter((r) => cols.some((c) => String(text(c, r)).toLowerCase().includes(s)) || String(r.id).includes(s))
    }
    function rowHtml(r, i) {
      const extras = (cfg.extraButtons || []).filter((b) => b.viewOnly)
        .map((b) => `<button type="button" class="row-btn" data-x="${b.key}" title="${UI.esc(b.label)}">${ICONS[b.icon] || ''}<span>${UI.esc(b.label)}</span></button>`).join('')
      return `<tr data-id="${r.id}"><td>${cfg.seqNo ? i + 1 : r.id}</td>${cols.map((c) => `<td>${UI.esc(text(c, r))}</td>`).join('')}<td class="apex-col-actions"><div class="row-acts">${extras}
        ${cfg.deleteOnly || !can('edit') ? '' : `<button type="button" class="apex-icon-edit" data-a="edit" title="تعديل" aria-label="تعديل">${ic('pencil')}</button>`}
        ${can('del') ? `<button type="button" class="apex-icon-delete" data-a="del" title="حذف" aria-label="حذف">${ic('trash-2')}</button>` : ''}</div></td></tr>`
    }
    // all matching rows, not just this page (for «تصدير»)
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
      tbody.innerHTML = list.slice(from, from + size).map((r, i) => rowHtml(r, from + i)).join('')
        || `<tr><td class="empty" colspan="${cols.length + 2}">${UI.emptyState(rows.length ? undefined : 'لا توجد بيانات')}</td></tr>`
      const pager = card.querySelector('.pager')
      pager.innerHTML = ''
      if (list.length > 5) pager.append(UI.pagination({ page, pageCount, pageSize: size, onPage: (p) => { page = p; draw() }, onSize: (n) => { size = n; page = 1; draw() } }))
    }
    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]'), btn = e.target.closest('button')
      if (!tr || !btn) return
      current = rows.find((r) => String(r.id) === tr.dataset.id)
      if (btn.dataset.a === 'edit') edit(current)
      else if (btn.dataset.a === 'del') remove(current)
      else if (btn.dataset.x) cfg.extraButtons.find((b) => b.key === btn.dataset.x).onClick(ctx)
    })
    tbody.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return
      const tr = e.target.closest('tr[data-id]')
      if (!tr) return
      current = rows.find((r) => String(r.id) === tr.dataset.id)
      if (cfg.onRowOpen) cfg.onRowOpen(current, ctx)
      else if (!cfg.deleteOnly && can('edit')) edit(current)
    })

    function field(c, r) {
      const v = r?.[c.field] ?? ''
      const attr = `data-f="${c.field}"`
      switch (c.type) {
        case 'check': return `<label class="chk"><input type="checkbox" ${attr} ${v ? 'checked' : ''}> ${UI.esc(c.label)}</label>`
        case 'select': return `<label>${UI.esc(c.label)}${c.required ? ' <b class="req">*</b>' : ''}</label><select ${attr}><option value=""></option>${(c.options?.() || []).map(([x, l]) => `<option value="${UI.esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}</select>`
        case 'date': return `<label>${UI.esc(c.label)}${c.required ? ' <b class="req">*</b>' : ''}</label><input type="date" ${attr} value="${UI.esc(v)}">`
        case 'time': return `<label>${UI.esc(c.label)}</label><input type="text" ${attr} data-time dir="ltr" maxlength="5" value="${UI.esc(v)}">`
        default: return `<label>${UI.esc(c.label)}${c.required ? ' <b class="req">*</b>' : ''}</label><input type="text" ${attr} ${c.type === 'en' ? 'dir="ltr"' : ''} value="${UI.esc(v)}">`
      }
    }
    function edit(r) {
      const wide = saveCols.length > 3
      UI.dialog({ head: r ? 'تعديل' : 'اضافة', x: true, width: wide ? 960 : 480, cls: `apex-dlg${wide ? ' lg' : ''}`,
        bodyHtml: `<div class="dlg-grid">${saveCols.map((c) => `<div class="fld">${field(c, r)}</div>`).join('')}</div>`,
        onOpen: (d) => d.root.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing && !UI.selPop && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); d.root.querySelector('.btns .pri').click() }
        }),
        buttons: [{ label: 'حفظ', icon: 'save', onClick: async (d) => {
          const v = { ...(r || {}) }
          d.root.querySelectorAll('[data-f]').forEach((i) => { v[i.dataset.f] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value.trim() })
          const err = check(v)
          if (err) return d.error(err)
          const res = await write(v, !!r)
          if (res) return d.error(res)
          d.close(true)
          load()
          UI.message('تم حفظ البيانات بنجاح.')
        } }] })
    }
    function check(r) {
      for (const c of cols) {
        if (c.required && !String(r[c.field] ?? '').trim()) return `${c.label} مطلوب`
        if (c.type === 'time' && r[c.field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r[c.field])) return `${c.label}: الوقت يجب أن يكون بصيغة HH:MM`
      }
      return cfg.validate?.(r) || null
    }
    // → an error message, or null when saved
    async function write(r, existing) {
      if (WebSync.blocks(cfg.table)) return ' '
      const val = (c) => (c.type === 'check' ? (r[c.field] ? 1 : 0) : r[c.field] ?? '')
      try {
        if (existing) DB.run(`UPDATE ${cfg.table} SET ${saveCols.map((c) => `${c.field} = ?`).join(', ')} WHERE id = ?`, [...saveCols.map(val), r.id])
        else {
          const fx = Object.entries(cfg.scope?.().fixed || {})
          DB.run(`INSERT INTO ${cfg.table} (${[...saveCols.map((c) => c.field), ...fx.map(([k]) => k)].join(', ')}) VALUES (${[...saveCols, ...fx].map(() => '?').join(', ')})`, [...saveCols.map(val), ...fx.map(([, x]) => x)])
        }
      } catch (e) {
        return /UNIQUE/.test(e.message) ? 'القيمة مكررة — يوجد سجل بنفس البيانات' : `تعذّر الحفظ: ${e.message}`
      }
      DB.audit('حفظ', cfg.title, `${existing ? 'changed' : 'new'}:${r.id ?? ''}`)
      await DB.flush()
      for (const k of Object.keys(optionsOf)) delete optionsOf[k]
      cfg.afterSave?.()
      return null
    }
    async function remove(r) {
      if (WebSync.blocks(cfg.table)) return
      const block = cfg.beforeDelete?.(r)
      if (block) return UI.message(block)
      if (!(await UI.confirm('هل تريد حذف السجل المحدد؟', 'تأكيد الحذف'))) return
      try {
        cfg.onDeleteRow ? cfg.onDeleteRow(r) : DB.run(`DELETE FROM ${cfg.table} WHERE id = ?`, [r.id])
      } catch (e) { return UI.message(`تعذّر الحذف: ${e.message}`) }
      DB.audit('حذف', cfg.title, String(r.id))
      await DB.flush()
      cfg.afterSave?.()
      load()
    }
    load()
  })
}
