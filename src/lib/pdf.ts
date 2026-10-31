// ============================================================
// LocaBénin — Génération de PDF serveur (pdfkit)
// Documents : quittance de loyer, contrat de location, reçu, facture
// d'abonnement. Polices standard PDF (Helvetica) : accents français OK.
// ============================================================

import "server-only";
import PDFDocument from "pdfkit";
import { formatFcfa, formatDate } from "./finance";
import { label } from "./constants";

const PRIMARY = "#0B6B45";
const DARK = "#1A2E24";
const MUTED = "#6B7A72";

function footer(doc: PDFKit.PDFDocument) {
  const bottom = doc.page.height - 60;
  doc.fontSize(8).fillColor(MUTED)
    .text("LocaBénin — Plateforme de location immobilière au Bénin", 50, bottom, { width: doc.page.width - 100, align: "center" })
    .text("Document généré électroniquement — contact@locabenin.bj", 50, bottom + 12, { width: doc.page.width - 100, align: "center" });
}

function header(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(18).text("LocaBénin", 50, 28);
  doc.font("Helvetica").fontSize(9).text("Portail de la location immobilière au Bénin", 50, 50);
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(16).text(title, 50, 120);
  if (subtitle) doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(subtitle, 50, 140, { width: doc.page.width - 100 });
}

function infoTable(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, startY: number): number {
  let y = startY;
  for (const [k, v] of rows) {
    const vStr = String(v);
    const h = Math.max(20, doc.heightOfString(vStr, { width: doc.page.width - 240 }) + 8);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(k, 50, y + 6, { width: 170 });
    doc.font("Helvetica").fontSize(9).fillColor(DARK).text(vStr, 230, y + 6, { width: doc.page.width - 280 });
    doc.moveTo(50, y + h).lineTo(doc.page.width - 50, y + h).strokeColor("#E5E0D8").lineWidth(0.5).stroke();
    y += h;
  }
  return y;
}

function amountBox(doc: PDFKit.PDFDocument, text: string, y: number) {
  const w = doc.page.width - 100;
  doc.roundedRect(50, y, w, 44, 8).fillAndStroke("#EFF7F2", PRIMARY);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(PRIMARY).text(text, 50, y + 14, { width: w, align: "center" });
}

export interface QuittanceData {
  paymentRef: string;
  leaseRef: string;
  tenantName: string;
  ownerName: string;
  listingTitle: string;
  listingAddress: string;
  periodLabel: string;
  amount: number;
  paidAt: Date;
  method: string;
}

export function buildQuittancePdf(data: QuittanceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    header(doc, "Quittance de loyer", `Référence paiement : ${data.paymentRef}`);
    let y = infoTable(doc, [
      ["Bail", data.leaseRef],
      ["Locataire", data.tenantName],
      ["Propriétaire", data.ownerName],
      ["Logement", `${data.listingTitle} — ${data.listingAddress}`],
      ["Période concernée", data.periodLabel],
      ["Date de paiement", formatDate(data.paidAt, true)],
      ["Mode de paiement", label(data.method)],
    ], 165);

    amountBox(doc, `Quittance de ${formatFcfa(data.amount)}`, y + 20);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED)
      .text("La présente quittance atteste du paiement du loyer et charges pour la période indiquée. En cas de paiement partiel, un solde reste dû.",
        50, y + 80, { width: doc.page.width - 100 });
    footer(doc);
    doc.end();
  });
}

export interface ContractData {
  leaseRef: string;
  kind: string;
  ownerName: string;
  ownerPhone: string;
  tenantName: string;
  tenantPhone: string;
  listingTitle: string;
  listingType: string;
  listingAddress: string;
  rentAmount: number;
  rentPeriod: string;
  depositAmount: number;
  advanceMonths: number;
  depositOptions: Array<{ label: string; amount: number }>;
  commissionNote: string | null;
  startDate: Date;
  endDate: Date | null;
}

