/* Devis réserves – Eurexpo · PDF (page de garde + devis) et Excel, fabriqués dans le navigateur,
 * puis enregistrés là où la personne le choisit. */
import { euros } from './logic.js?v=1';

const C = { vert: '#00AB89', fonce: '#004C46', clair: '#F5F5F4', texte: '#334155', alerte: '#C00000', accent: '#F0AE40', gris: '#78716C' };
const EMETTEUR = 'GL events Lyon – Eurexpo Lyon';
const SITES = 'Centre de congrès de Lyon · Eurexpo Lyon · La Sucrière · Matmut Stadium';

const charges = {};
function script(url) {
  return charges[url] = charges[url] || new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = url; s.onload = ok;
    s.onerror = () => ko(new Error('Impossible de charger ' + url.split('/').pop() + ' (connexion ?)'));
    document.head.appendChild(s);
  });
}
async function pdfmake() {
  await script('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js');
  await script('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js');
  return window.pdfMake;
}
export async function sheetjs() {
  await script('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  return window.XLSX;
}
const images = {};
async function image(nom) {
  if (images[nom]) return images[nom];
  const b = await (await fetch(nom)).blob();
  return images[nom] = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
}

/* Ordre des halls : n° de hall trouvé dans la zone (« Hall 2.1 BC », « Sanitaires Hall 3.2 latéral »),
 * puis les zones sans hall (accueil, extérieurs…) par ordre alphabétique ; ensuite code BPU puis n° de réserve */
const cmpTxt = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true, sensitivity: 'base' });
function cleHall(plan) {
  const p = String(plan || '');
  const m = /hall\s*(\d+)(?:\.(\d+))?/i.exec(p);
  return m ? [0, Number(m[1]), Number(m[2] || 0), /^\s*hall/i.test(p) ? 0 : 1] : [p ? 1 : 2, 0, 0, 0];
}
// Groupe de sous-total : le hall (« Sanitaires Hall 3.2 latéral » → Hall 3.2), sinon la zone elle-même
export function groupeHall(plan) {
  const p = String(plan || '').trim();
  const m = /hall\s*(\d+)(?:\.(\d+))?/i.exec(p);
  return m ? 'Hall ' + m[1] + (m[2] ? '.' + m[2] : '') : (p || 'Sans zone');
}
// Lignes rangées par hall, découpées en groupes { nom, lignes, n, ht }
export function groupes(lignes) {
  const out = [];
  parHall(lignes).forEach(l => {
    const g = groupeHall(l.plan);
    let G = out[out.length - 1];
    if (!G || G.nom !== g) out.push(G = { nom: g, lignes: [], n: 0, ht: 0 });
    G.lignes.push(l); G.n++; if (l.mt !== null && l.mt !== undefined) G.ht += l.mt;
  });
  out.forEach(G => { G.ht = Math.round(G.ht * 100) / 100; });
  return out;
}
export function parHall(lignes) {
  return lignes.slice().sort((a, b) => {
    const x = cleHall(a.plan), y = cleHall(b.plan);
    for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return cmpTxt(a.plan, b.plan) || ((!a.connu) - (!b.connu)) || cmpTxt(a.code, b.code) || (Number(a.num) - Number(b.num));
  });
}

