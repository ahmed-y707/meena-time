// Every icon is a Lucide icon (msar-erp.com's set), inlined by tools/build-ui.mjs.
const ic = (name) => LUCIDE[name] || ''
const ICONS = new Proxy({
  close: 'x', cancel: 'x', ok: 'check', save: 'save', del: 'trash-2', new: 'plus', print: 'printer', undo: 'undo-2', search: 'search', help: 'circle-help',
  restore: 'rotate-ccw', register: 'key-round', pdf: 'file-text', excel: 'file-spreadsheet', people: 'users', clock: 'clock', gear: 'settings', device: 'fingerprint',
  tools: 'settings', lock: 'lock', key: 'key-round', avatar: 'circle-user-round', reports: 'chart-column', home: 'layout-dashboard', item: 'list',
  i_repeat: 'refresh-cw', i_dept: 'building-2', i_upload: 'upload', i_restore: 'rotate-ccw', i_post: 'send', i_unpost: 'rotate-ccw', i_read: 'download', r_doc: 'file-text',
}, { get: (m, k) => ic(m[k] || 'file-text') })
