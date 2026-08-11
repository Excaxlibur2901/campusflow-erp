import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { generateVerificationQR } from './qrCode.js';

const PRIMARY = '1B3A6B';
const ACCENT = '2E75B6';
const MUTED = '6B7280';
const PDF_PRIMARY = [27, 58, 107];
const PDF_ACCENT = [46, 117, 182];
const PDF_MUTED = [107, 114, 128];

const clean = (value) => String(value ?? '').trim();

export const sanitizeFilename = (value) =>
  clean(value || 'document')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'document';

const parseMarginMm = (value) => {
  const parsed = Number.parseInt(clean(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 15;
};

const getInitials = (settings) => {
  const name = clean(settings?.institutionName) || 'CampusFlow';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
};

const logoFormat = (dataUrl) => {
  if (!dataUrl?.startsWith('data:image/')) return null;
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
};

const imageType = (dataUrl) => {
  if (dataUrl?.startsWith('data:image/png')) return 'png';
  if (dataUrl?.startsWith('data:image/jpeg') || dataUrl?.startsWith('data:image/jpg')) return 'jpg';
  return null;
};

const dataUrlToUint8Array = (dataUrl) => {
  const base64 = dataUrl?.split(',')[1];
  if (!base64) return null;
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const institutionName = (settings) => clean(settings?.institutionName) || 'Institution Name';

const contactLine = (settings) =>
  [
    settings?.phone && `Phone: ${settings.phone}`,
    settings?.email && `Email: ${settings.email}`,
    settings?.website && `Web: ${settings.website}`,
  ]
    .filter(Boolean)
    .join(' | ');

const accreditationLine = (settings) =>
  [
    settings?.naacGrade && `NAAC: ${settings.naacGrade}`,
    settings?.aisheCode && `AISHE: ${settings.aisheCode}`,
    settings?.establishedYear && `Est. ${settings.establishedYear}`,
    settings?.collegeType,
  ]
    .filter(Boolean)
    .join(' | ');

const rowsFromDetails = (details = []) =>
  details
    .filter((item) => clean(item?.value))
    .map((item) => [clean(item.label), clean(item.value)]);

const normalizeColumns = (columns = []) => columns.map(clean).filter(Boolean);

const normalizeRows = (rows = []) => rows.map((row) => row.map((cell) => clean(cell)));

/* ------------------------------------------------------------------ */
/*  Reference number helper                                           */
/* ------------------------------------------------------------------ */

const generateRef = (type) => {
  const year = new Date().getFullYear();
  const serial = String(Date.now() % 100000).padStart(5, '0');
  return `CF/${type}/${year}/${serial}`;
};

/* ------------------------------------------------------------------ */
/*  PDF helpers                                                       */
/* ------------------------------------------------------------------ */

const addPdfLetterhead = (pdf, settings, margin) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const logoSize = 18;
  const headerTop = margin;
  const logoX = margin;
  const logoY = headerTop + 1;
  const format = logoFormat(settings?.collegeLogo);

  if (format) {
    try {
      pdf.addImage(settings.collegeLogo, format, logoX, logoY, logoSize, logoSize);
    } catch {
      pdf.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'S');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(getInitials(settings), logoX + logoSize / 2, logoY + 10.5, { align: 'center' });
    }
  } else {
    pdf.setDrawColor(...PDF_PRIMARY);
    pdf.setFillColor(27, 58, 107);
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'FD');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(getInitials(settings), logoX + logoSize / 2, logoY + 10.5, { align: 'center' });
  }

  const centerX = pageWidth / 2;
  let y = headerTop + 4;
  pdf.setTextColor(...PDF_MUTED);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  if (settings?.affiliation) {
    pdf.text(clean(settings.affiliation).toUpperCase(), centerX, y, { align: 'center' });
    y += 4;
  }

  pdf.setTextColor(...PDF_PRIMARY);
  pdf.setFontSize(15);
  pdf.text(institutionName(settings), centerX, y, { align: 'center' });
  y += 5;

  pdf.setTextColor(...PDF_ACCENT);
  pdf.setFontSize(8);
  if (settings?.autonomousStatus) {
    pdf.text(`(${clean(settings.autonomousStatus)})`, centerX, y, { align: 'center' });
    y += 4;
  }

  pdf.setTextColor(...PDF_MUTED);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  if (settings?.address) {
    pdf.text(clean(settings.address), centerX, y, { align: 'center', maxWidth: pageWidth - margin * 2 - 44 });
    y += 4;
  }
  const contact = contactLine(settings);
  if (contact) {
    pdf.text(contact, centerX, y, { align: 'center', maxWidth: pageWidth - margin * 2 - 34 });
    y += 4;
  }

  const badgeX = pageWidth - margin - 22;
  pdf.setDrawColor(217, 119, 6);
  pdf.setTextColor(217, 119, 6);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  if (settings?.naacGrade) {
    pdf.circle(badgeX + 7, headerTop + 10, 7, 'S');
    pdf.text('NAAC', badgeX + 7, headerTop + 8.5, { align: 'center' });
    pdf.text(clean(settings.naacGrade), badgeX + 7, headerTop + 12, { align: 'center' });
  }
  if (settings?.aisheCode) {
    pdf.setTextColor(...PDF_MUTED);
    pdf.setFontSize(6);
    pdf.text(`AISHE: ${clean(settings.aisheCode)}`, badgeX + 7, headerTop + 22, { align: 'center' });
  }

  const dividerY = Math.max(y + 2, headerTop + 25);
  pdf.setDrawColor(...PDF_PRIMARY);
  pdf.setLineWidth(0.6);
  pdf.line(margin, dividerY, pageWidth - margin, dividerY);
  pdf.setDrawColor(...PDF_ACCENT);
  pdf.setLineWidth(0.3);
  pdf.line(margin, dividerY + 1.2, pageWidth - margin, dividerY + 1.2);
  return dividerY + 8;
};

