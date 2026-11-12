// Vendor-side key generator for Masar Time USB — NEVER ship this file or the private key.
// Usage: node tools/usb-keygen.js <device-code> [path/to/usb-private.pem]
const crypto = require('crypto')
const fs = require('fs')
const code = String(process.argv[2] || '').trim().toUpperCase()
if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(code)) { console.error('usage: node tools/usb-keygen.js XXXX-XXXX-XXXX-XXXX-XXXX [private.pem]'); process.exit(1) }
const pem = fs.readFileSync(process.argv[3] || process.env.MT_USB_KEY || '/root/meena-time-keys-backup/usb-private.pem', 'utf8')
console.log(crypto.sign(null, Buffer.from(`MTUSB1|${code}`), pem).toString('base64url'))
