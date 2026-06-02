#!/usr/bin/env node
// Gmail diagnostic — confirms which account the refresh_token resolves to
// and how many inbox threads match the cron's exact query.
// Run: node --env-file=.env.local scripts/gmail-diag.mjs

import { google } from "googleapis";

const auth = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth });

const profile = await gmail.users.getProfile({ userId: "me" });
console.log("account:", profile.data.emailAddress, "| messagesTotal:", profile.data.messagesTotal);

const q = "in:inbox newer_than:1d to:hello@splanai.com";
const list = await gmail.users.threads.list({ userId: "me", q, maxResults: 30 });
console.log("query:", q);
console.log("raw threads:", list.data.threads?.length ?? 0);