const addPdfBorder = (pdf) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Outer border: 0.7pt stroke, color [27,58,107], 8mm from edges
  pdf.setDrawColor(27, 58, 107);
  pdf.setLineWidth(0.7);
  pdf.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // Inner border: 0.3pt stroke, color [46,117,182], 10mm from edges
  pdf.setDrawColor(46, 117, 182);
  pdf.setLineWidth(0.3);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
};

const addPdfWatermark = (pdf) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setTextColor(230, 230, 230);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(40);
  pdf.text('OFFICIAL COPY', pageWidth / 2, pageHeight / 2, {
    align: 'center',
    angle: -40,
  });
};

const addPdfFooter = (pdf, footerText, footerId, title) => {
  const pageCount = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Generate QR data URL once for all pages
  const qrPayload = JSON.stringify({
    ref: footerId,
    title,
    date: new Date().toISOString().split('T')[0],
  });
  let qrDataUrl = null;
  try {
    qrDataUrl = generateVerificationQR(qrPayload);
  } catch {
    // If QR generation fails (e.g. no canvas in environment), skip it
  }

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);

    // Draw page borders
    addPdfBorder(pdf);

    // Draw watermark
    addPdfWatermark(pdf);

    // Footer line and text
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
    pdf.setTextColor(...PDF_MUTED);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(footerText, 14, pageHeight - 9);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 9, { align: 'right' });

    // QR code in footer area (bottom-right)
    if (qrDataUrl) {
      try {
        const qrX = pageWidth - 14 - 20; // margin=14, then offset by 20 for QR width area
        const qrY = pageHeight - 30;
        pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, 16, 16);
      } catch {
        // silently skip QR if addImage fails
      }
    }
  }
};

const addWrappedText = (pdf, text, x, y, maxWidth, lineHeight = 5, options = {}) => {
  const lines = pdf.splitTextToSize(clean(text), maxWidth);
  pdf.text(lines, x, y, options);
  return y + lines.length * lineHeight;
};

