const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

// Helper to create an Excel workbook buffer
async function generateExcel({ title, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CampusDesk Management System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(title || "Report");

  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 20,
  }));

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" }, // Indigo
  };

  rows.forEach((row) => {
    worksheet.addRow(row);
  });

  return await workbook.xlsx.writeBuffer();
}

// Helper to create a PDF buffer
function generatePDF({ title, headers, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const buffers = [];

    doc.on("data", (buffer) => buffers.push(buffer));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (err) => reject(err));

    // Title
    doc.fontSize(20).fillColor("#4F46E5").text("CampusDesk Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor("#172033").text(title, { align: "center" });
    doc.fontSize(9).fillColor("#64748B").text(`Generated on ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown(1.5);

    // Simple text table
    const startX = 40;
    const colWidth = Math.floor((doc.page.width - 80) / headers.length);
    let currentY = doc.y;

    // Table Header
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#172033");
    headers.forEach((h, idx) => {
      doc.text(h, startX + idx * colWidth, currentY, { width: colWidth - 5, truncate: true });
    });
    currentY += 18;
    doc.moveTo(startX, currentY).lineTo(doc.page.width - 40, currentY).strokeColor("#CBD5E1").stroke();
    currentY += 8;

    // Table Rows
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    rows.forEach((row) => {
      if (currentY > doc.page.height - 60) {
        doc.addPage();
        currentY = 40;
      }
      row.forEach((cell, idx) => {
        doc.text(String(cell != null ? cell : "-"), startX + idx * colWidth, currentY, {
          width: colWidth - 5,
          truncate: true,
        });
      });
      currentY += 16;
    });

    doc.end();
  });
}

module.exports = { generateExcel, generatePDF };

