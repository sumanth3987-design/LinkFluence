import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowUpRight, Bell, Bookmark, Check, ChevronDown, Compass, Flame,
  Heart, LayoutGrid, MessageCircle, Plus, Search, Settings2, Sparkles,
  Users, Video, WandSparkles, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import AuthScreen from '@/components/AuthScreen'
import CreatorWorkspace from '@/components/CreatorWorkspace'
import BrandWorkspace from '@/components/BrandWorkspace'
import AdminLogin from '@/components/AdminLogin'
import AdminDashboard from '@/components/AdminDashboard'
import { API_BASE_URL, getCurrentUser, logout } from '@/lib/auth'

const API_BASE = `${API_BASE_URL}/api`

const demoCreators = [
  { id: 1, name: 'Aarav Mehta', handle: '@aaravcreates', role: 'AI Filmmaker', location: 'Mumbai, India', rate: 12000, rating: 4.9, projects: 28, match: 98, tags: ['AI Video', 'Cinematic', 'Storytelling'], availability: 'Available' },
  { id: 2, name: 'Priya Sharma', handle: '@priyadesigns', role: 'AI Visual Artist', location: 'Bengaluru, India', rate: 8500, rating: 5, projects: 41, match: 96, tags: ['Product Ads', 'Midjourney', 'Branding'], availability: 'Available' },
  { id: 3, name: 'Kabir Khan', handle: '@kabir.motion', role: 'Motion Designer', location: 'Hyderabad, India', rate: 15000, rating: 4.8, projects: 19, match: 94, tags: ['Motion Design', '3D', 'AI Video'], availability: 'Busy this week' },
  { id: 4, name: 'Ananya Rao', handle: '@ananya.visuals', role: 'Content Creator', location: 'Pune, India', rate: 6500, rating: 4.9, projects: 35, match: 91, tags: ['Social Ads', 'Lifestyle', 'Reels'], availability: 'Available' },
  { id: 5, name: 'Rohan Kapoor', handle: '@rohanai.lab', role: 'AI Creative Director', location: 'Delhi, India', rate: 18000, rating: 5, projects: 52, match: 89, tags: ['Campaigns', 'Art Direction', 'GenAI'], availability: 'Available' },
  { id: 6, name: 'Meera Iyer', handle: '@meeramakes', role: 'AI Content Designer', location: 'Chennai, India', rate: 9500, rating: 4.9, projects: 24, match: 87, tags: ['Social Content', 'Adobe Firefly', 'Design'], availability: 'Available' },
]
const categories = ['All creators', 'AI Video', 'AI Images', 'Social Ads', 'Motion Design']
const navItems = [
  { label: 'Discover', icon: Compass },
  { label: 'My campaigns', icon: LayoutGrid },
  { label: 'Messages', icon: MessageCircle },
  { label: 'My network', icon: Users },
]
const keyOf = (value) => String(value ?? '')
const formatRate = (rate) => `₹${(Number(rate) || 0).toLocaleString('en-IN')}`

async function readApiResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success === false) {
    throw new Error(data.message || data.error || fallbackMessage)
  }
  return data
}

