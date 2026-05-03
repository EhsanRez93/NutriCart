import { useState, useEffect, useRef } from 'react'

// Parse "8 min", "1h 30m", "3 minutes" → seconds
export function parseDuration(str) {
  if (!str) return null
  let total = 0
  const h = str.match(/(\d+)\s*h/i)
  const m = str.match(/(\d+)\s*m(?!s)/i)
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

// ── StepTimer ─────────────────────────────────────────────────────────────
// storageKey   — unique localStorage key (e.g. "nc_timer_Spaghetti_step_2")
// defaultSeconds — duration parsed from the step; null = user sets manually
// stepTitle    — used in the notification body
export default function StepTimer({ storageKey, defaultSeconds, stepTitle }) {
  const [endTime,   setEndTime]   = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [running,   setRunning]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [open,      setOpen]      = useState(false)
  const intervalRef = useRef(null)

  // Restore running timer from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return
    const end = parseInt(saved)
    const rem = Math.ceil((end - Date.now()) / 1000)
    if (rem > 0) {
      setEndTime(end); setRemaining(rem); setRunning(true); setOpen(true)
    } else {
      localStorage.removeItem(storageKey)
      setDone(true); setOpen(true)
      fireTimerAlert(stepTitle)
    }
  }, [])

  // Fire missed alert on tab refocus / screen unlock
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

  // Tick using absolute endTime — survives tab throttling
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
      {/* ⏱ icon at bottom-right — tap to open timer */}
      {!open && (
        <button
          onClick={startTimer}
          title={`Start timer${defaultSeconds ? ` (${fmt(defaultSeconds)})` : ''}`}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-orange-100 flex items-center justify-center text-gray-400 hover:text-orange-600 transition shadow-sm text-base">
          ⏱
        </button>
      )}

      {/* Inline countdown — shown once started */}
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
