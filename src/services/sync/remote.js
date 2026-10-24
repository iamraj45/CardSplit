// Server API on top of Supabase: the functions and tables defined in supabase/migrations.
// The sync engine only depends on this shape (see testDoubles.js for the in-memory twin).

function toError(error) {
  const err = new Error(error.message || 'Server error');
  err.status = error.status ?? error.code;
  return err;
}

export function createSupabaseRemote(supabase, userId) {
  async function rpc(fn, args) {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw toError(error);
    return data;
  }

  return {
    // --- sync ---
    pull: (since) => rpc('pull_reconciliations', { p_since: since }).then((rows) => rows ?? []),
    save: (id, data, expectedVersion) =>
      rpc('save_reconciliation', { p_id: id, p_data: data, p_expected_version: expectedVersion }),
    remove: (id) => rpc('delete_reconciliation', { p_id: id }),
    myIds: () => rpc('my_reconciliation_ids').then((ids) => (ids ?? []).map((x) => (typeof x === 'string' ? x : Object.values(x)[0]))),
    acceptInvites: () => rpc('accept_pending_invites').then((n) => n ?? 0),

    async listPeople() {
      const { data, error } = await supabase.from('saved_people').select('id, name');
      if (error) throw toError(error);
      return data ?? [];
    },
    async upsertPeople(people) {
      const rows = people.map((p) => ({ user_id: userId, id: p.id, name: p.name, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('saved_people').upsert(rows);
      if (error) throw toError(error);
    },

    // --- sharing ---
    listMembers: (id) => rpc('list_members', { p_id: id }).then((rows) => rows ?? []),
    invite: (id, email, role) => rpc('invite_member', { p_id: id, p_email: email, p_role: role }),
    setRole: (id, memberId, role) => rpc('set_member_role', { p_id: id, p_user: memberId, p_role: role }),
    removeMember: (id, memberId, email) => rpc('remove_member', { p_id: id, p_user: memberId ?? null, p_email: email ?? null }),

    /** Live updates: calls `onChange` whenever a reconciliation or membership visible to us changes. */
    subscribe(onChange) {
      const channel = supabase
        .channel(`cardsplit-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliations' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliation_members' }, onChange)
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

/** Profile = display name + stable person id ("me" across devices). */
export async function fetchProfile(supabase, userId) {
  const { data, error } = await supabase.from('profiles').select('id, email, display_name, person_id').eq('id', userId).maybeSingle();
  if (error) throw toError(error);
  return data;
}

export async function saveProfile(supabase, profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ ...profile, updated_at: new Date().toISOString() })
    .select('id, email, display_name, person_id')
    .single();
  if (error) throw toError(error);
  return data;
}