function App() {
  const [authUser, setAuthUser] = useState(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authScreen, setAuthScreen] = useState(null)
  const [pendingInvite, setPendingInvite] = useState(null)
  const [notice, setNotice] = useState('')
  const [creators, setCreators] = useState(demoCreators)
  const [creatorSource, setCreatorSource] = useState('demo')
  const [creatorLoading, setCreatorLoading] = useState(true)
  const [creatorLoadError, setCreatorLoadError] = useState(false)
  const [invitations, setInvitations] = useState([])
  const [saved, setSaved] = useState([])
  const [activeNav, setActiveNav] = useState('Discover')
  const [activeCategory, setActiveCategory] = useState('All creators')
  const [search, setSearch] = useState('')
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [sortBy, setSortBy] = useState('match')
  const [showFilters, setShowFilters] = useState(false)

  const showNotice = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  useEffect(() => {
    let active = true
    getCurrentUser().then(result => {
      if (active) setAuthUser(result?.user || null)
    }).catch(() => {
      if (active) setAuthUser(null)
    }).finally(() => {
      if (active) setAuthChecking(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadCreators = async () => {
      setCreatorLoading(true)
      setCreatorLoadError(false)
      try {
        const response = await fetch(`${API_BASE}/creators`)
        const data = await readApiResponse(response, 'Could not load creators.')
        const rows = Array.isArray(data.creators) ? data.creators : []
        if (!active) return
        if (rows.length) {
          setCreators(rows.map((item, index) => ({
            ...item,
            id: keyOf(item.id ?? item._id),
            name: item.name || item.full_name || item.handle || `Creator ${index + 1}`,
            role: item.role || item.niche || item.category || 'Creative Professional',
            rate: Number(item.rate ?? item.starting_price ?? item.price) || 0,
            rating: Number(item.rating) || 0,
            match: Number(item.match) || Math.max(80, 98 - index * 3),
            tags: Array.isArray(item.tags) ? item.tags : [item.niche, item.category].filter(Boolean),
            availability: item.availability || 'Available',
          })))
          setCreatorSource('database')
        } else {
          setCreators(demoCreators)
          setCreatorSource('demo')
        }
      } catch (error) {
        if (!active) return
        console.error('Creator loading failed:', error)
        setCreators(demoCreators)
        setCreatorSource('demo')
        setCreatorLoadError(true)
      } finally {
        if (active) setCreatorLoading(false)
      }
    }
    void loadCreators()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (authUser?.role !== 'brand') {
      setInvitations([])
      return () => { active = false }
    }
    fetch(`${API_BASE}/invitations`, { credentials: 'include' })
      .then(response => readApiResponse(response, 'Could not load invitations.'))
      .then(data => {
        if (active) setInvitations(Array.isArray(data.invitations) ? data.invitations : [])
      })
      .catch(error => { if (active) showNotice(error.message) })
    return () => { active = false }
  }, [authUser])

  const invitedIds = useMemo(() => new Set(invitations.filter(item => item.status !== 'cancelled').map(item => keyOf(item.creator_id))), [invitations])
  const filteredCreators = useMemo(() => {
    const query = search.trim().toLowerCase()
    return creators.filter(creator => {
      const tags = Array.isArray(creator.tags) ? creator.tags : []
      const searchable = [creator.name, creator.handle, creator.role, creator.location, ...tags].join(' ').toLowerCase()
      const categoryMatch = activeCategory === 'All creators' || tags.some(tag => {
        const value = String(tag).toLowerCase()
        if (activeCategory === 'AI Images') return ['midjourney', 'branding', 'design', 'ai images'].some(term => value.includes(term))
        return value.includes(activeCategory.toLowerCase())
      })
      return (!query || searchable.includes(query)) && categoryMatch && (!showSavedOnly || saved.includes(keyOf(creator.id ?? creator._id)))
    }).sort((a, b) => sortBy === 'price' ? (Number(a.rate) || 0) - (Number(b.rate) || 0) : sortBy === 'rating' ? (Number(b.rating) || 0) - (Number(a.rating) || 0) : (Number(b.match) || 0) - (Number(a.match) || 0))
  }, [creators, search, activeCategory, showSavedOnly, saved, sortBy])

  const sendInvitation = async (creator, user = authUser) => {
    if (!user || user.role !== 'brand') {
      showNotice('Sign in with a Brand/Agency account to invite creators.')
      return
    }
    try {
      const id = keyOf(creator.id ?? creator._id)
      const response = await fetch(`${API_BASE}/invitations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: id, creator_name: creator.name || creator.full_name || 'Creator', message: '' }),
      })
      const data = await readApiResponse(response, 'Could not save the invitation.')
      setInvitations(current => [...current, data.invitation || { creator_id: id, creator_name: creator.name, status: 'pending', created_at: new Date().toISOString() }])
      showNotice(data.message || `Invitation saved for ${creator.name || 'creator'}.`)
    } catch (error) {
      showNotice(error.message || 'Could not save the invitation.')
    }
  }

  const handleInvite = (creator) => {
    const id = keyOf(creator.id ?? creator._id)
    if (invitedIds.has(id)) return
    if (!authUser || authUser.role !== 'brand') {
      setPendingInvite(creator)
      setAuthScreen({ role: 'brand', mode: 'login' })
      return
    }
    void sendInvitation(creator)
  }

  const handleAuthSuccess = (user) => {
    setAuthUser(user)
    setAuthScreen(null)
    const creator = pendingInvite
    setPendingInvite(null)
    if (creator && user?.role === 'brand') void sendInvitation(creator, user)
    else if (creator) showNotice('Sign in with a Brand/Agency account to invite creators.')
    else showNotice(`Signed in successfully${user?.name ? ` as ${user.name}` : ''}.`)
  }

  const handleLogout = async () => {
    try {
      await logout()
      setAuthUser(null)
      setPendingInvite(null)
      setAuthScreen(null)
      setInvitations([])
      showNotice('You have been signed out.')
    } catch (error) {
      showNotice(error.message || 'Could not sign out. Please try again.')
    }
  }

  const isAdminPath = window.location.pathname.startsWith('/admin')
  if (authUser?.role === 'admin') return <AdminDashboard user={authUser} onLogout={handleLogout} />
  if (isAdminPath) return <AdminLogin onSuccess={handleAuthSuccess} />
  if (authScreen) return <AuthScreen initialRole={authScreen.role} initialMode={authScreen.mode} onSuccess={handleAuthSuccess} onBack={() => { setAuthScreen(null); setPendingInvite(null) }} />
  if (authUser?.role === 'creator') return <CreatorWorkspace user={authUser} onLogout={handleLogout} onNotice={showNotice} />
  
if (authUser?.role === 'brand') {
  return (
    <>
      <BrandWorkspace onLogout={handleLogout} />

      <button
        type="button"
        onClick={handleLogout}
        className="fixed bottom-5 right-5 z-100 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-red-700"
      >
        Sign out
      </button>
    </>
  )
}


  const changeNav = (label) => {
    if (label === 'Discover') setActiveNav(label)
    else {
      setActiveNav(label)
      showNotice('Sign in with a Brand/Agency account to access campaign and collaboration tools.')
    }
  }
  const toggleSaved = (creator) => {
    const id = keyOf(creator.id ?? creator._id)
    setSaved(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  return <div className="min-h-screen bg-[#faf9f7] text-[#24232b]">
    <header className="sticky top-0 z-30 border-b border-[#ece9e5] bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
      <button className="flex items-center gap-2 font-bold" onClick={() => { setActiveNav('Discover'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white"><WandSparkles size={20}/></span><span className="text-xl">linkfluence<span className="text-violet-600">.</span></span></button>
      <nav className="hidden gap-1 lg:flex">{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => changeNav(label)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${activeNav === label ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={16}/>{label}</button>)}</nav>
      <div className="flex items-center gap-2">{authUser ? <button onClick={handleLogout} className="rounded-xl border px-3 py-2 text-sm">{authUser.name || 'Account'} · Sign out</button> : <button disabled={authChecking} onClick={() => setAuthScreen({ role: 'brand', mode: 'login' })} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{authChecking ? 'Checking…' : 'Brand / Agency sign in'}</button>}<button aria-label="Notifications" onClick={() => showNotice('Sign in to view workspace notifications.')} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><Bell size={18}/></button></div>
    </div></header>
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-[#211b38] px-6 py-9 text-white md:px-10"><div className="absolute -right-10 -top-16 h-72 w-72 rounded-full border border-white/10"/><div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-violet-200"><Sparkles size={14}/> AI-POWERED CREATOR DISCOVERY</span><h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">Find your next <span className="text-violet-300">creative obsession.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-violet-100/80">Meet creative professionals turning bold ideas into standout content. Discover talent and start your next collaboration.</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => document.getElementById('creator-directory')?.scrollIntoView({ behavior: 'smooth' })} className="bg-violet-500 text-white hover:bg-violet-600">Explore creators <ArrowUpRight size={15}/></Button><Button variant="outline" onClick={() => setAuthScreen({ role: 'brand', mode: 'login' })} className="border-white/25 bg-transparent text-white hover:bg-white/10"><Plus size={15}/> Create a campaign</Button></div></div></motion.section>
      <section className="my-7 grid gap-3 sm:grid-cols-3">{[{icon:WandSparkles,title:'AI-powered matching',desc:'Discover relevant talent'},{icon:Video,title:'Portfolio-first profiles',desc:'See the work, not just words'},{icon:Heart,title:'Made for collaboration',desc:'From brief to delivery'}].map(({icon:Icon,title,desc})=><div key={title} className="flex items-center gap-3 rounded-2xl border border-[#eeeae5] bg-white p-4"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600"><Icon size={20}/></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-slate-500">{desc}</p></div></div>)}</section>
      <section id="creator-directory" className="scroll-mt-24"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-600"><Flame size={14}/> Curated for your next big idea</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Discover creators</h2><p className="mt-2 text-sm text-slate-500">Search, filter, save favourites, and invite creators to collaborate.</p></div><button onClick={() => { setSearch(''); setActiveCategory('All creators'); setShowSavedOnly(false); setSortBy('match') }} className="text-sm font-semibold text-violet-700">Reset discovery</button></div>
        {creatorLoadError && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Creator API unavailable; showing demo profiles.</p>}{creatorLoading && <p className="mb-4 rounded-xl border bg-white p-3 text-sm text-slate-500">Loading creator profiles…</p>}{creatorSource === 'demo' && !creatorLoading && !creatorLoadError && <p className="mb-4 rounded-xl border bg-white p-3 text-sm text-slate-500">Showing demo profiles. Live profiles appear when available from the backend.</p>}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-white px-4"><Search size={18} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search creators, skills, or AI tools…" className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"/><button aria-label="Toggle filters" onClick={()=>setShowFilters(v=>!v)} className="text-slate-500"><Settings2 size={17}/></button>{search && <button onClick={()=>setSearch('')} aria-label="Clear search"><X size={15}/></button>}</div><select value={sortBy} onChange={e=>setSortBy(e.target.value)} aria-label="Sort creators" className="rounded-xl border bg-white px-4 py-3 text-sm"><option value="match">Best match</option><option value="rating">Highest rated</option><option value="price">Lowest price</option></select></div>
        {showFilters && <div className="mb-4 flex flex-wrap gap-2 rounded-xl border bg-white p-3"><button onClick={()=>setShowSavedOnly(v=>!v)} className={`rounded-full border px-3 py-2 text-xs ${showSavedOnly?'border-violet-500 bg-violet-50 text-violet-700':''}`}>Saved only ({saved.length})</button><button onClick={()=>setSortBy('rating')} className="rounded-full border px-3 py-2 text-xs">Top rated</button><button onClick={()=>{setSearch('AI');setShowSavedOnly(false)}} className="rounded-full border px-3 py-2 text-xs">AI specialists</button></div>}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{categories.map(category=><button key={category} onClick={()=>{setActiveCategory(category);setShowSavedOnly(false)}} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-semibold ${activeCategory===category?'bg-violet-600 text-white':'border bg-white text-slate-600 hover:border-violet-300'}`}>{category}</button>)}</div>
        <p className="mb-4 text-sm text-slate-500">Showing <strong>{filteredCreators.length}</strong> creators{showSavedOnly?' · Saved list':''}</p>
        {filteredCreators.length===0 ? <div className="rounded-2xl border border-dashed bg-white p-12 text-center"><Search size={25} className="mx-auto mb-3 text-violet-400"/><h3 className="font-semibold">No creators found</h3><p className="mt-1 text-sm text-slate-500">Try another search or clear your filters.</p><Button variant="outline" className="mt-4" onClick={()=>{setSearch('');setActiveCategory('All creators');setShowSavedOnly(false)}}>Clear filters</Button></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredCreators.map((creator,index)=>{const id=keyOf(creator.id??creator._id);const isSaved=saved.includes(id);const isInvited=invitedIds.has(id);const tags=Array.isArray(creator.tags)?creator.tags:[];return <motion.article key={id||index} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex h-28 items-center justify-center bg-linear-to-br from-violet-200 via-fuchsia-100 to-orange-100"><span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/70 bg-white/60 text-2xl font-bold text-violet-800">{String(creator.name||creator.full_name||'C').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()}</span></div><div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold">{creator.name||creator.full_name||creator.handle||'Creator'}</h3><p className="mt-1 text-xs text-slate-500">{creator.handle||creator.role||creator.niche||'Creative professional'}</p></div><span className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">★ {Number(creator.rating||0).toFixed(1)}</span></div><p className="mt-3 text-sm font-medium text-slate-700">{creator.role||creator.niche||creator.category||'Creative Professional'}</p><p className="mt-1 text-xs text-slate-500">{creator.location||'Location not specified'}</p><div className="mt-3 flex min-h-8 flex-wrap gap-1.5">{tags.map(tag=><span key={tag} className="rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-700">{tag}</span>)}</div><div className="mt-4 flex items-center justify-between border-t pt-4"><div><p className="font-bold">{formatRate(creator.rate??creator.starting_price??creator.price)}</p><p className="text-[11px] text-slate-400">Starting price / project</p></div><div className="text-right"><p className="text-xs font-semibold">{creator.projects||0} projects</p><p className="mt-1 text-[11px] text-emerald-600">{creator.availability||'Available'}</p></div></div><div className="mt-4 grid grid-cols-[1fr_42px] gap-2"><Button disabled={isInvited} onClick={()=>handleInvite(creator)} className={isInvited?'bg-emerald-50 text-emerald-700 hover:bg-emerald-50':'bg-violet-600 text-white hover:bg-violet-700'}>{isInvited?<><Check size={14}/> Invitation sent</>:<>Invite to project <ArrowUpRight size={14}/></>}</Button><button onClick={()=>showNotice(`${creator.name||'Creator'} profile preview selected.`)} aria-label={`View ${creator.name||'creator'} profile`} className="flex items-center justify-center rounded-xl border text-slate-500 hover:border-violet-300 hover:text-violet-700"><ArrowUpRight size={16}/></button></div><button onClick={()=>toggleSaved(creator)} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${isSaved?'border-pink-200 bg-pink-50 text-pink-700':'text-slate-600 hover:bg-slate-50'}`}><Bookmark size={14} fill={isSaved?'currentColor':'none'}/>{isSaved?'Remove saved creator':'Save creator'}</button></div></motion.article>})}</div>}
      </section>
      <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t py-5 text-xs text-slate-400"><span>© 2026 Linkfluence · Where AI creativity meets opportunity.</span><span>{creatorSource==='database'?'Creator records · Database':'Demo data · Not live profiles'}</span></footer>
    </main>
    {notice && <div role="status" className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-start gap-3 rounded-xl border border-violet-100 bg-white p-4 text-sm shadow-xl"><Sparkles size={17} className="mt-0.5 shrink-0 text-violet-600"/><p className="flex-1">{notice}</p><button onClick={()=>setNotice('')} aria-label="Dismiss notice"><X size={16}/></button></div>}
  </div>
}

export default App
