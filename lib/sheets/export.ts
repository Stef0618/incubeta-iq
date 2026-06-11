import { google } from "googleapis";
import type { CandidateScore, Rubric } from "@/types";

// Step 4: write the ranked shortlist to Google Sheets via service account.
// Adds a new tab to the configured spreadsheet for each export.

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

  // Bold header row and freeze it.
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
      ],
    },
  });

  return {
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
    tabTitle,
  };
}
