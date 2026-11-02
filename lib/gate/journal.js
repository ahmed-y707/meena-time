// Append-only punch journal. A punch is on disk the moment the device sends it
// (one JSON line, appended), long before the database — which lives in the
// window and is written in batches — picks it up. The window drains from the
// last acknowledged position and acknowledges only after its own save, so a
// crash or power cut between the two replays the punches instead of losing them.
//
//   <dir>/YYYY-MM-DD.jsonl   one file per day of ARRIVAL: {c: code, t: 'YYYY-MM-DD HH:MM:SS', sn}
//   <dir>/ack.json           {file, pos}: everything before pos of file (and older files) is saved
const fs = require('fs')
const path = require('path')

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/
const KEEP_DAYS = 14 // acknowledged files are kept this long, then removed

function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

class Journal {
  constructor(dir) {
    this.dir = dir
    fs.mkdirSync(dir, { recursive: true })
    this.fd = null
    this.fdDay = null
  }

  files() { return fs.readdirSync(this.dir).filter((f) => DAY_FILE.test(f)).sort() }
  readAck() { try { return JSON.parse(fs.readFileSync(path.join(this.dir, 'ack.json'), 'utf8')) } catch { return { file: '', pos: 0 } } }

  // many punches in one write() call: a device posts its records in batches
  append(rows) {
    if (!rows.length) return
    const day = localDay()
    if (this.fdDay !== day) {
      if (this.fd != null) fs.closeSync(this.fd)
      this.fd = fs.openSync(path.join(this.dir, day + '.jsonl'), 'a')
      this.fdDay = day
    }
    fs.writeSync(this.fd, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }

  // up to `max` rows after the acknowledged position, and the position to acknowledge once saved
  drain(max = 5000) {
    const ack = this.readAck()
    const rows = []
    let next = { ...ack }
    for (const f of this.files()) {
      if (f < ack.file) continue
      const start = f === ack.file ? ack.pos : 0
      const full = path.join(this.dir, f)
      const size = fs.statSync(full).size
      if (size <= start) { next = { file: f, pos: size }; continue }
      const buf = Buffer.alloc(size - start)
      const fd = fs.openSync(full, 'r')
      try { fs.readSync(fd, buf, 0, buf.length, start) } finally { fs.closeSync(fd) }
      let pos = start, from = 0
      // only whole lines: a line still being written is picked up next time
      for (let i = buf.indexOf(10); i !== -1; i = buf.indexOf(10, from)) {
        const line = buf.toString('utf8', from, i)
        from = i + 1
        pos = start + from
        try { const r = JSON.parse(line); if (r && r.c && r.t) rows.push(r) } catch {} // a torn line from a crash
        if (rows.length >= max) return { rows, next: { file: f, pos } }
      }
      next = { file: f, pos }
    }
    return { rows, next }
  }

  ack(next) {
    if (!next || typeof next.file !== 'string' || !(next.file === '' || DAY_FILE.test(next.file))) return
    const tmp = path.join(this.dir, 'ack.json.tmp')
    fs.writeFileSync(tmp, JSON.stringify({ file: next.file, pos: +next.pos || 0 }))
    fs.renameSync(tmp, path.join(this.dir, 'ack.json'))
    this.prune(next.file)
  }

  prune(ackedFile) {
    const cutoff = localDay(new Date(Date.now() - KEEP_DAYS * 86400e3))
    for (const f of this.files()) if (f < ackedFile && f.slice(0, 10) < cutoff) fs.rmSync(path.join(this.dir, f), { force: true })
  }

  close() { if (this.fd != null) { fs.closeSync(this.fd); this.fd = null; this.fdDay = null } }
}

module.exports = { Journal, localDay }
