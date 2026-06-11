// Import the lib path directly: pdf-parse v1's index.js runs debug code
// when it thinks it is the entrypoint.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

// Resumes are parsed to plain text in-memory and never written to disk.

const MAX_RESUME_CHARS = 40_000; // bounds token usage on pathological files

export async function parseResume(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop();

  let text: string;
  if (ext === "pdf") {
    text = await parsePdf(buffer);
  } else if (ext === "docx") {
    text = await parseDocx(buffer);
  } else {
    throw new Error(`Unsupported file type: .${ext}. Upload PDF or DOCX.`);
  }

  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) {
    throw new Error(
      `No text could be extracted from ${fileName}. The file may be a scanned image.`
    );
  }
  return cleaned.slice(0, MAX_RESUME_CHARS);
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