export function buildContractPdf(data: ContractData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    header(doc, "Contrat de location", `Référence : ${data.leaseRef}`);

    const article = (n: number, t: string) => {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(PRIMARY).text(`Article ${n} — ${t}`);
      doc.font("Helvetica").fontSize(9.5).fillColor(DARK);
    };
    doc.font("Helvetica").fontSize(9.5).fillColor(DARK);

    article(1, "PARTIES");
    doc.text(`Le BAILLEUR : ${data.ownerName} (tél. ${data.ownerPhone}), ci-après « le Propriétaire ».`);
    doc.text(`Le PRENEUR : ${data.tenantName} (tél. ${data.tenantPhone}), ci-après « le Locataire ».`);
    doc.text("Le contrat est conclu via la plateforme LocaBénin.");

    article(2, "OBJET");
    doc.text(`Location d'un ${label(data.listingType).toLowerCase()} : « ${data.listingTitle} », situé ${data.listingAddress}. Type de location : ${label(data.kind)}.`);

    article(3, "DURÉE");
    doc.text(`Prise d'effet le ${formatDate(data.startDate)}${data.endDate ? `, pour une durée courant jusqu'au ${formatDate(data.endDate)}` : ", pour une durée indéterminée renouvelable par période"}.`);

    article(4, "LOYER ET CHARGES");
    doc.text(`Loyer : ${formatFcfa(data.rentAmount)} par ${label(data.rentPeriod)}, payable d'avance via la plateforme (Mobile Money ou carte).`);

    article(5, "CAUTION ET AVANCES");
    doc.text(`Caution de dépôt de garantie : ${data.depositAmount > 0 ? formatFcfa(data.depositAmount) : "sans objet (meublé)"} ; restituable en fin de bail après état des lieux de sortie, déduction faite des retenues justifiées.`);
    if (data.advanceMonths > 0) doc.text(`Avances : ${data.advanceMonths} mois de loyer, soit ${formatFcfa(data.advanceMonths * data.rentAmount)} payés à l'entrée.`);
    if (data.depositOptions.length > 0) {
      doc.text("Cautions optionnelles :");
      for (const opt of data.depositOptions) doc.text(`  • ${opt.label} : ${formatFcfa(opt.amount)}`);
    }
    if (data.commissionNote) doc.text(data.commissionNote);

    article(6, "OBLIGATIONS DU LOCATAIRE");
    doc.text("Payer le loyer aux échéances convenues ; user paisiblement des lieux ; souscrire les assurances usuelles ; signaler sans délai tout dommage (tickets de réparation) ; ne pas sous-louer sans accord écrit.");

    article(7, "OBLIGATIONS DU PROPRIÉTAIRE");
    doc.text("Délivrer un logement décent ; en assurer la jouissance paisible ; réaliser les réparations majeures ; restituer la caution dans les délais après sortie.");

    article(8, "FIN DU BAIL");
    doc.text("Préavis : délai légal béninois, notifié via la plateforme. État des lieux de sortie contradictoire avec photos. La restitution de caution est enregistrée dans l'espace Finances.");

    article(9, "LITIGES");
    doc.text("Tout litige fera l'objet d'une tentative de règlement amiable via la plateforme avant saisine des tribunaux compétents du Bénin.");

    article(10, "SIGNATURES ÉLECTRONIQUES");
    doc.text("Les parties signent électroniquement ce contrat via LocaBénin. Le document signé, horodaté et haché (SHA-256) est conservé dans le coffre-fort de chaque partie.");

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK).text(`Fait à Porto-Novo, le ${formatDate(new Date())}`, 50);
    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text("Signature du Propriétaire : ______________________", 50, doc.y);
    doc.text("Signature du Locataire : ______________________", 300, doc.y - 14);
    footer(doc);
    doc.end();
  });
}

export interface InvoiceData {
  invoiceRef: string;
  ownerName: string;
  ownerPhone: string;
  periodLabel: string;
  lines: Array<{ label: string; price: number; listingCount: number }>;
  total: number;
  status: string;
  dueDate: Date;
}

export function buildInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    header(doc, "Facture d'abonnement", `Référence : ${data.invoiceRef}`);
    let y = infoTable(doc, [
      ["Abonné", data.ownerName],
      ["Téléphone", data.ownerPhone],
      ["Période", data.periodLabel],
      ["Statut", label(data.status)],
      ["Échéance", formatDate(data.dueDate)],
    ], 165);

    y += 30;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("Détail", 50, y);
    y += 18;
    for (const line of data.lines) {
      doc.font("Helvetica").fontSize(9.5).fillColor(DARK)
        .text(`${line.label} — abonnement mensuel (offres : ${line.listingCount})`, 50, y, { width: 340 });
      doc.font("Helvetica-Bold").text(formatFcfa(line.price), 400, y, { width: 145, align: "right" });
      y += 20;
    }
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#E5E0D8").stroke();
    y += 10;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(PRIMARY).text("TOTAL MENSUEL", 50, y, { width: 340 });
    doc.text(formatFcfa(data.total), 400, y, { width: 145, align: "right" });
    footer(doc);
    doc.end();
  });
}

export function buildReceiptPdf(input: { ref: string; title: string; payer: string; amount: number; detail: Array<{ label: string; amount: number }>; date: Date }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    header(doc, "Reçu de paiement", `Référence : ${input.ref}`);
    let y = infoTable(doc, [
      ["Objet", input.title],
      ["Payeur", input.payer],
      ["Date", formatDate(input.date, true)],
    ], 165);
    y += 24;
    for (const l of input.detail) {
      doc.font("Helvetica").fontSize(9.5).fillColor(DARK).text(l.label, 50, y, { width: 340 });
      doc.font("Helvetica-Bold").text(formatFcfa(l.amount), 400, y, { width: 145, align: "right" });
      y += 20;
    }
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#E5E0D8").stroke();
    y += 12;
    amountBox(doc, `Total payé : ${formatFcfa(input.amount)}`, y + 6);
    footer(doc);
    doc.end();
  });
}
