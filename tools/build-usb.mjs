// Builds the Windows installer of Masar Time USB (the free flash-drive edition):
//   node tools/build-usb.mjs  →  dist-usb/Masar-Time-USB-Setup-<version>.exe
// Only usb/ is shipped (none of the full program's code), every script is obfuscated, and Electron's
// fuses are switched so the program can't be run as plain Node, inspected with --inspect, fed
// NODE_OPTIONS, or made to load loose files instead of its own app.asar.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
process.chdir(ROOT)

const VERSION = process.env.USB_VERSION || '1.0.0'
const STAGE = path.join(ROOT, 'build-usb', 'app')
const OUT = path.join(ROOT, 'dist-usb')
fs.rmSync(path.join(ROOT, 'build-usb'), { recursive: true, force: true })
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(STAGE, { recursive: true })
fs.cpSync('usb', STAGE, { recursive: true })
for (const f of ['tools']) fs.rmSync(path.join(STAGE, f), { recursive: true, force: true })

// 1) obfuscate every script (main process and window)
const JavaScriptObfuscator = require('javascript-obfuscator')
const strong = {
  compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.75, deadCodeInjection: true, deadCodeInjectionThreshold: 0.3,
  identifierNamesGenerator: 'hexadecimal', numbersToExpressions: true, selfDefending: true, simplify: true, splitStrings: true, splitStringsChunkLength: 6,
  stringArray: true, stringArrayCallsTransform: true, stringArrayEncoding: ['rc4'], stringArrayIndexShift: true, stringArrayRotate: true, stringArrayShuffle: true,
  stringArrayWrappersCount: 3, stringArrayWrappersChainedCalls: true, stringArrayWrappersType: 'function', stringArrayThreshold: 1, transformObjectKeys: true,
  unicodeEscapeSequence: false, disableConsoleOutput: true,
}
const files = ['main.js', 'licence.js', 'store.js', 'preload.js', 'renderer/app.js']
for (const f of files) {
  const p = path.join(STAGE, f)
  const target = f.startsWith('renderer/') ? 'browser' : 'node'
  const out = JavaScriptObfuscator.obfuscate(fs.readFileSync(p, 'utf8'), { ...strong, target, renameGlobals: target === 'node' }).getObfuscatedCode()
  fs.writeFileSync(p, out)
}
console.log(`obfuscated: ${files.join(', ')}`)

// 2) the app's own package.json — no dependencies: only Electron and Node's built-ins are used
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: 'masar-time-usb', productName: 'Masar Time USB', version: VERSION, main: 'main.js', description: 'Masar Time USB', author: 'Masar', license: 'UNLICENSED',
}, null, 2))

// 3) Windows app folder (asar packed)
const config = {
  appId: 'sa.masar.time.usb', productName: 'Masar Time USB', copyright: 'Masar',
  directories: { app: STAGE, output: OUT },
  files: ['**/*'], asar: true, electronVersion: require('electron/package.json').version,
  win: { target: [{ target: 'dir', arch: ['x64'] }], signAndEditExecutable: !!process.env.USB_RCEDIT, icon: path.join(ROOT, 'build', 'icon.ico') },
}
fs.writeFileSync(path.join(ROOT, 'build-usb', 'builder.json'), JSON.stringify(config))
execFileSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', 'dir', '--x64', '--config', path.join(ROOT, 'build-usb', 'builder.json')], { stdio: 'inherit' })

// 4) fuses — patched straight into the .exe
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const exe = path.join(OUT, 'win-unpacked', 'Masar Time USB.exe')
await flipFuses(exe, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // with rcedit the exe carries app.asar's hash: a modified app.asar refuses to start
  // only after it's been seen to start on real Windows (under wine the hash resource went missing): USB_INTEGRITY=1
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: !!process.env.USB_INTEGRITY,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
})
console.log('fuses: RunAsNode off, NODE_OPTIONS off, --inspect off, app.asar only')

// 5) installer (native makensis)
execFileSync('makensis', [`-DVERSION=${VERSION}`, 'usb.nsi'], { cwd: path.join(ROOT, 'installer'), stdio: ['ignore', 'ignore', 'inherit'] })
console.log(`→ dist-usb/Masar-Time-USB-Setup-${VERSION}.exe`)
