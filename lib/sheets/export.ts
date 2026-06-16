import { google } from "googleapis";
import type { Band, CandidateScore, Rubric } from "@/types";

// Step 4: write the ranked shortlist to Google Sheets via service account.
// Adds a new tab to the configured spreadsheet for each export.

// Soft traffic-light fills, by band. RGB as 0..1 floats (Sheets API format).
// Pastel shades so black cell text stays readable.
const BAND_COLORS: Record<Band, { red: number; green: number; blue: number }> = {
  ADVANCE: { red: 0.85, green: 0.92, blue: 0.83 }, // soft green
  CONSIDER: { red: 1.0, green: 0.95, blue: 0.8 }, // soft yellow
  BORDERLINE: { red: 0.99, green: 0.9, blue: 0.8 }, // soft orange
  DECLINE: { red: 0.96, green: 0.8, blue: 0.8 }, // soft red
};

type RGB = { red: number; green: number; blue: number };

// Continuous red->yellow->green heatmap for a Final Score, anchored to the
// fixed 1..4 scale (1 = red, 2.5 = yellow, 4 = green) so colors are comparable
// across exports. Independent of the band: a disqualified candidate can show a
// high-score color next to a red DECLINE band.
function scoreColor(score: number): RGB {
  const t = Math.max(0, Math.min(1, (score - 1) / 3)); // 0 at 1.0, 1 at 4.0
  const low: RGB = { red: 0.93, green: 0.6, blue: 0.6 }; // red  @ 1.0
  const mid: RGB = { red: 1.0, green: 0.9, blue: 0.6 }; // yellow @ 2.5
  const high: RGB = { red: 0.7, green: 0.88, blue: 0.7 }; // green @ 4.0
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  const mix = (c1: RGB, c2: RGB, u: number): RGB => ({
    red: lerp(c1.red, c2.red, u),
    green: lerp(c1.green, c2.green, u),
    blue: lerp(c1.blue, c2.blue, u),
  });
  return t <= 0.5 ? mix(low, mid, t / 0.5) : mix(mid, high, (t - 0.5) / 0.5);
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      "Google service account credentials are not set. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to .env.local."
    );
  }
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export async function exportToSheet(
  rubric: Rubric,
  scores: CandidateScore[]
): Promise<{ sheetUrl: string; tabTitle: string }> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID is not set. Add it to .env.local.");
  }
  const sheets = getSheetsClient();

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  // Sheet tab titles max out at 100 chars and reject some punctuation.
  const tabTitle = `${rubric.roleTitle} ${stamp}`
    .replace(/[[\]*?/\\:]/g, " ")
    .slice(0, 100);

  const addSheet = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabTitle } } }],
    },
  });
  const sheetId =
    addSheet.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;

  const categoryNames = rubric.categories.map(
    (c) => `${c.name} (${c.weight}%)`
  );
  const header = [
    "Rank",
    "Candidate",
    "File",
    "Band",
    "Final Score",
    "Raw Weighted",
    ...categoryNames,
    "Red Flags",
    "Bonuses",
    "Disqualified",
    "Summary",
  ];

  const ranked = [...scores].sort((a, b) => b.finalScore - a.finalScore);
  const rows = ranked.map((s, i) => [
    i + 1,
    s.candidateName,
    s.fileName,
    s.band,
    s.finalScore,
    s.rawWeightedScore,
    ...rubric.categories.map((c) => {
      const cs = s.categoryScores.find((x) => x.categoryId === c.id);
      return cs ? cs.score : "";
    }),
    s.redFlagsTriggered.map((r) => `${r.text} (-${r.deduction})`).join("; "),
    s.bonusesAwarded.map((b) => `${b.text} (+${b.points})`).join("; "),
    s.disqualified ? s.disqualifierReason ?? "Yes" : "No",
    s.summary,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabTitle}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });

  // Per-row cell fills. Column order: 0 Rank, 1 Candidate, 2 File, 3 Band,
  // 4 Final Score. Candidate + Band are tinted by band; Final Score by its own
  // value. Data rows start at index 1 (header is row 0); `ranked` matches them.
  const fill = (
    rowIndex: number,
    startColumnIndex: number,
    endColumnIndex: number,
    color: RGB
  ) => ({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex,
        endColumnIndex,
      },
      cell: { userEnteredFormat: { backgroundColor: color } },
      fields: "userEnteredFormat.backgroundColor",
    },
  });
  const colorRequests = ranked.flatMap((s, i) => {
    const r = i + 1;
    const band = BAND_COLORS[s.band];
    return [
      fill(r, 1, 2, band), // Candidate
      fill(r, 3, 4, band), // Band
      fill(r, 4, 5, scoreColor(s.finalScore)), // Final Score (by value)
    ];
  });

  // Bold header row, freeze it, and apply the cell fills.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        ...colorRequests,
      ],
    },
  });

  return {
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
    tabTitle,
  };
}
