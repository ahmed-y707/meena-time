// Live punches from ZKTeco devices over the LAN («ADMS» / push protocol): the
// device is set to «Cloud Server» = this PC's IP + port, and posts every punch
// the moment a student puts a finger — no polling, no downloading the whole log.
//
//   GET  /iclock/cdata?SN=..&options=all      handshake → our options (clock, push all tables)
//   POST /iclock/cdata?SN=..&table=ATTLOG     "PIN\tYYYY-MM-DD HH:MM:SS\tstate\tverify..." lines
//   GET  /iclock/getrequest?SN=..             commands for the device (none) → "OK"
//   POST /iclock/devicecmd                    command results → "OK"
//
// The work per request is parsing a few lines and one append to the journal, so a
// morning rush of thousands of punches costs next to nothing.
const http = require('http')

const MAX_BODY = 8 * 1024 * 1024 // a device sending its whole history posts large batches
const TS = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/

function parseAttlog(body) {
  const out = []
  let bad = 0
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const code = (parts[0] || '').trim()
    const m = TS.exec((parts[1] || '').trim())
    if (!code || !/^[0-9A-Za-z_-]{1,24}$/.test(code) || !m) { bad++; continue }
    out.push({ c: code, t: `${m[1]} ${m[2].padStart(2, '0')}:${m[3]}:${m[4] || '00'}` })
  }
  return { rows: out, bad }
}

// hours east of GMT as the device wants it («TimeZone=3» for Riyadh)
const tzHours = () => -new Date().getTimezoneOffset() / 60

function createReceiver({ onPunches, onDevice, log = () => {} }) {
  let server = null
  const state = { port: null, listening: false, error: null }

  const reply = (res, text, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'text/plain', Date: new Date().toUTCString(), 'Content-Length': Buffer.byteLength(text) })
    res.end(text)
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x')
    const p = url.pathname.replace(/\/+$/, '').toLowerCase()
    const sn = (url.searchParams.get('SN') || url.searchParams.get('sn') || '').trim().slice(0, 40)
    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
    if (!p.startsWith('/iclock')) return reply(res, 'Not Found', 404)
    if (sn) onDevice(sn, { ip, seen: Date.now() })

    if (p === '/iclock/cdata' && req.method === 'GET') {
      // ATTLOGStamp=0: the device sends what it has not sent yet; repeats are dropped later
      // (punches are unique per student + time). TimeZone + the Date header set its clock.
      return reply(res, [
        `GET OPTION FROM: ${sn}`, 'ATTLOGStamp=0', 'OPERLOGStamp=9999', 'ATTPHOTOStamp=9999',
        'ErrorDelay=30', 'Delay=10', 'TransTimes=00:00;23:59', 'TransInterval=1',
        'TransFlag=TransData AttLog', `TimeZone=${tzHours()}`, 'Realtime=1', 'Encrypt=0',
      ].join('\r\n'))
    }
    if (p === '/iclock/getrequest') return reply(res, 'OK')
    if (p === '/iclock/devicecmd') { req.resume(); return reply(res, 'OK') }
    if (p === '/iclock/cdata' && req.method === 'POST') {
      const chunks = []
      let size = 0
      for await (const ch of req) {
        size += ch.length
        if (size > MAX_BODY) return reply(res, 'ERROR: too large', 413)
        chunks.push(ch)
      }
      const table = (url.searchParams.get('table') || '').toUpperCase()
      if (table !== 'ATTLOG') return reply(res, 'OK') // user/fingerprint/operation logs: not needed
      const { rows, bad } = parseAttlog(Buffer.concat(chunks).toString('utf8'))
      if (bad) log(`device ${sn}: ${bad} unreadable line(s)`)
      // the device deletes what we acknowledged: answer only after the punches are on disk
      try { onPunches(rows.map((r) => ({ ...r, sn }))) } catch (e) { log(`journal: ${e.message}`); return reply(res, 'ERROR', 500) }
      return reply(res, `OK: ${rows.length}`)
    }
    return reply(res, 'OK')
  }

  return {
    state,
    start(port) {
      return new Promise((resolve) => {
        this.stop()
        state.port = port; state.listening = false; state.error = null
        server = http.createServer((req, res) => handle(req, res).catch((e) => { log(`request: ${e.message}`); try { reply(res, 'ERROR', 500) } catch {} }))
        server.keepAliveTimeout = 65e3
        server.headersTimeout = 70e3
        server.requestTimeout = 120e3
        server.on('error', (e) => {
          state.listening = false
          state.error = e.code === 'EADDRINUSE' ? `المنفذ ${port} مستخدم من برنامج آخر` : e.code === 'EACCES' ? `لا توجد صلاحية لفتح المنفذ ${port}` : e.message
          log(`listen ${port}: ${e.code || e.message}`)
          resolve(state)
        })
        server.listen(port, '0.0.0.0', () => { state.listening = true; resolve(state) })
      })
    },
    stop() { if (server) { server.close(); server.closeAllConnections?.(); server = null } state.listening = false },
  }
}

module.exports = { createReceiver, parseAttlog }
