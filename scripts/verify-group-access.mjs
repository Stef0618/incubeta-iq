// Verifies the Workspace-group access gate end to end, without the login flow.
//
// Run AFTER Incubeta's admin has (1) authorized domain-wide delegation for the
// service account and (2) confirmed the group + an admin to impersonate.
//
// Usage (Node >= 20.6, loads .env.local automatically):
//   node --env-file=.env.local scripts/verify-group-access.mjs someone@incubeta.com
//
// Prints isMember=true/false on success, or a targeted hint on the common
// misconfigurations so you know exactly which setup step to revisit.

import { google } from "googleapis";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/verify-group-access.mjs <email@incubeta.com>");
  process.exit(1);
}

const {
  WORKSPACE_GROUP_EMAIL: GROUP,
  WORKSPACE_ADMIN_SUBJECT: SUBJECT,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: SA_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: SA_KEY,
} = process.env;

const missing = Object.entries({
  WORKSPACE_GROUP_EMAIL: GROUP,
  WORKSPACE_ADMIN_SUBJECT: SUBJECT,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: SA_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: SA_KEY,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/admin.directory.group.member.readonly"],
  subject: SUBJECT,
});

try {
  const admin = google.admin({ version: "directory_v1", auth });
  const res = await admin.members.hasMember({ groupKey: GROUP, memberKey: email });
  console.log(`OK  isMember(${email} in ${GROUP}) = ${res.data.isMember}`);
  process.exit(0);
} catch (err) {
  const reason = err?.errors?.[0]?.message ?? err?.message ?? String(err);
  const code = err?.code ?? err?.response?.status;
  console.error(`FAILED (${code ?? "?"}): ${reason}`);
  if (String(reason).includes("unauthorized_client") || code === 401) {
    console.error("Hint: domain-wide delegation not authorized for this service account's client ID, or the scope is missing. Re-check Admin console > Security > API controls > Domain-wide delegation.");
  } else if (code === 403) {
    console.error("Hint: the impersonated WORKSPACE_ADMIN_SUBJECT lacks rights to read groups (needs at least the Groups Reader admin role), or the Admin SDK API is not enabled on the service account's GCP project.");
  } else if (code === 404) {
    console.error("Hint: group or member not found. Check WORKSPACE_GROUP_EMAIL is the exact group address and the email is a real user in the domain.");
  }
  process.exit(1);
}
