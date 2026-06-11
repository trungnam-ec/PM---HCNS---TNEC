import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { supabase } from "@/lib/supabase";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { startDate, endDate, officeManualNeeds, projectManualNeeds } = data;
    let candidates = data.candidates;

    // 1. Fetch candidates from Supabase if not provided by client
    if (!candidates || !Array.isArray(candidates)) {
      const { data: dbData, error } = await supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      candidates = dbData || [];
    }

    // 2. Prepare temp files inside scratch directory
    const scratchDir = path.join(process.cwd(), "scratch");
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir);
    }

    const timestamp = Date.now();
    const tempJsonPath = path.join(scratchDir, `report_data_${timestamp}.json`);
    const tempDocxPath = path.join(scratchDir, `report_output_${timestamp}.docx`);

    // Write JSON payload to temp file
    const payload = {
      startDate,
      endDate,
      candidates,
      officeManualNeeds,
      projectManualNeeds
    };
    fs.writeFileSync(tempJsonPath, JSON.stringify(payload, null, 2), "utf-8");

    // 3. Execute Python script to populate docx template
    const scriptPath = path.join(scratchDir, "fill_weekly_report.py");
    const pythonCmd = `python "${scriptPath}" "${tempJsonPath}" "${tempDocxPath}"`;
    
    await execAsync(pythonCmd);

    if (!fs.existsSync(tempDocxPath)) {
      throw new Error("Python script failed to generate weekly report docx.");
    }

    // 4. Read output file buffer
    const buffer = fs.readFileSync(tempDocxPath);

    // Clean up temp files
    try {
      fs.unlinkSync(tempJsonPath);
      fs.unlinkSync(tempDocxPath);
    } catch (cleanupError) {
      console.error("Temp file cleanup error:", cleanupError);
    }

    // 5. Send document response
    const outputFilename = `Bao_Cao_Tuyen_Dung_Tuan_${startDate || "Start"}_den_${endDate || "End"}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(outputFilename)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error: any) {
    console.error("Export weekly recruitment report error:", error);
    return new NextResponse(`Error exporting report: ${error.message || error}`, { status: 500 });
  }
}
