// SMS gateways used by Saudi schools. Each takes the settings.sms object and a
// recipient in international digits (9665XXXXXXXX). Throws on failure.
'use strict';

const PROVIDERS = {
  none: { label: 'غير مفعّل', fields: [] },
  msegat: { label: 'Msegat', fields: [['userName', 'اسم المستخدم'], ['apiKey', 'API Key'], ['sender', 'اسم المرسل']] },
  taqnyat: { label: 'Taqnyat — تقنيات', fields: [['token', 'Bearer Token'], ['sender', 'اسم المرسل']] },
  unifonic: { label: 'Unifonic', fields: [['appSid', 'AppSid'], ['sender', 'اسم المرسل']] },
};

async function post(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20e3) });
  const body = await r.text();
  if (!r.ok) throw new Error(`SMS HTTP ${r.status}: ${body.slice(0, 150)}`);
  return body;
}

async function send(cfg = {}, to, text) {
  switch (cfg.provider) {
    case 'msegat': {
      const b = await post('https://www.msegat.com/gw/sendsms.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: cfg.userName, apiKey: cfg.apiKey, numbers: to, userSender: cfg.sender, msg: text, msgEncoding: 'UTF8' }),
      });
      const j = JSON.parse(b);
      if (String(j.code) !== '1' && String(j.code) !== 'M0000') throw new Error(`Msegat: ${j.message || b.slice(0, 150)}`);
      return;
    }
    case 'taqnyat': {
      await post('https://api.taqnyat.sa/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ recipients: [to], body: text, sender: cfg.sender }),
      });
      return;
    }
    case 'unifonic': {
      const b = await post('https://el.cloud.unifonic.com/rest/SMS/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ AppSid: cfg.appSid || '', SenderID: cfg.sender || '', Body: text, Recipient: to }),
      });
      if (!JSON.parse(b).success) throw new Error(`Unifonic: ${b.slice(0, 150)}`);
      return;
    }
    default:
      throw new Error('لم يُضبط مزوّد رسائل SMS بعد');
  }
}

module.exports = { send, PROVIDERS };
