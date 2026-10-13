
import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Flame,
  Heart,
  Image,
  LayoutGrid,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  Video,
  WandSparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const creators = [
  {
    id: 1,
    name: 'Aarav Mehta',
    handle: '@aaravcreates',
    role: 'AI Filmmaker',
    location: 'Mumbai, India',
    rate: 12000,
    rating: '4.9',
    projects: 28,
    match: 98,
    tags: ['AI Video', 'Cinematic', 'Storytelling'],
    initials: 'AM',
    color: 'from-orange-200 via-rose-200 to-purple-300',
    avatar: 'text-rose-950',
    symbol: '◈',
    availability: 'Available',
  },
  {
    id: 2,
    name: 'Priya Sharma',
    handle: '@priyadesigns',
    role: 'AI Visual Artist',
    location: 'Bengaluru, India',
    rate: 8500,
    rating: '5.0',
    projects: 41,
    match: 96,
    tags: ['Product Ads', 'Midjourney', 'Branding'],
    initials: 'PS',
    color: 'from-violet-200 via-fuchsia-200 to-orange-100',
    avatar: 'text-violet-950',
    symbol: '✳',
    availability: 'Available',
  },
  {
    id: 3,
    name: 'Kabir Khan',
    handle: '@kabir.motion',
    role: 'Motion Designer',
    location: 'Hyderabad, India',
    rate: 15000,
    rating: '4.8',
    projects: 19,
    match: 94,
    tags: ['Motion Design', '3D', 'AI Video'],
    initials: 'KK',
    color: 'from-cyan-200 via-blue-200 to-indigo-300',
    avatar: 'text-blue-950',
    symbol: '✺',
    availability: 'Busy this week',
  },
  {
    id: 4,
    name: 'Ananya Rao',
    handle: '@ananya.visuals',
    role: 'Content Creator',
    location: 'Pune, India',
    rate: 6500,
    rating: '4.9',
    projects: 35,
    match: 91,
    tags: ['Social Ads', 'Lifestyle', 'Reels'],
    initials: 'AR',
    color: 'from-lime-200 via-emerald-200 to-teal-300',
    avatar: 'text-emerald-950',
    symbol: '✦',
    availability: 'Available',
  },
  {
    id: 5,
    name: 'Rohan Kapoor',
    handle: '@rohanai.lab',
    role: 'AI Creative Director',
    location: 'Delhi, India',
    rate: 18000,
    rating: '5.0',
    projects: 52,
    match: 89,
    tags: ['Campaigns', 'Art Direction', 'GenAI'],
    initials: 'RK',
    color: 'from-amber-200 via-orange-200 to-red-200',
    avatar: 'text-orange-950',
    symbol: '✧',
    availability: 'Available',
  },
  {
    id: 6,
    name: 'Meera Iyer',
    handle: '@meeramakes',
    role: 'AI Content Designer',
    location: 'Chennai, India',
    rate: 9500,
    rating: '4.9',
    projects: 24,
    match: 87,
    tags: ['Social Content', 'Adobe Firefly', 'Design'],
    initials: 'MI',
    color: 'from-pink-200 via-purple-200 to-indigo-200',
    avatar: 'text-purple-950',
    symbol: '❋',
    availability: 'Available',
  },
]

const categories = ['All creators', 'AI Video', 'AI Images', 'Social Ads', 'Motion Design']

const navItems = [
  { label: 'Discover', icon: Compass },
  { label: 'My campaigns', icon: LayoutGrid },
  { label: 'Messages', icon: MessageCircle },
  { label: 'My network', icon: Users },
]

const formatRate = (rate) => `₹${rate.toLocaleString('en-IN')}`

