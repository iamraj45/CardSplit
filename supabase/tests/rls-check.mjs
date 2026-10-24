// Security check for the Supabase rules (run against a DEV project, never production data).
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//   USER_A_EMAIL=... USER_A_PASSWORD=... USER_B_EMAIL=... USER_B_PASSWORD=... \
//   node supabase/tests/rls-check.mjs
//
// Create the two users in the Supabase dashboard (Authentication → Users → Add user, "auto confirm").
// The script signs in with passwords only to automate the check; the app itself uses magic links.
import { createClient } from '@supabase/supabase-js';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};
const url = env('SUPABASE_URL');
const key = env('SUPABASE_ANON_KEY');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};

async function signIn(email, password, name) {
  const client = createClient(url, key, opts);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  await client.from('profiles').upsert({ id: data.user.id, email, display_name: name, person_id: `p-${data.user.id.slice(0, 8)}` });
  return { client, id: data.user.id, email };
}

const rpc = async (client, fn, args) => {
  const { data, error } = await client.rpc(fn, args);
  return { data, error };
};

const a = await signIn(env('USER_A_EMAIL'), env('USER_A_PASSWORD'), 'Test Owner');
const b = await signIn(env('USER_B_EMAIL'), env('USER_B_PASSWORD'), 'Test Member');
const anon = createClient(url, key, opts);
const id = `rls-check-${Date.now()}`;
const doc = { id, name: 'RLS check', periodStart: '2026-01-01', periodEnd: '2026-01-31', people: [], cards: [], transactions: [], adjustments: [] };

try {
  let r = await rpc(a.client, 'save_reconciliation', { p_id: id, p_data: doc, p_expected_version: 0 });
  check(r.data?.status === 'ok' && r.data.version === 1, 'owner creates a reconciliation');

  r = await rpc(anon, 'pull_reconciliations', { p_since: null });
  check(Boolean(r.error), 'signed-out callers cannot use the functions');

  const direct = await b.client.from('reconciliations').select('id').eq('id', id);
  check(!direct.error && direct.data.length === 0, 'non-member cannot read it directly');
  r = await rpc(b.client, 'pull_reconciliations', { p_since: null });
  check(!r.data?.some((row) => row.id === id), 'non-member does not receive it when pulling');
  r = await rpc(b.client, 'save_reconciliation', { p_id: id, p_data: { ...doc, name: 'hacked' }, p_expected_version: 1 });
  check(r.data?.status === 'forbidden', 'non-member cannot overwrite it');
  r = await rpc(b.client, 'invite_member', { p_id: id, p_email: b.email, p_role: 'editor' });
  check(r.data?.status === 'forbidden', 'non-member cannot invite themselves');

  r = await rpc(a.client, 'invite_member', { p_id: id, p_email: b.email, p_role: 'viewer' });
  check(r.data?.status === 'added', 'owner shares with an existing user as viewer');
  r = await rpc(b.client, 'pull_reconciliations', { p_since: null });
  const row = r.data?.find((x) => x.id === id);
  check(row?.role === 'viewer' && row.owner_name === 'Test Owner', 'viewer receives it with role and owner name');
  r = await rpc(b.client, 'save_reconciliation', { p_id: id, p_data: { ...doc, name: 'viewer edit' }, p_expected_version: 1 });
  check(r.data?.status === 'forbidden', 'viewer cannot edit');
  r = await rpc(b.client, 'set_member_role', { p_id: id, p_user: b.id, p_role: 'editor' });
  check(r.data?.status === 'forbidden', 'viewer cannot promote themselves');
  r = await rpc(b.client, 'list_members', { p_id: id });
  check(r.data?.length === 2 && !r.data.some((m) => m.pending), 'members can list members (without pending invites)');

  r = await rpc(a.client, 'set_member_role', { p_id: id, p_user: b.id, p_role: 'editor' });
  check(r.data?.status === 'ok', 'owner makes the member an editor');
  r = await rpc(b.client, 'save_reconciliation', { p_id: id, p_data: { ...doc, name: 'editor edit' }, p_expected_version: 1 });
  check(r.data?.status === 'ok' && r.data.version === 2, 'editor saves with the current version');
  r = await rpc(a.client, 'save_reconciliation', { p_id: id, p_data: { ...doc, name: 'stale' }, p_expected_version: 1 });
  check(r.data?.status === 'conflict' && r.data.version === 2 && r.data.data.name === 'editor edit', 'stale save is rejected as a conflict with the server copy');
  r = await rpc(b.client, 'remove_member', { p_id: id, p_user: a.id, p_email: null });
  check(r.data?.status === 'forbidden', 'editor cannot remove the owner');

  const people = await b.client.from('saved_people').upsert({ user_id: a.id, id: 'x', name: 'Injected' });
  check(Boolean(people.error), "a user cannot write someone else's saved people");
  const profiles = await b.client.from('profiles').select('id').eq('id', a.id);
  check(!profiles.error && profiles.data.length === 0, "a user cannot read someone else's profile directly");

  r = await rpc(b.client, 'delete_reconciliation', { p_id: id });
  check(r.data?.status === 'left', 'editor "delete" only leaves');
  r = await rpc(a.client, 'pull_reconciliations', { p_since: null });
  check(r.data?.find((x) => x.id === id)?.deleted_at === null, 'reconciliation still exists for the owner');
} finally {
  const r = await rpc(a.client, 'delete_reconciliation', { p_id: id });
  check(r.data?.status === 'deleted', 'owner deletes it (clean-up)');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll security checks passed.');
process.exit(failures ? 1 : 0);
