// Messages to guardians: a late notice when a student's first punch of the day is
// after start + grace, an absence notice when there is still no punch at start +
// N minutes. The window sends the day's plan (who has school today, at what time,
// who is on leave) — the rules here only compare minutes, so a burst of punches
// costs a Map lookup each. Sending goes through one spaced-out queue (WhatsApp bans
// bursty senders); SMS can stand in when WhatsApp fails, go with it, or replace it.
const fs = require('fs')
const path = require('path')
const sms = require('./sms')
const { localDay } = require('./journal')

const DEFAULTS = {
  enabled: false,
  late: true,
  absent: true,
  absentAfter: 60,      // minutes after the start time
  lateWindow: 180,      // no late notice for a punch older than this (e.g. a device sending yesterday's log)
  whatsapp: true,
  smsMode: 'off',       // off | fallback | always | only
  sms: { provider: 'none' },
  testMode: false,
  testNumber: '',
  schoolName: '',
  tplLate: 'المكرم ولي أمر الطالب/ة: {name}\nنحيطكم علماً بأن {name} حضر/ت إلى المدرسة اليوم {day} {date} الساعة {time} متأخراً/ة {minutes} دقيقة.\n{school}',
  tplAbsent: 'المكرم ولي أمر الطالب/ة: {name}\nنحيطكم علماً بغياب {name} عن المدرسة اليوم {day} {date}، ولم يُسجَّل حضوره/ا حتى الساعة {cutoff}.\n{school}',
}
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fill = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (all, k) => (v[k] ?? all))
// any Saudi mobile spelling → 9665XXXXXXXX, else null
function intl(v) {
  let d = String(v || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '').replace(/^00/, '')
  if (d.startsWith('966')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return /^5\d{8}$/.test(d) ? '966' + d : null
}
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return d } }
const writeJSON = (p, v) => { fs.writeFileSync(p + '.tmp', JSON.stringify(v), { mode: 0o600 }); fs.renameSync(p + '.tmp', p) }

