// Vendor-side licence generator — NEVER ship this file or keys/private.pem.
// Usage: node tools/keygen.js <request-code> [edition=Gold]
//        node tools/keygen.js <request-code> --days 7   → trial code, usable today + 6 more days, then the app locks
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const reqCode = args[0]
let edition = args[1] || 'Gold'
if (args[1] === '--days') {
  const days = parseInt(args[2], 10)
  if (!(days >= 1 && days <= 90)) { console.error('--days must be 1..90'); process.exit(1) }
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const today = new Date()
  const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days - 1)
  edition = `Trial-${ymd(today)}-${ymd(last)}`
}
if (!reqCode) {
  console.error('usage: node tools/keygen.js <request-code> [edition]')
  process.exit(1)
}
const key = fs.readFileSync(path.join(__dirname, 'keys', 'private.pem'), 'utf8')
const sig = crypto.sign(null, Buffer.from(`${reqCode.trim().toUpperCase()}|${edition}`), key).toString('base64url')
console.log(`${sig}.${edition}`)
