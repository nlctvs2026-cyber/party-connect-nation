#!/usr/bin/env node
// Purge the test photos from the private `member-photos` bucket.
//
// The database will not do this: deleting storage.objects rows directly is
// blocked by the platform trigger storage.protect_delete() ("Direct deletion
// from storage tables is not allowed. Use the Storage API instead."), so the
// files have to go through the Storage API. Pair with the row purge in
// drizzle/migrations/0008_purge_test_data.sql — the two are independent and
// can run in either order.
//
// Usage:
//   node scripts/purge-member-photos.mjs           # dry run: list what would go
//   node scripts/purge-member-photos.mjs --yes     # actually delete
//
// Needs credentials with delete rights on the bucket. Checked in this order:
//   1. SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS
//   2. SUPABASE_ADMIN_EMAIL + SUPABASE_ADMIN_PASSWORD
//      — signs in and relies on the "admin manages member photos" policy
// Each can come from the shell environment or from a file. Files are read
// .env first, then .env.local on top; put credentials in .env.local, which
// .gitignore already ignores (*.local), because .env itself is committed.
// No shell syntax needed — just create .env.local and run the script.
// Without credentials it stops and tells you; it never deletes on a dry run.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BUCKET = "member-photos";
const APPLY = process.argv.includes("--yes");

// Minimal .env reader — keeps this runnable without extra dependencies.
// Reads one file into `out`; missing files are fine.
function readEnvFile(out, file) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no such file is fine */
  }
  return out;
}

// .env first, then .env.local overrides it (git-ignored via .gitignore's *.local).
const dot = readEnvFile(readEnvFile({}, ".env"), ".env.local");
const env = (name) => process.env[name] || dot[name] || "";

const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const adminEmail = env("SUPABASE_ADMIN_EMAIL");
const adminPassword = env("SUPABASE_ADMIN_PASSWORD");

if (!url) {
  console.error("X SUPABASE_URL not found (env, .env or .env.local).");
  process.exit(1);
}

let client;
if (serviceKey) {
  client = createClient(url, serviceKey);
  console.log("auth: service_role key");
} else if (adminEmail && adminPassword) {
  client = createClient(url, env("SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY"));
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (error) {
    console.error(`X admin sign-in failed: ${error.message}`);
    process.exit(1);
  }
  console.log("auth: admin session (is_admin policy)");
} else {
  console.error("X No credentials. Set one of:");
  console.error("    SUPABASE_SERVICE_ROLE_KEY                       (env, .env or .env.local)");
  console.error("    SUPABASE_ADMIN_EMAIL + SUPABASE_ADMIN_PASSWORD  (env, .env or .env.local)");
  console.error("  Easiest: create .env.local (already git-ignored) with those lines,");
  console.error("  then re-run. The service key lives in Dashboard -> Settings -> API.");
  process.exit(1);
}

// list() returns one page (default 100). Walk a prefix until exhausted;
// folders come back with id === null.
async function listAll(prefix) {
  const files = [];
  const folders = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list(${prefix || "/"}): ${error.message}`);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) folders.push(path);
      else files.push(path);
    }
    if (!data || data.length < pageSize) break;
  }
  return { files, folders };
}

console.log(`bucket: ${BUCKET}${APPLY ? "  (DELETING)" : "  (dry run — pass --yes to delete)"}`);

let files;
let folders;
try {
  ({ files, folders } = await listAll(""));
} catch (e) {
  console.error(`X Could not list the bucket: ${e.message}`);
  console.error("  Check SUPABASE_URL and the credential's access to the bucket.");
  process.exit(1);
}

// The app only ever uploads to applications/<uuid>.<ext> (membership.ts), but
// sweep every folder so nothing test-related is left behind.
const allPaths = [...files];
try {
  for (const folder of folders) {
    const nested = await listAll(folder);
    allPaths.push(...nested.files);
    for (const deeper of nested.folders) {
      const deep = await listAll(deeper);
      allPaths.push(...deep.files);
      for (const d of deep.folders) allPaths.push(...(await listAll(d)).files);
    }
  }
} catch (e) {
  console.error(`X Could not walk the folders: ${e.message}`);
  process.exit(1);
}

console.log(`found ${allPaths.length} object(s) in ${folders.length} folder(s)`);
for (const p of allPaths.slice(0, 20)) console.log(`  ${p}`);
if (allPaths.length > 20) console.log(`  ... and ${allPaths.length - 20} more`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --yes to delete.");
  process.exit(0);
}
if (allPaths.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

// remove() takes an array of paths; batch to keep requests small.
let deleted = 0;
for (let i = 0; i < allPaths.length; i += 100) {
  const batch = allPaths.slice(i, i + 100);
  const { error } = await client.storage.from(BUCKET).remove(batch);
  if (error) {
    console.error(`X remove failed after ${deleted} deletions: ${error.message}`);
    process.exit(1);
  }
  deleted += batch.length;
  console.log(`  deleted ${deleted}/${allPaths.length}`);
}

const { data: after } = await client.storage.from(BUCKET).list("", { limit: 100 });
console.log(`\nDone. ${deleted} object(s) deleted; bucket root now has ${(after ?? []).length} entr(ies).`);
