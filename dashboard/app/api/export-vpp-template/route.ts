import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { targetName, type, receiverName, items = [] } = data;

    if (!targetName) {
      return new NextResponse("Missing targetName", { status: 400 });
    }

    // 1. Path to template
    const templateFileName = "phieu_cap_phat_vpp.xlsx";
    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return new NextResponse(
        JSON.stringify({ error: "template_not_found", fileName: templateFileName }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Load the template using ExcelJS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // Get the first worksheet
    const worksheet = workbook.worksheets[0];

    // 3. Fill in metadata
    const now = new Date();
    const monthStr = `Tháng ${now.getMonth() + 1}`;

    // C9 is Month
    worksheet.getCell("C9").value = monthStr;
    // C10 is Receiver Name
    worksheet.getCell("C10").value = receiverName || "";
    // E10 is Department/Project
    worksheet.getCell("E10").value = `Bộ phận: ${targetName}`;

    // 4. Clear existing template items (from row 14 to row 30)
    // Clear rows 14 to 30 completely of values but keep structure and formatting
    for (let r = 14; r <= 30; r++) {
      const row = worksheet.getRow(r);
      for (let c = 1; c <= 7; c++) {
        row.getCell(c).value = "";
      }
    }

    // 5. Write the VPP items starting from row 14
    items.forEach((item: any, idx: number) => {
      const rowIndex = 14 + idx;
      const row = worksheet.getRow(rowIndex);

      row.getCell(1).value = idx + 1; // TT
      row.getCell(2).value = item.name; // Tên văn phòng phẩm
      row.getCell(3).value = item.unit; // Đơn vị
      row.getCell(4).value = Number(item.qty) || 0; // Số lượng
      row.getCell(5).value = ""; // Đơn giá dự kiến
      row.getCell(6).value = ""; // Thành tiền
      row.getCell(7).value = item.notes || "Đã duyệt cấp phát"; // Ghi chú
    });

    // 6. Overwrite the Date directly in Cell F34 (fixed template location)
    const dayStr = String(now.getDate()).padStart(2, "0");
    const monthNumStr = String(now.getMonth() + 1).padStart(2, "0");
    const yearStr = String(now.getFullYear());
    worksheet.getCell("F34").value = `TPHCM, ngày ${dayStr} tháng ${monthNumStr} năm ${yearStr}`;

    // Set Sheet Name (max 31 characters, remove "Phòng " prefix for brevity if needed)
    const cleanSheetName = targetName.replace(/Phòng\s+/i, "P. ").slice(0, 30);
    worksheet.name = cleanSheetName;

    // 7. Write workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const outputFilename = `Phieu_Cap_Phat_VPP_${targetName.replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(outputFilename)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error: any) {
    console.error("Export Excel VPP error:", error);
    return new NextResponse(`Error exporting Excel: ${error.message || error}`, { status: 500 });
  }
}
