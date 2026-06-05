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

const addPdfFooter = (pdf, footerText) => {
  const pageCount = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
    pdf.setTextColor(...PDF_MUTED);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(footerText, 14, pageHeight - 9);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 9, { align: 'right' });
  }
};

const addWrappedText = (pdf, text, x, y, maxWidth, lineHeight = 5, options = {}) => {
  const lines = pdf.splitTextToSize(clean(text), maxWidth);
  pdf.text(lines, x, y, options);
  return y + lines.length * lineHeight;
};

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
  }

  const generated = new Date().toLocaleString();
  addPdfFooter(pdf, `Generated by CampusFlow ERP | ${generated}${footerId ? ` | Ref: ${footerId}` : ''}`);
  pdf.save(`${sanitizeFilename(filename || title)}.pdf`);
};

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

export const downloadOfficialFile = async (format, options) => {
  if (format === 'pdf') {
    downloadOfficialPdf(options);
    return;
  }
  await downloadOfficialDocx(options);
};

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