const addPdfSignatories = (pdf, signatories, margin, y) => {
  if (!signatories || !signatories.length) return y;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const usableWidth = pageWidth - margin * 2;
  const count = signatories.length;
  const spacing = usableWidth / count;

  // Add some vertical space before signatures
  y += 15;

  for (let i = 0; i < count; i += 1) {
    const centerX = margin + spacing * i + spacing / 2;
    const lineHalf = 15; // 30mm total line width / 2

    // Signature line (30mm)
    pdf.setDrawColor(100, 100, 100);
    pdf.setLineWidth(0.4);
    pdf.line(centerX - lineHalf, y, centerX + lineHalf, y);

    // Name (bold, 9pt)
    const nameText = clean(signatories[i].name);
    if (nameText) {
      pdf.setTextColor(40, 40, 40);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(nameText, centerX, y + 5, { align: 'center' });
    }

    // Designation (normal, 8pt, muted)
    const desigText = clean(signatories[i].designation);
    if (desigText) {
      pdf.setTextColor(...PDF_MUTED);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(desigText, centerX, y + (nameText ? 10 : 5), { align: 'center' });
    }
  }

  return y + 18;
};

/* ------------------------------------------------------------------ */
/*  DOCX helpers                                                      */
/* ------------------------------------------------------------------ */

const run = (text, options = {}) =>
  new TextRun({
    text: clean(text),
    bold: options.bold,
    italics: options.italics,
    color: options.color,
    size: options.size,
  });

const paragraph = (text, options = {}) =>
  new Paragraph({
    alignment: options.alignment,
    spacing: options.spacing ?? { after: 120 },
    border: options.border,
    children: [run(text, options)],
  });

const docxLetterhead = (settings) => {
  const children = [];
  const type = imageType(settings?.collegeLogo);
  const imageData = type ? dataUrlToUint8Array(settings.collegeLogo) : null;

  if (type && imageData) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new ImageRun({
            data: imageData,
            type,
            transformation: { width: 58, height: 58 },
          }),
        ],
      }),
    );
  }

  if (settings?.affiliation) {
    children.push(paragraph(clean(settings.affiliation).toUpperCase(), {
      alignment: AlignmentType.CENTER,
      bold: true,
      color: MUTED,
      size: 18,
      spacing: { after: 40 },
    }));
  }

  children.push(paragraph(institutionName(settings), {
    alignment: AlignmentType.CENTER,
    bold: true,
    color: PRIMARY,
    size: 30,
    spacing: { after: 40 },
  }));

  if (settings?.autonomousStatus) {
    children.push(paragraph(`(${clean(settings.autonomousStatus)})`, {
      alignment: AlignmentType.CENTER,
      bold: true,
      color: ACCENT,
      size: 18,
      spacing: { after: 40 },
    }));
  }

  if (settings?.address) {
    children.push(paragraph(clean(settings.address), {
      alignment: AlignmentType.CENTER,
      color: MUTED,
      size: 18,
      spacing: { after: 40 },
    }));
  }

  const contact = contactLine(settings);
  if (contact) {
    children.push(paragraph(contact, {
      alignment: AlignmentType.CENTER,
      color: MUTED,
      size: 17,
      spacing: { after: 40 },
    }));
  }

  const accreditation = accreditationLine(settings);
  if (accreditation) {
    children.push(paragraph(accreditation, {
      alignment: AlignmentType.CENTER,
      bold: true,
      color: ACCENT,
      size: 17,
      spacing: { after: 120 },
    }));
  }

  children.push(new Paragraph({
    border: {
      bottom: {
        color: ACCENT,
        space: 1,
        style: BorderStyle.SINGLE,
        size: 12,
      },
    },
    spacing: { after: 260 },
    children: [run('')],
  }));

  return children;
};

const tableCell = (text, options = {}) =>
  new TableCell({
    shading: options.shading,
    width: options.width,
    children: [
      paragraph(text, {
        bold: options.bold,
        color: options.color ?? '1A1A2E',
        size: 18,
        spacing: { after: 0 },
      }),
    ],
  });

const docxTable = (columns, rows) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: columns.map((column) =>
          tableCell(column, {
            bold: true,
            color: PRIMARY,
            shading: { fill: 'EAF2F8' },
          }),
        ),
      }),
      ...rows.map((row) =>
        new TableRow({
          children: columns.map((_, index) => tableCell(row[index] ?? '')),
        }),
      ),
    ],
  });

/* ------------------------------------------------------------------ */
/*  Core PDF export                                                    */
/* ------------------------------------------------------------------ */

