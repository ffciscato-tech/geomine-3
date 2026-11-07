import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

const views = {
  loading: document.querySelector('#loading-view'),
  login: document.querySelector('#login-view'),
  access: document.querySelector('#access-view'),
};
const feedback = document.querySelector('#feedback');
const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const emailLoginButton = document.querySelector('#email-login');
const googleLoginButton = document.querySelector('#google-login');
const resetPasswordButton = document.querySelector('#reset-password');
const logoutButton = document.querySelector('#logout');

let auth;

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.hidden = key !== name;
  });
}

function showFeedback(message, success = false) {
  feedback.textContent = message;
  feedback.classList.toggle('success', success);
  feedback.hidden = !message;
}

function setBusy(busy) {
  [emailLoginButton, googleLoginButton, resetPasswordButton, logoutButton]
    .filter(Boolean)
    .forEach((button) => { button.disabled = busy; });
}

function friendlyAuthError(error) {
  const messages = {
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/invalid-email': 'Informe um e-mail válido.',
    'auth/missing-password': 'Informe a senha.',
    'auth/popup-closed-by-user': 'A janela de acesso foi fechada antes da conclusão.',
    'auth/popup-blocked': 'O navegador bloqueou a janela de acesso. Libere pop-ups e tente novamente.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    'auth/user-disabled': 'Esta conta está desativada.',
  };
  return messages[error?.code] ?? 'Não foi possível concluir o acesso. Tente novamente.';
}

async function fetchCsrfToken() {
  const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('csrf-unavailable');
  const payload = await response.json();
  return payload.csrfToken;
}

async function createServerSession(user) {
  const [csrfToken, idToken] = await Promise.all([
    fetchCsrfToken(),
    user.getIdToken(true),
  ]);
  const response = await fetch('/api/sessionLogin', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ idToken, csrfToken }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'session-rejected');
  await signOut(auth);
  window.location.assign('/');
}

async function loadStatus() {
  const response = await fetch('/api/status', { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) {
    showView('login');
    return;
  }
  if (!response.ok) throw new Error('status-unavailable');
  const user = await response.json();
  document.querySelector('#user-name').textContent = user.name || user.email;
  document.querySelector('#user-email').textContent = user.email;
  showView('access');
}

async function initialize() {
  try {
    const configResponse = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error('firebase-config-unavailable');
    const config = await configResponse.json();
    auth = getAuth(initializeApp(config));
    await setPersistence(auth, inMemoryPersistence);
    await loadStatus();
  } catch (error) {
    console.error('GeoMine access initialization failed', error);
    showView('login');
    showFeedback('O serviço de acesso não respondeu. Atualize a página em instantes.');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showFeedback('');
  if (!loginForm.reportValidity()) return;
  setBusy(true);
  try {
    const credential = await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    await createServerSession(credential.user);
  } catch (error) {
    console.error('GeoMine email sign-in failed', error);
    showFeedback(friendlyAuthError(error));
  } finally {
    setBusy(false);
  }
});

googleLoginButton.addEventListener('click', async () => {
  showFeedback('');
  setBusy(true);
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    await createServerSession(credential.user);
  } catch (error) {
    console.error('GeoMine Google sign-in failed', error);
    showFeedback(friendlyAuthError(error));
  } finally {
    setBusy(false);
  }
});

resetPasswordButton.addEventListener('click', async () => {
  showFeedback('');
  const email = emailInput.value.trim();
  if (!email) {
    emailInput.focus();
    showFeedback('Informe o e-mail para receber a redefinição de senha.');
    return;
  }
  setBusy(true);
  try {
    await sendPasswordResetEmail(auth, email);
    showFeedback('Se a conta estiver cadastrada, o Firebase enviará as instruções de redefinição.', true);
  } catch (error) {
    console.error('GeoMine password reset failed', error);
    showFeedback(friendlyAuthError(error));
  } finally {
    setBusy(false);
  }
});

logoutButton.addEventListener('click', async () => {
  showFeedback('');
  setBusy(true);
  try {
    const csrfToken = await fetchCsrfToken();
    const response = await fetch('/api/sessionLogout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ csrfToken }),
    });
    if (!response.ok) throw new Error('logout-failed');
    window.location.assign('/');
  } catch (error) {
    console.error('GeoMine sign-out failed', error);
    showFeedback('Não foi possível encerrar a sessão. Tente novamente.');
    setBusy(false);
  }
});

initialize();
