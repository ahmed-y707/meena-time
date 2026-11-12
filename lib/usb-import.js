// Upgrade from Masar Time USB (the free flash-drive edition) on the same PC: read its encrypted data
// (%APPDATA%\Masar Time USB\masar-usb.dat) with its own activation, so the full program can take over
// the employees, their names and every punch. The data key must be derived exactly as usb/licence.js
// does — keep the two in step.
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const PREFIX = 'MTUSB1'
const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 }) } catch { return '' } }
function machineParts() {
  if (process.platform === 'win32') {
    const guid = run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']).match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i)?.[1] || ''
    const vol = run('cmd', ['/c', 'vol', (process.env.SystemDrive || 'C:')]).match(/([0-9A-F]{4}-[0-9A-F]{4})/i)?.[1] || ''
    return [guid, vol, os.cpus()[0]?.model || '', os.arch()]
  }
  let id = ''
  for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { id = fs.readFileSync(f, 'utf8').trim(); break } catch {} }
  return [id, os.cpus()[0]?.model || '', os.arch()]
}
function deviceCode() {
  const parts = machineParts()
  if (!parts[0]) parts.push(os.hostname())
  return crypto.createHash('sha256').update(`${PREFIX}|${parts.join('|')}`).digest('hex').slice(0, 20).toUpperCase().match(/.{4}/g).join('-')
}

// → { employees: {pin: {name}}, punches: {pin: [ts…]} } or null (no USB edition here / not activated / unreadable)
function readUsbEdition(dir) {
  try {
    const key = fs.readFileSync(path.join(dir, 'activation.key'), 'utf8').replace(/\s+/g, '')
    const b = fs.readFileSync(path.join(dir, 'masar-usb.dat'))
    const k = crypto.createHash('sha256').update(`${PREFIX}|data|${deviceCode()}|${key}`).digest()
    const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    const data = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'))
    return { employees: data.employees || {}, punches: data.punches || {} }
  } catch {
    return null
  }
}

module.exports = { readUsbEdition }
