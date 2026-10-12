// Generic Apex-Time-style editable grid window. Like Apex it is either adding (a numbered new row
// at the bottom; جديد off, حفظ / إهمال on) or viewing (no new row; جديد on, حفظ / إهمال only once
// something was edited). It opens adding; حفظ saves and opens the next new row; إهمال asks, drops
// every unsaved change and switches to viewing; Enter saves quietly and moves on. (the «مجموعات أوقات الدوام»
// pattern): toolbar مساعدة · [extra] · جديد · حفظ · إهمال · حذف · طباعة · إغلاق,
// rows edited in place, committed with «حفظ», discarded with «إهمال».
//
// cfg = {
//   id, title, table, width?, height?, help?, orderBy?,
//   columns: [{ field, label, width?, type: 'text'|'en'|'check'|'select'|'date'|'time'|'readonly',
//               options?: () => [[value, label]], format?: (v,row) => string, required? }],
//   extraButtons?: [{ key, label, icon, onClick(ctx), viewOnly? }], // after «مساعدة»; viewOnly: off while adding
//   buttons?: ['new', 'save', …],                           // this window's Apex button sequence (keys)
//   idLabel?: string,                                       // caption of the number column (default «#»)
//   seqNo?: true,                                           // number the rows 1…n instead of showing the id
//   beforeDelete?: (row) => string|null,                    // return a message to block
//   onRowOpen?: (row) => void,                              // double-click
//   deleteOnly?: true,                                      // list with «حذف» only (no new/edit)
//   onDeleteRow?: (row) => void,                            // custom delete (inside the save transaction)
//   validate?: (row) => string|null,                        // per-row check before saving
//   afterSave?: () => void,
//   scope?: () => ({ where, params, fixed }),               // show a subset; «fixed» fields go into new rows
//   side?: (ctx) => Element, caption?: () => string,        // a panel beside the grid, a title bar above it
// }
function openGridWindow(cfg) {
  UI.openWindow(cfg.id, cfg.title, { width: cfg.width || 640, height: cfg.height || 360 }, (body, win) => {
    const cols = cfg.columns
    const editable = cols.filter((c) => c.type !== 'readonly')
    let rows = []
    let dirty = false
    let current = 0
    let adding = !cfg.deleteOnly

    const blankRow = () => Object.fromEntries([['_state', 'blank'], ...cols.map((c) => [c.field, c.type === 'check' ? 0 : ''])])
    const load = () => {
      const fields = ['id', ...new Set(cols.filter((c) => !c.virtual).map((c) => c.field))].join(', ')
      const sc = cfg.scope?.() || {}
      rows = DB.all(`SELECT ${fields} FROM ${cfg.table} ${sc.where ? `WHERE ${sc.where}` : ''} ORDER BY ${cfg.orderBy || 'id'}`, sc.params || []).map((r) => ({ ...r, _state: 'clean' }))
      dirty = false
      current = Math.min(current, adding ? rows.length : Math.max(0, rows.length - 1))
      if (cap) cap.textContent = cfg.caption()
      draw()
    }
    const ctx = {
      get currentRow() { return rows.filter((r) => r._state !== 'deleted')[current] || null },
      reload: load,
      win,
    }

    const all = [
      { key: 'help', label: 'مساعده', icon: 'help', onClick: () => UI.message(cfg.help || 'أدخل البيانات في السطر الفارغ ثم اضغط «حفظ».') },
      ...(cfg.extraButtons || []).map((b) => ({ ...b, onClick: () => b.onClick(ctx) })),
      ...(cfg.deleteOnly ? [] : [
        { key: 'new', label: 'جديد', icon: 'new', onClick: startAdding },
        { key: 'save', label: 'حفظ', icon: 'save', onClick: async () => {
          if (!(await save())) return
          startAdding()
          await UI.message('تم حفظ البيانات بنجاح.')
          focusFirst()
        } },
        { key: 'undo', label: 'إهمال', icon: 'undo', onClick: async () => {
          if (!(await UI.dialog({ head: 'تأكيد', msg: true, bodyHtml: '<div class="msg-icon">i</div><div class="msg-text">سيتم حذف جميع التعديلات، هل أنت متأكد؟</div>', width: 360,
            buttons: [{ label: 'موافق', icon: 'ok', onClick: (d) => d.close(true) }, { label: 'الغاء', icon: 'cancel', onClick: (d) => d.close(false) }] }))) return
          adding = false
          load()
        } },
      ]),
      { key: 'del', label: 'حذف', icon: 'del', onClick: remove },
      { key: 'print', label: 'طباعه', icon: 'print', onClick: () => UI.printGrid(cfg.title, wrap) },
      { key: 'close', label: 'إغلاق', icon: 'close', onClick: async () => { if (!dirty || (await confirmDiscard())) win.close() } },
    ]
    const bar = UI.toolbar(cfg.buttons ? cfg.buttons.map((k) => all.find((b) => b.key === k)).filter(Boolean) : all)
    function startAdding() {
      adding = true
      current = rows.filter((r) => r._state !== 'deleted').length
      draw()
      focusFirst()
    }
    // Apex greys out جديد while adding, حفظ / إهمال while there is nothing to save or drop
    function syncButtons() {
      const off = { new: adding, save: !adding && !dirty, undo: !adding && !dirty }
      for (const b of cfg.extraButtons || []) if (b.viewOnly) off[b.key] = adding
      for (const b of bar.querySelectorAll('button[data-key]')) if (b.dataset.key in off) b.disabled = off[b.dataset.key] || !!b.dataset.permOff
    }
    const head = cols.map((c, i) => `<th ${i === 0 ? 'class="sorted"' : ''} style="${c.width ? `width:${c.width}px` : ''}">${UI.esc(c.label)}</th>`).join('')
    const wrap = UI.el(`<div class="grid-wrap"><table class="grid"><thead><tr>
        <th style="width:16px"></th><th style="width:${cfg.idLabel ? 110 : 34}px">${UI.esc(cfg.idLabel || '#')}</th>${head}</tr></thead><tbody></tbody></table></div>`)
    const cap = cfg.caption ? UI.el('<div class="grid-caption"></div>') : null
    const main = [cap, wrap].filter(Boolean)
    if (cfg.side) {
      const box = UI.el('<div class="grid-side"><div class="gs-main"></div></div>')
      box.firstChild.append(...main)
      box.prepend(cfg.side(ctx)) // first in RTL = on the right, as Apex's «نوع القائمة»
      body.append(bar, box)
    } else body.append(bar, ...main)
    const tbody = wrap.querySelector('tbody')

    function cell(c, r) {
      const v = r[c.field]
      switch (c.type) {
        case 'readonly': return `<td class="center">${r._state === 'blank' ? '' : UI.esc(c.format ? c.format(v, r) : v)}</td>`
        case 'check': return `<td class="center"><input type="checkbox" data-f="${c.field}" ${v ? 'checked' : ''}></td>`
        case 'select': {
          const opts = (c.options?.() || []).map(([val, lab]) => `<option value="${UI.esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${UI.esc(lab)}</option>`).join('')
          return `<td><select data-f="${c.field}" class="cell-select"><option value=""></option>${opts}</select></td>`
        }
        case 'date': return `<td><input type="date" data-f="${c.field}" value="${UI.esc(v)}" class="cell-date"></td>`
        case 'time': return `<td><input type="text" data-f="${c.field}" data-time dir="ltr" maxlength="5" value="${UI.esc(v)}" class="center"></td>`
        default: return `<td><input type="text" data-f="${c.field}" ${c.type === 'en' ? 'dir="ltr"' : ''} value="${UI.esc(v)}"></td>`
      }
    }

    function draw() {
      tbody.innerHTML = ''
      const all = [...rows.filter((r) => r._state !== 'deleted'), ...(adding ? [blankRow()] : [])]
      // the new row shows the number it will get, as in Apex
      const nextNo = cfg.seqNo ? all.length : Math.max(0, ...rows.map((r) => +r.id || 0)) + 1
      all.forEach((r, i) => {
        const tr = UI.el(`<tr class="${i === current ? 'current' : ''} ${r._state === 'blank' ? 'new' : ''}">
          <td class="sel"></td><td class="center">${r._state === 'blank' ? nextNo : cfg.seqNo ? i + 1 : r.id ?? ''}</td>${cols.map((c) => cell(c, r)).join('')}</tr>`)
        const pick = () => {
          if (current === i) return
          current = i
          tbody.querySelectorAll('tr').forEach((x, j) => x.classList.toggle('current', j === i))
        }
        tr.addEventListener('mousedown', pick)
        tr.addEventListener('focusin', pick) // also when Enter / Tab moves into the row
        if (cfg.onRowOpen && r._state !== 'blank') tr.addEventListener('dblclick', () => cfg.onRowOpen(r, ctx))
        tr.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' || inp.type === 'checkbox' || inp.type === 'date' ? 'change' : 'input', () => {
          const v = inp.type === 'checkbox' ? (inp.checked ? 1 : 0) : inp.value
          if (r._state === 'blank') { r._state = 'new'; rows.push(r) }
          else if (r._state === 'clean') r._state = 'changed'
          r[inp.dataset.f] = v
          dirty = true
          syncButtons()
        }))
        tbody.appendChild(tr)
      })
      syncButtons()
    }
    const focusFirst = () => tbody.querySelectorAll('tr')[current]?.querySelector('[data-f]')?.focus()
    // Enter saves at once (when anything changed), then moves down a row in the same column; on the
    // last row it opens a new empty row. A validation message keeps the cursor where it was.
    tbody.addEventListener('keydown', async (e) => {
      const inp = e.target.closest?.('[data-f]')
      if (e.key !== 'Enter' || e.isComposing || !inp || UI.selPop) return
      e.preventDefault()
      const trs = [...tbody.querySelectorAll('tr')]
      const i = trs.indexOf(inp.closest('tr')), field = inp.dataset.f
      const filledBlank = i === trs.length - 1 && rows.filter((r) => r._state !== 'deleted').length >= trs.length
      if (i === trs.length - 1 && !filledBlank) return // still-empty new row: nothing to do
      if (dirty && !(await save())) return
      current = Math.min(i + 1, tbody.querySelectorAll('tr').length - 1)
      draw()
      const tr = tbody.querySelectorAll('tr')[current]
      ;(tr?.classList.contains('new') ? tr.querySelector('[data-f]') : tr?.querySelector(`[data-f="${field}"]`) || tr?.querySelector('[data-f]'))?.focus()
    })

    // → true when everything was saved (Enter only moves on then)
    async function save() {
      const fail = (m) => { UI.message(m); return false }
      if (WebSync.blocks(cfg.table)) { load(); return false }
      for (const r of rows) {
        if (r._state === 'deleted') continue
        for (const c of cols) {
          if (c.required && !String(r[c.field] ?? '').trim()) return fail(`${c.label} مطلوب`)
          if (c.type === 'time' && r[c.field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r[c.field])) return fail(`${c.label}: الوقت يجب أن يكون بصيغة HH:MM`)
        }
        const err = cfg.validate?.(r)
        if (err) return fail(err)
      }
      const val = (c, r) => (c.type === 'check' ? (r[c.field] ? 1 : 0) : typeof r[c.field] === 'string' ? r[c.field].trim() : r[c.field] ?? '')
      const saveCols = editable.filter((c) => !c.virtual)
      try {
        DB.run('BEGIN')
        for (const r of rows) {
          if (r._state === 'new') {
            const fx = Object.entries(cfg.scope?.().fixed || {})
            DB.run(`INSERT INTO ${cfg.table} (${[...saveCols.map((c) => c.field), ...fx.map(([k]) => k)].join(', ')}) VALUES (${[...saveCols, ...fx].map(() => '?').join(', ')})`, [...saveCols.map((c) => val(c, r)), ...fx.map(([, v]) => v)])
          }
          else if (r._state === 'changed') DB.run(`UPDATE ${cfg.table} SET ${saveCols.map((c) => `${c.field} = ?`).join(', ')} WHERE id = ?`, [...saveCols.map((c) => val(c, r)), r.id])
          else if (r._state === 'deleted' && r.id) cfg.onDeleteRow ? cfg.onDeleteRow(r) : DB.run(`DELETE FROM ${cfg.table} WHERE id = ?`, [r.id])
        }
        DB.run('COMMIT')
      } catch (e) {
        DB.run('ROLLBACK')
        return fail(/UNIQUE/.test(e.message) ? 'القيمة مكررة — يوجد سجل بنفس البيانات' : `تعذّر الحفظ: ${e.message}`)
      }
      DB.audit('حفظ', cfg.title, rows.filter((r) => r._state !== 'clean').map((r) => `${r._state}:${r.id ?? ''}`).join(' '))
      await DB.flush()
      cfg.afterSave?.()
      load()
      return true
    }

    async function remove() {
      if (WebSync.blocks(cfg.table)) return
      const r = ctx.currentRow
      if (!r) return
      const block = cfg.beforeDelete?.(r)
      if (block) return UI.message(block)
      const ok = await UI.dialog({ head: 'تأكيد الحذف', bodyHtml: `<div>هل تريد حذف السجل المحدد؟</div>`, width: 340,
        buttons: [{ label: 'نعم', icon: 'ok', onClick: (d) => d.close(true) }, { label: 'لا', icon: 'cancel', onClick: (d) => d.close(false) }] })
      if (!ok) return
      if (r._state === 'new') rows.splice(rows.indexOf(r), 1)
      else r._state = 'deleted'
      await save()
    }

    const confirmDiscard = () => UI.dialog({ head: 'تنبيه', bodyHtml: '<div>توجد تعديلات لم تُحفظ. إغلاق بدون حفظ؟</div>', width: 340,
      buttons: [{ label: 'نعم', icon: 'ok', onClick: (d) => d.close(true) }, { label: 'لا', icon: 'cancel', onClick: (d) => d.close(false) }] })

    load()
  })
}
