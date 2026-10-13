import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../lib/auth';
import {
  ShieldCheck, LayoutDashboard, Users, UserRoundCheck, Mail, RefreshCw,
  Search, LogOut, Link2, Unlink, CheckCircle2, AlertCircle, LoaderCircle,
  ArrowUpRight, Database, Activity, Clock3, ChevronRight
} from 'lucide-react';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'listings', label: 'Creator listings', icon: UserRoundCheck },
  { id: 'invitations', label: 'Invitations', icon: Mail },
];

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body;
}

function Badge({ children, tone = 'slate' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', violet: 'bg-violet-50 text-violet-700',
    blue: 'bg-sky-50 text-sky-700', rose: 'bg-rose-50 text-rose-700',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${colors[tone] || colors.slate}`}>{children || 'unknown'}</span>;
}

function StatCard({ label, value, note, icon: Icon, tone = 'violet' }) {
  const tones = { violet: 'bg-violet-50 text-violet-700', blue: 'bg-sky-50 text-sky-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value ?? '—'}</p></div><span className={`rounded-xl p-3 ${tones[tone] || tones.violet}`}><Icon size={21}/></span></div>
    {note && <p className="mt-3 text-xs text-slate-500">{note}</p>}
  </div>;
}

function Empty({ title, text }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center"><Database size={26} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold text-slate-800">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}

const niceDate = value => value ? (Number.isNaN(new Date(value).getTime()) ? '—' : new Date(value).toLocaleString('en-IN', { dateStyle: 'medium' })) : '—';

export default function AdminDashboard({ user, onLogout }) {
  const [section, setSection] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [listings, setListings] = useState([]);
  const [creatorAccounts, setCreatorAccounts] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [linkChoices, setLinkChoices] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [overviewData, usersData, listingsData, invitationsData] = await Promise.all([
        api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/creators/listings'), api('/api/admin/invitations'),
      ]);
      setOverview(overviewData.overview || {});
      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setListings(Array.isArray(listingsData.listings) ? listingsData.listings : []);
      setCreatorAccounts(Array.isArray(listingsData.creator_accounts) ? listingsData.creator_accounts : []);
      setInvitations(Array.isArray(invitationsData.invitations) ? invitationsData.invitations : []);
    } catch (err) {
      setError(err.message || 'Could not load admin data. Confirm that you are signed in as an admin.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredUsers = useMemo(() => users.filter(item => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${item.name || ''} ${item.email || ''} ${item.role || ''}`.toLowerCase().includes(query);
    return matchesSearch && (roleFilter === 'all' || item.role === roleFilter);
  }), [users, search, roleFilter]);

  const filteredListings = useMemo(() => listings.filter(item => {
    const query = search.trim().toLowerCase();
    return !query || `${item.name || ''} ${item.handle || ''} ${item.email || ''} ${item.linked_user?.email || ''}`.toLowerCase().includes(query);
  }), [listings, search]);

  async function linkListing(listing) {
    const creatorUserId = linkChoices[listing.id];
    if (!creatorUserId) { setError('Select a registered creator account before linking.'); return; }
    setBusyId(listing.id); setError(''); setNotice('');
    try {
      const result = await api(`/api/admin/creators/${encodeURIComponent(listing.id)}/link`, {
        method: 'POST', body: JSON.stringify({ creator_user_id: creatorUserId }),
      });
      setNotice(result.message || 'Creator listing linked successfully.');
      await loadData();
    } catch (err) { setError(err.message || 'Could not link creator listing.'); }
    finally { setBusyId(''); }
  }

  async function unlinkListing(listing) {
    if (!window.confirm(`Unlink marketplace listing “${listing.name || listing.handle || listing.id}” from its creator account?`)) return;
    setBusyId(listing.id); setError(''); setNotice('');
    try {
      const result = await api(`/api/admin/creators/${encodeURIComponent(listing.id)}/unlink`, { method: 'POST', body: JSON.stringify({}) });
      setNotice(result.message || 'Creator listing unlinked.');
      await loadData();
    } catch (err) { setError(err.message || 'Could not unlink creator listing.'); }
    finally { setBusyId(''); }
  }

  const stat = overview || {};
  const invitationsPending = Number(stat.pending_invitations || 0);
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-700 text-white"><ShieldCheck size={22}/></span><div><p className="font-bold tracking-tight">linkfluence<span className="text-violet-600">.</span></p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Admin console</p></div></div>
      <nav className="flex-1 space-y-1 p-3">{NAV.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setSearch(''); }} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition ${section === id ? 'bg-violet-50 text-violet-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={18}/>{label}{section === id && <ChevronRight size={15} className="ml-auto"/>}</button>)}</nav>
      <div className="border-t border-slate-100 p-4"><div className="mb-3 rounded-xl bg-slate-50 p-3"><p className="truncate text-sm font-semibold">{user?.name || 'Administrator'}</p><p className="truncate text-xs text-slate-500">{user?.email || 'Admin session'}</p><div className="mt-2"><Badge tone="violet">Admin</Badge></div></div><button onClick={onLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><LogOut size={16}/> Sign out</button></div>
    </aside>

    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-7">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Platform administration</p><h1 className="mt-1 text-xl font-bold capitalize sm:text-2xl">{NAV.find(item => item.id === section)?.label || 'Overview'}</h1></div>
        <div className="flex items-center gap-2"><button onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/><span className="hidden sm:inline">Refresh</span></button><button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 lg:hidden"><LogOut size={16}/></button></div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-7">
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} className="mt-0.5 shrink-0"/><span className="flex-1">{error}</span><button onClick={() => setError('')} className="font-bold">×</button></div>}
        {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0"/><span className="flex-1">{notice}</span><button onClick={() => setNotice('')} className="font-bold">×</button></div>}
        {loading && !overview && <div className="flex items-center gap-3 rounded-2xl border bg-white p-6 text-sm text-slate-500"><LoaderCircle size={19} className="animate-spin"/> Loading admin data from MongoDB…</div>}

        {section === 'overview' && <>
          <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-violet-950 to-violet-800 p-6 text-white sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-200"><Activity size={14}/> Control center</p><h2 className="mt-3 text-2xl font-bold sm:text-3xl">Platform overview</h2><p className="mt-2 max-w-xl text-sm leading-6 text-violet-100/80">Monitor accounts, marketplace listings, and collaboration invitations from one protected workspace.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><Database size={24}/><p className="mt-2 text-xs text-violet-100">Live database metrics</p></div></div></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total accounts" value={stat.total_users} note="Registered platform users" icon={Users} tone="violet"/><StatCard label="Creator accounts" value={stat.creator_users} note="Accounts with creator role" icon={UserRoundCheck} tone="blue"/><StatCard label="Marketplace listings" value={stat.total_listings} note={`${stat.unlinked_listings ?? 0} currently unlinked`} icon={Database} tone="green"/><StatCard label="Pending invitations" value={invitationsPending} note={`${stat.total_invitations ?? 0} invitations in total`} icon={Mail} tone="amber"/></div>
          <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Invitation statuses</h3><div className="mt-4 space-y-3">{[['Pending', stat.pending_invitations, 'amber'], ['Accepted', stat.accepted_invitations, 'green'], ['Declined', stat.declined_invitations, 'rose']].map(([label, value, tone]) => <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-700">{label}</span><Badge tone={tone}>{value ?? 0}</Badge></div>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Priority actions</h3><p className="mt-1 text-sm text-slate-500">Resolve marketplace account-linking issues.</p><button onClick={() => { setSection('listings'); setSearch(''); }} className="mt-4 flex w-full items-center justify-between rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-left text-sm font-semibold text-violet-800 hover:bg-violet-100"><span>Review creator listings</span><ArrowUpRight size={17}/></button><button onClick={() => setSection('invitations')} className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><span>Monitor invitations</span><ArrowUpRight size={17}/></button></div></div>
        </>}

        {section === 'users' && <>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row"><div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={17} className="text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, or role" className="h-11 min-w-0 flex-1 outline-none"/></div><select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="all">All roles</option><option value="creator">Creators</option><option value="brand">Brands</option><option value="admin">Admins</option></select></div>
          {filteredUsers.length === 0 ? <Empty title="No users found" text="Try another search or role filter."/> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Account</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Account ID</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredUsers.map(item => <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{item.name || 'Unnamed user'}</p><p className="mt-1 text-xs text-slate-500">{item.email}</p></td><td className="px-5 py-4"><Badge tone={item.role === 'admin' ? 'violet' : item.role === 'creator' ? 'blue' : 'slate'}>{item.role}</Badge></td><td className="px-5 py-4 text-slate-500">{niceDate(item.created_at)}</td><td className="px-5 py-4 font-mono text-xs text-slate-400">{item.id}</td></tr>)}</tbody></table></div></div>}
        </>}

        {section === 'listings' && <>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-900"><strong>Account linking:</strong> Select the correct registered creator account for each unlinked marketplace listing. This enables invitations to be delivered to that creator's login account.</div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={17} className="text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search listing name, handle, or email" className="h-11 min-w-0 flex-1 outline-none"/></div>
          {filteredListings.length === 0 ? <Empty title="No marketplace listings" text="There are no creator listings to display yet."/> : <div className="space-y-3">{filteredListings.map(listing => <article key={listing.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{listing.name || listing.handle || 'Creator listing'}</h3><Badge tone={listing.linked_user ? 'green' : 'amber'}>{listing.linked_user ? 'Linked' : 'Unlinked'}</Badge></div><p className="mt-1 text-sm text-slate-500">{listing.handle ? `@${String(listing.handle).replace(/^@/, '')}` : 'No handle'}{listing.email ? ` · ${listing.email}` : ''}</p>{listing.linked_user && <p className="mt-2 text-xs text-emerald-700">Linked to {listing.linked_user.name} ({listing.linked_user.email})</p>}<p className="mt-2 break-all font-mono text-[11px] text-slate-400">Listing ID: {listing.id}</p></div><div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto xl:min-w-[420px]"><select value={linkChoices[listing.id] || listing.linked_user?.id || ''} onChange={e => setLinkChoices(current => ({ ...current, [listing.id]: e.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Choose creator account…</option>{creatorAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select><button disabled={busyId === listing.id || !(linkChoices[listing.id] || listing.linked_user?.id)} onClick={() => void linkListing(listing)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">{busyId === listing.id ? <LoaderCircle size={16} className="animate-spin"/> : <Link2 size={16}/>} Link account</button>{listing.linked_user && <button disabled={busyId === listing.id} onClick={() => void unlinkListing(listing)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Unlink size={16}/> Unlink</button>}</div></div></article>)}</div>}
          <p className="text-xs leading-5 text-slate-400">{creatorAccounts.length} registered creator account(s) available for linking. Verify the identity before confirming a link.</p>
        </>}

        {section === 'invitations' && <>
          {invitations.length === 0 ? <Empty title="No invitations yet" text="Brand invitations will appear here when they are created."/> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Creator</th><th className="px-5 py-4">Brand</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Invitation ID</th></tr></thead><tbody className="divide-y divide-slate-100">{invitations.map(item => <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-semibold">{item.creator_name || 'Creator'}</td><td className="px-5 py-4">{item.brand_name || 'Brand'}</td><td className="px-5 py-4"><Badge tone={item.status === 'accepted' ? 'green' : item.status === 'declined' ? 'rose' : item.status === 'pending' ? 'amber' : 'slate'}>{item.status}</Badge></td><td className="px-5 py-4 text-slate-500">{niceDate(item.created_at)}</td><td className="px-5 py-4 font-mono text-xs text-slate-400">{item.id}</td></tr>)}</tbody></table></div></div>}
        </>}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-400"><span className="flex items-center gap-2"><ShieldCheck size={14}/> Protected administrator workspace</span><span className="flex items-center gap-1"><Clock3 size={13}/> Data loaded from Flask / MongoDB</span></footer>
      </main>
    </div>
  </div>;
}
