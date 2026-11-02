// School gate under load, without Electron: 3 simulated devices push a morning rush
// of 1,000 students (one HTTP post per punch, like real devices), then a device
// dumps 60,000 history lines, then everything is re-sent. Checks nothing is lost
// or doubled, the late / absence messages, test mode, SMS fallback, the journal's
// crash replay, and that the notifier remembers what it sent across a restart.
//   node tools/gate-test.mjs
import { createRequire } from 'node:module'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
const require = createRequire(import.meta.url)
const { Journal, localDay } = require('../lib/gate/journal')
const { createReceiver, parseAttlog } = require('../lib/gate/adms')
const { createNotifier, intl } = require('../lib/gate/notify')
const sms = require('../lib/gate/sms')

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${n}${x ? '  ' + x : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'))
const day = localDay()
const pad = (n) => String(n).padStart(2, '0')
const at = (min, sec = 0) => `${day} ${pad(Math.floor(min / 60))}:${pad(min % 60)}:${pad(sec)}`

// ── fake WhatsApp: records sends; numbers ending in 9 are «not on WhatsApp» ──
const sent = []
let waDown = false
const whatsapp = { async send(to, text) { if (waDown) throw new Error('واتساب غير مربوط'); if (to.endsWith('9')) { const e = new Error('الرقم غير مسجّل على واتساب'); throw e } sent.push({ to, text }) } }
const smsSent = []
sms.send = async (cfg, to, text) => { if (cfg.provider !== 'msegat') throw new Error('لم يُضبط مزوّد رسائل SMS بعد'); smsSent.push({ to, text }) }

// the clock the notifier sees: 07:30 today
let fakeNow = new Date(`${day}T07:30:00`)
const notifier = createNotifier({ dir, whatsapp, now: () => fakeNow, gapMs: [0, 1] })
notifier.setSettings({ enabled: true, late: true, absent: true, absentAfter: 60, schoolName: 'مدرسة تجريبية', whatsapp: true, smsMode: 'off' })

// 1,000 students, school starts 07:00 with 10 minutes' grace. 10 on leave, 40 with no phone.
const N = 1000
const students = {}
for (let i = 1; i <= N; i++) students[String(1000 + i)] = { n: `TEST-طالبة ${i}`, p: i <= 40 ? '' : `05${String(50000000 + i).padStart(8, '0')}`, s: 420, g: 10, x: i > 40 && i <= 50 ? 1 : 0 }
notifier.setRoster({ date: day, holiday: false, students, first: {} })

// ── 1. ATTLOG parsing ──
const p = parseAttlog('1001\t2026-11-02 07:01:22\t0\t1\t0\t0\n\nbad line\n1002\t2026-11-02 7:05\t0\n')
ok('parses device lines, skips junk', p.rows.length === 2 && p.bad === 1 && p.rows[1].t === '2026-11-02 07:05:00', JSON.stringify(p))

// ── receiver + journal on a free port ──
const journal = new Journal(path.join(dir, 'journal'))
const devices = {}
let posts = 0
const recv = createReceiver({ onDevice: (sn, i) => { devices[sn] = i }, onPunches: (rows) => { posts++; journal.append(rows.map((r) => ({ c: r.c, t: r.t, sn: r.sn }))); notifier.onPunches(rows) } })
const PORT = 18000 + Math.floor(Math.random() * 1000)
await recv.start(PORT)
ok('receiver listens', recv.state.listening, String(PORT))
const base = `http://127.0.0.1:${PORT}`

const hs = await (await fetch(`${base}/iclock/cdata?SN=DEV1&options=all&pushver=2.4.1`)).text()
ok('handshake gives clock + push options', hs.includes('GET OPTION FROM: DEV1') && /TimeZone=\d/.test(hs) && hs.includes('Realtime=1') && hs.includes('\r\n'))
ok('getrequest answers OK', (await (await fetch(`${base}/iclock/getrequest?SN=DEV1`)).text()) === 'OK')
ok('other tables are acknowledged', (await (await fetch(`${base}/iclock/cdata?SN=DEV1&table=OPERLOG`, { method: 'POST', body: 'OPLOG 1\t2\t3' })).text()) === 'OK')

// ── 2. morning rush: every student once (950 of them; 50 absent), one post per punch, 3 devices in parallel ──
// students 1..950 come; 1..700 on time (06:30–07:10), 701..950 late (07:11–07:29)
const rush = []
for (let i = 1; i <= 950; i++) {
  const min = i <= 700 ? 390 + (i % 41) : 431 + (i % 19)
  rush.push({ code: String(1000 + i), ts: at(min, i % 60), sn: `DEV${(i % 3) + 1}` })
}
const lat = []
const t0 = performance.now()
const cpu0 = process.cpuUsage()
await Promise.all([1, 2, 3].map(async (d) => {
  for (const r of rush.filter((x) => x.sn === `DEV${d}`)) {
    const s = performance.now()
    const res = await fetch(`${base}/iclock/cdata?SN=${r.sn}&table=ATTLOG&Stamp=1`, { method: 'POST', body: `${r.code}\t${r.ts}\t0\t1\t0\t0\t0\n` })
    if ((await res.text()) !== 'OK: 1') throw new Error('bad answer')
    lat.push(performance.now() - s)
  }
}))
const ms = performance.now() - t0
const cpu = process.cpuUsage(cpu0)
lat.sort((a, b) => a - b)
ok('950 single-punch posts answered', lat.length === 950, `${ms.toFixed(0)} ms total, p50 ${lat[475].toFixed(1)} ms, p99 ${lat[940].toFixed(1)} ms, CPU ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms`)
ok('rush: p99 under 50 ms per punch', lat[940] < 50)
ok('all three devices seen', ['DEV1', 'DEV2', 'DEV3'].every((s) => devices[s]))

// late notices queue up; wait for the queue to empty
for (let i = 0; i < 200 && notifier.status().queue; i++) await sleep(20)
const lateMsgs = sent.filter((m) => m.text.includes('متأخر'))
// late = 701..950 (250) minus on-leave (none in that range) minus not-on-WhatsApp (numbers ending in 9)
const expectedLate = rush.filter((r) => +r.code - 1000 > 700).length
const notOnWa = rush.filter((r) => +r.code - 1000 > 700 && intl(students[r.code].p).endsWith('9')).length
ok('late notices for exactly the late students', lateMsgs.length === expectedLate - notOnWa, `${lateMsgs.length} sent, ${notOnWa} not on WhatsApp`)
ok('nobody on time got a late notice', !lateMsgs.some((m) => /طالبة (\d+)\b/.test(m.text) && +m.text.match(/طالبة (\d+)\b/)[1] <= 700))
const one = lateMsgs.find((m) => m.text.includes('TEST-طالبة 701 '))
ok('late message filled: time, minutes, school', one && /الساعة 07:\d\d/.test(one.text) && /متأخراً\/ة \d+ دقيقة/.test(one.text) && one.text.includes('مدرسة تجريبية'), one?.text?.replace(/\n/g, ' | '))
const notOnWaLog = notifier.readLog(1000).filter((l) => l.type === 'late' && !l.ok)
ok('«not on WhatsApp» is logged, not lost', notOnWaLog.length === notOnWa && notOnWaLog.every((l) => l.text.includes('غير مسجّل')))

// ── 3. resend everything (devices re-send after a network cut): no second message ──
const before = sent.length
await fetch(`${base}/iclock/cdata?SN=DEV1&table=ATTLOG`, { method: 'POST', body: rush.map((r) => `${r.code}\t${r.ts}\t0\t1`).join('\n') })
await sleep(100)
ok('re-sent punches: no duplicate messages', sent.length === before)

// ── 4. a device dumps its whole history (60k lines from past days) ──
const hist = []
for (let d = 1; d <= 60; d++) for (let i = 1; i <= N; i++) hist.push(`${1000 + i}\t${localDay(new Date(Date.now() - d * 86400e3))} 07:${pad(i % 50)}:00\t0\t1`)
const t1 = performance.now()
for (let i = 0; i < hist.length; i += 10000) {
  const r = await fetch(`${base}/iclock/cdata?SN=DEV2&table=ATTLOG`, { method: 'POST', body: hist.slice(i, i + 10000).join('\n') })
  if (!(await r.text()).startsWith('OK: ')) throw new Error('history batch')
}
ok('60,000 history lines received', true, `${(performance.now() - t1).toFixed(0)} ms`)
ok('history: no messages for old days', sent.length === before)

// ── 5. journal: everything there, drained in pages, acknowledged, replay after a crash ──
let total = 0, next = null
for (;;) { const r = journal.drain(5000); if (!r.rows.length) { next = r.next; break } total += r.rows.length; next = r.next; if (total > 200000) break; journal.ack(r.next) }
ok('journal holds every line (rush + resend + history)', total === 950 + 950 + 60000, String(total))
fs.appendFileSync(path.join(dir, 'journal', day + '.jsonl'), '{"c":"1001","t":"' + at(400) + '"}\n{"c":"10') // a crash mid-line
const j2 = new Journal(path.join(dir, 'journal'))
const after = j2.drain(5000)
ok('after a crash: only the unsaved whole line comes back', after.rows.length === 1 && after.rows[0].c === '1001', JSON.stringify(after.rows))
j2.ack(after.next)
fs.appendFileSync(path.join(dir, 'journal', day + '.jsonl'), '02","t":"' + at(401) + '"}\n')
ok('the torn line is completed later and read once', j2.drain(5000).rows.length === 1)

// ── 6. absence at 08:00 (start 07:00 + 60) ──
fakeNow = new Date(`${day}T07:59:00`)
ok('no absence before the cutoff', notifier.checkAbsence() === 0)
fakeNow = new Date(`${day}T08:00:30`)
const nAbs = notifier.checkAbsence()
for (let i = 0; i < 200 && notifier.status().queue; i++) await sleep(20)
// absent = 951..1000 (50); none on leave or without a phone in that range
ok('absence notices for the 50 who never came', nAbs === 50, String(nAbs))
ok('…and not twice', notifier.checkAbsence() === 0)
ok('on-leave and no-phone students are skipped', !sent.some((m) => /طالبة (4[1-9]|50|[1-9]|[1-3]\d|40)\b/.test(m.text) && m.text.includes('غياب')))

// ── 7. restart: the notifier remembers what it already sent today ──
await sleep(5200) // state is saved every 5 s
const n2 = createNotifier({ dir, whatsapp, now: () => fakeNow, gapMs: [0, 1] })
n2.setRoster({ date: day, holiday: false, students, first: {} })
const s2 = sent.length
n2.onPunches(rush.map((r) => ({ c: r.code, t: r.ts })))
ok('after a restart: no repeated late or absence messages', n2.checkAbsence({ force: true }) === 0 && (await sleep(100), sent.length === s2))

// ── 8. test mode, SMS fallback, holiday, a day with no punches ──
n2.setSettings({ testMode: true, testNumber: '0551112223', smsMode: 'fallback', sms: { provider: 'msegat' } })
waDown = true
n2.setRoster({ date: day, holiday: false, students: { 9001: { n: 'TEST-تجربة', p: '0559998887', s: 420, g: 10, x: 0 } }, first: {} })
n2.onPunches([{ c: '9001', t: at(445) }])
for (let i = 0; i < 100 && n2.status().queue; i++) await sleep(20)
const last = smsSent.at(-1)
ok('test mode: goes to the test number with a banner', last && last.to === '966551112223' && last.text.startsWith('[وضع التجربة — الرقم الأصلي: 0559998887]'), last?.to)
ok('WhatsApp down → SMS fallback used and both logged', n2.readLog(3).some((l) => l.channel === 'whatsapp' && !l.ok) && n2.readLog(3).some((l) => l.channel === 'sms' && l.ok))
waDown = false
const n3 = createNotifier({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-b-')), whatsapp, now: () => fakeNow, gapMs: [0, 1] })
n3.setSettings({ enabled: true })
n3.setRoster({ date: day, holiday: false, students, first: {} })
ok('no punch at all today (school closed / devices off) → no absence storm', n3.checkAbsence({ force: true }) === 0)
n3.setRoster({ date: day, holiday: true, students, first: { 1001: 400 } })
ok('official holiday → no absence', n3.checkAbsence({ force: true }) === 0)
n3.setSettings({ enabled: false })
n3.setRoster({ date: day, holiday: false, students, first: { 1001: 400 } })
ok('messages switched off → nothing', n3.checkAbsence({ force: true }) === 0)
ok('phone spellings normalised', intl('0551234567') === '966551234567' && intl('+966 55 123 4567') === '966551234567' && intl('٠٥٥١٢٣٤٥٦٧') === '966551234567' && intl('551234567') === '966551234567' && intl('12345') === null)

// secrets never come back in full: covered in index.js (maskSms); settings file is 0600
ok('settings file is private (0600)', (fs.statSync(path.join(dir, 'settings.json')).mode & 0o777) === 0o600)

// ── 9. the receiver alone in its own process (as in the app): memory through a rush + 60k history ──
{
  const { spawn } = await import('node:child_process')
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-child-'))
  const cport = PORT + 1
  const child = spawn(process.execPath, ['-e', `
    const { Journal } = require(${JSON.stringify(path.resolve('lib/gate/journal.js'))})
    const { createReceiver } = require(${JSON.stringify(path.resolve('lib/gate/adms.js'))})
    const j = new Journal(${JSON.stringify(cdir)})
    const r = createReceiver({ onDevice() {}, onPunches(rows) { j.append(rows) } })
    r.start(${cport}).then(() => console.log('ready'))
    process.on('message', () => process.send(process.memoryUsage().rss))`], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] })
  await new Promise((r) => child.stdout.once('data', r))
  const rss = () => new Promise((r) => { child.once('message', r); child.send(1) })
  const m0 = await rss()
  for (const r of rush) await fetch(`http://127.0.0.1:${cport}/iclock/cdata?SN=${r.sn}&table=ATTLOG`, { method: 'POST', body: `${r.code}\t${r.ts}\t0\t1\n` })
  for (let i = 0; i < hist.length; i += 10000) await (await fetch(`http://127.0.0.1:${cport}/iclock/cdata?SN=DEV2&table=ATTLOG`, { method: 'POST', body: hist.slice(i, i + 10000).join('\n') })).text()
  const m1 = await rss()
  child.kill(); fs.rmSync(cdir, { recursive: true, force: true })
  ok('receiver process memory stays small', m1 / 1048576 < 120, `${(m0 / 1048576).toFixed(0)} MB → ${(m1 / 1048576).toFixed(0)} MB after 61k punches`)
}

recv.stop(); journal.close(); j2.close()
fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
