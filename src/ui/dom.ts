/** Required element lookup: a missing element is a markup bug, so fail loudly. */
export function el<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

export const els = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T[] =>
  [...root.querySelectorAll<T>(selector)];

export function setText(selector: string, text: string | number): void {
  el(selector).textContent = String(text);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  const t = el('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

export function isDialogOpen(): boolean {
  return el<HTMLDialogElement>('#dialog').open;
}

export function confirmDialog(text: string, okLabel = 'OK'): Promise<boolean> {
  const dlg = el<HTMLDialogElement>('#dialog');
  const okBtn = el('#dialog-ok');
  const cancelBtn = el('#dialog-cancel');
  el('#dialog-text').textContent = text;
  okBtn.textContent = okLabel;
  return new Promise((resolve) => {
    // 'close' also fires on Esc, so the promise always settles.
    let result = false;
    const ok = () => { result = true; dlg.close(); };
    const cancel = () => dlg.close();
    const onClose = () => {
      okBtn.removeEventListener('click', ok);
      cancelBtn.removeEventListener('click', cancel);
      dlg.removeEventListener('close', onClose);
      resolve(result);
    };
    okBtn.addEventListener('click', ok);
    cancelBtn.addEventListener('click', cancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}
