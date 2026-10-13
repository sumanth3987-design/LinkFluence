
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardList,
  LoaderCircle,
  LogOut,
  Save,
  Settings,
  Star,
  UserRound,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { API_BASE_URL } from "../lib/auth";

const API = `${API_BASE_URL}/api`;

const NAVIGATION = [
  { id: "profile", label: "My Profile", icon: UserRound },
  { id: "invitations", label: "Invitations", icon: ClipboardList },
  { id: "projects", label: "My Projects", icon: BriefcaseBusiness },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "earnings", label: "Earnings", icon: CircleDollarSign },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
];

const EMPTY_PROFILE = {
  name: "",
  email: "",
  bio: "",
  niche: "",
  location: "",
  profile_image_url: "",
  instagram: "",
  youtube: "",
  tiktok: "",
  website: "",
  skills: [],
  languages: [],
  portfolio_links: [],
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Keep an empty response object if the server returns no JSON.
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

function unwrap(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function dateLabel(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0.00";
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Status({ value }) {
  const status = String(value || "unknown").replaceAll("_", " ");
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
      {status}
    </span>
  );
}

function RecordList({ records, emptyTitle, emptyDescription, renderRecord }) {
  if (!records.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {records.map((record, index) => (
        <div key={record.id || record._id || record.invitation_id || index}>
          {renderRecord(record)}
        </div>
      ))}
    </div>
  );
}

export default function CreatorWorkspace({ user, onLogout, onNotice }) {
  const [activeSection, setActiveSection] = useState("profile");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [profile, setProfile] = useState({
    ...EMPTY_PROFILE,
    name: user?.name || "",
    email: user?.email || "",
  });

  const [invitations, setInvitations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [earnings, setEarnings] = useState({ items: [], total: 0 });
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });

  const loadSection = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      switch (activeSection) {
        case "profile": {
          const data = await apiRequest("/creator/profile");
          const saved = data.profile || data.data || data;
          setProfile({
            ...EMPTY_PROFILE,
            ...saved,
            name: saved.name || user?.name || "",
            email: saved.email || user?.email || "",
            skills: Array.isArray(saved.skills) ? saved.skills : [],
            languages: Array.isArray(saved.languages) ? saved.languages : [],
            portfolio_links: Array.isArray(saved.portfolio_links)
              ? saved.portfolio_links
              : [],
          });
          break;
        }

        case "invitations": {
          const data = await apiRequest("/creator/invitations");
          setInvitations(unwrap(data, "invitations"));
          break;
        }

        case "projects": {
          const data = await apiRequest("/creator/projects");
          setProjects(unwrap(data, "projects"));
          break;
        }

        case "reviews": {
          const data = await apiRequest("/creator/reviews");
          setReviews(unwrap(data, "reviews"));
          break;
        }

        case "earnings": {
          const data = await apiRequest("/creator/earnings");
          setEarnings({
            items: unwrap(data, "earnings"),
            total: Number(data.total ?? data.total_earnings ?? 0),
          });
          break;
        }

        case "notifications": {
          const data = await apiRequest("/notifications");
          setNotifications(unwrap(data, "notifications"));
          break;
        }

        case "settings": {
          const data = await apiRequest("/settings");
          const account = data.settings || data.user || data.data || {};
          setSettings({
            name: account.name || user?.name || "",
            email: account.email || user?.email || "",
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      setError(err.message || "Could not load this section.");
    } finally {
      setLoading(false);
    }
  }, [activeSection, refreshKey, user?.name, user?.email]);

  useEffect(() => {
    loadSection();
  }, [loadSection]);

  function updateProfile(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...profile,
        skills: Array.isArray(profile.skills)
          ? profile.skills
          : String(profile.skills || "").split(",").map((v) => v.trim()).filter(Boolean),
        languages: Array.isArray(profile.languages)
          ? profile.languages
          : String(profile.languages || "").split(",").map((v) => v.trim()).filter(Boolean),
        portfolio_links: Array.isArray(profile.portfolio_links)
          ? profile.portfolio_links
          : String(profile.portfolio_links || "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
      };

      const data = await apiRequest("/creator/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (data.profile) {
        setProfile((current) => ({ ...current, ...data.profile }));
      }

      onNotice?.("Profile saved successfully.");
    } catch (err) {
      setError(err.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function respondToInvitation(invitation, action) {
    const id = invitation.id || invitation._id || invitation.invitation_id;
    if (!id) {
      setError("This invitation has no valid ID.");
      return;
    }

    setError("");
    try {
      await apiRequest(`/creator/invitations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      onNotice?.(`Invitation ${action === "accept" ? "accepted" : "declined"}.`);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err.message || "Could not update the invitation.");
    }
  }

  async function markNotificationsRead() {
    setError("");
    try {
      await apiRequest("/notifications/read", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotifications((items) =>
        items.map((item) => ({ ...item, read: true, is_read: true }))
      );
      onNotice?.("Notifications marked as read.");
    } catch (err) {
      setError(err.message || "Could not update notifications.");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await apiRequest("/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      onNotice?.("Settings saved successfully.");
    } catch (err) {
      setError(err.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const unreadCount = notifications.filter(
    (item) => !(item.read || item.is_read)
  ).length;

  function field(label, name, options = {}) {
    const { multiline = false, type = "text", hint = "" } = options;
    const value = profile[name];
    const displayValue = Array.isArray(value)
      ? name === "portfolio_links"
        ? value.join("\n")
        : value.join(", ")
      : value || "";

    const inputClass =
      "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

    return (
      <label className="block text-sm font-medium text-slate-700" key={name}>
        {label}
        {multiline ? (
          <textarea
            rows={4}
            className={inputClass}
            value={displayValue}
            onChange={(event) => updateProfile(name, event.target.value)}
          />
        ) : (
          <input
            type={type}
            className={inputClass}
            value={displayValue}
            onChange={(event) => updateProfile(name, event.target.value)}
          />
        )}
        {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      </label>
    );
  }

  function renderContent() {
    if (loading) {
      return (
        <div className="flex items-center gap-3 rounded-xl bg-white p-8 text-slate-600">
          <LoaderCircle className="animate-spin" size={20} />
          Loading your information…
        </div>
      );
    }

    switch (activeSection) {
      case "profile":
        return (
          <form onSubmit={saveProfile} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Creator profile</h3>
              <p className="mt-1 text-sm text-slate-500">
                Keep your public creator information up to date.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {field("Display name", "name")}
              {field("Email", "email", { type: "email" })}
              {field("Niche", "niche")}
              {field("Location", "location")}
              {field("Instagram URL", "instagram", { type: "url" })}
              {field("YouTube URL", "youtube", { type: "url" })}
              {field("TikTok URL", "tiktok", { type: "url" })}
              {field("Website", "website", { type: "url" })}
              {field("Profile image URL", "profile_image_url", { type: "url" })}
              {field("Skills", "skills", { hint: "Separate skills with commas." })}
              {field("Languages", "languages", { hint: "Separate languages with commas." })}
              <div className="md:col-span-2">
                {field("Bio", "bio", { multiline: true })}
              </div>
              <div className="md:col-span-2">
                {field("Portfolio links", "portfolio_links", {
                  multiline: true,
                  hint: "Enter one URL per line.",
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        );

      case "invitations":
        return (
          <RecordList
            records={invitations}
            emptyTitle="No invitations yet"
            emptyDescription="Brand invitations linked to your creator account will appear here."
            renderRecord={(item) => (
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {item.brand_name || item.brand?.name || "Brand invitation"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Received {dateLabel(item.created_at)}
                    </p>
                  </div>
                  <Status value={item.status} />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                  {item.message || "No message included."}
                </p>
                {String(item.status).toLowerCase() === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => respondToInvitation(item, "accept")}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      <Check size={16} /> Accept
                    </button>
                    <button
                      onClick={() => respondToInvitation(item, "decline")}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                    >
                      <X size={16} /> Decline
                    </button>
                  </div>
                )}
              </article>
            )}
          />
        );

      case "projects":
        return (
          <RecordList
            records={projects}
            emptyTitle="No assigned projects"
            emptyDescription="Projects assigned to your creator account will appear here."
            renderRecord={(item) => (
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {item.title || item.name || "Project"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.created_at ? `Created ${dateLabel(item.created_at)}` : ""}
                      {item.deadline ? ` · Deadline ${dateLabel(item.deadline)}` : ""}
                    </p>
                  </div>
                  <Status value={item.status} />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                  {item.description || item.brief || "No project description provided."}
                </p>
              </article>
            )}
          />
        );

      case "reviews":
        return (
          <RecordList
            records={reviews}
            emptyTitle="No reviews yet"
            emptyDescription="Reviews stored for your creator account will appear here."
            renderRecord={(item) => (
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">
                    {item.brand_name || item.project_title || "Project review"}
                  </h3>
                  {item.rating != null && (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                      <Star size={16} /> {item.rating}/5
                    </span>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                  {item.comment || item.review || "No written feedback provided."}
                </p>
                <p className="mt-3 text-xs text-slate-500">{dateLabel(item.created_at)}</p>
              </article>
            )}
          />
        );

      case "earnings":
        return (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-500">Recorded earnings</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{money(earnings.total)}</p>
              <p className="mt-2 text-xs text-slate-500">
                Calculated from the backend’s recorded creator earnings.
              </p>
            </div>
            <RecordList
              records={earnings.items}
              emptyTitle="No earnings recorded"
              emptyDescription="Payments must be recorded in the backend before they appear here."
              renderRecord={(item) => (
                <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {item.project_title || item.description || "Creator earning"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">{dateLabel(item.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {money(item.amount ?? item.net_amount)}
                    </p>
                    <Status value={item.status || "recorded"} />
                  </div>
                </article>
              )}
            />
          </div>
        );

      case "notifications":
        return (
          <div className="space-y-4">
            {unreadCount > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={markNotificationsRead}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mark all as read ({unreadCount})
                </button>
              </div>
            )}
            <RecordList
              records={notifications}
              emptyTitle="You're all caught up"
              emptyDescription="New notifications for your account will appear here."
              renderRecord={(item) => (
                <article className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">
                      {item.title || "Notification"}
                    </h3>
                    <Status value={item.read || item.is_read ? "read" : "unread"} />
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {item.message || item.body || ""}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">{dateLabel(item.created_at)}</p>
                </article>
              )}
            />
          </div>
        );

      case "settings":
        return (
          <form onSubmit={saveSettings} className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
            <h3 className="text-lg font-semibold text-slate-900">Account settings</h3>
            <p className="mt-1 text-sm text-slate-500">
              Update the name and email associated with your account.
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Name
              <input
                required
                value={settings.name}
                onChange={(event) => setSettings((v) => ({ ...v, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Email
              <input
                required
                type="email"
                value={settings.email}
                onChange={(event) => setSettings((v) => ({ ...v, email: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
        );

      default:
        return <EmptyState title="Section not found" description="Choose a section from the menu." />;
    }
  }

  const activeItem = NAVIGATION.find((item) => item.id === activeSection);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Linkfluence
          </p>
          <h1 className="mt-1 text-xl font-bold">Creator workspace</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{user?.name || profile.name || "Creator"}</p>
            <p className="text-xs text-slate-500">{user?.email || profile.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Workspace
          </p>
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {NAVIGATION.map((item) => {
              const Icon = item.icon;
              const selected = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium ${
                    selected
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.id === "notifications" && unreadCount > 0 && (
                    <span className="ml-auto rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">{activeItem?.label || "Workspace"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                View and manage information associated with your creator account.
              </p>
            </div>
            <button
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {renderContent()}
        </main>
      </div>
    </div>
  );
}
