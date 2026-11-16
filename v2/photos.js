/* Devis réserves – Eurexpo · photos des réserves pour les rapports PDF.
 * Les photos viennent de BatiScript par la fonction « relais-batiscript » ; chacune est réduite dans le navigateur
 * (plus grand côté : COTE pixels) pour garder un PDF léger. */

const COTE = 900;        // plus grand côté de la photo dans le PDF, en pixels
const ENSEMBLE = 4;      // photos téléchargées en même temps

async function reduire(blob) {
  let im;
  try { im = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { im = await createImageBitmap(blob); }
  const k = Math.min(1, COTE / Math.max(im.width, im.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
  const g = cv.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(im, 0, 0, cv.width, cv.height);
  if (im.close) im.close();
  const out = { img: cv.toDataURL('image/jpeg', 0.78), w: cv.width, h: cv.height };
  cv.width = cv.height = 0;
  return out;
}

/* nums : numéros des réserves, dans l'ordre du rapport · appel(corps) → Response de la fonction relais
 * Renvoie { photos: [{ num, i, n, img, w, h }] (ordre du rapport), sans: nombre de réserves sans photo, erreurs: nombre de photos non lues } */
export async function charger(nums, appel, suivi) {
  suivi = suivi || (() => {});
  suivi('Lecture de la liste des photos dans BatiScript…');
  const rep = await appel({ photos: true });
  const d = await rep.json().catch(() => null);
  if (!d || !d.ok) throw new Error((d && d.err) || 'Photos des réserves indisponibles');
  const nb = d.res.nb || {};
  const aFaire = [];
  let sans = 0;
  nums.forEach(num => {
    const n = Number(nb[String(num)]) || 0;
    if (!n) { sans++; return; }
    for (let i = 0; i < n; i++) aFaire.push({ num: String(num), i, n });
  });
  let fait = 0, erreurs = 0, suivant = 0;
  suivi('Photos : 0 / ' + aFaire.length + '…');
  async function ouvrier() {
    while (suivant < aFaire.length) {
      const p = aFaire[suivant++];
      try {
        let r = await appel({ photo: p.num, i: p.i });
        if (!r.ok && r.status >= 500) r = await appel({ photo: p.num, i: p.i });   // 2e essai si BatiScript a hoqueté
        if (!r.ok) throw new Error('photo non fournie (' + r.status + ')');
        Object.assign(p, await reduire(await r.blob()));
      } catch (e) { console.warn('Photo ' + p.num + ' (' + (p.i + 1) + ') :', e); erreurs++; }
      fait++;
      suivi('Photos : ' + fait + ' / ' + aFaire.length + '…');
    }
  }
  await Promise.all(Array.from({ length: Math.min(ENSEMBLE, aFaire.length) }, ouvrier));
  return { photos: aFaire.filter(p => p.img), sans, erreurs };
}
