// Mástil horizontal en SVG: la 1ª cuerda arriba, como en las tablaturas.
export function mastil(cuerdaNum, traste) {
  const trastes = Math.max(5, traste + 1);
  const W = 320;
  const izq = 26;
  const der = 8;
  const arriba = 12;
  const sepC = 18;
  const H = arriba * 2 + sepC * 5;
  const anchoT = (W - izq - der) / trastes;
  let s = `<svg viewBox="0 0 ${W} ${H + 16}" class="mastil-svg" role="img" aria-label="Posición en el mástil">`;
  for (let f = 0; f <= trastes; f++) {
    const x = izq + f * anchoT;
    s += `<line x1="${x}" y1="${arriba}" x2="${x}" y2="${arriba + sepC * 5}" class="${f === 0 ? 'cejuela' : 'traste'}"/>`;
    if (f > 0) s += `<text x="${x - anchoT / 2}" y="${H + 12}" class="num-traste" text-anchor="middle">${f}</text>`;
  }
  for (let i = 0; i < 6; i++) {
    const y = arriba + i * sepC;
    s += `<line x1="${izq}" y1="${y}" x2="${W - der}" y2="${y}" class="cuerda" style="stroke-width:${1 + i * 0.35}"/>`;
    s += `<text x="${izq - 9}" y="${y + 4}" class="num-cuerda" text-anchor="end">${i + 1}</text>`;
  }
  const y = arriba + (cuerdaNum - 1) * sepC;
  if (traste === 0) {
    s += `<circle cx="${izq}" cy="${y}" r="7" class="aire-objetivo"/>`;
  } else {
    s += `<circle cx="${izq + (traste - 0.5) * anchoT}" cy="${y}" r="8" class="punto"/>`;
  }
  return s + '</svg>';
}
