import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// ── Simple SVG Line Chart ─────────────────────
function WeightChart({ logs, targetWeight, startWeight }) {
  if (logs.length === 0) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
      No weight logs yet — add your first entry below
    </div>
  )

  const W = 600, H = 200, PAD = 40
  const weights  = logs.map(l => l.weight)
  const allW     = [...weights, parseFloat(targetWeight), parseFloat(startWeight)]
  const minW     = Math.min(...allW) - 1
  const maxW     = Math.max(...allW) + 1
  const range    = maxW - minW

  function xPos(i) { return PAD + (i / Math.max(logs.length - 1, 1)) * (W - PAD * 2) }
  function yPos(w) { return H - PAD - ((w - minW) / range) * (H - PAD * 2) }

  // Build path for actual weight
  const path = logs.map((l, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i)} ${yPos(l.weight)}`).join(' ')

  // Target line (horizontal)
  const targetY = yPos(parseFloat(targetWeight))

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = PAD + p * (H - PAD * 2)
          const w = (maxW - p * range).toFixed(1)
          return (
            <g key={i}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f3f4f6" strokeWidth="1" />
              <text x={PAD - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{w}</text>
            </g>
          )
        })}

        {/* Target weight line */}
        <line x1={PAD} y1={targetY} x2={W - PAD} y2={targetY} stroke="#16a34a" strokeWidth="1.5" strokeDasharray="6,4" />
        <text x={W - PAD + 5} y={targetY + 4} fontSize="10" fill="#16a34a" fontWeight="bold">Target</text>

        {/* Actual weight path */}
        <path d={path} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Area fill */}
        <path
          d={`${path} L ${xPos(logs.length - 1)} ${H - PAD} L ${xPos(0)} ${H - PAD} Z`}
          fill="url(#grad)" opacity="0.15"
        />

        {/* Gradient */}
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Data points */}
        {logs.map((l, i) => (
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(l.weight)} r="4" fill="#4f46e5" />
            <text x={xPos(i)} y={yPos(l.weight) - 8} textAnchor="middle" fontSize="9" fill="#4f46e5" fontWeight="bold">
              {l.weight}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {logs.map((l, i) => {
          if (logs.length > 7 && i % 2 !== 0) return null
          return (
            <text key={i} x={xPos(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="#9ca3af">
              {new Date(l.log_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Energy Level Picker ───────────────────────
function EnergyPicker({ value, onChange }) {
  const levels = [
    { level: 1, emoji: '😴', label: 'Very Low' },
    { level: 2, emoji: '😔', label: 'Low' },
    { level: 3, emoji: '😐', label: 'Okay' },
    { level: 4, emoji: '😊', label: 'Good' },
    { level: 5, emoji: '⚡', label: 'High' },
  ]
  return (
    <div className="flex gap-2">
      {levels.map(l => (
        <button key={l.level} onClick={() => onChange(l.level)}
          className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 transition
            ${value === l.level ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
          <span className="text-xl">{l.emoji}</span>
          <span className="text-xs text-gray-500 mt-0.5">{l.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────
export default function ProgressTracker({ profile, userId }) {
  const [logs, setLogs]           = useState([])
  const [weight, setWeight]       = useState('')
  const [energy, setEnergy]       = useState(3)
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saved, setSaved]         = useState(false)

  const startWeight  = parseFloat(profile.currentWeight)
  const targetWeight = parseFloat(profile.targetWeight)
  const isGaining    = targetWeight > startWeight

  useEffect(() => {
    if (!userId) return
    loadLogs()
  }, [userId])

  async function loadLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: true })
    if (data) setLogs(data)
    setLoading(false)
  }

  async function handleSave() {
    if (!weight || !userId) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]

    // Upsert — one entry per day
    const { error } = await supabase.from('weight_logs').upsert({
      user_id:      userId,
      log_date:     today,
      weight:       parseFloat(weight),
      energy_level: energy,
      notes:        notes || null,
    }, { onConflict: 'user_id,log_date' })

    if (!error) {
      await loadLogs()
      setWeight('')
      setNotes('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  // ── Stats calculations ──
  const latestWeight  = logs.length > 0 ? logs[logs.length - 1].weight : startWeight
  const firstWeight   = logs.length > 0 ? logs[0].weight : startWeight
  const totalChange   = (latestWeight - firstWeight).toFixed(1)
  const totalNeeded   = Math.abs(targetWeight - startWeight)
  const totalAchieved = Math.min(Math.abs(latestWeight - startWeight), totalNeeded)
  const progressPct   = Math.round((totalAchieved / totalNeeded) * 100)
  const remaining     = Math.abs(targetWeight - latestWeight).toFixed(1)
  const weeksLogged   = logs.length
  const avgEnergy     = logs.length > 0
    ? (logs.reduce((s, l) => s + (l.energy_level || 3), 0) / logs.length).toFixed(1)
    : '—'

  // Streak: consecutive days with a log
  function calcStreak() {
    if (logs.length === 0) return 0
    let streak = 1
    const today = new Date(); today.setHours(0,0,0,0)
    const sorted = [...logs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date))
    const lastLog = new Date(sorted[0].log_date); lastLog.setHours(0,0,0,0)
    const daysSinceLast = Math.floor((today - lastLog) / 86400000)
    if (daysSinceLast > 1) return 0
    for (let i = 1; i < sorted.length; i++) {
      const curr = new Date(sorted[i].log_date)
      const prev = new Date(sorted[i - 1].log_date)
      const diff = Math.floor((prev - curr) / 86400000)
      if (diff === 1) streak++; else break
    }
    return streak
  }

  const streak = calcStreak()

  // Check if already logged today
  const todayStr    = new Date().toISOString().split('T')[0]
  const loggedToday = logs.some(l => l.log_date === todayStr)

  const energyEmojis = { 1: '😴', 2: '😔', 3: '😐', 4: '😊', 5: '⚡' }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-gray-800">📈 Progress Tracker</h2>
        <p className="text-gray-500 text-sm mt-1">Track your weight and energy daily</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Current Weight', value: `${latestWeight}kg`, sub: `Started: ${startWeight}kg`, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Progress',       value: `${progressPct}%`,  sub: `${totalAchieved}kg of ${totalNeeded}kg`, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Remaining',      value: `${remaining}kg`,   sub: `to reach ${targetWeight}kg`, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Streak',         value: `${streak} days`,   sub: 'consecutive logs', color: 'text-orange-700', bg: 'bg-orange-50' },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} rounded-2xl p-4`}>
            <p className="text-xs text-gray-500 font-semibold mb-1">{s.label}</p>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Progress bar toward goal */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-800">🎯 Goal Progress</h3>
          <span className="text-sm font-bold text-green-700">{progressPct}% complete</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-4 mb-2">
          <div className="h-4 rounded-full transition-all duration-700 bg-gradient-to-r from-green-500 to-emerald-400"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Start: {startWeight}kg</span>
          <span className={`font-bold ${parseFloat(totalChange) > 0 ? 'text-green-600' : parseFloat(totalChange) < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
            {parseFloat(totalChange) > 0 ? '+' : ''}{totalChange}kg total change
          </span>
          <span>Target: {targetWeight}kg</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">📊 Weight History</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-600 inline-block rounded"></span> Actual</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-600 inline-block rounded border-dashed border border-green-600"></span> Target</span>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
        ) : (
          <WeightChart logs={logs} targetWeight={targetWeight} startWeight={startWeight} />
        )}
      </div>

      {/* Log entry */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">
            {loggedToday ? '✅ Today\'s Log' : '➕ Log Today\'s Weight'}
          </h3>
          {loggedToday && <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">Already logged today</span>}
        </div>

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-green-700 text-sm font-semibold">
            ✅ Weight logged successfully!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Today's Weight (kg)</label>
            <input
              type="number" step="0.1" placeholder={`e.g. ${latestWeight}`}
              value={weight} onChange={e => setWeight(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none" />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Energy Level Today</label>
            <EnergyPicker value={energy} onChange={setEnergy} />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Notes (optional)</label>
            <input
              type="text" placeholder="e.g. felt great after workout, slept well..."
              value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none" />
          </div>

          <button onClick={handleSave} disabled={!weight || saving}
            className="w-full bg-green-600 text-white font-bold py-3 rounded-full hover:bg-green-700 transition disabled:opacity-50">
            {saving ? '⏳ Saving...' : loggedToday ? '🔄 Update Today\'s Log' : '💾 Save Today\'s Weight'}
          </button>
        </div>
      </div>

      {/* Log history */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">📋 Log History</h3>
            <span className="text-xs text-gray-400">Avg energy: {avgEnergy} {energyEmojis[Math.round(parseFloat(avgEnergy))] || ''}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...logs].reverse().map((log, i) => {
              const prev = logs[logs.length - 2 - i]
              const diff = prev ? (log.weight - prev.weight).toFixed(1) : null
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{energyEmojis[log.energy_level] || '😐'}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        {new Date(log.log_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                      {log.notes && <p className="text-xs text-gray-400">{log.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-gray-800">{log.weight}kg</p>
                    {diff !== null && (
                      <p className={`text-xs font-bold ${parseFloat(diff) > 0 ? (isGaining ? 'text-green-600' : 'text-red-500') : parseFloat(diff) < 0 ? (isGaining ? 'text-red-500' : 'text-green-600') : 'text-gray-400'}`}>
                        {parseFloat(diff) > 0 ? '+' : ''}{diff}kg
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}