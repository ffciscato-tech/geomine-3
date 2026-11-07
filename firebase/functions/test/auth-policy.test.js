'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isEmailAllowed,
  normalizeAllowedEmails,
  parseCookies,
  safeDisplayName,
} = require('../auth-policy');

test('normaliza a lista de e-mails autorizados', () => {
  assert.deepEqual(
    [...normalizeAllowedEmails(' FFciscato@CCMENG.NET, outro@ccmeng.net, ')],
    ['ffciscato@ccmeng.net', 'outro@ccmeng.net'],
  );
});

test('a política de acesso ignora maiúsculas e recusa ausências', () => {
  assert.equal(isEmailAllowed('FFCISCATO@ccmeng.net', 'ffciscato@ccmeng.net'), true);
  assert.equal(isEmailAllowed('intruso@example.com', 'ffciscato@ccmeng.net'), false);
  assert.equal(isEmailAllowed('', 'ffciscato@ccmeng.net'), false);
});

test('analisa cookies codificados sem perder sinais de igual', () => {
  assert.deepEqual(parseCookies('a=1; token=abc%3D%3D; vazio='), {
    a: '1',
    token: 'abc==',
    vazio: '',
  });
});

test('usa nome quando existe e e-mail como fallback', () => {
  assert.equal(safeDisplayName({ name: 'Filipe', email: 'f@example.com' }), 'Filipe');
  assert.equal(safeDisplayName({ email: 'f@example.com' }), 'f@example.com');
});
