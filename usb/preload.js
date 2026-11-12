// Masar Time USB — the only door between the window and the program.
const { contextBridge, ipcRenderer } = require('electron')
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a)
contextBridge.exposeInMainWorld('usb', {
  brand: call('brand'), status: call('act:status'), activate: call('act:activate'),
  scan: call('usb:scan'), importFiles: call('usb:import'), pick: call('usb:pick'),
  employees: call('emp:list'), rename: call('emp:rename'), remove: call('emp:delete'),
  report: call('report'), summary: call('summary'), print: call('print'), pdf: call('pdf'), quit: call('quit'),
})