export const nomFichier = (d, ext) =>
  (d.num ? d.num + ' - ' : '') + 'Devis réserves - ' + String(d.salon).replace(/[\\/:*?"<>|]/g, ' ') + '.' + ext;

// Enregistrement : fenêtre « Enregistrer sous » quand le navigateur la propose (Chrome, Edge), sinon téléchargement
// La fenêtre est ouverte tout de suite (au clic), le fichier est fabriqué ensuite : fabriquer() → Blob
export async function enregistrer(nom, type, fabriquer, pendant) {
  let h = null;
  if (window.showSaveFilePicker && window.self === window.top) {
    try {
      const ext = nom.split('.').pop();
      h = await window.showSaveFilePicker({
        suggestedName: nom,
        types: [{ description: ext.toUpperCase(), accept: { [type]: ['.' + ext] } }]
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return 'annule';
      h = null;
    }
  }
  if (pendant) pendant();
  const blob = await fabriquer();
  if (h) { const w = await h.createWritable(); await w.write(blob); await w.close(); return 'enregistre'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return 'telecharge';
}

/* d : { salon, num, date, lignes:[{num, plan, constat, obs, code, connu, des, unite, qte, pu, mt}], n, nc, sansPu, ht, tva, ttc, taux, source } */
export async function pdf(d) {
  const pm = await pdfmake();
  const [logo, photo] = await Promise.all([image('logo.png'), image('garde.jpg')]);
  const W = 841.89, H = 595.28;
  const edite = new Date().toLocaleDateString('fr-FR');

  const garde = [
    { text: 'CENTRE DE CONGRÈS DE LYON\nEUREXPO LYON\nLA SUCRIÈRE\nMATMUT STADIUM', absolutePosition: { x: 560, y: 78 },
      width: 236, alignment: 'right', fontSize: 6.5, color: C.fonce, lineHeight: 1.15 },
    { image: logo, width: 145, absolutePosition: { x: 30, y: 128 } },
    { text: 'HOME OF\nEXCELLENCE', absolutePosition: { x: 32, y: 222 }, fontSize: 21, color: C.fonce, lineHeight: 1.05 },
    { image: photo, width: 285, height: 195, absolutePosition: { x: 374, y: 116 } },
    { stack: [
      { text: 'Devis de remise en état', bold: true, fontSize: 18, color: C.fonce },
      { text: 'Salon ' + d.salon, bold: true, fontSize: 18, color: C.fonce },
      { text: [d.num, d.date].filter(Boolean).join(' · '), fontSize: 10, color: C.fonce, margin: [0, 14, 0, 0] },
      { text: 'Total ' + euros(d.ht) + ' HT · ' + euros(d.ttc) + ' TTC · ' + d.n + ' réserve(s)', fontSize: 9, color: C.fonce, margin: [0, 16, 0, 0] }
    ], alignment: 'right', absolutePosition: { x: 400, y: 386 }, width: 396 },
    { text: 'Édité le ' + edite + ' – GL events Lyon', italics: true, fontSize: 7, color: C.texte, absolutePosition: { x: 30, y: 524 } },
    { text: '', pageBreak: 'after' }
  ];

  const alertes = [];
  if (d.nc) alertes.push(d.nc + ' réserve(s) non classée(s)');
  if (d.sansPu) alertes.push(d.sansPu + ' réserve(s) sans prix unitaire');

  const entete = {
    columns: [
      { width: '*', stack: [
        { text: 'Devis N° ' + (d.num || '—'), bold: true, fontSize: 18, color: C.fonce },
        { text: 'Remise en état suite au salon ' + d.salon, fontSize: 10, color: C.texte, margin: [0, 4, 0, 2] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 205, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 2, 0, 8] },
        { table: { widths: [52, 'auto'], body: [
          [{ text: 'Date', bold: true }, d.date || ''],
          [{ text: 'Salon', bold: true }, d.salon],
          [{ text: 'N° devis', bold: true }, d.num || '']
        ] }, layout: 'noBorders', fontSize: 8.5 },
        alertes.length ? { text: 'Attention : ' + alertes.join(' – '), color: C.alerte, bold: true, fontSize: 8.5, margin: [0, 4, 0, 0] } : {}
      ] },
      { width: 230, stack: [
        { image: logo, width: 110, alignment: 'right' },
        { text: EMETTEUR + '\n' + SITES, fontSize: 7, alignment: 'right', color: C.texte, margin: [0, 6, 0, 0] }
      ] }
    ],
    margin: [0, 0, 0, 10]
  };

  const th = t => ({ text: t, bold: true, color: '#FFFFFF', fillColor: C.fonce, alignment: 'center', fontSize: 8.5 });
  const corps = [[th('N°\nréserve'), th('Hall / zone'), th('Constat'), th('Observations'), th('Code\nBPU'), th('Désignation'),
    th('Unité'), th('Qté'), th('PU HT'), th('Montant HT')]];
  const stot = [];
  groupes(d.lignes).forEach(G => { G.lignes.forEach(l => {
    const nc = !l.connu;
    corps.push([
      l.num, l.plan || '', l.constat || '', l.obs || '',
      { text: nc ? '' : l.code, alignment: 'center' },
      nc ? { text: 'Non classé', color: C.alerte, bold: true } : (l.des || ''),
      { text: l.unite || '', alignment: 'center' },
      { text: String(l.qte).replace('.', ','), alignment: 'center' },
      { text: l.pu === null ? (nc ? '' : 'à saisir') : euros(l.pu), alignment: 'right', color: l.pu === null && !nc ? C.alerte : undefined },
      { text: l.mt === null ? '' : euros(l.mt), alignment: 'right' }
    ]);
  });
    const f = { fillColor: '#E6F6F2', bold: true, color: C.fonce };
    stot.push(corps.length);
    corps.push([Object.assign({ text: 'Sous-total ' + G.nom + ' (' + G.n + ' réserve' + (G.n > 1 ? 's' : '') + ')', colSpan: 9, alignment: 'right' }, f),
      '', '', '', '', '', '', '', '', Object.assign({ text: euros(G.ht), alignment: 'right' }, f)]);
  });
  const total = (lib, v, gras) => [{ text: lib, colSpan: 2, bold: gras, alignment: 'right' }, '', { text: euros(v), bold: gras, alignment: 'right' }];

  const doc = {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [40, 28, 24, 30],
    info: { title: 'Devis ' + (d.num || '') + ' – ' + d.salon, author: EMETTEUR },
    defaultStyle: { fontSize: 8.5, color: C.texte, lineHeight: 1.1 },
    background: (page) => page === 1
      ? { canvas: [
          { type: 'rect', x: 0, y: 0, w: 374, h: H, color: C.clair },
          { type: 'rect', x: 374, y: 0, w: W - 374, h: H, color: C.vert },
          { type: 'rect', x: 233, y: 116, w: 141, h: 195, color: C.fonce }
        ] }
      : { canvas: [{ type: 'rect', x: 0, y: 0, w: 12, h: H, color: C.vert }] },
    footer: (page, nb) => page === 1 ? null : {
      columns: [
        { text: 'Devis ' + (d.num || '') + ' – ' + d.salon, fontSize: 7, color: C.gris },
        { text: 'Page ' + (page - 1) + ' / ' + (nb - 1), fontSize: 7, color: C.gris, alignment: 'right' }
      ], margin: [40, 8, 24, 0]
    },
    content: garde.concat([
      entete,
      { table: { headerRows: 1, dontBreakRows: true, widths: [34, 62, 108, 128, 34, 160, 30, 26, 54, 62], body: corps },
        layout: {
          fillColor: (i) => i > 0 && i % 2 === 0 ? C.clair : null,
          hLineWidth: (i) => i === 0 ? 0 : (stot.indexOf(i) >= 0 || stot.indexOf(i - 1) >= 0 ? 0.8 : 0.4), vLineWidth: () => 0, hLineColor: () => '#E7E5E4',
          paddingTop: () => 4, paddingBottom: () => 4
        } },
      { columns: [{ width: '*', text: '' }, { width: 230, table: { widths: [70, 70, 80], body: [
        total('Total HT', d.ht, true), total('TVA ' + String(Math.round(d.taux * 1000) / 10).replace('.', ',') + ' %', d.tva, false),
        total('Total TTC', d.ttc, true)
      ] }, layout: 'noBorders', fontSize: 9.5 }], margin: [0, 10, 0, 0], unbreakable: true },
      { text: 'Prix unitaires HT issus du bordereau de prix (BPU) remise en état après salon.', fontSize: 7.5, italics: true, margin: [0, 14, 0, 0] },
      { text: 'Réserves relevées dans BatiScript' + (d.source ? ' – ' + d.source : '') + '.', fontSize: 7.5, italics: true }
    ])
  };
  const blob = await new Promise((ok, ko) => { try { pm.createPdf(doc).getBlob(ok); } catch (e) { ko(e); } });
  return blob;
}

/* Excel sur la trame du PDF (ExcelJS : couleurs, logo, sous-totaux par hall, formules) */
async function exceljs() {
  await script('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');
  return window.ExcelJS;
}
const argb = h => 'FF' + h.replace('#', '').toUpperCase();
const lignesTexte = (t, wch) => String(t == null ? '' : t).split('\n')
  .reduce((n, p) => n + Math.max(1, Math.ceil(p.length / (wch * 1.1))), 0);

export async function excel(d) {
  const EJ = await exceljs();
  const logo = await image('logo.png');
  const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 3, h: 1 }); i.src = logo; });
  const amp = t => String(t || '').replace(/&/g, '&&');
  const wb = new EJ.Workbook(); wb.creator = EMETTEUR;
  const ws = wb.addWorksheet('Devis', {
    properties: { tabColor: { argb: argb(C.vert) } },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 } },
    headerFooter: { oddFooter: '&L&8Devis ' + amp(d.num) + ' – ' + amp(d.salon) + '&R&8Page &P / &N' }
  });
  const W = [8, 18, 24, 30, 8, 38, 7, 6, 12, 13];
  ws.columns = W.map(w => ({ width: w }));
  const F = (o) => Object.assign({ name: 'Arial', size: 9, color: { argb: argb(C.texte) } }, o);
  const fond = h => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(h) } });
  const EUR = '#,##0.00 "€"';
  const trait = { style: 'thin', color: { argb: 'FFE7E5E4' } };

  // En-tête du devis
  ws.getCell('A1').value = 'Devis N° ' + (d.num || '—'); ws.getCell('A1').font = F({ size: 18, bold: true, color: { argb: argb(C.fonce) } });
  ws.getRow(1).height = 28;
  ws.getCell('A2').value = 'Remise en état suite au salon ' + d.salon; ws.getCell('A2').font = F({ size: 10 });
  ['A3', 'B3', 'C3'].forEach(c => { ws.getCell(c).border = { bottom: { style: 'medium', color: { argb: argb(C.accent) } } }; });
  ws.getRow(3).height = 6;
  [['Date', d.date || ''], ['Salon', d.salon], ['N° devis', d.num || '']].forEach((x, i) => {
    const r = 5 + i; ws.getCell('A' + r).value = x[0]; ws.getCell('A' + r).font = F({ bold: true, size: 8.5 });
    ws.getCell('B' + r).value = x[1]; ws.getCell('B' + r).font = F({ size: 8.5 });
  });
  ws.getCell('J5').value = EMETTEUR; ws.getCell('J6').value = SITES;
  ['J5', 'J6'].forEach(c => { ws.getCell(c).font = F({ size: 7 }); ws.getCell(c).alignment = { horizontal: 'right' }; });
  const lw = 150;
  ws.addImage(wb.addImage({ base64: logo, extension: 'png' }), { tl: { col: 8.2, row: 0.15 }, ext: { width: lw, height: lw * dim.h / dim.w } });
  const alertes = [];
  if (d.nc) alertes.push(d.nc + ' réserve(s) non classée(s)');
  if (d.sansPu) alertes.push(d.sansPu + ' réserve(s) sans prix unitaire');
  if (alertes.length) { ws.getCell('A8').value = 'Attention : ' + alertes.join(' – '); ws.getCell('A8').font = F({ bold: true, size: 8.5, color: { argb: argb(C.alerte) } }); }

  // Tableau
  const hr = 10;
  const th = ws.getRow(hr);
  th.values = ['N°\nréserve', 'Hall / zone', 'Constat', 'Observations', 'Code\nBPU', 'Désignation', 'Unité', 'Qté', 'PU HT', 'Montant HT'];
  th.height = 28;
  th.eachCell(c => { c.fill = fond(C.fonce); c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });

  let r = hr, k = 0;
  const stot = [];
  groupes(d.lignes).forEach(G => {
    const debut = r + 1;
    G.lignes.forEach(l => {
      r++; k++;
      const nc = !l.connu, row = ws.getRow(r);
      const n = Number(l.num);
      row.values = [isNaN(n) || l.num === '' ? l.num : n, l.plan || '', l.constat || '', l.obs || '', nc ? '' : l.code,
        nc ? 'Non classé' : (l.des || ''), l.unite || '', l.qte,
        l.pu === null ? (nc ? '' : 'à saisir') : l.pu,
        l.pu === null || nc ? null : { formula: 'H' + r + '*I' + r, result: l.mt }];
      for (let c = 1; c <= 10; c++) {
        const x = row.getCell(c);
        x.font = F(); x.border = { bottom: trait };
        x.alignment = { vertical: 'middle', wrapText: true, horizontal: [5, 7, 8].indexOf(c) >= 0 ? 'center' : (c >= 9 ? 'right' : 'left') };
        if (k % 2 === 0) x.fill = fond(C.clair);
      }
      row.getCell(9).numFmt = EUR; row.getCell(10).numFmt = EUR;
      if (nc) row.getCell(6).font = F({ bold: true, color: { argb: argb(C.alerte) } });
      if (l.pu === null && !nc) row.getCell(9).font = F({ color: { argb: argb(C.alerte) } });
      row.height = Math.max(16, 3 + 11.5 * Math.max(...[2, 3, 4, 6].map(c => lignesTexte(row.getCell(c).value, W[c - 1]))));
    });
    r++;
    const row = ws.getRow(r);
    ws.mergeCells('A' + r + ':I' + r);
    row.getCell(1).value = 'Sous-total ' + G.nom + ' (' + G.n + ' réserve' + (G.n > 1 ? 's' : '') + ')';
    row.getCell(10).value = { formula: 'SUM(J' + debut + ':J' + (r - 1) + ')', result: G.ht };
    [1, 10].forEach(c => {
      const x = row.getCell(c);
      x.fill = fond('#E6F6F2'); x.font = F({ bold: true, color: { argb: argb(C.fonce) } });
      x.alignment = { horizontal: 'right', vertical: 'middle' };
      x.border = { top: { style: 'thin', color: { argb: argb(C.vert) } }, bottom: { style: 'thin', color: { argb: argb(C.vert) } } };
    });
    row.getCell(10).numFmt = EUR; row.height = 17;
    stot.push('J' + r);
  });
  const fin = r;
  ws.autoFilter = 'A' + hr + ':J' + fin;
  ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
  ws.pageSetup.printTitlesRow = hr + ':' + hr;

  // Totaux
  r += 2;
  const rHt = r, taux = String(Math.round(d.taux * 1000) / 10).replace('.', ',');
  [['Total HT', { formula: stot.length ? stot.join('+') : '0', result: d.ht }, true],
   ['TVA ' + taux + ' %', { formula: 'ROUND(J' + rHt + '*' + d.taux + ',2)', result: d.tva }, false],
   ['Total TTC', { formula: 'J' + rHt + '+J' + (rHt + 1), result: d.ttc }, true]].forEach((t, i) => {
    const y = rHt + i;
    ws.mergeCells('G' + y + ':I' + y);
    const a = ws.getCell('G' + y), v = ws.getCell('J' + y);
    a.value = t[0]; v.value = t[1]; v.numFmt = EUR;
    a.font = F({ bold: t[2], size: 9.5 }); v.font = F({ bold: t[2], size: 9.5 });
    a.alignment = { horizontal: 'right' }; v.alignment = { horizontal: 'right' };
    if (i === 2) [a, v].forEach(x => { x.border = { top: { style: 'thin', color: { argb: argb(C.fonce) } } }; });
  });
  r = rHt + 4;
  ['Prix unitaires HT issus du bordereau de prix (BPU) remise en état après salon.',
   'Réserves relevées dans BatiScript' + (d.source ? ' – ' + d.source : '') + '.'].forEach(t => {
    r++; ws.getCell('A' + r).value = t; ws.getCell('A' + r).font = F({ size: 7.5, italic: true });
  });

  // Récapitulatif par hall (2e onglet)
  const rc = wb.addWorksheet('Récap par hall', { properties: { tabColor: { argb: argb(C.fonce) } }, views: [{ showGridLines: false }] });
  rc.columns = [{ width: 34 }, { width: 12 }, { width: 16 }];
  rc.getCell('A1').value = 'Récapitulatif par hall – ' + (d.num || '') + ' – ' + d.salon;
  rc.getCell('A1').font = F({ size: 13, bold: true, color: { argb: argb(C.fonce) } });
  const h = rc.getRow(3); h.values = ['Hall / zone', 'Réserves', 'Montant HT'];
  h.eachCell(c => { c.fill = fond(C.fonce); c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); c.alignment = { horizontal: 'center' }; });
  let y = 3;
  groupes(d.lignes).forEach((G, i) => {
    y++; const row = rc.getRow(y); row.values = [G.nom, G.n, G.ht];
    row.eachCell(c => { c.font = F(); c.border = { bottom: trait }; if (i % 2) c.fill = fond(C.clair); });
    row.getCell(2).alignment = { horizontal: 'center' }; row.getCell(3).numFmt = EUR;
  });
  y++; const tot = rc.getRow(y);
  tot.values = ['Total', { formula: 'SUM(B4:B' + (y - 1) + ')', result: d.n }, { formula: 'SUM(C4:C' + (y - 1) + ')', result: d.ht }];
  tot.eachCell(c => { c.font = F({ bold: true, color: { argb: argb(C.fonce) } }); c.fill = fond('#E6F6F2'); });
  tot.getCell(2).alignment = { horizontal: 'center' }; tot.getCell(3).numFmt = EUR;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