export const downloadOfficialPdf = ({
  settings,
  title,
  subtitle,
  details = [],
  sections = [],
  columns = [],
  rows = [],
  filename,
  footerId,
  signatories,
}) => {
  const margin = parseMarginMm(settings?.pageMargins);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = addPdfLetterhead(pdf, settings, margin);

  pdf.setTextColor(...PDF_PRIMARY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(clean(title), pageWidth / 2, y, { align: 'center' });
  y += 7;

  if (subtitle) {
    pdf.setTextColor(...PDF_MUTED);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    y = addWrappedText(pdf, subtitle, pageWidth / 2, y, maxWidth, 4.5, { align: 'center' });
    y += 2;
  }

  const detailRows = rowsFromDetails(details);
  if (detailRows.length) {
    autoTable(pdf, {
      startY: y,
      body: detailRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: [27, 58, 107], cellWidth: 36 } },
    });
    y = pdf.lastAutoTable.finalY + 7;
  }

  sections.forEach((section) => {
    if (section.heading) {
      pdf.setTextColor(...PDF_PRIMARY);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(clean(section.heading), margin, y);
      y += 5;
    }
    pdf.setTextColor(40, 40, 40);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    (section.lines ?? []).filter(Boolean).forEach((line) => {
      y = addWrappedText(pdf, line, margin, y, maxWidth);
    });
    y += 2;
  });

  const normalizedColumns = normalizeColumns(columns);
  const normalizedRows = normalizeRows(rows);
  if (normalizedColumns.length && normalizedRows.length) {
    autoTable(pdf, {
      head: [normalizedColumns],
      body: normalizedRows,
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.2, overflow: 'linebreak' },
      headStyles: { fillColor: [27, 58, 107], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    y = pdf.lastAutoTable.finalY + 5;
  }

  // Signature block (before footer)
  if (signatories && signatories.length > 0) {
    addPdfSignatories(pdf, signatories, margin, y);
  }

  const generated = new Date().toLocaleString();
  addPdfFooter(
    pdf,
    `Generated by CampusFlow ERP | ${generated}${footerId ? ` | Ref: ${footerId}` : ''}`,
    footerId,
    title,
  );
  pdf.save(`${sanitizeFilename(filename || title)}.pdf`);
};

/* ------------------------------------------------------------------ */
/*  Core DOCX export                                                   */
/* ------------------------------------------------------------------ */

export const downloadOfficialDocx = async ({
  settings,
  title,
  subtitle,
  details = [],
  sections = [],
  columns = [],
  rows = [],
  filename,
  footerId,
  signatories,
}) => {
  const margin = Math.round(parseMarginMm(settings?.pageMargins) * 56.7);
  const children = [
    ...docxLetterhead(settings),
    paragraph(title, {
      alignment: AlignmentType.CENTER,
      bold: true,
      color: PRIMARY,
      size: 26,
      spacing: { after: subtitle ? 80 : 220 },
    }),
  ];

  if (subtitle) {
    children.push(paragraph(subtitle, {
      alignment: AlignmentType.CENTER,
      color: MUTED,
      size: 18,
      spacing: { after: 220 },
    }));
  }

  const detailRows = rowsFromDetails(details);
  if (detailRows.length) {
    children.push(docxTable(['Field', 'Value'], detailRows));
    children.push(paragraph('', { spacing: { after: 160 } }));
  }

  sections.forEach((section) => {
    if (section.heading) {
      children.push(paragraph(section.heading, {
        bold: true,
        color: PRIMARY,
        size: 21,
        spacing: { before: 120, after: 80 },
      }));
    }
    (section.lines ?? []).filter(Boolean).forEach((line) => {
      children.push(paragraph(line, { size: 19, spacing: { after: 80 } }));
    });
  });

  const normalizedColumns = normalizeColumns(columns);
  const normalizedRows = normalizeRows(rows);
  if (normalizedColumns.length && normalizedRows.length) {
    children.push(docxTable(normalizedColumns, normalizedRows));
  }

  // Signatory block in DOCX
  if (signatories && signatories.length > 0) {
    children.push(paragraph('', { spacing: { after: 400 } }));
    const sigChildren = [];
    signatories.forEach((sig, idx) => {
      if (idx > 0) {
        sigChildren.push(new TextRun({ text: '          ', size: 18 }));
      }
      sigChildren.push(new TextRun({ text: '____________________', size: 18 }));
      sigChildren.push(new TextRun({ text: '\n', break: 1, size: 18 }));
      if (clean(sig.name)) {
        sigChildren.push(new TextRun({ text: clean(sig.name), bold: true, size: 18 }));
        sigChildren.push(new TextRun({ text: '\n', break: 1, size: 18 }));
      }
      if (clean(sig.designation)) {
        sigChildren.push(new TextRun({ text: clean(sig.designation), color: MUTED, size: 16 }));
        sigChildren.push(new TextRun({ text: '\n', break: 1, size: 16 }));
      }
    });
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: sigChildren,
    }));
  }

  children.push(paragraph('', { spacing: { after: 180 } }));
  children.push(paragraph(
    `Generated by CampusFlow ERP | ${new Date().toLocaleString()}${footerId ? ` | Ref: ${footerId}` : ''}`,
    { alignment: AlignmentType.CENTER, color: MUTED, size: 16 },
  ));

  const doc = new Document({
    creator: 'CampusFlow ERP',
    sections: [{
      properties: {
        page: {
          margin: {
            top: margin,
            right: margin,
            bottom: margin,
            left: margin,
          },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sanitizeFilename(filename || title)}.docx`);
};

/* ------------------------------------------------------------------ */
/*  Unified format dispatcher (preserved signature)                    */
/* ------------------------------------------------------------------ */

export const downloadOfficialFile = async (format, options) => {
  if (format === 'pdf') {
    downloadOfficialPdf(options);
    return;
  }
  await downloadOfficialDocx(options);
};

/* ------------------------------------------------------------------ */
/*  Document export payload (preserved)                                */
/* ------------------------------------------------------------------ */

export const documentExportPayload = (doc, settings) => ({
  settings,
  title: doc.title,
  subtitle: `Official ${doc.type} document`,
  details: [
    { label: 'Document Type', value: doc.type },
    { label: 'Generated Date', value: doc.date },
    { label: 'Generated By', value: doc.by },
    { label: 'Status', value: doc.status },
    { label: 'Document ID', value: doc.id },
  ],
  sections: [
    {
      heading: 'Document Content',
      lines: [
        'This official document is generated from CampusFlow ERP using the institution letterhead configured in Settings.',
        'Detailed module-specific content can be attached by the corresponding workflow in the full system.',
      ],
    },
  ],
  filename: doc.title,
  footerId: doc.id,
});

/* ================================================================== */
/*  NEW EXPORT FUNCTIONS                                              */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  1. Fee Receipt                                                     */
/* ------------------------------------------------------------------ */

export const downloadFeeReceipt = (format, { student, settings, feeItems, paymentMode, transactionId }) => {
  const year = new Date().getFullYear();
  const receiptNo = generateRef('FEE');
  const totalAmount = (feeItems || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const payload = {
    settings,
    title: 'FEE RECEIPT',
    subtitle: `Academic Year ${year}-${String(year + 1).slice(2)}`,
    details: [
      { label: 'Student Name', value: clean(student?.name) },
      { label: 'Roll No', value: clean(student?.rollNo) },
      { label: 'Department', value: clean(student?.dept) },
      { label: 'Semester', value: clean(student?.semester) },
      { label: 'Receipt No', value: receiptNo },
      { label: 'Date', value: new Date().toLocaleDateString('en-IN') },
      { label: 'Payment Mode', value: clean(paymentMode) },
      { label: 'Transaction ID', value: clean(transactionId) },
    ],
    columns: ['#', 'Fee Component', 'Amount (₹)'],
    rows: [
      ...(feeItems || []).map((item, idx) => [
        String(idx + 1),
        clean(item.name),
        Number(item.amount || 0).toLocaleString('en-IN'),
      ]),
      ['', 'TOTAL', totalAmount.toLocaleString('en-IN')],
    ],
    signatories: [
      { name: '', designation: 'Accounts Section' },
      { name: settings?.principalName || '', designation: 'Principal' },
    ],
    filename: `Fee_Receipt_${clean(student?.name)}`,
    footerId: receiptNo,
  };

  return downloadOfficialFile(format, payload);
};

/* ------------------------------------------------------------------ */
/*  2. Hall Ticket                                                     */
/* ------------------------------------------------------------------ */

export const downloadHallTicket = (format, { student, settings, exam }) => {
  const hallTicketRef = generateRef('HLT');

  const payload = {
    settings,
    title: 'HALL TICKET / ADMIT CARD',
    subtitle: clean(exam?.name),
    details: [
      { label: 'Student Name', value: clean(student?.name) },
      { label: 'Roll No', value: clean(student?.rollNo) },
      { label: 'Department', value: clean(student?.dept) },
      { label: 'Semester', value: clean(student?.semester) },
      { label: 'Exam', value: clean(exam?.name) },
      { label: 'Date', value: clean(exam?.date) },
      { label: 'Time', value: `${clean(exam?.startTime)} - ${clean(exam?.endTime)}` },
    ],
    sections: [
      {
        heading: 'Examination Subjects',
        lines: exam?.subjects || [],
      },
      {
        heading: 'Instructions to Candidates',
        lines: [
          'Candidates must be seated 15 minutes before the examination.',
          'Bring this hall ticket and college ID card to every examination.',
          'Electronic devices including mobile phones are strictly prohibited.',
          'Use of unfair means will lead to cancellation of examination.',
          'Candidates must not leave the hall within the first 30 minutes.',
        ],
      },
    ],
    signatories: [
      { name: '', designation: 'Controller of Examinations' },
      { name: settings?.principalName || '', designation: 'Principal' },
    ],
    filename: `Hall_Ticket_${clean(student?.name)}`,
    footerId: hallTicketRef,
  };

  return downloadOfficialFile(format, payload);
};

/* ------------------------------------------------------------------ */
/*  3. Attendance Report                                               */
/* ------------------------------------------------------------------ */

export const downloadAttendanceReport = (format, { student, settings, records, subjects }) => {
  const attendanceRef = generateRef('ATT');
  const subjectList = subjects || [];
  const allRecords = records || [];

  // Compute per-subject attendance for this student
  const subjectRows = subjectList.map((subj) => {
    const subjectName = typeof subj === 'string' ? subj : clean(subj.name || subj);
    // Filter records for this student and subject
    const relevantRecords = allRecords.filter(
      (r) =>
        (clean(r.studentId) === clean(student?.id) ||
          clean(r.rollNo) === clean(student?.rollNo) ||
          clean(r.student) === clean(student?.name)) &&
        (clean(r.subject) === subjectName || clean(r.subjectName) === subjectName),
    );
    const total = relevantRecords.length || 0;
    const present = relevantRecords.filter((r) => r.status === 'Present' || r.present === true).length;
    const absent = total - present;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
    return [subjectName, String(total), String(present), String(absent), `${percentage}%`];
  });

  // Overall summary row
  const totalClasses = subjectRows.reduce((sum, row) => sum + Number(row[1]), 0);
  const totalPresent = subjectRows.reduce((sum, row) => sum + Number(row[2]), 0);
  const totalAbsent = subjectRows.reduce((sum, row) => sum + Number(row[3]), 0);
  const overallPct = totalClasses > 0 ? ((totalPresent / totalClasses) * 100).toFixed(1) : '0.0';

  const payload = {
    settings,
    title: 'ATTENDANCE REPORT',
    subtitle: `${clean(student?.name)} | ${clean(student?.rollNo)}`,
    details: [
      { label: 'Student Name', value: clean(student?.name) },
      { label: 'Roll No', value: clean(student?.rollNo) },
      { label: 'Department', value: clean(student?.dept) },
      { label: 'Semester', value: clean(student?.semester) },
      { label: 'Section', value: clean(student?.section) },
      { label: 'Report Generated', value: new Date().toLocaleDateString('en-IN') },
    ],
    columns: ['Subject', 'Total Classes', 'Present', 'Absent', 'Percentage'],
    rows: [
      ...subjectRows,
      ['OVERALL', String(totalClasses), String(totalPresent), String(totalAbsent), `${overallPct}%`],
    ],
    signatories: [
      { name: '', designation: 'Class Advisor' },
      { name: '', designation: 'HOD' },
    ],
    filename: `Attendance_Report_${clean(student?.name)}`,
    footerId: attendanceRef,
  };

  return downloadOfficialFile(format, payload);
};

/* ------------------------------------------------------------------ */
/*  4. Timetable Document                                              */
/* ------------------------------------------------------------------ */

export const downloadTimetableDocument = (format, { settings, department, year, slots, days, timeSlots }) => {
  const timetableRef = generateRef('TT');
  const daysList = days || [];
  const timeSlotList = timeSlots || [];
  const allSlots = slots || [];
  const currentYear = new Date().getFullYear();

  const payload = {
    settings,
    title: 'CLASS TIMETABLE',
    subtitle: `${clean(department)} — Year ${clean(year)}`,
    details: [
      { label: 'Department', value: clean(department) },
      { label: 'Year', value: clean(year) },
      { label: 'Academic Session', value: `${currentYear}-${String(currentYear + 1).slice(2)}` },
      { label: 'Generated On', value: new Date().toLocaleDateString('en-IN') },
    ],
    columns: ['Day', ...timeSlotList],
    rows: daysList.map((day) =>
      [
        day,
        ...timeSlotList.map((_, slotIndex) => {
          const match = allSlots.find(
            (s) => clean(s.day) === clean(day) && Number(s.slot) === slotIndex,
          );
          if (match) {
            const subj = clean(match.subject);
            const room = clean(match.room);
            return subj ? (room ? `${subj} (${room})` : subj) : '-';
          }
          return '-';
        }),
      ],
    ),
    signatories: [
      { name: '', designation: 'HOD' },
      { name: settings?.principalName || '', designation: 'Principal' },
    ],
    filename: `Timetable_${clean(department)}_Year${clean(year)}`,
    footerId: timetableRef,
  };

  return downloadOfficialFile(format, payload);
};

/* ------------------------------------------------------------------ */
/*  5. Seating Document                                                */
/* ------------------------------------------------------------------ */

export const downloadSeatingDocument = (format, { settings, exam, allocations, classrooms }) => {
  const seatingRef = generateRef('SEA');
  const allocationList = allocations || [];

  // Count unique departments from allocations
  const uniqueDepts = new Set(allocationList.map((a) => clean(a.dept)).filter(Boolean));

  const payload = {
    settings,
    title: 'EXAMINATION SEATING ARRANGEMENT',
    subtitle: `${clean(exam?.name)} | ${clean(exam?.date)}`,
    details: [
      { label: 'Exam', value: clean(exam?.name) },
      { label: 'Date', value: clean(exam?.date) },
      { label: 'Total Students', value: String(allocationList.length) },
      { label: 'Halls Used', value: Array.isArray(exam?.halls) ? exam.halls.join(', ') : clean(exam?.halls) },
      { label: 'Departments', value: String(uniqueDepts.size) },
    ],
    columns: ['S.No', 'Roll Number', 'Department', 'Row', 'Column', 'Status'],
    rows: allocationList.map((a, idx) => [
      String(idx + 1),
      clean(a.student),
      clean(a.dept),
      `R${(Number(a.row) || 0) + 1}`,
      `C${(Number(a.col) || 0) + 1}`,
      a.absent ? 'Absent' : 'Allocated',
    ]),
    signatories: [
      { name: '', designation: 'Controller of Examinations' },
    ],
    filename: `Seating_${clean(exam?.name)}`,
    footerId: seatingRef,
  };

  return downloadOfficialFile(format, payload);
};

/* ------------------------------------------------------------------ */
/*  6. Official Letter                                                 */
/* ------------------------------------------------------------------ */

export const downloadOfficialLetter = (format, { settings, subject, body, recipientName, recipientAddress, signatory, designation }) => {
  const refNo = generateRef('LTR');

  const payload = {
    settings,
    title: 'OFFICIAL COMMUNICATION',
    details: [
      { label: 'Ref No', value: refNo },
      { label: 'Date', value: new Date().toLocaleDateString('en-IN') },
      { label: 'To', value: clean(recipientName) },
      { label: 'Address', value: clean(recipientAddress || '') },
    ],
    sections: [
      {
        heading: `Subject: ${clean(subject)}`,
        lines: [],
      },
      {
        heading: '',
        lines: (body || '').split('\n').filter(Boolean),
      },
    ],
    signatories: [
      {
        name: signatory || settings?.principalName || '',
        designation: designation || 'Principal',
      },
    ],
    filename: `Letter_${clean(subject)}`,
    footerId: refNo,
  };

  return downloadOfficialFile(format, payload);
};
