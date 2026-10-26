// Machine-bound activation, same flow as Apex Time's «تسجيل المنتج»:
// the app shows a request code derived from this machine; the vendor signs it
// with the private key (tools/keygen.js); the app verifies the licence code
// with the embedded public key. Runs in Node (Electron main / preview server).

const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'public.pem'), 'utf8')

function machineFingerprint() {
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
    .map((i) => i.mac)
    .sort()
  return [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model || '', macs[0] || ''].join('|')
}

// «كود الطلب»: 20 hex chars grouped in 4s, e.g. 1A2B-3C4D-5E6F-7A8B-9C0D
function requestCode() {
  const h = crypto.createHash('sha256').update(machineFingerprint()).digest('hex').slice(0, 20).toUpperCase()
  return h.match(/.{4}/g).join('-')
}

// «كود الترخيص» = base64url(signature over "<requestCode>|<edition>") + "." + edition
// A trial edition carries its own dates inside the signed text: «Trial-YYYYMMDD-YYYYMMDD»
// (issued, last usable day), so nobody can stretch it without a new code from us.
const TRIAL = /^Trial-(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})$/
function verifyLicence(code, reqCode = requestCode()) {
  try {
    const [sig, edition] = String(code || '').trim().split('.')
    if (!sig || !edition) return { ok: false }
    const ok = crypto.verify(null, Buffer.from(`${reqCode}|${edition}`), PUBLIC_KEY, Buffer.from(sig, 'base64url'))
    if (!ok) return { ok: false }
    const t = edition.match(TRIAL)
    if (!t) return { ok: true, edition }
    return { ok: true, edition: 'Trial', trial: true, issued: `${t[1]}-${t[2]}-${t[3]}`, expires: `${t[4]}-${t[5]}-${t[6]}` }
  } catch {
    return { ok: false }
  }
}

module.exports = { requestCode, verifyLicence }
