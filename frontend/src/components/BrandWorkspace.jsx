import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/auth";
import {
  LayoutDashboard, Search, Megaphone, Mail, MessageSquare, Bookmark,
  Bell, Settings, LogOut, Plus, RefreshCw, X, Send, Check, Clock3,
  Wallet, Users, ArrowUpRight, LoaderCircle, AlertCircle, ChevronRight,
  FileText, Trash2, Menu, Building2, CircleHelp, Filter, Sparkles,
} from "lucide-react";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "marketplace", label: "Creator Marketplace", icon: Search },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "invitations", label: "Invitations", icon: Mail },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "saved", label: "Saved Creators", icon: Bookmark },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "profile", label: "Brand Profile", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const EMPTY = {
  creators: [], campaigns: [], briefs: [], invitations: [], saved: [],
  messages: [], notifications: [], settings: null,
};
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value || 0));
const dateLabel = (value) => {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No date"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const getName = (item) => item?.name || item?.creator_name || item?.full_name || item?.handle || "Creator";
const getId = (item) => String(item?.id || item?._id || item?.creator_id || "");

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `Request failed (${response.status})`);
  }
  return body;
}

function Button({ children, onClick, variant = "primary", disabled = false, type = "button", className = "" }) {
  const styles = variant === "primary"
    ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
    : variant === "danger"
      ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
      : variant === "quiet"
        ? "bg-transparent text-slate-600 hover:bg-slate-100"
        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}>
      {children}
    </button>
  );
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600", green: "bg-emerald-50 text-emerald-700",
    yellow: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700", blue: "bg-sky-50 text-sky-700",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tones[tone] || tones.slate}`}>{children || "unknown"}</span>;
}

function EmptyState({ icon: Icon = FileText, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-violet-50 p-3 text-violet-600"><Icon size={24} /></div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", required = false, textarea = false, rows = 3 }) {
  const shared = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100";
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}{required && <span className="ml-1 text-rose-500">*</span>}
      {textarea
        ? <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className={`${shared} resize-y`} />
        : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className={shared} />}
    </label>
  );
}

