const connect = document.getElementById('team-connect');
const disconnect = document.getElementById('team-disconnect');
const message = document.getElementById('team-message');
const list = document.getElementById('team-list');
const sdk = 'https://www.gstatic.com/firebasejs/10.12.2/';
const apiKey = 'AIzaSyCcIXseyzp6FzsWpUwPF4vAv2Fu4No4rs4';
const documents = 'https://firestore.googleapis.com/v1/projects/projetosccm/databases/(default)/documents/';
let auth;
let user;
let generation = 0;
let refreshing = false;

async function read(path, token) {
  const response = await fetch(documents + path, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(response.status === 403
    ? 'Use uma conta com acesso Master no Projetos CCM.'
    : 'Falha na consulta ao Projetos CCM.');
  return response.json();
}

const emailKey = email => String(email || '').trim().toLowerCase();
const greenAccount = 'ffciscato@ccmeng.net';
function memberColor(member, index, total) {
  if (emailKey(member.email) === greenAccount) return '#18834b';
  const hue = (165 + index * 260 / Math.max(1, total)) % 360;
  return 'hsl(' + hue + ' 65% 40%)';
}

function row(member, fields, now, color) {
  const updated = Date.parse(fields.atualizadoEm?.timestampValue);
  const recent = Number.isFinite(updated) && now - updated <= 120000 && updated - now <= 300000;
  const working = recent && fields.ativo?.booleanValue;
  const status = !recent ? 'Sem atualização recente' : working ? 'Trabalhando agora'
    : fields.almoco?.stringValue === 'almocando' ? 'Pausa para almoço' : 'Sem cronômetro';
  const item = document.createElement('li');
  item.style.setProperty('--member-color', color);
  item.textContent = [
    member.nome || member.email,
    member.nome && member.email,
    status,
    working && fields.alvo?.stringValue,
    Number.isFinite(updated) && new Date(updated).toLocaleString('pt-BR'),
  ].filter(Boolean).join(' · ');
  return item;
}

async function refresh() {
  if (!user || refreshing || document.getElementById('team').classList.contains('hidden')) return;
  refreshing = true;
  const current = generation;
  try {
    const token = await user.getIdToken();
    const team = await read('projetos/equipe', token);
    const presence = new Map();
    let page = '';
    do {
      const data = await read('projetosPresenca?pageSize=100' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), token);
      for (const { fields = {} } of data.documents || []) presence.set(emailKey(fields.email?.stringValue), fields);
      page = data.nextPageToken;
    } while (page);
    const members = JSON.parse(team.fields?.membros?.stringValue || '[]');
    if (current !== generation) return;
    const now = Date.now();
    const active = members.filter(member => member.ativo !== false)
      .sort((left, right) => emailKey(left.email).localeCompare(emailKey(right.email)));
    const otherCount = active.filter(member => emailKey(member.email) !== greenAccount).length;
    let otherIndex = 0;
    list.replaceChildren(...active.map(member => {
      const email = emailKey(member.email);
      const color = memberColor(member, otherIndex, otherCount);
      if (email !== greenAccount) otherIndex++;
      return row(member, presence.get(email) || {}, now, color);
    }));
    message.textContent = list.childElementCount ? 'Atualização automática a cada 30 segundos.' : 'Nenhum membro ativo cadastrado.';
  } catch (error) {
    if (current === generation) {
      list.replaceChildren();
      message.textContent = error.message;
    }
  } finally {
    refreshing = false;
  }
}

connect.onclick = async () => {
  connect.disabled = true;
  message.textContent = 'Conectando ao Projetos CCM…';
  try {
    const [app, session] = await Promise.all([import(sdk + 'firebase-app.js'), import(sdk + 'firebase-auth.js')]);
    auth ||= session.getAuth(app.initializeApp({
      apiKey,
      authDomain: 'projetosccm.firebaseapp.com',
      projectId: 'projetosccm',
    }));
    await session.setPersistence(auth, session.inMemoryPersistence);
    user = (await session.signInWithPopup(auth, new session.GoogleAuthProvider())).user;
    connect.hidden = true;
    disconnect.hidden = false;
    await refresh();
  } catch (error) {
    message.textContent = error.code === 'auth/unauthorized-domain'
      ? 'O domínio do Compasso precisa ser autorizado no Firebase do Projetos CCM.'
      : 'Falha ao entrar. Abra a janela do Google e tente novamente.';
  } finally {
    connect.disabled = false;
  }
};

disconnect.onclick = async () => {
  generation++;
  user = undefined;
  list.replaceChildren();
  disconnect.hidden = true;
  connect.hidden = false;
  message.textContent = 'Entre com sua conta Master para ver a equipe.';
  await auth.signOut();
};
document.querySelector('[data-tab="team"]').addEventListener('click', refresh);
setInterval(refresh, 30000);