function App() {
  const [activeNav, setActiveNav] = useState('Discover')
  const [activeCategory, setActiveCategory] = useState('All creators')
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState([])
  const [invited, setInvited] = useState([])
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [sortBy, setSortBy] = useState('match')
  const [showFilters, setShowFilters] = useState(false)
  const [notice, setNotice] = useState('')

  const filteredCreators = useMemo(() => {
    const query = search.trim().toLowerCase()

    let results = creators.filter((creator) => {
      const searchable = [
        creator.name,
        creator.role,
        creator.location,
        ...creator.tags,
      ].join(' ').toLowerCase()

      const matchesSearch = !query || searchable.includes(query)

      const matchesCategory =
        activeCategory === 'All creators' ||
        (activeCategory === 'AI Images' &&
          creator.tags.some((tag) =>
            ['Midjourney', 'Branding', 'Design'].includes(tag),
          )) ||
        creator.tags.some((tag) =>
          tag.toLowerCase().includes(
            activeCategory === 'AI Video' ? 'ai video' :
            activeCategory === 'Social Ads' ? 'social ads' :
            activeCategory === 'Motion Design' ? 'motion design' :
            activeCategory.toLowerCase(),
          ),
        )

      const matchesSaved = !showSavedOnly || saved.includes(creator.id)

      return matchesSearch && matchesCategory && matchesSaved
    })

    results = [...results].sort((a, b) =>
      sortBy === 'price' ? a.rate - b.rate :
      sortBy === 'rating' ? Number(b.rating) - Number(a.rating) :
      b.match - a.match,
    )

    return results
  }, [search, activeCategory, saved, showSavedOnly, sortBy])

  const toggleSaved = (id) => {
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const handleInvite = (creator) => {
    if (invited.includes(creator.id)) return

    setInvited((current) => [...current, creator.id])
    setNotice(`Demo invitation prepared for ${creator.name}.`)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const changeNav = (label) => {
    setActiveNav(label)
    if (label !== 'Discover') {
      setNotice(`${label} preview — connect your account to use this workspace.`)
      window.setTimeout(() => setNotice(''), 3000)
    } else {
      setNotice('')
    }
  }

  return (
    <div className="app-shell min-h-screen bg-[#faf9f7] text-[#24232b]">
      <header className="sticky top-0 z-30 border-b border-[#ece9e5] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-360 items-center justify-between gap-4 px-5 md:px-9">
          <button
            className="flex shrink-0 items-center gap-2.5"
            onClick={() => changeNav('Discover')}
            aria-label="Linkfluence home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6745e8] text-white">
              <WandSparkles size={21} />
            </span>
            <span className="text-[21px] font-bold tracking-[-1px]">
              linkfluence<span className="text-[#7657ed]">.</span>
            </span>
          </button>

          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => changeNav(label)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition ${
                  activeNav === label
                    ? 'bg-[#f0ecff] text-[#6745e8]'
                    : 'text-[#77747e] hover:bg-[#f7f5f3] hover:text-[#25232b]'
                }`}
              >
                <Icon size={16} />
                {label}
                {label === 'Messages' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8a6cf4]" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#77747e] hover:bg-[#f5f3f1]"
              aria-label="Notifications"
              onClick={() => {
                setNotice('You’re all caught up on notifications.')
                window.setTimeout(() => setNotice(''), 3000)
              }}
            >
              <Bell size={19} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#f17d68]" />
            </button>
            <div className="hidden h-8 w-px bg-[#ece9e5] sm:block" />
            <button
              className="flex items-center gap-2.5 rounded-full text-left"
              onClick={() => {
                setNotice('Demo account: Brand workspace')
                window.setTimeout(() => setNotice(''), 3000)
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eee8ff] text-sm font-semibold text-[#6745e8]">
                BL
              </span>
              <span className="hidden sm:block">
                <span className="block text-[12px] font-semibold">Brand Studio</span>
                <span className="block text-[11px] text-[#8a8790]">Brand account</span>
              </span>
              <ChevronDown size={15} className="hidden text-[#8a8790] sm:block" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-360">
        <aside className="sticky top-18 hidden h-[calc(100vh-72px)] w-56.5 shrink-0 flex-col border-r border-[#ece9e5] bg-white px-5 py-7 lg:flex">
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.7px] text-[#a09ca5]">
            Workspace
          </div>

          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => changeNav(label)}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition ${
                activeNav === label
                  ? 'bg-[#f0ecff] font-semibold text-[#6745e8]'
                  : 'text-[#74717c] hover:bg-[#f8f7f5]'
              }`}
            >
              <Icon size={18} />
              {label}
              {label === 'Messages' && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f3e8ff] px-1 text-[10px] font-semibold text-[#6745e8]">
                  2
                </span>
              )}
            </button>
          ))}

          <div className="my-6 border-t border-[#f0eeeb]" />

          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.7px] text-[#a09ca5]">
            Discovery
          </div>
          <button
            onClick={() => {
              setShowSavedOnly(false)
              setActiveCategory('All creators')
              setActiveNav('Discover')
            }}
            className="mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] text-[#74717c] hover:bg-[#f8f7f5]"
          >
            <Flame size={18} /> Trending creators
          </button>
          <button
            onClick={() => {
              setShowSavedOnly(true)
              setActiveNav('Discover')
            }}
            className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition ${
              showSavedOnly
                ? 'bg-[#f0ecff] font-semibold text-[#6745e8]'
                : 'text-[#74717c] hover:bg-[#f8f7f5]'
            }`}
          >
            <Bookmark size={18} /> Saved creators
            <span className="ml-auto text-[11px] text-[#96919e]">{saved.length}</span>
          </button>

          <div className="mt-auto rounded-2xl bg-[#f5f1ff] p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#7657ed] shadow-sm">
              <Sparkles size={19} />
            </div>
            <p className="text-[13px] font-semibold">Better matches, faster.</p>
            <p className="mt-1.5 text-[11px] leading-5 text-[#777083]">
              Find creative talent that fits your next campaign.
            </p>
            <button
              onClick={() => {
                setSearch('')
                setActiveCategory('All creators')
                setShowSavedOnly(false)
                setActiveNav('Discover')
              }}
              className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[#6745e8]"
            >
              Explore creators <ArrowRight size={13} />
            </button>
          </div>

          <button
            onClick={() => {
              setNotice('Settings preview coming soon.')
              window.setTimeout(() => setNotice(''), 3000)
            }}
            className="mt-5 flex items-center gap-3 px-3 py-2 text-left text-[12px] text-[#8a8790]"
          >
            <Settings2 size={17} /> Settings
            <CircleHelp size={15} className="ml-auto" />
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-7 md:px-9 md:py-9">
          <div className="mx-auto max-w-280">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12px] text-[#99949e]">
                <span>Workspace</span>
                <span>/</span>
                <span className="font-medium text-[#514d59]">{activeNav}</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#eae6e1] bg-white px-3 py-1.5 text-[11px] text-[#77717f]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#48b58b]" />
                Demo workspace
              </div>
            </div>

            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="relative mb-8 overflow-hidden rounded-[25px] bg-[#211b38] px-6 py-8 text-white sm:px-9 sm:py-10"
            >
              <div className="pointer-events-none absolute -right-12 -top-32 h-80 w-80 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -right-1 top-0 h-60 w-60 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute right-28 top-12 h-28 w-28 rounded-full bg-[#7854ec]/30 blur-3xl" />

              <div className="relative max-w-162.5">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] font-medium tracking-wide text-[#d9cffd]">
                  <Sparkles size={13} /> YOUR CREATIVE PARTNER, POWERED BY AI
                </div>
                <h1 className="max-w-150 text-[32px] font-semibold leading-[1.13] tracking-[-1.5px] sm:text-[43px]">
                  Find your next
                  <br />
                  <span className="text-[#bca8ff]">creative obsession.</span>
                </h1>
                <p className="mt-4 max-w-115 text-[13px] leading-6 text-[#c8c1d8] sm:text-[14px]">
                  Meet the AI creators turning bold ideas into scroll-stopping content.
                  Your next great collaboration starts here.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={() => document.getElementById('creator-directory')?.scrollIntoView({ behavior: 'smooth' })}
                    className="h-11 rounded-xl bg-[#8b6cf3] px-5 text-[12px] font-semibold text-white hover:bg-[#7958e8]"
                  >
                    Explore creators <ArrowUpRight size={15} />
                  </Button>
                  <button
                    onClick={() => {
                      setNotice('Campaign creation will be connected to the backend next.')
                      window.setTimeout(() => setNotice(''), 3000)
                    }}
                    className="flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-[12px] font-medium text-white hover:bg-white/10"
                  >
                    <Plus size={16} /> Create a campaign
                  </button>
                </div>
              </div>

              <div className="relative mt-8 grid max-w-142.5 grid-cols-3 gap-4 border-t border-white/15 pt-5 sm:absolute sm:bottom-8 sm:right-8 sm:mt-0 sm:w-75 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
                <div>
                  <p className="text-[24px] font-semibold tracking-tight">2.4k<span className="text-[#bca8ff]">+</span></p>
                  <p className="mt-1 text-[10px] text-[#c8c1d8]">AI creators</p>
                </div>
                <div>
                  <p className="text-[24px] font-semibold tracking-tight">94<span className="text-[#bca8ff]">%</span></p>
                  <p className="mt-1 text-[10px] text-[#c8c1d8]">Match accuracy*</p>
                </div>
                <div>
                  <p className="text-[24px] font-semibold tracking-tight">1.8k</p>
                  <p className="mt-1 text-[10px] text-[#c8c1d8]">Projects*</p>
                </div>
              </div>
            </motion.section>

            <section className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl border border-[#eeeae5] bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0ebff] text-[#7657ed]">
                  <WandSparkles size={19} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold">AI-powered matching</p>
                  <p className="mt-1 text-[10px] text-[#8b8791]">Discover relevant talent</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-[#eeeae5] bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f7ef] text-[#26996c]">
                  <Video size={19} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold">Portfolio-first profiles</p>
                  <p className="mt-1 text-[10px] text-[#8b8791]">See the work, not just words</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-[#eeeae5] bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0e8] text-[#dc8552]">
                  <Heart size={19} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold">Made for collaboration</p>
                  <p className="mt-1 text-[10px] text-[#8b8791]">From brief to delivery</p>
                </div>
              </div>
            </section>

            <section id="creator-directory" className="scroll-mt-24">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.6px] text-[#8a6cf4]">
                    <Sparkles size={13} /> CURATED FOR YOUR NEXT BIG IDEA
                  </div>
                  <h2 className="text-[25px] font-semibold tracking-[-0.9px] sm:text-[29px]">
                    Discover creators
                  </h2>
                  <p className="mt-2 text-[12px] text-[#88838e]">
                    Explore talent, save your favourites, and start a collaboration.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSearch('')
                    setActiveCategory('All creators')
                    setShowSavedOnly(false)
                    setSortBy('match')
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-[#7660c9] hover:text-[#5034c6]"
                >
                  Reset discovery <ArrowDownUp size={13} />
                </button>
              </div>

              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-[#e9e5e0] bg-white px-4 focus-within:border-[#a994fa] focus-within:ring-2 focus-within:ring-[#8b6cf3]/10">
                  <Search size={18} className="shrink-0 text-[#9b96a1]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search creators, skills, or AI tools..."
                    className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#aaa5af]"
                    aria-label="Search creators"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} aria-label="Clear search">
                      <X size={15} className="text-[#96919e]" />
                    </button>
                  )}
                  <kbd className="hidden rounded-md border border-[#eeeae6] bg-[#faf9f7] px-2 py-1 text-[10px] text-[#aaa5af] md:inline">
                    Search
                  </kbd>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1 sm:flex-none">
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value)}
                      className="h-12 w-full appearance-none rounded-xl border border-[#e9e5e0] bg-white pl-4 pr-9 text-[12px] text-[#55515d] outline-none focus:border-[#a994fa] sm:w-41.25"
                      aria-label="Sort creators"
                    >
                      <option value="match">Best match</option>
                      <option value="rating">Highest rated</option>
                      <option value="price">Lowest price</option>
                    </select>
                    <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#96919e]" />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className={`h-12 gap-2 rounded-xl border-[#e9e5e0] bg-white px-4 text-[12px] ${showFilters ? 'border-[#a994fa] text-[#6745e8]' : 'text-[#55515d]'}`}
                  >
                    <Settings2 size={16} /> Filters
                  </Button>
                </div>
              </div>

              {showFilters && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#e9e5e0] bg-white p-4">
                  <span className="text-[11px] font-semibold text-[#6d6875]">Quick filters</span>
                  <button
                    onClick={() => setShowSavedOnly(!showSavedOnly)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] ${showSavedOnly ? 'border-[#8b6cf3] bg-[#f0ecff] text-[#6745e8]' : 'border-[#e9e5e0] text-[#77717f]'}`}
                  >
                    Saved only
                  </button>
                  <button
                    onClick={() => setSortBy('rating')}
                    className="rounded-full border border-[#e9e5e0] px-3 py-1.5 text-[11px] text-[#77717f] hover:bg-[#f8f7f5]"
                  >
                    Top rated
                  </button>
                  <button
                    onClick={() => {
                      setSearch('AI')
                      setShowSavedOnly(false)
                    }}
                    className="rounded-full border border-[#e9e5e0] px-3 py-1.5 text-[11px] text-[#77717f] hover:bg-[#f8f7f5]"
                  >
                    AI specialists
                  </button>
                </div>
              )}

              <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setActiveCategory(category)
                      setShowSavedOnly(false)
                    }}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-[11px] font-medium transition ${
                      activeCategory === category
                        ? 'bg-[#6745e8] text-white shadow-sm shadow-[#6745e8]/20'
                        : 'border border-[#e9e5e0] bg-white text-[#797580] hover:border-[#cfc4fa] hover:text-[#6745e8]'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="mb-4 flex items-center justify-between">
                <p className="text-[11px] text-[#918c97]">
                  Showing <span className="font-semibold text-[#514d59]">{filteredCreators.length}</span> creators
                  {showSavedOnly ? ' · Saved list' : ''}
                </p>
                <span className="flex items-center gap-1 text-[10px] text-[#8a8790]">
                  <Sparkles size={12} className="text-[#8b6cf3]" /> AI match scores
                </span>
              </div>

              {filteredCreators.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#ddd6ef] bg-white px-5 py-14 text-center">
                  <Search size={25} className="mx-auto mb-3 text-[#a99adf]" />
                  <p className="text-[14px] font-semibold">No creators found</p>
                  <p className="mt-2 text-[12px] text-[#8b8791]">Try another search or change your filters.</p>
                  <Button
                    variant="outline"
                    className="mt-4 rounded-xl"
                    onClick={() => {
                      setSearch('')
                      setActiveCategory('All creators')
                      setShowSavedOnly(false)
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredCreators.map((creator, index) => (
                    <motion.article
                      key={creator.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.045 }}
                      className="group overflow-hidden rounded-[19px] border border-[#eae6e1] bg-white transition duration-200 hover:-translate-y-1 hover:border-[#d8cef8] hover:shadow-[0_14px_40px_rgba(42,30,78,0.07)]"
                    >
                      <div className={`relative flex h-31.5 items-center justify-center overflow-hidden bg-linear-to-br ${creator.color}`}>
                        <div className="absolute -left-5 -top-10 h-36 w-36 rounded-full border border-white/40" />
                        <div className="absolute -bottom-16 -right-4 h-44 w-44 rounded-full border border-white/40" />
                        <span className={`relative flex h-18.5 w-18.5 items-center justify-center rounded-[24px] border border-white/70 bg-white/45 text-[34px] shadow-lg backdrop-blur-sm ${creator.avatar}`}>
                          {creator.symbol}
                        </span>
                        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[9px] font-semibold text-[#554d68] backdrop-blur">
                          <Sparkles size={11} className="text-[#7959e9]" />
                          {creator.match}% match
                        </div>
                        <button
                          onClick={() => toggleSaved(creator.id)}
                          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/80 backdrop-blur transition hover:scale-105 ${
                            saved.includes(creator.id) ? 'text-[#e15d83]' : 'text-[#77717f]'
                          }`}
                          aria-label={saved.includes(creator.id) ? 'Remove saved creator' : 'Save creator'}
                        >
                          <Bookmark size={15} fill={saved.includes(creator.id) ? 'currentColor' : 'none'} />
                        </button>
                      </div>

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-[14px] font-semibold tracking-[-0.3px]">{creator.name}</h3>
                            <p className="mt-1 truncate text-[10px] text-[#96919e]">{creator.handle}</p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[#f6f4f1] px-2 py-1 text-[10px] font-medium text-[#625d68]">
                            <span className="text-[#e7a640]">★</span> {creator.rating}
                          </span>
                        </div>

                        <p className="mt-3 text-[12px] font-medium text-[#514b60]">{creator.role}</p>
                        <p className="mt-1 text-[10px] text-[#9a95a0]">{creator.location}</p>

                        <div className="mt-4 flex min-h-12.25 flex-wrap content-start gap-1.5">
                          {creator.tags.map((tag) => (
                            <span key={tag} className="rounded-md bg-[#f6f4f9] px-2 py-1.5 text-[9px] text-[#716a7e]">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-[#f0eeeb] pt-3.5">
                          <div>
                            <p className="text-[15px] font-semibold tracking-[-0.4px]">{formatRate(creator.rate)}</p>
                            <p className="mt-0.5 text-[9px] text-[#9a95a0]">Starting price / project</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-semibold text-[#514d59]">{creator.projects} projects</p>
                            <p className={`mt-1 text-[9px] ${creator.availability === 'Available' ? 'text-[#26996c]' : 'text-[#c38a40]'}`}>
                              {creator.availability}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-[1fr_44px] gap-2">
                          <Button
                            onClick={() => handleInvite(creator)}
                            disabled={invited.includes(creator.id)}
                            className={`h-10 rounded-xl text-[11px] font-semibold ${
                              invited.includes(creator.id)
                                ? 'bg-[#e7f7ee] text-[#23875f] hover:bg-[#e7f7ee]'
                                : 'bg-[#6745e8] text-white hover:bg-[#5534d1]'
                            }`}
                          >
                            {invited.includes(creator.id) ? (
                              <><Check size={14} /> Invitation prepared</>
                            ) : (
                              <>Invite to project <ArrowUpRight size={14} /></>
                            )}
                          </Button>
                          <button
                            onClick={() => {
                              setNotice(`${creator.name} profile preview selected.`)
                              window.setTimeout(() => setNotice(''), 3000)
                            }}
                            className="flex h-10 items-center justify-center rounded-xl border border-[#eae6e1] text-[#77717f] transition hover:border-[#cfc4fa] hover:text-[#6745e8]"
                            aria-label={`View ${creator.name} profile`}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              )}

              <div className="mt-7 flex flex-col items-center justify-between gap-3 rounded-2xl border border-[#eae6e1] bg-white p-5 sm:flex-row">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0ecff] text-[#7657ed]">
                    <Image size={19} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold">Have a specific creative brief?</p>
                    <p className="mt-1 text-[10px] text-[#8b8791]">Let AI help you discover the right creators.</p>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setNotice('Brief creation will be connected to Flask and MongoDB next.')
                    window.setTimeout(() => setNotice(''), 3000)
                  }}
                  variant="outline"
                  className="h-10 w-full gap-2 rounded-xl border-[#e5defc] text-[11px] text-[#6745e8] hover:bg-[#f7f4ff] sm:w-auto"
                >
                  <Plus size={15} /> Create a brief
                </Button>
              </div>
            </section>

            <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#eae6e1] py-5 text-[10px] text-[#a09ba5]">
              <p>© 2026 Linkfluence · Where AI creativity meets opportunity.</p>
              <div className="flex items-center gap-4">
                <span>Built for creators</span>
                <span>Demo data · Not live profiles</span>
              </div>
            </footer>
          </div>
        </main>
      </div>

      <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-32px)] max-w-110 -translate-x-1/2">
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-xl border border-[#e7e0fa] bg-white px-4 py-3.5 text-[12px] shadow-[0_12px_40px_rgba(30,20,60,0.14)]"
          >
            <span className="mt-0.5 text-[#6745e8]"><Sparkles size={16} /></span>
            <p className="flex-1 leading-5 text-[#5b5665]">{notice}</p>
            <button onClick={() => setNotice('')} aria-label="Dismiss notification">
              <X size={15} className="text-[#96919e]" />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default App
