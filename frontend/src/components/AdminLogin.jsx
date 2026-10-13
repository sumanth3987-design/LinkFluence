import { useState } from 'react';
import { API_BASE_URL } from '../lib/auth';
import { ShieldCheck, LockKeyhole, ArrowLeft, LoaderCircle, AlertCircle } from 'lucide-react';

export default function AdminLogin({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Admin sign-in failed.');
      if (data.user?.role !== 'admin') throw new Error('This account does not have administrator access.');
      window.history.replaceState(null, '', '/admin/dashboard');
      onSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Could not sign in. Check the backend connection.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-900">
    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
      <div className="bg-gradient-to-br from-violet-700 via-violet-800 to-slate-900 px-8 py-9 text-white">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20"><ShieldCheck size={29}/></div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-200">Linkfluence Control</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Admin sign in</h1>
        <p className="mt-2 text-sm leading-6 text-violet-100/80">Restricted access for authorised platform administrators.</p>
      </div>
      <form onSubmit={submit} className="space-y-5 p-8">
        {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={18} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
        <label className="block text-sm font-semibold text-slate-700">Admin email
          <input autoComplete="username" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Password
          <input autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter admin password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
        </label>
        <button disabled={busy} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3.5 font-semibold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60">
          {busy ? <LoaderCircle size={18} className="animate-spin"/> : <LockKeyhole size={18}/>} {busy ? 'Verifying…' : 'Sign in securely'}
        </button>
        <button type="button" onClick={() => { window.history.replaceState(null, '', '/'); window.location.reload(); }} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"><ArrowLeft size={16}/> Back to marketplace</button>
        <p className="text-center text-xs leading-5 text-slate-400">Admin access is checked by the Flask backend. Creator and brand accounts cannot use this login.</p>
      </form>
    </div>
  </main>;
}
