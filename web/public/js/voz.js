// Leer en voz alta: usa la voz del teléfono (app Android) o la del navegador.
let activa = leer();

function leer() {
  try {
    return localStorage.getItem('voz') !== 'no';
  } catch {
    return true;
  }
}

export const voz = {
  activa: () => activa,
  disponible: () => Boolean(window.AndroidVoz) || 'speechSynthesis' in window,
  alternar() {
    activa = !activa;
    try {
      localStorage.setItem('voz', activa ? 'si' : 'no');
    } catch {
      /* sin almacenamiento */
    }
    if (!activa) this.callar();
    return activa;
  },
  hablar(texto) {
    if (!activa || !texto) return;
    const limpio = String(texto).replace(/[*_#•]/g, '').slice(0, 400);
    try {
      if (window.AndroidVoz?.hablar) {
        window.AndroidVoz.hablar(limpio);
      } else if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(limpio);
        u.lang = 'es-MX';
        u.rate = 1.05;
        speechSynthesis.speak(u);
      }
    } catch {
      /* sin voz: no pasa nada */
    }
  },
  callar() {
    try {
      window.AndroidVoz?.callar?.();
      window.speechSynthesis?.cancel();
    } catch {
      /* nada */
    }
  },
};
