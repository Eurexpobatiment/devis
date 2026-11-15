/* Devis réserves – Eurexpo · plans des réserves pour le PDF.
 * Les positions (X, Y entre 0 et 1) et les plans viennent de BatiScript par la fonction « relais-batiscript » ;
 * chaque plan est dessiné dans le navigateur (pdf.js) avec une pastille numérotée par réserve du devis. */

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const COTE = 2400;          // plus grand côté de l'image du plan, en pixels
const C = { fonce: '#004C46', pastille: '#C00000', blanc: '#FFFFFF' };

let charge = null;
function pdfjs() {
  return charge = charge || new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { charge = null; ko(new Error('Impossible de charger le lecteur de plans (connexion ?)')); };
    document.head.appendChild(s);
  });
}

// Fond du plan : première page du PDF (ou image) → canvas dont le plus grand côté fait COTE pixels
async function fond(octets, type) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const entete = new Uint8Array(octets.slice(0, 5));
  const estPdf = /pdf/i.test(type) || String.fromCharCode.apply(null, entete) === '%PDF-';
  if (estPdf) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(octets) }).promise;
    try {
      const page = await doc.getPage(1);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: COTE / Math.max(v1.width, v1.height) });
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
    } finally { doc.destroy(); }
  } else {
    const url = URL.createObjectURL(new Blob([octets], { type: type || 'image/jpeg' }));
    try {
      const im = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Plan illisible')); i.src = url; });
      const k = Math.min(1, COTE / Math.max(im.naturalWidth, im.naturalHeight));
      cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(im, 0, 0, cv.width, cv.height);
    } finally { URL.revokeObjectURL(url); }
  }
  return cv;
}

/* Pastilles : un point à l'endroit exact de la réserve, et son numéro dans une bulle reliée au point.
 * Les bulles qui se chevauchent sont écartées peu à peu (elles restent dans l'image). */
export function placer(points, W, H, r) {
  const B = points.map((p, i) => {
    const a = (i * 2.399963) % (2 * Math.PI);   // départs répartis autour du point
    return { px: p.x * W, py: p.y * H, x: p.x * W + Math.cos(a) * r * 1.6, y: p.y * H - Math.abs(Math.sin(a)) * r * 1.6 - r * 0.6, num: p.num };
  });
  const borne = b => { b.x = Math.min(W - r - 2, Math.max(r + 2, b.x)); b.y = Math.min(H - r - 2, Math.max(r + 2, b.y)); };
  B.forEach(borne);
  for (let t = 0; t < 200; t++) {
    let bouge = false;
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        let dx = B[j].x - B[i].x, dy = B[j].y - B[i].y, d = Math.hypot(dx, dy);
        const mini = r * 2.15;
        if (d >= mini) continue;
        if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        const e = (mini - d) / 2 + 0.5; dx /= d; dy /= d;
        B[i].x -= dx * e; B[i].y -= dy * e; B[j].x += dx * e; B[j].y += dy * e; bouge = true;
      }
      // une bulle ne doit pas cacher le point d'une autre réserve
      for (let j = 0; j < B.length; j++) {
        if (j === i) continue;
        let dx = B[i].x - B[j].px, dy = B[i].y - B[j].py, d = Math.hypot(dx, dy);
        const mini = r * 1.3;
        if (d >= mini) continue;
        if (d < 0.01) { dx = 0; dy = -1; d = 1; }
        B[i].x += dx / d * (mini - d + 0.5); B[i].y += dy / d * (mini - d + 0.5); bouge = true;
      }
      // rappel doux vers son point, pour ne pas partir trop loin
      const lx = B[i].x - B[i].px, ly = B[i].y - B[i].py, l = Math.hypot(lx, ly);
      if (l > r * 6) { B[i].x -= lx / l * (l - r * 6) * 0.2; B[i].y -= ly / l * (l - r * 6) * 0.2; }
      borne(B[i]);
    }
    if (!bouge) break;
  }
  return B;
}
function dessiner(cv, points) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const long = Math.max(...points.map(p => String(p.num).length), 1);
  const r = Math.round(Math.max(W, H) * (long > 3 ? 0.0125 : 0.0105));
  const B = placer(points, W, H, r);
  g.lineCap = 'round';
  B.forEach(b => {   // traits de rappel, sous les bulles
    g.strokeStyle = C.blanc; g.lineWidth = r * 0.34; g.beginPath(); g.moveTo(b.px, b.py); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = C.pastille; g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(b.px, b.py); g.lineTo(b.x, b.y); g.stroke();
  });
  B.forEach(b => {   // point exact
    g.beginPath(); g.arc(b.px, b.py, r * 0.3, 0, 2 * Math.PI); g.fillStyle = C.pastille; g.fill();
    g.lineWidth = r * 0.1; g.strokeStyle = C.blanc; g.stroke();
  });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  B.forEach(b => {   // bulle numérotée
    g.beginPath(); g.arc(b.x, b.y, r, 0, 2 * Math.PI); g.fillStyle = C.pastille; g.fill();
    g.lineWidth = r * 0.14; g.strokeStyle = C.blanc; g.stroke();
    const t = String(b.num);
    g.font = 'bold ' + Math.round(r * (t.length > 3 ? 0.72 : t.length > 2 ? 0.86 : 1.05)) + 'px Arial, Helvetica, sans-serif';
    g.fillStyle = C.blanc; g.fillText(t, b.x, b.y + r * 0.04);
  });
}

/* nums : numéros des réserves du devis · appel(corps) → Response de la fonction relais (compte déjà vérifié)
 * Renvoie { pages: [{ nom, img, w, h, nums }], absentes: [numéros sans position], erreurs: [plans non lus] } */
export async function pages(nums, appel, suivi) {
  suivi = suivi || (() => {});
  suivi('Lecture des positions des réserves dans BatiScript…');
  const rep = await appel({ positions: true });
  const d = await rep.json().catch(() => null);
  if (!d || !d.ok) throw new Error((d && d.err) || 'Positions des réserves indisponibles');
  const pos = d.res.pos || {}, noms = d.res.plans || {};
  const parPlan = new Map(), absentes = [];
  nums.forEach(n => {
    const p = pos[String(n)];
    if (!p) { absentes.push(String(n)); return; }
    if (!parPlan.has(p[0])) parPlan.set(p[0], []);
    parPlan.get(p[0]).push({ num: String(n), x: Math.min(1, Math.max(0, p[1])), y: Math.min(1, Math.max(0, p[2])) });
  });
  const out = [], erreurs = [];
  let k = 0;
  for (const [idPlan, points] of parPlan) {
    k++;
    const nom = noms[idPlan] || 'Plan';
    suivi('Plan ' + k + ' / ' + parPlan.size + ' : ' + nom + '…');
    try {
      const r = await appel({ plan: idPlan });
      if (!r.ok) throw new Error('plan non fourni (' + r.status + ')');
      const cv = await fond(await r.arrayBuffer(), r.headers.get('Content-Type') || '');
      points.sort((a, b) => Number(a.num) - Number(b.num));
      dessiner(cv, points);
      out.push({ nom, img: cv.toDataURL('image/jpeg', 0.82), w: cv.width, h: cv.height, nums: points.map(p => p.num) });
      cv.width = cv.height = 0;
    } catch (e) { console.warn('Plan ' + nom + ' :', e); erreurs.push(nom); }
  }
  return { pages: out, absentes, erreurs };
}