export default function BrandWorkspace({ onLogout }) {
  const [section, setSection] = useState("overview");
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [mobileNav, setMobileNav] = useState(false);
  const [creatorModal, setCreatorModal] = useState(null);
  const [inviteMessage, setInviteMessage] = useState("Hi! We'd love to discuss a collaboration with you.");
  const [campaignModal, setCampaignModal] = useState(false);
  const [briefModal, setBriefModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", platform: "Instagram", budget: "", goal: "" });
  const [briefForm, setBriefForm] = useState({ title: "", description: "", deliverables: "", audience: "", budget: "", deadline: "" });
  const [settingsForm, setSettingsForm] = useState({ name: "", email: "" });
  const [messageCreator, setMessageCreator] = useState("");
  const [messageText, setMessageText] = useState("");

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");
    const requests = [
      ["creators", "/api/creators", "creators"],
      ["campaigns", "/api/campaigns", "campaigns"],
      ["briefs", "/api/briefs", "briefs"],
      ["invitations", "/api/invitations", "invitations"],
      ["saved", "/api/saved-creators", "saved_creators"],
      ["messages", "/api/messages", "messages"],
      ["notifications", "/api/notifications", "notifications"],
      ["settings", "/api/settings", "settings"],
    ];
    const results = await Promise.all(requests.map(async ([key, path, field]) => {
      try {
        const result = await api(path);
        const value = result[field] ?? (key === "settings" ? null : []);
        return [key, key === "settings" ? value : (Array.isArray(value) ? value : []), null];
      } catch (err) {
        return [key, key === "settings" ? null : [], err.message || "Request failed"];
      }
    }));
    const next = { ...EMPTY };
    const failures = [];
    for (const [key, value, failure] of results) {
      next[key] = value;
      if (failure && !failure.includes("Authentication required") && !failure.includes("Not logged in")) failures.push(failure);
    }
    setData(next);
    const settings = next.settings || {};
    setSettingsForm({ name: settings.name || "", email: settings.email || "" });
    if (failures.length) setError(failures[0]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const action = async (work, successMessage, after = true) => {
    setBusy(true);
    setError("");
    try {
      await work();
      if (successMessage) setNotice(successMessage);
      if (after) await loadData(false);
      return true;
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const savedIds = useMemo(() => new Set(data.saved.map((item) => String(item.creator_id || item.id || ""))), [data.saved]);
  const filteredCreators = useMemo(() => data.creators.filter((creator) => {
    const q = search.toLowerCase();
    const platforms = [creator.platform, ...(Array.isArray(creator.platforms) ? creator.platforms : [])].filter(Boolean).map((value) => String(value).toLowerCase());
    const searchable = [creator.name, creator.handle, creator.niche, creator.category, creator.location, creator.platform, ...(Array.isArray(creator.platforms) ? creator.platforms : [])].filter(Boolean).join(" ").toLowerCase();
    return (!q || searchable.includes(q)) && (platform === "all" || platforms.some((value) => value.includes(platform)));
  }), [data.creators, search, platform]);
  const unreadCount = data.notifications.filter((item) => !item.read).length;
  const activeCampaigns = data.campaigns.filter((item) => !["completed", "cancelled", "archived"].includes(String(item.status || "").toLowerCase())).length;
  const totalBudget = data.campaigns.reduce((sum, item) => sum + Number(item.budget || 0), 0);
  const brand = data.settings || {};

  const createCampaign = async (event) => {
    event.preventDefault();
    const ok = await action(() => api("/api/campaigns", { method: "POST", body: JSON.stringify({ ...campaignForm, budget: Number(campaignForm.budget || 0) }) }), "Campaign created and saved.");
    if (ok) {
      setCampaignModal(false);
      setCampaignForm({ name: "", description: "", platform: "Instagram", budget: "", goal: "" });
    }
  };
  const createBrief = async (event) => {
    event.preventDefault();
    const ok = await action(() => api("/api/briefs", { method: "POST", body: JSON.stringify({ ...briefForm, budget: Number(briefForm.budget || 0) }) }), "Creative brief saved.");
    if (ok) {
      setBriefModal(false);
      setBriefForm({ title: "", description: "", deliverables: "", audience: "", budget: "", deadline: "" });
    }
  };
  const inviteCreator = async (event) => {
    event.preventDefault();
    if (!creatorModal) return;
    const ok = await action(() => api("/api/invitations", { method: "POST", body: JSON.stringify({ creator_id: getId(creatorModal), message: inviteMessage }) }), "Invitation saved.");
    if (ok) setCreatorModal(null);
  };
  const toggleSave = (creator) => {
    const id = getId(creator);
    if (!id) { setError("This creator listing has no ID, so it cannot be saved."); return; }
    if (savedIds.has(id)) {
      void action(() => api(`/api/saved-creators/${encodeURIComponent(id)}`, { method: "DELETE" }), "Creator removed from saved list.");
    } else {
      void action(() => api("/api/saved-creators", { method: "POST", body: JSON.stringify({ creator_id: id }) }), "Creator saved.");
    }
  };
  const sendMessage = async (event) => {
    event.preventDefault();
    if (!messageCreator || !messageText.trim()) return;
    const ok = await action(() => api("/api/messages", { method: "POST", body: JSON.stringify({ creator_id: messageCreator, message: messageText.trim() }) }), "Message saved.");
    if (ok) setMessageText("");
  };
  const saveSettings = async (event) => {
    event.preventDefault();
    await action(() => api("/api/settings", { method: "PATCH", body: JSON.stringify(settingsForm) }), "Account settings updated.");
  };
  const markRead = () => action(() => api("/api/notifications/read", { method: "POST", body: JSON.stringify({}) }), "Notifications marked as read.");

  const title = NAV.find((item) => item.id === section)?.label || "Overview";
  const sidebar = (
    <>
      <div className="flex h-19 items-center gap-3 border-b border-slate-100 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white"><Sparkles size={21} /></div>
        <div><div className="text-lg font-extrabold tracking-tight text-slate-900">Linkfluence</div><div className="text-xs text-slate-500">Agency workspace</div></div>
        <button type="button" className="ml-auto rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <div className="px-3 pt-5">
        <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</div>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.id} onClick={() => { setSection(item.id); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${section === item.id ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                <Icon size={18} strokeWidth={1.8} /><span className="flex-1">{item.label}</span>
                {item.id === "notifications" && unreadCount > 0 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto p-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><CircleHelp size={17} /> Need help?</div>
          <p className="mb-3 text-xs leading-5 text-slate-500">Keep your campaigns, briefs, and creator collaborations organized in one place.</p>
          <Button variant="secondary" className="w-full" onClick={() => setSection("settings")}>Account settings <ChevronRight size={15} /></Button>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (onLogout) {
              await onLogout();
              return;
            }
            try {
              await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
            } catch (err) {
              console.error("Logout request failed:", err);
            } finally {
              window.location.reload();
            }
          }}
          className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      {mobileNav && <button type="button" aria-label="Close menu backdrop" className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMobileNav(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-65 flex-col border-r border-slate-100 bg-white transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>{sidebar}</aside>
      <main className="min-h-screen lg:pl-65">
        <header className="sticky top-0 z-30 flex h-19 items-center justify-between border-b border-slate-100 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div><div className="text-xs font-medium text-slate-400">Workspace / {title}</div><h1 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h1></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" onClick={() => loadData()} disabled={loading || busy} className="px-3!"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /><span className="hidden sm:inline">Refresh</span></Button>
            <button type="button" onClick={() => setSection("notifications")} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Notifications"><Bell size={18} />{unreadCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}</button>
            <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700 sm:flex">{(brand.name || "B").slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        <div className="mx-auto max-w-375 p-4 sm:p-7">
          {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><Check size={17} />{notice}<button type="button" className="ml-auto" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button></div>}
          {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}

          {loading ? (
            <div className="flex min-h-[55vh] items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={22} />Loading your workspace...</div>
          ) : (
            <>
              {section === "overview" && (
                <section>
                  <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div><p className="mb-2 text-sm font-medium text-violet-700">Your collaboration command center</p><h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Welcome back, {brand.name || "Brand partner"}</h2><p className="mt-2 text-sm text-slate-500">Discover creators and keep every collaboration moving.</p></div>
                    <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setSection("marketplace")}><Search size={16} /> Find creators</Button><Button onClick={() => setCampaignModal(true)}><Plus size={17} /> New campaign</Button></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "Creators available", value: data.creators.length, icon: Users, caption: "In your marketplace" },
                      { label: "Active campaigns", value: activeCampaigns, icon: Megaphone, caption: `${data.campaigns.length} total campaigns` },
                      { label: "Pending invitations", value: data.invitations.filter((item) => String(item.status).toLowerCase() === "pending").length, icon: Clock3, caption: "Awaiting creator response" },
                      { label: "Campaign budgets", value: money(totalBudget), icon: Wallet, caption: "Sum of saved campaign budgets" },
                    ].map((card, index) => {
                      const Icon = card.icon;
                      return <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{card.label}</span><span className={`rounded-xl p-2.5 ${index === 0 ? "bg-violet-50 text-violet-700" : index === 1 ? "bg-sky-50 text-sky-700" : index === 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}><Icon size={19} /></span></div><div className="mt-4 text-2xl font-extrabold text-slate-950">{card.value}</div><p className="mt-1 text-xs text-slate-400">{card.caption}</p></div>;
                    })}
                  </div>
                  <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Recent campaigns</h3><p className="mt-1 text-sm text-slate-500">Your latest campaign records</p></div><Button variant="quiet" onClick={() => setSection("campaigns")}>View all <ArrowUpRight size={15} /></Button></div>
                      {data.campaigns.length ? <div className="space-y-3">{data.campaigns.slice(0, 4).map((item, index) => <div key={getId(item) || item.name || index} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="rounded-xl bg-white p-2.5 text-violet-600"><Megaphone size={18} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{item.name}</div><div className="mt-1 text-xs text-slate-500">{item.platform || "Platform not set"} · {dateLabel(item.created_at)}</div></div><div className="text-right"><div className="text-sm font-bold text-slate-800">{money(item.budget)}</div><div className="mt-1"><Badge tone={item.status === "active" ? "green" : "slate"}>{item.status || "draft"}</Badge></div></div></div>)}</div> : <EmptyState icon={Megaphone} title="No campaigns yet" description="Create your first campaign to start organizing creator partnerships." action={<Button onClick={() => setCampaignModal(true)}><Plus size={16} /> Create campaign</Button>} />}
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Latest activity</h3><p className="mt-1 text-sm text-slate-500">Recent notifications</p></div><Button variant="quiet" onClick={() => setSection("notifications")}>See all <ChevronRight size={15} /></Button></div>
                      {data.notifications.length ? <div className="space-y-4">{data.notifications.slice(0, 5).map((item, index) => <div key={getId(item) || `${item.title}-${item.created_at || index}`} className="flex gap-3"><div className={`mt-0.5 rounded-xl p-2 ${item.read ? "bg-slate-100 text-slate-500" : "bg-violet-50 text-violet-700"}`}><Bell size={16} /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800">{item.title || "Notification"}</div><p className="mt-1 text-sm text-slate-500">{item.message || "You have an update."}</p><p className="mt-1 text-xs text-slate-400">{dateLabel(item.created_at)}</p></div></div>)}</div> : <EmptyState icon={Bell} title="You're all caught up" description="New collaboration updates will appear here." />}
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl bg-linear-to-r from-violet-700 to-indigo-700 p-6 text-white sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Sparkles size={14} /> Grow your creator network</div><h3 className="text-xl font-bold sm:text-2xl">Find the right voice for your brand.</h3><p className="mt-2 max-w-xl text-sm text-violet-100">Search creator profiles, save your shortlist, and send collaboration invitations.</p></div><Button className="bg-white! text-violet-700! hover:bg-violet-50!" onClick={() => setSection("marketplace")}>Explore marketplace <ArrowUpRight size={16} /></Button></div></div>
                </section>
              )}

              {section === "marketplace" && (
                <section>
                  <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold text-slate-950">Discover creators</h2><p className="mt-1 text-sm text-slate-500">Search creator listings and start collaboration invitations.</p></div><Badge>{filteredCreators.length} creators</Badge></div>
                  <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, niche, handle or location" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></div><div className="relative"><Filter size={16} className="absolute left-3 top-3 text-slate-400" /><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm outline-none sm:w-48"><option value="all">All platforms</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option></select></div></div>
                  {filteredCreators.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredCreators.map((creator, index) => { const id = getId(creator); const isSaved = savedIds.has(id); const image = creator.profile_image_url || creator.image_url || creator.avatar || ""; return (
                    <article key={id || `${creator.handle}-${index}`} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="h-24 bg-linear-to-r from-violet-100 via-indigo-50 to-sky-100" /><div className="px-5 pb-5"><div className="-mt-10 mb-3 flex items-end justify-between"><div className="flex h-17 w-17 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-violet-100 text-xl font-bold text-violet-700 shadow-sm">{image ? <img src={image} alt={getName(creator)} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : getName(creator).slice(0, 1).toUpperCase()}</div><Button variant="secondary" className="px-3! py-2!" onClick={() => toggleSave(creator)} disabled={busy}>{isSaved ? <Check size={15} /> : <Bookmark size={15} />} {isSaved ? "Saved" : "Save"}</Button></div><h3 className="text-lg font-bold text-slate-900">{getName(creator)}</h3><p className="mt-1 text-sm text-slate-500">{creator.handle ? `@${String(creator.handle).replace(/^@/, "")}` : creator.niche || creator.category || "Creator profile"}</p><div className="mt-3 flex flex-wrap gap-2">{(creator.niche || creator.category) && <Badge tone="violet">{creator.niche || creator.category}</Badge>}{(creator.platform || (creator.platforms || [])[0]) && <Badge tone="blue">{creator.platform || creator.platforms[0]}</Badge>}</div>{creator.bio && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{creator.bio}</p>}<div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="truncate text-xs text-slate-400">{creator.location || "Location not listed"}</span><Button onClick={() => { setCreatorModal(creator); setInviteMessage("Hi! We'd love to discuss a collaboration with you."); }}>Invite <Send size={14} /></Button></div></div></article>
                  ); })}</div> : <EmptyState icon={Users} title="No matching creators" description="Try another search term or change the platform filter." action={<Button variant="secondary" onClick={() => { setSearch(""); setPlatform("all"); }}>Clear filters</Button>} />}
                </section>
              )}

              {section === "campaigns" && (
                <section>
                  <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold text-slate-950">Campaign management</h2><p className="mt-1 text-sm text-slate-500">Create campaign records and track their current status.</p></div><Button onClick={() => setCampaignModal(true)}><Plus size={16} /> New campaign</Button></div>
                  <div className="mb-5 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-100 bg-white p-5"><p className="text-sm text-slate-500">Total campaigns</p><p className="mt-2 text-2xl font-extrabold">{data.campaigns.length}</p></div><div className="rounded-2xl border border-slate-100 bg-white p-5"><p className="text-sm text-slate-500">Active / in progress</p><p className="mt-2 text-2xl font-extrabold">{activeCampaigns}</p></div><div className="rounded-2xl border border-slate-100 bg-white p-5"><p className="text-sm text-slate-500">Total planned budget</p><p className="mt-2 text-2xl font-extrabold">{money(totalBudget)}</p></div></div>
                  {data.campaigns.length ? <div className="space-y-3">{data.campaigns.map((item, index) => <div key={getId(item) || index} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 sm:flex-row sm:items-center"><div className="rounded-xl bg-violet-50 p-3 text-violet-700"><Megaphone size={20} /></div><div className="min-w-0 flex-1"><h3 className="font-bold text-slate-900">{item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.description || "No description added"}</p><div className="mt-2 flex flex-wrap gap-2"><Badge>{item.platform || "Platform not set"}</Badge><Badge tone={String(item.status).toLowerCase() === "active" ? "green" : "slate"}>{item.status || "draft"}</Badge></div></div><div className="sm:text-right"><p className="text-lg font-bold">{money(item.budget)}</p><p className="mt-1 text-xs text-slate-400">Created {dateLabel(item.created_at)}</p></div></div>)}</div> : <EmptyState icon={Megaphone} title="No campaigns created" description="Create your first campaign. It will be saved in the database and remain after refresh." action={<Button onClick={() => setCampaignModal(true)}><Plus size={16} /> Create campaign</Button>} />}
                  <div className="mt-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Creative briefs</h3><p className="text-sm text-slate-500">Store campaign instructions and deliverables.</p></div><Button variant="secondary" onClick={() => setBriefModal(true)}><Plus size={16} /> New brief</Button></div>
                  {data.briefs.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{data.briefs.map((brief, index) => <div key={getId(brief) || index} className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex items-start justify-between gap-3"><div className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><FileText size={19} /></div><Badge>{brief.status || "draft"}</Badge></div><h4 className="mt-3 font-bold">{brief.title || brief.name}</h4><p className="mt-1 text-sm text-slate-500">{brief.description || "No description"}</p><div className="mt-4 flex justify-between text-xs text-slate-400"><span>Budget: {money(brief.budget)}</span><span>Due: {dateLabel(brief.deadline)}</span></div></div>)}</div> : <div className="mt-4"><EmptyState icon={FileText} title="No briefs yet" description="Add requirements, deliverables, audience and a deadline." action={<Button variant="secondary" onClick={() => setBriefModal(true)}><Plus size={16} /> Create brief</Button>} /></div>}
                </section>
              )}

              {section === "invitations" && <section><div className="mb-6"><h2 className="text-2xl font-extrabold text-slate-950">Collaboration invitations</h2><p className="mt-1 text-sm text-slate-500">Review invitations sent to creators and track responses.</p></div>{data.invitations.length ? <div className="space-y-3">{data.invitations.map((item, index) => <div key={getId(item) || index} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 sm:flex-row sm:items-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 font-bold text-violet-700">{getName(item).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><h3 className="font-bold">{getName(item)}</h3><p className="mt-1 text-sm text-slate-500">{item.message || "No message added"}</p><p className="mt-2 text-xs text-slate-400">Sent {dateLabel(item.created_at)}</p></div><Badge tone={String(item.status).toLowerCase() === "accepted" ? "green" : String(item.status).toLowerCase() === "declined" ? "red" : String(item.status).toLowerCase() === "pending" ? "yellow" : "slate"}>{item.status || "pending"}</Badge></div>)}</div> : <EmptyState icon={Mail} title="No invitations yet" description="Go to Creator Marketplace to invite a creator to collaborate." action={<Button onClick={() => setSection("marketplace")}><Search size={16} /> Find creators</Button>} />}</section>}

              {section === "messages" && <section><div className="mb-6"><h2 className="text-2xl font-extrabold text-slate-950">Messages</h2><p className="mt-1 text-sm text-slate-500">Send and review messages stored by the current backend.</p></div><div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><form onSubmit={sendMessage} className="h-fit rounded-2xl border border-slate-100 bg-white p-5"><h3 className="mb-4 font-bold">Compose message</h3><label className="block text-sm font-medium text-slate-700">Creator listing<select required value={messageCreator} onChange={(event) => setMessageCreator(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400"><option value="">Choose a creator</option>{data.creators.map((creator, index) => <option key={getId(creator) || index} value={getId(creator)}>{getName(creator)}</option>)}</select></label><div className="mt-4"><Field label="Message" value={messageText} onChange={setMessageText} placeholder="Write your collaboration message..." textarea required /></div><Button type="submit" disabled={busy || !messageCreator || !messageText.trim()} className="mt-4 w-full"><Send size={16} /> Send message</Button><p className="mt-3 text-xs leading-5 text-slate-400">This uses the existing brand message endpoint. Cross-account delivery requires a matching creator-side messages endpoint.</p></form><div className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Message history</h3><Badge>{data.messages.length} messages</Badge></div>{data.messages.length ? <div className="space-y-3">{data.messages.map((item, index) => <div key={getId(item) || index} className="rounded-xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{item.creator_name || "Creator"}</p><span className="text-xs text-slate-400">{dateLabel(item.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.message}</p></div>)}</div> : <EmptyState icon={MessageSquare} title="No messages yet" description="Messages you send from this workspace will be listed here." />}</div></div></section>}

              {section === "saved" && <section><div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold text-slate-950">Saved creators</h2><p className="mt-1 text-sm text-slate-500">Your shortlist for future partnerships.</p></div><Button variant="secondary" onClick={() => setSection("marketplace")}><Search size={16} /> Browse creators</Button></div>{data.saved.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.saved.map((item, index) => <div key={getId(item) || index} className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 font-bold text-violet-700">{getName(item).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{getName(item)}</h3><p className="text-xs text-slate-400">Saved {dateLabel(item.created_at)}</p></div></div><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={() => { const creator = data.creators.find((entry) => getId(entry) === String(item.creator_id)); if (creator) setCreatorModal(creator); else setError("This saved creator is not present in the current marketplace list."); }}>Invite <Send size={14} /></Button><Button variant="danger" onClick={() => void action(() => api(`/api/saved-creators/${encodeURIComponent(String(item.creator_id || item.id || ""))}`, { method: "DELETE" }), "Creator removed from saved list.")}><Trash2 size={15} /></Button></div></div>)}</div> : <EmptyState icon={Bookmark} title="Your shortlist is empty" description="Save creators from the marketplace to find them quickly later." action={<Button onClick={() => setSection("marketplace")}><Search size={16} /> Discover creators</Button>} />}</section>}

              {section === "notifications" && <section><div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold text-slate-950">Notifications</h2><p className="mt-1 text-sm text-slate-500">Campaign updates and collaboration activity.</p></div><Button variant="secondary" disabled={busy || unreadCount === 0} onClick={markRead}><Check size={16} /> Mark all as read</Button></div>{data.notifications.length ? <div className="space-y-3">{data.notifications.map((item, index) => <div key={getId(item) || index} className={`flex gap-3 rounded-2xl border p-5 ${item.read ? "border-slate-100 bg-white" : "border-violet-100 bg-violet-50/40"}`}><div className={`rounded-xl p-2.5 ${item.read ? "bg-slate-100 text-slate-500" : "bg-violet-100 text-violet-700"}`}><Bell size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.title || "Notification"}</h3>{!item.read && <Badge tone="violet">New</Badge>}</div><p className="mt-1 text-sm leading-6 text-slate-600">{item.message || "You have an update."}</p><p className="mt-2 text-xs text-slate-400">{dateLabel(item.created_at)}</p></div></div>)}</div> : <EmptyState icon={Bell} title="No notifications" description="Updates will appear here when actions happen in your workspace." />}</section>}

              {(section === "profile" || section === "settings") && <section><div className="mb-6"><h2 className="text-2xl font-extrabold text-slate-950">{section === "profile" ? "Brand profile" : "Account settings"}</h2><p className="mt-1 text-sm text-slate-500">Update your account information. Changes are saved to your account in MongoDB.</p></div><div className="grid gap-5 xl:grid-cols-[.7fr_1.3fr]"><div className="rounded-2xl border border-slate-100 bg-white p-6"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-2xl font-extrabold text-violet-700">{(settingsForm.name || "B").slice(0, 1).toUpperCase()}</div><h3 className="mt-4 text-lg font-bold">{settingsForm.name || "Brand account"}</h3><p className="mt-1 break-all text-sm text-slate-500">{settingsForm.email || "No email"}</p><div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Account role</div><div className="mt-1 font-semibold text-slate-800">Brand / Agency</div></div><div className="mt-3 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Workspace records</div><div className="mt-1 text-sm text-slate-700">{data.campaigns.length} campaigns · {data.saved.length} saved creators</div></div></div><form onSubmit={saveSettings} className="rounded-2xl border border-slate-100 bg-white p-6"><h3 className="mb-5 font-bold">Account information</h3><div className="grid gap-4 sm:grid-cols-2"><Field label="Your name / brand contact" value={settingsForm.name} onChange={(value) => setSettingsForm((prev) => ({ ...prev, name: value }))} placeholder="Name" required /><Field label="Email address" type="email" value={settingsForm.email} onChange={(value) => setSettingsForm((prev) => ({ ...prev, email: value }))} placeholder="you@company.com" required /></div><div className="mt-6 flex justify-end"><Button type="submit" disabled={busy}><Check size={16} /> Save changes</Button></div><p className="mt-4 text-xs leading-5 text-slate-400">The current UI expects the backend to store account name and email. Company logo, company description, team members, and billing fields need dedicated backend schema and routes before they can be persisted.</p></form></div></section>}
            </>
          )}
        </div>
      </main>

      {creatorModal && <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatorModal(null); }}><form onSubmit={inviteCreator} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><div className="mb-2 inline-flex rounded-xl bg-violet-50 p-2.5 text-violet-700"><Send size={19} /></div><h2 className="text-xl font-extrabold">Invite {getName(creatorModal)}</h2><p className="mt-1 text-sm text-slate-500">Send a collaboration invitation.</p></div><button type="button" onClick={() => setCreatorModal(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={19} /></button></div><Field label="Invitation message" value={inviteMessage} onChange={setInviteMessage} textarea rows={4} required placeholder="Explain the collaboration you have in mind" /><p className="mt-3 text-xs leading-5 text-slate-400">The backend may require this marketplace listing to be linked to a creator login account.</p><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreatorModal(null)}>Cancel</Button><Button type="submit" disabled={busy}><Send size={15} /> Send invitation</Button></div></form></div>}

      {campaignModal && <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"><form onSubmit={createCampaign} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-extrabold">Create campaign</h2><p className="mt-1 text-sm text-slate-500">The campaign is saved as a draft.</p></div><button type="button" onClick={() => setCampaignModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={19} /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Campaign name" value={campaignForm.name} onChange={(value) => setCampaignForm((prev) => ({ ...prev, name: value }))} placeholder="Summer creator launch" required /><label className="block text-sm font-medium text-slate-700">Platform<select value={campaignForm.platform} onChange={(event) => setCampaignForm((prev) => ({ ...prev, platform: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option>Instagram</option><option>YouTube</option><option>TikTok</option><option>Multiple platforms</option><option>Other</option></select></label><Field label="Budget (INR)" type="number" value={campaignForm.budget} onChange={(value) => setCampaignForm((prev) => ({ ...prev, budget: value }))} placeholder="50000" /><Field label="Goal" value={campaignForm.goal} onChange={(value) => setCampaignForm((prev) => ({ ...prev, goal: value }))} placeholder="Awareness, leads, sales" /></div><div className="mt-4"><Field label="Description" value={campaignForm.description} onChange={(value) => setCampaignForm((prev) => ({ ...prev, description: value }))} placeholder="What is this campaign about?" textarea /></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCampaignModal(false)}>Cancel</Button><Button type="submit" disabled={busy}><Plus size={16} /> Save campaign</Button></div></form></div>}

      {briefModal && <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"><form onSubmit={createBrief} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-extrabold">Create creative brief</h2><p className="mt-1 text-sm text-slate-500">Save campaign instructions and expected deliverables.</p></div><button type="button" onClick={() => setBriefModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={19} /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Brief title" value={briefForm.title} onChange={(value) => setBriefForm((prev) => ({ ...prev, title: value }))} placeholder="Product launch brief" required /><Field label="Budget (INR)" type="number" value={briefForm.budget} onChange={(value) => setBriefForm((prev) => ({ ...prev, budget: value }))} placeholder="25000" /><Field label="Target audience" value={briefForm.audience} onChange={(value) => setBriefForm((prev) => ({ ...prev, audience: value }))} placeholder="Audience and market" /><Field label="Deadline" type="date" value={briefForm.deadline} onChange={(value) => setBriefForm((prev) => ({ ...prev, deadline: value }))} /></div><div className="mt-4"><Field label="Description" value={briefForm.description} onChange={(value) => setBriefForm((prev) => ({ ...prev, description: value }))} placeholder="Campaign context and objectives" textarea /></div><div className="mt-4"><Field label="Deliverables" value={briefForm.deliverables} onChange={(value) => setBriefForm((prev) => ({ ...prev, deliverables: value }))} placeholder="Example: 2 reels, 3 stories, usage rights" textarea /></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setBriefModal(false)}>Cancel</Button><Button type="submit" disabled={busy}><Plus size={16} /> Save brief</Button></div></form></div>}
    </div>
  );
}
