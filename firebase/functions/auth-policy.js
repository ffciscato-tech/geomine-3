'use strict';

function normalizeAllowedEmails(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isEmailAllowed(email, allowedValue) {
  if (!email) return false;
  return normalizeAllowedEmails(allowedValue).has(String(email).trim().toLowerCase());
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 1) return cookies;
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function safeDisplayName(decodedToken) {
  const name = typeof decodedToken?.name === 'string' ? decodedToken.name.trim() : '';
  return name || decodedToken?.email || 'Usuário autorizado';
}

module.exports = {
  isEmailAllowed,
  normalizeAllowedEmails,
  parseCookies,
  safeDisplayName,
};
