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

  function open(button) {
    const note = button.dataset.helpFrom ? document.getElementById(button.dataset.helpFrom)?.textContent : (button.dataset.propHelp || button.querySelector('[hidden]')?.textContent);
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
