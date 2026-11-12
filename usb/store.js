// Masar Time USB — the data: employees (fingerprint number → name) and their punches, kept in one
// file encrypted with AES-256-GCM under the activation's data key (see licence.js).
// The report is worked out here too, so a tampered window can't produce one without the data.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const REPEAT_MIN = 5
const mins = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5)
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function createStore(file, key) {
  let data = { v: 1, employees: {}, punches: {}, imports: [] }

  function load() {
    if (!fs.existsSync(file)) return
    const b = fs.readFileSync(file)
    const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    data = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'))
  }
  function save() {
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()])
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), body]))
    fs.renameSync(tmp, file) // a crash never leaves a half-written file
  }

  // ZKTeco «attlog.dat» from the device's USB export: "   5000\t2026-10-01 09:14:50\t1\t0\t1\t0" (CRLF);
  // also accepts CSV-like lines "5000,2026-10-01 09:14" and dd/mm/yyyy dates.
  function parse(text) {
    const out = []
    for (const line of String(text).split(/\r?\n/)) {
      const pin = line.match(/^\s*"?(\d{1,9})"?[\s,;\t]/)?.[1]
      let m = line.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/)
      let y, mo, d, h, mi, s
      if (m) [, y, mo, d, h, mi, s] = m
      else if ((m = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/))) [, d, mo, y, h, mi, s] = m
      if (!pin || !m) continue
      const p2 = (x) => String(x || 0).padStart(2, '0')
      out.push({ pin: String(+pin), ts: `${y}-${p2(mo)}-${p2(d)} ${p2(h)}:${p2(mi)}:${p2(s)}` })
    }
    return out
  }

  // → { read, added, duplicates, newEmployees, from, to }
  function importText(text, source) {
    const list = parse(text)
    let added = 0, duplicates = 0, newEmployees = 0
    const touched = new Set()
    for (const { pin, ts } of list) {
      if (!data.employees[pin]) { data.employees[pin] = { name: '' }; newEmployees++ }
      const arr = (data.punches[pin] ||= [])
      if (arr.includes(ts)) { duplicates++; continue }
      arr.push(ts); added++; touched.add(pin)
    }
    for (const pin of touched) data.punches[pin].sort()
    const days = list.map((p) => p.ts.slice(0, 10)).sort()
    const res = { read: list.length, added, duplicates, newEmployees, from: days[0] || null, to: days.at(-1) || null }
    data.imports.push({ at: new Date().toISOString(), source: String(source || '').slice(0, 200), ...res })
    if (data.imports.length > 500) data.imports = data.imports.slice(-500)
    save()
    return res
  }

  function employees() {
    return Object.entries(data.employees)
      .map(([pin, e]) => ({ pin, name: e.name || '', punches: (data.punches[pin] || []).length, last: (data.punches[pin] || []).at(-1) || null }))
      .sort((a, b) => +a.pin - +b.pin)
  }
  function renameEmployee(pin, name) {
    if (!data.employees[pin]) return false
    data.employees[pin].name = String(name || '').trim().slice(0, 80)
    save()
    return true
  }
  function deleteEmployee(pin) {
    if (!data.employees[pin]) return false
    delete data.employees[pin]
    delete data.punches[pin]
    save()
    return true
  }

  // The one report: per employee per day, the first punch (دخول) and the last (خروج).
  // A day with a single punch (or only repeats of it) has no خروج. Days without punches are not listed.
  function report({ from, to, pin = null }) {
    const rows = []
    const pins = pin ? [String(pin)] : Object.keys(data.employees).sort((a, b) => +a - +b)
    for (const p of pins) {
      const byDay = {}
      for (const ts of data.punches[p] || []) {
        const d = ts.slice(0, 10)
        if ((from && d < from) || (to && d > to)) continue
        ;(byDay[d] ||= []).push(ts.slice(11, 16))
      }
      for (const d of Object.keys(byDay).sort()) {
        // a finger pressed again within REPEAT_MIN of the first punch is the same arrival, not a خروج
        const t = byDay[d].filter((x, i, a) => i === 0 || mins(x) - mins(a[0]) >= REPEAT_MIN)
        const [y, m, dd] = d.split('-').map(Number)
        rows.push({ pin: p, name: data.employees[p]?.name || '', date: d, day: DAY_NAMES[new Date(y, m - 1, dd).getDay()],
          in: t[0], out: t.length > 1 ? t.at(-1) : '', count: t.length })
      }
    }
    return rows
  }

  function summary() {
    const all = Object.values(data.punches).flat().sort()
    return { employees: Object.keys(data.employees).length, punches: all.length, first: all[0] || null, last: all.at(-1) || null, lastImport: data.imports.at(-1) || null }
  }

  load()
  return { importText, employees, renameEmployee, deleteEmployee, report, summary, parse }
}

module.exports = { createStore }
