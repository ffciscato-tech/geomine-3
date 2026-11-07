'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const express = require('express');
const {
  isEmailAllowed,
  parseCookies,
  safeDisplayName,
} = require('./auth-policy');

if (!getApps().length) initializeApp();

setGlobalOptions({
  region: 'southamerica-east1',
  maxInstances: 10,
  memory: '512MiB',
  timeoutSeconds: 60,
});

const allowedEmails = defineString('GEOMINE_ALLOWED_EMAILS', {
  default: 'ffciscato@ccmeng.net',
  description: 'Lista de e-mails autorizados, separados por vírgula.',
});

const SESSION_COOKIE = '__session';
const CSRF_COOKIE = 'geomine_csrf';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RECENT_LOGIN_MAX_SECONDS = 5 * 60;
const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb', strict: true }));
app.use((request, response, next) => {
  response.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

function cookieOptions({ httpOnly }) {
  return {
    httpOnly,
    secure: !isEmulator,
    sameSite: 'strict',
    path: '/',
  };
}

function setNoStore(response) {
  response.set('Cache-Control', 'private, no-store, max-age=0');
}

function csrfMatches(request) {
  const cookies = parseCookies(request.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE];
  const bodyToken = request.body?.csrfToken;
  const headerToken = request.get('X-CSRF-Token');
  if (!cookieToken || !bodyToken || !headerToken) return false;
  const cookieBuffer = Buffer.from(cookieToken);
  const bodyBuffer = Buffer.from(String(bodyToken));
  const headerBuffer = Buffer.from(String(headerToken));
  return (
    cookieBuffer.length === bodyBuffer.length &&
    cookieBuffer.length === headerBuffer.length &&
    crypto.timingSafeEqual(cookieBuffer, bodyBuffer) &&
    crypto.timingSafeEqual(cookieBuffer, headerBuffer)
  );
}

function tokenIsAllowed(decodedToken) {
  return (
    decodedToken?.email_verified === true &&
    isEmailAllowed(decodedToken.email, allowedEmails.value())
  );
}

async function verifiedSession(request) {
  const sessionCookie = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!sessionCookie) return null;
  try {
    const decodedToken = await getAuth().verifySessionCookie(sessionCookie, true);
    return tokenIsAllowed(decodedToken) ? decodedToken : null;
  } catch {
    return null;
  }
}

app.get('/api/csrf', (request, response) => {
  setNoStore(response);
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  response.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieOptions({ httpOnly: false }),
    maxAge: 10 * 60 * 1000,
  });
  response.json({ csrfToken });
});

app.post('/api/sessionLogin', async (request, response) => {
  setNoStore(response);
  if (!csrfMatches(request) || typeof request.body?.idToken !== 'string') {
    response.status(401).json({ error: 'Solicitação de acesso inválida.' });
    return;
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(request.body.idToken, true);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !tokenIsAllowed(decodedToken) ||
      typeof decodedToken.auth_time !== 'number' ||
      nowSeconds - decodedToken.auth_time > RECENT_LOGIN_MAX_SECONDS
    ) {
      response.status(403).json({ error: 'Esta conta não está autorizada no GeoMine.' });
      return;
    }

    const sessionCookie = await getAuth().createSessionCookie(request.body.idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
    response.cookie(SESSION_COOKIE, sessionCookie, {
      ...cookieOptions({ httpOnly: true }),
      maxAge: SESSION_MAX_AGE_MS,
    });
    response.clearCookie(CSRF_COOKIE, cookieOptions({ httpOnly: false }));
    response.json({ status: 'success' });
  } catch {
    response.status(401).json({ error: 'Não foi possível validar esta conta.' });
  }
});

app.post('/api/sessionLogout', async (request, response) => {
  setNoStore(response);
  if (!csrfMatches(request)) {
    response.status(401).json({ error: 'Solicitação de saída inválida.' });
    return;
  }
  response.clearCookie(SESSION_COOKIE, cookieOptions({ httpOnly: true }));
  response.clearCookie(CSRF_COOKIE, cookieOptions({ httpOnly: false }));
  response.json({ status: 'success' });
});

app.get('/api/status', async (request, response) => {
  setNoStore(response);
  const session = await verifiedSession(request);
  if (!session) {
    response.status(401).json({ authenticated: false });
    return;
  }
  response.json({
    authenticated: true,
    name: safeDisplayName(session),
    email: session.email,
  });
});

app.get(/^\/geomine(?:\/.*)?$/, async (request, response) => {
  setNoStore(response);
  const session = await verifiedSession(request);
  if (!session) {
    response.redirect(302, '/?access=required');
    return;
  }
  response.type('html');
  response.sendFile(path.join(__dirname, 'private', 'GeoMine.html'), (error) => {
    if (error && !response.headersSent) {
      response.status(error.statusCode || 500).send('GeoMine temporariamente indisponível.');
    }
  });
});

app.use((request, response) => {
  setNoStore(response);
  response.status(404).json({ error: 'Rota não encontrada.' });
});

exports.web = onRequest({ cors: false }, app);