function createNotifier({ dir, whatsapp, log = () => {}, now = () => new Date(), gapMs = [3000, 6000] }) {
  const P = { settings: path.join(dir, 'settings.json'), state: path.join(dir, 'notify-state.json'), log: path.join(dir, 'messages.jsonl') }
  let settings = { ...DEFAULTS, ...readJSON(P.settings, {}) }
  let roster = { date: null, students: {} }
  let state = readJSON(P.state, { date: null, sent: {}, first: {} })
  let stateDirty = false
  const queue = []
  let sending = false

  const minutesOf = (d) => d.getHours() * 60 + d.getMinutes()
  function today() {
    const d = localDay(now())
    if (state.date !== d) { state = { date: d, sent: {}, first: {} }; stateDirty = true }
    return d
  }
  const saveState = () => { if (stateDirty) { try { writeJSON(P.state, state); stateDirty = false } catch (e) { log(`state: ${e.message}`) } } }
  setInterval(saveState, 5000).unref()

  function record(entry) {
    const line = JSON.stringify({ at: now().toISOString(), ...entry })
    try { fs.appendFileSync(P.log, line + '\n') } catch (e) { log(`messages log: ${e.message}`) }
  }

  function vars(st, extra) {
    const d = now()
    return { name: st.n, school: settings.schoolName, date: localDay(d).split('-').reverse().join('/'), day: DAY_NAMES[d.getDay()], ...extra }
  }

  function enqueue(kind, code, st, text) {
    queue.push({ kind, code, name: st.n, phone: st.p, text })
    pump()
  }

  async function pump() {
    if (sending) return
    sending = true
    try {
      while (queue.length) {
        const m = queue.shift()
        const usedWa = await deliver(m)
        if (queue.length && usedWa) await new Promise((r) => setTimeout(r, gapMs[0] + Math.random() * (gapMs[1] - gapMs[0])))
      }
    } finally { sending = false }
  }

  // returns whether WhatsApp was used (the queue waits between WhatsApp messages only)
  async function deliver(m) {
    const s = settings
    let to = intl(m.phone), text = m.text
    if (s.testMode && !m.direct) { to = intl(s.testNumber); text = `[وضع التجربة — الرقم الأصلي: ${m.phone || 'غير مسجّل'}]\n` + text }
    const base = { type: m.kind, code: m.code, name: m.name, phone: m.phone, test: !!(s.testMode && !m.direct) }
    if (!to) { record({ ...base, ok: false, channel: '-', text: m.phone ? 'رقم ولي الأمر غير صحيح' : (s.testMode ? 'وضع التجربة بدون رقم تجربة' : 'لا يوجد رقم ولي أمر') }); return false }
    let waOk = false, usedWa = false
    if (s.whatsapp && s.smsMode !== 'only') {
      usedWa = true
      try { await whatsapp.send(to, text); waOk = true; record({ ...base, channel: 'whatsapp', ok: true, text }) }
      catch (e) { record({ ...base, channel: 'whatsapp', ok: false, text: String(e.message || e).slice(0, 200) }) }
    }
    if (s.smsMode === 'always' || s.smsMode === 'only' || (s.smsMode === 'fallback' && !waOk)) {
      try { await sms.send(s.sms, to, text); record({ ...base, channel: 'sms', ok: true, text }) }
      catch (e) { record({ ...base, channel: 'sms', ok: false, text: String(e.message || e).slice(0, 200) }) }
    }
    return usedWa
  }

  // live punches (any order, any device): only the first one today counts
  function onPunches(rows) {
    const d = today()
    const nowMin = minutesOf(now())
    for (const r of rows) {
      if (r.t.slice(0, 10) !== d) continue
      const m = +r.t.slice(11, 13) * 60 + +r.t.slice(14, 16)
      if (state.first[r.c] != null && state.first[r.c] <= m) continue
      state.first[r.c] = m; stateDirty = true
      const st = roster.date === d && roster.students[r.c]
      if (!st || st.s == null || st.x || !settings.enabled || !settings.late) continue
      const key = 'late|' + r.c
      if (state.sent[key] || m <= st.s + st.g || nowMin - m > settings.lateWindow) continue
      if (!settings.testMode && !intl(st.p)) continue
      state.sent[key] = 1
      enqueue('late', r.c, st, fill(settings.tplLate, vars(st, { time: hm(m), minutes: m - st.s })))
    }
  }

  // every 30 s, and from the «فحص الغياب الآن» button (force: ignore the time)
  function checkAbsence({ force = false } = {}) {
    const d = today()
    if (roster.date !== d || !settings.enabled || !settings.absent) return 0
    if (roster.holiday) return 0
    // not a single punch today: the school is closed or the devices are down — say nothing
    if (!Object.keys(state.first).length) return 0
    const nowMin = minutesOf(now())
    let n = 0
    for (const [code, st] of Object.entries(roster.students)) {
      if (st.s == null || st.x || state.first[code] != null) continue
      const cutoff = st.s + (+settings.absentAfter || 0)
      if (!force && nowMin < cutoff) continue
      const key = 'absent|' + code
      if (state.sent[key]) continue
      if (!settings.testMode && !intl(st.p)) continue
      state.sent[key] = 1; stateDirty = true; n++
      enqueue('absent', code, st, fill(settings.tplAbsent, vars(st, { cutoff: hm(cutoff) })))
    }
    if (n) record({ type: 'absent-run', ok: true, channel: '-', text: `فحص الغياب: ${n} رسالة` })
    return n
  }
  setInterval(() => { try { checkAbsence() } catch (e) { log(`absence: ${e.message}`) } }, 30e3).unref()

  return {
    DEFAULTS,
    PROVIDERS: sms.PROVIDERS,
    get settings() { return settings },
    setSettings(patch) {
      const next = { ...settings }
      for (const k of ['enabled', 'late', 'absent', 'whatsapp', 'testMode']) if (k in patch) next[k] = !!patch[k]
      for (const k of ['absentAfter', 'lateWindow']) if (k in patch) next[k] = Math.max(0, Math.min(720, parseInt(patch[k], 10) || 0))
      if ('smsMode' in patch && ['off', 'fallback', 'always', 'only'].includes(patch.smsMode)) next.smsMode = patch.smsMode
      for (const k of ['testNumber', 'schoolName', 'tplLate', 'tplAbsent']) if (k in patch) next[k] = String(patch[k] ?? '').slice(0, 1000)
      if (patch.sms && typeof patch.sms === 'object') {
        next.sms = { ...settings.sms }
        for (const [k, v] of Object.entries(patch.sms)) if (typeof v === 'string') next.sms[k] = v.slice(0, 300)
      }
      settings = next
      writeJSON(P.settings, settings)
      return settings
    },
    // {date, holiday, students: {code: {n, p, s, g, x}}, first: {code: minute}} from the window
    setRoster(r) {
      const d = today()
      roster = { date: r.date, holiday: !!r.holiday, students: r.students || {} }
      if (r.date === d && r.first) for (const [c, m] of Object.entries(r.first)) if (state.first[c] == null || m < state.first[c]) { state.first[c] = m; stateDirty = true }
    },
    onPunches,
    checkAbsence,
    // the «إرسال رسالة تجربة» button: straight to the number typed, test mode or not
    async test(phone) {
      await deliver({ kind: 'test', code: '', name: '—', phone, text: `رسالة تجربة من ${settings.schoolName || 'نظام الحضور'} ✓`, direct: true })
      return readLog(1)[0]
    },
    status() {
      const d = today()
      const st = Object.values(roster.date === d ? roster.students : {})
      const dueToday = st.filter((x) => x.s != null && !x.x)
      return {
        date: d, queue: queue.length + (sending ? 1 : 0), students: st.length, schoolToday: dueToday.length,
        present: Object.keys(state.first).length, late: Object.keys(state.sent).filter((k) => k.startsWith('late|')).length,
        absentSent: Object.keys(state.sent).filter((k) => k.startsWith('absent|')).length,
        noPhone: st.filter((x) => !intl(x.p)).length, holiday: !!roster.holiday,
      }
    },
    readLog,
  }

  function readLog(limit = 200) {
    try {
      const size = fs.statSync(P.log).size
      const len = Math.min(size, 512 * 1024) // the tail is enough for the window
      const fd = fs.openSync(P.log, 'r')
      const buf = Buffer.alloc(len)
      try { fs.readSync(fd, buf, 0, len, size - len) } finally { fs.closeSync(fd) }
      const out = []
      for (const l of buf.toString('utf8').split('\n').reverse()) { if (!l) continue; try { out.push(JSON.parse(l)) } catch {} if (out.length >= limit) break }
      return out
    } catch { return [] }
  }
}

module.exports = { createNotifier, intl, DEFAULTS }
