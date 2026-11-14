/* Ajuda contextual das propriedades clássicas. Um balão é compartilhado
   pelas janelas estáticas e pelos controles que a seleção recria. */
(function () {
  let trigger = null, panel = null, observer = null;
  const inset = 8;

  function close() {
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-describedby');
    observer.disconnect();
    panel.remove();
    panel = trigger = null;
  }

  function position() {
    if (!trigger) return;
    if (!trigger.isConnected || !trigger.getClientRects().length) { close(); return; }
    const anchor = trigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const view = window.visualViewport;
    const left = view?.offsetLeft || 0, top = view?.offsetTop || 0;
    const right = left + (view?.width || document.documentElement.clientWidth);
    const bottom = top + (view?.height || window.innerHeight);
    panel.style.left = Math.max(left + inset, Math.min(anchor.left, right - bounds.width - inset)) + 'px';
    const y = anchor.bottom + inset + bounds.height <= bottom ? anchor.bottom + inset : anchor.top - bounds.height - inset;
    panel.style.top = Math.max(top + inset, y) + 'px';
  }

  /* Texto de um bloco da janela, sem o "i" dos botões de ajuda internos.
     Cada <br> vira uma linha do balão; o resto do espaço é normalizado. */
  function blockText(element) {
    const copy = element.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    copy.querySelectorAll('br').forEach(node => node.replaceWith('\u0001'));
    return copy.textContent.split('\u0001').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }

  /* data-help-from aceita um ou vários ids: o i de uma seção reúne os textos
     de leitura que antes ocupavam linhas da janela. */
  function noteFor(button) {
    if (button.dataset.helpFrom) return button.dataset.helpFrom.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(blockText).filter(Boolean).join('\n');
    return (button.dataset.propHelp || button.querySelector('[hidden]')?.textContent || '').replace(/\s+/g, ' ');
  }

  function open(button) {
    const note = noteFor(button);
    if (!note?.trim()) return;
    trigger = button;
    panel = document.createElement('div');
    panel.id = 'gmPropertyExplanation';
    panel.setAttribute('role', 'tooltip');
    panel.setAttribute('popover', 'manual');
    panel.textContent = note.trim();
    document.body.append(panel);
    panel.showPopover?.();
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-describedby', panel.id);
    observer = new MutationObserver(position);
    const host = trigger.closest('.modal-bg,#propDock,#propBox');
    if (host) observer.observe(host, {childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
    position();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-prop-help],button[data-help-from]');
    if (button) {
      event.preventDefault();
      const wasOpen = button === trigger;
      close();
      if (!wasOpen) open(button);
    } else if (trigger && !panel.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (trigger && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = trigger;
      close();
      previous.focus({preventScroll:true});
    }
  }, true);
  document.addEventListener('focusin', event => {
    if (trigger && event.target !== trigger && !panel.contains(event.target)) close();
  });
  document.addEventListener('scroll', event => {
    if (trigger && !panel.contains(event.target)) close();
  }, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
})();

/* Janelas de propriedades (.gmp): o nome com o Renomear fica sempre visível
   logo abaixo do cabeçalho; o i do cabeçalho abre os dados de leitura do
   arquivo; as seções lembram se ficaram abertas e cada título mostra um
   resumo do estado da seção. */
(function () {
  const key = id => 'gmp.sec.' + id;
  const recall = id => { try { return localStorage.getItem(key(id)); } catch (_) { return null; } };

  function closeInfo(scope) {
    (scope || document).querySelectorAll('button[data-gmp-info][aria-expanded="true"]').forEach(button => {
      button.setAttribute('aria-expanded', 'false');
      const panel = document.getElementById(button.dataset.gmpInfo);
      if (panel) panel.hidden = true;
    });
  }

  /* Chamado ao abrir uma janela: painel do i fechado e seções como o usuário
     as deixou. Sem registro, vale o que está no HTML. */
  window.gmpOpen = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (!modal.classList.contains('on')) closeInfo(modal);
    modal.querySelectorAll('details[data-gmp-sec]').forEach(section => {
      const saved = recall(section.dataset.gmpSec);
      if (saved !== null) section.open = saved === '1';
    });
  };

  window.gmpStatus = function (id, text, kind) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = text || '';
    element.classList.toggle('ok', kind === 'ok');
    element.classList.toggle('warn', kind === 'warn');
  };

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-gmp-info]');
    if (!button) return;
    const panel = document.getElementById(button.dataset.gmpInfo);
    if (!panel) return;
    const show = panel.hidden;
    panel.hidden = !show;
    button.setAttribute('aria-expanded', String(show));
  });
  document.addEventListener('toggle', event => {
    const section = event.target;
    if (!section.matches?.('details[data-gmp-sec]') || !section.closest('.modal-bg.on')) return;
    try { localStorage.setItem(key(section.dataset.gmpSec), section.open ? '1' : '0'); } catch (_) {}
  }, true);
})();
