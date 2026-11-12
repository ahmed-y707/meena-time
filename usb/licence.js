// Masar Time USB — per-PC activation.
// «كود الجهاز» is derived from this Windows installation (MachineGuid), the system drive's
// serial number and the CPU, so a copy of the program (or of its data folder) on another PC
// asks for a new key. «مفتاح التفعيل» is an Ed25519 signature over that code, made only by the
// distributor (the private key never leaves the server); the program carries the public key.
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'public.pem'), 'utf8')
const PREFIX = 'MTUSB1'

function run(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 }) } catch { return '' }
}

function machineParts() {
  if (process.platform === 'win32') {
    const guid = run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']).match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i)?.[1] || ''
    const vol = run('cmd', ['/c', 'vol', (process.env.SystemDrive || 'C:')]).match(/([0-9A-F]{4}-[0-9A-F]{4})/i)?.[1] || ''
    return [guid, vol, os.cpus()[0]?.model || '', os.arch()]
  }
  // test machines (Linux): the installation id
  let id = ''
  for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { id = fs.readFileSync(f, 'utf8').trim(); break } catch {} }
  return [id, os.cpus()[0]?.model || '', os.arch()]
}

let cached = null
// 20 hex digits in groups of 4, e.g. 7F3A-91C2-0B5E-44D8-A1F0
function deviceCode() {
  if (cached) return cached
  const parts = machineParts()
  if (!parts[0]) parts.push(os.hostname()) // no machine id at all: fall back to the computer name
  const h = crypto.createHash('sha256').update(`${PREFIX}|${parts.join('|')}`).digest('hex').slice(0, 20).toUpperCase()
  return (cached = h.match(/.{4}/g).join('-'))
}

// The key as pasted: spaces and line breaks are ignored ('-' and '_' belong to the key itself)
const clean = (key) => String(key || '').replace(/\s+/g, '')

function verifyKey(key, code = deviceCode()) {
  try {
    const sig = Buffer.from(clean(key), 'base64url')
    if (sig.length !== 64) return false
    return crypto.verify(null, Buffer.from(`${PREFIX}|${code}`), PUBLIC_KEY, sig)
  } catch {
    return false
  }
}

// Data at rest is encrypted with a key that exists only on an activated PC
// (it needs this PC's code AND the distributor's signature for it).
function dataKey(key, code = deviceCode()) {
  return crypto.createHash('sha256').update(`${PREFIX}|data|${code}|${clean(key)}`).digest()
}

module.exports = { deviceCode, verifyKey, dataKey, clean }
