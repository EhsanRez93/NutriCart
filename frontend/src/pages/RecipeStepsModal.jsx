import { useState, useEffect, useRef } from 'react'

const API = 'https://nutricart-production-cd53.up.railway.app'

// Parse "8 min", "1h 30m", "3 minutes" → seconds
function parseDuration(str) {
  if (!str) return null
  let total = 0
  const h = str.match(/(\d+)\s*h/i)
  const m = str.match(/(\d+)\s*m(?!s)/i) // m but not ms
  const s = str.match(/(\d+)\s*s(?!ec|aute|auté)/i)
  if (h) total += parseInt(h[1]) * 3600
  if (m) total += parseInt(m[1]) * 60
  if (s) total += parseInt(s[1])
  return total > 0 ? total : null
}

function requestNotifPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function fireTimerAlert(title) {
  if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400])
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.35, 0.7].forEach(t => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.45, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3)
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.3)
    })
  } catch (_) {}
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('⏰ Timer done!', { body: `"${title}" is ready!`, icon: '/favicon.ico' })
  }
}

const DIFFICULTY_COLORS = {
  Easy:   { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300' },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  Hard:   { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300' },
}

// ── Step Timer ────────────────────────────────────────────────────────────
// Uses absolute endTime in localStorage so it survives tab switches & throttling.
// On page return, checks if timer already expired and fires alert immediately.
function StepTimer({ storageKey, defaultSeconds, stepTitle }) {
  const [endTime,   setEndTime]   = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [running,   setRunning]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [open,      setOpen]      = useState(false) // whether the inline timer is visible
  const intervalRef = useRef(null)

  // Restore any running timer from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return
    const end = parseInt(saved)
    const rem = Math.ceil((end - Date.now()) / 1000)
    if (rem > 0) {
      setEndTime(end); setRemaining(rem); setRunning(true); setOpen(true)
    } else {
      // Timer expired while we were away — fire alert now
      localStorage.removeItem(storageKey)
      setDone(true); setOpen(true)
      fireTimerAlert(stepTitle)
    }
  }, [])

  // Also check on page visibility change (tab refocus / screen unlock)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      const saved = localStorage.getItem(storageKey)
      if (!saved) return
      const end = parseInt(saved)
      const rem = Math.ceil((end - Date.now()) / 1000)
      if (rem <= 0) {
        clearInterval(intervalRef.current)
        localStorage.removeItem(storageKey)
        setRunning(false); setDone(true); setRemaining(0)
        fireTimerAlert(stepTitle)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [storageKey, stepTitle])

  // Tick using endTime difference — immune to throttling
  useEffect(() => {
    if (!running || !endTime) return
    intervalRef.current = setInterval(() => {
      const rem = Math.ceil((endTime - Date.now()) / 1000)
      if (rem <= 0) {
        clearInterval(intervalRef.current)
        setRunning(false); setDone(true); setRemaining(0)
        localStorage.removeItem(storageKey)
        fireTimerAlert(stepTitle)
      } else {
        setRemaining(rem)
      }
    }, 500)
    return () => clearInterval(intervalRef.current)
  }, [running, endTime])

  function startTimer() {
    requestNotifPermission()
    const secs = defaultSeconds || 300
    const end  = Date.now() + secs * 1000
    localStorage.setItem(storageKey, end.toString())
    setEndTime(end); setRemaining(secs); setRunning(true); setDone(false); setOpen(true)
  }

  function pause() {
    clearInterval(intervalRef.current)
    setRunning(false)
    localStorage.removeItem(storageKey)
  }

  function resume() {
    const end = Date.now() + remaining * 1000
    localStorage.setItem(storageKey, end.toString())
    setEndTime(end); setRunning(true)
  }

  function reset() {
    clearInterval(intervalRef.current)
    localStorage.removeItem(storageKey)
    setRunning(false); setDone(false); setRemaining(null); setEndTime(null); setOpen(false)
  }

  function fmt(s) {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      {/* Icon button at bottom-right — only shown when timer is not open */}
      {!open && (
        <button
          onClick={startTimer}
          title={`Start timer${defaultSeconds ? ` (${fmt(defaultSeconds)})` : ''}`}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-orange-100 flex items-center justify-center text-gray-400 hover:text-orange-600 transition shadow-sm text-base">
          ⏱
        </button>
      )}

      {/* Inline timer — shown when open */}
      {open && (
        <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold
          ${done
            ? 'bg-green-50 border-green-400 text-green-700'
            : 'bg-orange-50 border-orange-300 text-orange-700'}`}>
          {done ? (
            <>
              <span>✅ Done!</span>
              <button onClick={reset} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">Dismiss</button>
            </>
          ) : (
            <>
              <span className="font-mono text-sm tabular-nums">{fmt(remaining ?? defaultSeconds ?? 0)}</span>
              {running
                ? <button onClick={pause}  title="Pause"  className="hover:text-orange-900 text-base">⏸</button>
                : <button onClick={resume} title="Resume" className="hover:text-green-700 text-base">▶</button>
              }
              <button onClick={reset} title="Cancel" className="ml-auto hover:text-red-600">✕</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function RecipeStepsModal({ meal, userId, onClose }) {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [recipe, setRecipe]     = useState(null)
  const [activeStep, setActiveStep] = useState(0)
  const [checked, setChecked]   = useState({})

  useEffect(() => {
    fetchSteps()
  }, [])

  async function fetchSteps() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${API}/api/recipesteps`, {
        method:  'POST',
        headers: {
          'Content-Type':             'application/json',
          'x-posthog-distinct-id':    userId || 'anonymous',
        },
        body: JSON.stringify({ meal }),
      })
      if (!res.ok) {
        const statusText = res.status === 502 || res.status === 503
          ? 'Backend is warming up — please wait a moment and try again'
          : `Server error (${res.status}) — please try again`
        setError(statusText)
        return
      }
      const data = await res.json()
      if (data.success) {
        setRecipe(data)
      } else {
        setError(data.error || 'Failed to load recipe')
      }
    } catch (err) {
      const msg = err?.message || ''
      setError(msg.includes('fetch') ? 'Network error — check your connection and try again' : 'Could not load recipe steps — please try again')
    }
    setLoading(false)
  }

  function toggleStep(i) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
    if (i + 1 < (recipe?.steps?.length || 0)) setActiveStep(i + 1)
  }

  const diff    = DIFFICULTY_COLORS[recipe?.difficulty] || DIFFICULTY_COLORS.Easy
  const steps   = recipe?.steps || []
  const doneAll = steps.length > 0 && steps.every((_, i) => checked[i])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-2xl">{mealIcon(meal.meal)}</span>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{meal.meal}</span>
                {(meal.multiplier || 1) > 1 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-300">
                    {meal.multiplier}x portions
                  </span>
                )}
                {recipe && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${diff.bg} ${diff.text} ${diff.border}`}>
                    {recipe.difficulty}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-extrabold text-gray-800 leading-tight">{meal.name}</h2>
              {recipe && (
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>⏱ Total: <strong className="text-gray-700">{recipe.totalTime}</strong></span>
                  <span>🔪 Prep: <strong className="text-gray-700">{recipe.prepTime}</strong></span>
                  <span>🔥 Cook: <strong className="text-gray-700">{recipe.cookTime}</strong></span>
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none flex-shrink-0">×</button>
          </div>

          {/* Nutrition bar */}
          <div className="flex gap-3 mt-3 text-center">
            {[
              { label: 'Calories', value: meal.calories, unit: 'kcal', color: 'text-green-700' },
              { label: 'Protein',  value: meal.protein,  unit: 'g',    color: 'text-blue-700' },
              { label: 'Carbs',    value: meal.carbs,    unit: 'g',    color: 'text-yellow-700' },
              { label: 'Fats',     value: meal.fats,     unit: 'g',    color: 'text-orange-700' },
            ].map((n, i) => (
              <div key={i} className="flex-1 bg-gray-50 rounded-xl py-2">
                <p className={`text-base font-extrabold ${n.color}`}>{n.value}<span className="text-xs font-normal text-gray-400">{n.unit}</span></p>
                <p className="text-xs text-gray-400">{n.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-5xl mb-4 animate-bounce">👨‍🍳</div>
              <p className="font-bold text-gray-700 text-lg">Generating recipe steps...</p>
              <p className="text-gray-400 text-sm mt-1">AI chef is writing your guide</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-4xl mb-3">⚠️</p>
              <p className="font-bold text-gray-700 mb-1">Couldn't load recipe</p>
              <p className="text-gray-400 text-sm mb-4">{error}</p>
              <button onClick={fetchSteps} className="bg-green-600 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-green-700 transition">
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && recipe && (
            <>
              {/* Tip */}
              {recipe.tip && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5 flex gap-3">
                  <span className="text-xl flex-shrink-0">💡</span>
                  <p className="text-sm text-amber-800">{recipe.tip}</p>
                </div>
              )}

              {/* Steps */}
              <div className="space-y-3 mb-4">
                {steps.map((s, i) => {
                  const done    = !!checked[i]
                  const current = i === activeStep && !done
                  const stepSecs = parseDuration(s.duration)
                  return (
                    <div
                      key={i}
                      onClick={() => toggleStep(i)}
                      className={`relative rounded-2xl p-4 border-2 cursor-pointer transition-all select-none
                        ${done    ? 'border-green-300 bg-green-50 opacity-70' :
                          current ? 'border-green-500 bg-white shadow-md' :
                                    'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <div className="flex items-start gap-3">
                        {/* Step number / check */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition
                          ${done ? 'bg-green-500 text-white' : current ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {done ? '✓' : s.step}
                        </div>
                      <div className="flex-1 min-w-0 pr-8">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-base">{s.icon || '🍳'}</span>
                            <span className={`font-bold text-sm ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{s.title}</span>
                            <span className="ml-auto text-xs text-gray-400 flex-shrink-0">⏱ {s.duration}</span>
                          </div>
                          <p className={`text-sm leading-relaxed ${done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{s.instruction}</p>
                          {!done && (
                            <StepTimer
                              storageKey={`nc_timer_${meal.name}_step_${i}`}
                              defaultSeconds={stepSecs}
                              stepTitle={s.title}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Ingredients reminder */}
              {meal.items && meal.items.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">🛒 Ingredients</p>
                  <div className="flex flex-wrap gap-2">
                    {meal.items.map((item, i) => (
                      <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded-lg">{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Done state */}
              {doneAll && (
                <div className="bg-green-600 rounded-2xl p-5 text-center mb-4">
                  <p className="text-3xl mb-2">🎉</p>
                  <p className="text-white font-extrabold text-lg">Meal complete!</p>
                  <p className="text-green-100 text-sm mt-1">Don't forget to mark it as eaten in your plan</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
            <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl text-sm hover:bg-gray-50 transition">
              Close
            </button>
            {steps.length > 0 && !doneAll && (
              <button
                onClick={() => setChecked(Object.fromEntries(steps.map((_, i) => [i, true])))}
                className="flex-1 bg-green-600 text-white font-bold py-3 rounded-2xl text-sm hover:bg-green-700 transition">
                ✓ Mark All Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function mealIcon(n) {
  if (!n) return '🍽️'
  const l = n.toLowerCase()
  if (l === 'breakfast') return '🌅'
  if (l === 'lunch')     return '☀️'
  if (l === 'snack')     return '🍎'
  if (l === 'dinner')    return '🌙'
  return '🍽️'
}
