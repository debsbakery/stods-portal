// lib/invoice-pdf.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OrderWithItems } from './types';
import { formatCurrency } from './utils';

// ── Helper: fetch image URL → base64 data URI (works server + browser) ────────
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

// ── Fallback "D" circle if logo fails ─────────────────────────────────────────
function drawFallbackLogo(
  doc: jsPDF,
  color: [number, number, number],
  margin: number,
  yPos: number
) {
  doc.setFillColor(...color);
  doc.circle(margin + 12, yPos + 12, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('D', margin + 12, yPos + 15, { align: 'center' });
}

interface InvoiceData {
  order: OrderWithItems;
  bakeryInfo: {
    name: string;
    email: string;
    phone: string;
    address: string;
    abn?: string;
    bankName?: string;
    bankBSB?: string;
    bankAccount?: string;
  };
}

export async function generateInvoice(data: InvoiceData): Promise<jsPDF> {
  const { order, bakeryInfo } = data;
  const doc = new jsPDF();

  const logoColor: [number, number, number] = [206, 17, 38];
  const textColor: [number, number, number] = [0, 0, 0];
  const margin = 20;
  let yPos = margin;

  // ── Header background ────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 50, 'F');

  // ── Logo ─────────────────────────────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debsbakery-portal.vercel.app';
  const logoBase64 = await imageUrlToBase64(`${siteUrl}/logo.png`);

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, yPos + 2, 25, 25);
    } catch {
      drawFallbackLogo(doc, logoColor, margin, yPos);
    }
  } else {
    drawFallbackLogo(doc, logoColor, margin, yPos);
  }

  // ── Company name & details ────────────────────────────────────────────────────
  doc.setTextColor(...textColor);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(bakeryInfo.name, margin + 30, yPos + 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(bakeryInfo.email,   margin + 30, yPos + 20);
  doc.text(bakeryInfo.phone,   margin + 30, yPos + 25);
  doc.text(bakeryInfo.address, margin + 30, yPos + 30);
  if (bakeryInfo.abn) {
    doc.setFont('helvetica', 'bold');
    doc.text(`ABN: ${bakeryInfo.abn}`, margin + 30, yPos + 36);
  }

  // ── TAX INVOICE title ─────────────────────────────────────────────────────────
  doc.setTextColor(...textColor);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', 210 - margin, 25, { align: 'right' });

  // ── Invoice details box ───────────────────────────────────────────────────────
  yPos = 60;
  doc.setFillColor(250, 250, 250);
  doc.rect(210 - 90, yPos, 70, 40, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Number:', 210 - 85, yPos + 8);
  doc.text('Invoice Date:',   210 - 85, yPos + 16);
  doc.text('Order Date:',     210 - 85, yPos + 24);
  doc.text('Order ID:',       210 - 85, yPos + 32);

  doc.setFont('helvetica', 'normal');

  const invoiceNum = order.invoice_number
    ? String(order.invoice_number).padStart(6, '0')
    : `TEMP-${order.id.slice(0, 8).toUpperCase()}`;

  const invoiceDate = new Date(`${order.delivery_date}T00:00:00`).toLocaleDateString('en-AU');
  const orderDate   = new Date(order.created_at).toLocaleDateString('en-AU');
  const orderId     = order.id.slice(0, 8).toUpperCase();

  doc.text(invoiceNum,  210 - margin - 2, yPos + 8,  { align: 'right' });
  doc.text(invoiceDate, 210 - margin - 2, yPos + 16, { align: 'right' });
  doc.text(orderDate,   210 - margin - 2, yPos + 24, { align: 'right' });
  doc.text(orderId,     210 - margin - 2, yPos + 32, { align: 'right' });

  // ── Customer / Bill To ────────────────────────────────────────────────────────
  yPos = 60;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', margin, yPos);

  doc.setFontSize(9);
  yPos += 8;

  if (order.customer_business_name) {
    doc.setFont('helvetica', 'bold');
    doc.text(order.customer_business_name, margin, yPos);
    yPos += 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.text(order.customer_email, margin, yPos);
  yPos += 5;

  const customerAddress = order.customer_address || 'Address on file';
  doc.text(customerAddress, margin, yPos);
  yPos += 5;

  if ((order as any).customer_phone) {
    doc.text((order as any).customer_phone, margin, yPos);
    yPos += 5;
  }

  if (order.customer_abn) {
    doc.setFont('helvetica', 'bold');
    doc.text(`ABN: ${order.customer_abn}`, margin, yPos);
    yPos += 5;
  }

  // ── PO / Docket Numbers ───────────────────────────────────────────────────────
  yPos = 110;
  if ((order as any).purchase_order_number || (order as any).docket_number) {
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, yPos, 170, 15, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');

    let poLine = '';
    if ((order as any).purchase_order_number) {
      poLine = `PO Number: ${(order as any).purchase_order_number}`;
    }
    if ((order as any).docket_number) {
      if (poLine) poLine += '  |  ';
      poLine += `Docket Number: ${(order as any).docket_number}`;
    }

    doc.text(poLine, margin + 5, yPos + 10);
    yPos += 20;
  }

  if (order.notes) {
    yPos += 3;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text('Notes:', margin, yPos);
    yPos += 3;
    const splitNotes = doc.splitTextToSize(order.notes, 85);
    doc.text(splitNotes, margin, yPos);
    yPos += (splitNotes.length * 3) + 3;
    doc.setTextColor(...textColor);
  }

  // ── Items table ───────────────────────────────────────────────────────────────
  yPos = Math.max(yPos + 5, 125);

  const tableData = order.order_items.map(item => {
    const hasGST = item.gst_applicable !== false;
    return [
      (item as any).code || '--',           // ✅ correct column name
      item.product_name,
      item.quantity.toString(),
      formatCurrency(item.unit_price),
      hasGST ? 'Yes' : 'No',
      formatCurrency(item.subtotal),
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Code', 'Product', 'Qty', 'Unit Price', 'GST', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 60 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  // ── Totals ────────────────────────────────────────────────────────────────────
  const subtotal = order.order_items.reduce((sum, item) => sum + item.subtotal, 0);
  const gstTotal = order.order_items.reduce((sum, item) => {
    const hasGST = item.gst_applicable !== false;
    return sum + (hasGST ? item.subtotal * 0.1 : 0);
  }, 0);
  const total = subtotal + gstTotal;

  const finalY   = (doc as any).lastAutoTable.finalY + 10;
  const summaryX = 210 - 75;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);
  doc.text('Subtotal:', summaryX, finalY);
  doc.text(formatCurrency(subtotal), 210 - margin, finalY, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('GST (10%):', summaryX, finalY + 7);
  doc.text(formatCurrency(gstTotal), 210 - margin, finalY + 7, { align: 'right' });

  doc.setFillColor(0, 0, 0);
  doc.rect(summaryX - 5, finalY + 12, 70, 10, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('TOTAL (inc GST):', summaryX, finalY + 19);
  doc.text(formatCurrency(total), 210 - margin, finalY + 19, { align: 'right' });

  // ── Bank Payment Details ──────────────────────────────────────────────────────
  doc.setTextColor(...textColor);
  const bankY = finalY + 35;

  if (bakeryInfo.bankName || bakeryInfo.bankBSB || bakeryInfo.bankAccount) {
    doc.setFillColor(240, 253, 244);
    doc.rect(margin, bankY, 170, 30, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 101, 52);
    doc.text('Payment Information', margin + 5, bankY + 8);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    let bankLineY = bankY + 15;
    if (bakeryInfo.bankName) {
      doc.text(`Bank: ${bakeryInfo.bankName}`, margin + 5, bankLineY);
      bankLineY += 5;
    }
    if (bakeryInfo.bankBSB) {
      doc.text(`BSB: ${bakeryInfo.bankBSB}`, margin + 5, bankLineY);
      bankLineY += 5;
    }
    if (bakeryInfo.bankAccount) {
      doc.text(`Account: ${bakeryInfo.bankAccount}`, margin + 5, bankLineY);
      bankLineY += 5;
    }
    doc.text(`Reference: ${invoiceNum}`, margin + 5, bankLineY);
  }

  // ── Payment Terms ─────────────────────────────────────────────────────────────
  const termsY = bakeryInfo.bankName ? bankY + 40 : finalY + 30;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);

  const paymentTerms = (order as any).payment_terms || 30;
  doc.text(`Payment Terms: ${paymentTerms} days`, margin, termsY);
  doc.text('Payment Methods: Bank Transfer or Cash at delivery', margin, termsY + 5);

  // ── GST Statement ─────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);
  doc.text('This is a Tax Invoice for GST purposes.', margin, termsY + 15);
  doc.text(
    `Total includes GST of ${formatCurrency(gstTotal)} where applicable.`,
    margin,
    termsY + 20
  );

  // ── Footer ────────────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-AU')}`, 105, 280, { align: 'center' });
  doc.text('Thank you for your business!', 105, 284, { align: 'center' });

  return doc;
}