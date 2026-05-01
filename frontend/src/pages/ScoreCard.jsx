import { useState, useEffect } from 'react'

function calculateScores(profile, aiMealPlan, actualIntake) {
  const scores = []

  const proteinTarget = profile.protein || 140
  const actualProtein = actualIntake?.protein || 0
  const avgProtein = actualProtein > 0 ? actualProtein
    : aiMealPlan ? aiMealPlan.days.reduce((sum, day) => sum + (day.totalProtein || 0), 0) / 7
    : proteinTarget * 0.75
  const proteinPct = Math.min((avgProtein / proteinTarget) * 100, 100)
  scores.push({
    category: 'Protein Intake', icon: '💪',
    score: proteinPct, grade: getGrade(proteinPct),
    value: `${Math.round(avgProtein)}g ${actualProtein > 0 ? 'eaten today' : 'avg/day'}`,
    target: `Target: ${proteinTarget}g/day`,
    tip: proteinPct < 80 ? 'Add more chicken, eggs or Greek yogurt' : 'Great protein intake!',
    color: '#3b82f6', bg: '#dbeafe',
  })

  scores.push({
    category: 'Meal Variety', icon: '🌈',
    score: aiMealPlan ? 88 : 60, grade: getGrade(aiMealPlan ? 88 : 60),
    value: aiMealPlan ? '7 unique days' : 'Generate AI plan', target: 'No repeated meals',
    tip: aiMealPlan ? 'Excellent variety!' : 'Generate your AI meal plan for a varied week',
    color: '#8b5cf6', bg: '#ede9fe',
  })

  const symptoms    = Array.isArray(profile.symptoms) ? profile.symptoms : []
  const hasSymptoms = symptoms.filter(s => s !== 'None of these').length > 0
  scores.push({
    category: 'Symptom Targeting', icon: '🎯',
    score: hasSymptoms ? 85 : 95, grade: getGrade(hasSymptoms ? 85 : 95),
    value: hasSymptoms ? `${symptoms.length} flags addressed` : 'No issues flagged', target: 'All symptoms covered',
    tip: hasSymptoms ? 'Your plan targets your reported symptoms' : 'Standard optimal nutrition applied',
    color: '#10b981', bg: '#d1fae5',
  })

  const actualCalories = actualIntake?.calories || 0
  const calorieTarget  = profile.calories || 2000
  const calorieScore   = actualCalories > 0 ? Math.min((actualCalories / calorieTarget) * 100, 100) : aiMealPlan ? 91 : 70
  scores.push({
    category: 'Calorie Consistency', icon: '⚖️',
    score: calorieScore, grade: getGrade(calorieScore),
    value: actualCalories > 0 ? `${actualCalories} kcal eaten` : aiMealPlan ? `~${calorieTarget} kcal/day` : 'Log meals to track',
    target: `Target: ${calorieTarget} kcal`,
    tip: calorieScore >= 85 ? 'Calorie intake on target!' : 'Keep logging meals to hit your target',
    color: '#f59e0b', bg: '#fef3c7',
  })

  scores.push({
    category: 'Micronutrient Coverage', icon: '💊',
    score: 78, grade: getGrade(78),
    value: '4 of 5 priorities', target: 'Iron, B12, Vit D, Mg, Zn',
    tip: 'Add more salmon and leafy greens for better Vitamin D',
    color: '#ef4444', bg: '#fee2e2',
  })

  return scores
}

function getGrade(score) {
  if (score >= 90) return { letter: 'A', color: '#16a34a', bg: '#dcfce7' }
  if (score >= 80) return { letter: 'B', color: '#2563eb', bg: '#dbeafe' }
  if (score >= 70) return { letter: 'C', color: '#d97706', bg: '#fef3c7' }
  if (score >= 60) return { letter: 'D', color: '#dc2626', bg: '#fee2e2' }
  return { letter: 'F', color: '#7f1d1d', bg: '#fecaca' }
}

function getOverallGrade(scores) {
  const avg = scores.reduce((s, item) => s + item.score, 0) / scores.length
  return { avg: Math.round(avg), grade: getGrade(avg) }
}

function ScoreRing({ score, color, size = 80, stroke = 7 }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
    </svg>
  )
}

// ── Period activation logic ───────────────────
function getPeriodStatus(eatenMeals, startDate, period) {
  if (!startDate || !eatenMeals) return { active: false, reason: 'Generate a meal plan first' }

  const today    = new Date(); today.setHours(0,0,0,0)
  const start    = new Date(startDate); start.setHours(0,0,0,0)
  const daysPassed = Math.floor((today - start) / 86400000)

  // Count days with at least 1 logged meal
  const daysLogged = Object.keys(eatenMeals).filter(k => Object.keys(eatenMeals[k] || {}).length > 0).length

  if (period === 'daily') {
    // Active if user has logged at least 1 meal on today's plan day
    const todayPlanDay = Math.max(0, Math.min(daysPassed, 6))
    const hasLoggedToday = Object.keys(eatenMeals[`day-${todayPlanDay}`] || {}).length > 0
    return {
      active: hasLoggedToday,
      reason: hasLoggedToday ? null : 'Log at least 1 meal today in the Meal Plan tab'
    }
  }

  if (period === 'weekly') {
    // Active only when all 7 days of the plan week have passed (daysPassed >= 6)
    const weekComplete = daysPassed >= 6
    return {
      active: weekComplete,
      reason: weekComplete ? null : `${6 - daysPassed} day${6 - daysPassed !== 1 ? 's' : ''} remaining until your week is complete`
    }
  }

  if (period === 'monthly') {
    // Active only when 30 days have passed since plan start
    const monthComplete = daysPassed >= 30
    return {
      active: monthComplete,
      reason: monthComplete ? null : `${30 - daysPassed} day${30 - daysPassed !== 1 ? 's' : ''} remaining until your monthly report is ready`
    }
  }

  return { active: false, reason: '' }
}

export default function ScoreCard({ profile, aiMealPlan, actualIntake, eatenMeals = {}, skippedMeals = {}, startDate }) {
  const [animate, setAnimate]         = useState(false)
  const [activePeriod, setActivePeriod] = useState('daily')

  const scores  = calculateScores(profile, aiMealPlan, actualIntake)
  const overall = getOverallGrade(scores)

  const dailyStatus   = getPeriodStatus(eatenMeals, startDate, 'daily')
  const weeklyStatus  = getPeriodStatus(eatenMeals, startDate, 'weekly')
  const monthlyStatus = getPeriodStatus(eatenMeals, startDate, 'monthly')
  const statusMap     = { daily: dailyStatus, weekly: weeklyStatus, monthly: monthlyStatus }
  const currentStatus = statusMap[activePeriod]

  useEffect(() => { setTimeout(() => setAnimate(true), 100) }, [])

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-extrabold text-gray-800 mb-2">📊 Nutrition Score Card</h2>
        <p className="text-gray-500">Performance report for {profile.name}</p>
      </div>

      {/* Period Tabs */}
      <div className="flex gap-3 mb-6 justify-center">
        {[
          { id: 'daily',   label: '📆 Daily',   status: dailyStatus },
          { id: 'weekly',  label: '📅 Weekly',  status: weeklyStatus },
          { id: 'monthly', label: '🗓️ Monthly', status: monthlyStatus },
        ].map(p => (
          <button key={p.id}
            onClick={() => p.status.active && setActivePeriod(p.id)}
            className={`flex flex-col items-center px-5 py-3 rounded-2xl font-bold text-sm transition border-2
              ${activePeriod === p.id && p.status.active
                ? 'border-green-500 bg-green-50 text-green-700'
                : p.status.active
                  ? 'border-gray-200 text-gray-600 hover:border-green-300 cursor-pointer'
                  : 'border-gray-100 text-gray-300 cursor-not-allowed opacity-60'}`}>
            <span>{p.label}</span>
            {p.status.active
              ? <span className="text-xs text-green-500 mt-1">✅ Active</span>
              : <span className="text-xs text-gray-400 mt-1">🔒 Locked</span>}
          </button>
        ))}
      </div>

      {/* Locked */}
      {!currentStatus.active ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center mb-6">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-bold text-gray-600 mb-2">{activePeriod.charAt(0).toUpperCase() + activePeriod.slice(1)} Score Not Yet Available</p>
          <p className="text-gray-400 text-sm mb-4">{currentStatus.reason}</p>
          <div className="bg-white rounded-xl p-4 inline-block">
            <p className="text-xs text-gray-500">
              {activePeriod === 'daily'   && '📌 Go to Meal Plan → mark at least 1 meal as eaten today'}
              {activePeriod === 'weekly'  && '📌 Your weekly score unlocks after all 7 days of your plan have passed'}
              {activePeriod === 'monthly' && '📌 Your monthly score unlocks after 30 days from your plan start date'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Overall Score */}
          <div className="bg-white rounded-3xl shadow-lg p-8 mb-6">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 text-center">
              {activePeriod.charAt(0).toUpperCase() + activePeriod.slice(1)} Overall Score
            </p>
            <div className="flex items-center justify-center gap-8">
              <div className="relative">
                <ScoreRing score={overall.avg} color={overall.grade.color} size={160} stroke={12} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-extrabold" style={{ color: overall.grade.color }}>{overall.grade.letter}</span>
                  <span className="text-sm text-gray-400 font-semibold">{overall.avg}/100</span>
                </div>
              </div>
              <div className="text-left">
                <h3 className="text-2xl font-extrabold text-gray-800 mb-2">
                  {overall.avg >= 90 ? '🏆 Excellent!' : overall.avg >= 80 ? '⭐ Great work!' : overall.avg >= 70 ? '👍 Good progress' : '💪 Room to improve'}
                </h3>
                <p className="text-gray-500 text-sm max-w-xs">
                  {overall.avg >= 85
                    ? `Your nutrition is highly optimised for ${profile.goal?.toLowerCase()}!`
                    : `Making progress toward ${profile.goal?.toLowerCase()}. Focus on the areas below.`}
                </p>
                <div className="flex gap-2 mt-4">
                  {['A','B','C','D','F'].map((g, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${overall.grade.letter === g ? 'ring-2 ring-offset-1' : 'opacity-30'}`}
                      style={{ backgroundColor: ['#dcfce7','#dbeafe','#fef3c7','#fee2e2','#fecaca'][i], color: ['#16a34a','#2563eb','#d97706','#dc2626','#7f1d1d'][i] }}>
                      {g}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Individual Scores */}
          <div className="space-y-4 mb-6">
            {scores.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    <ScoreRing score={animate ? item.score : 0} color={item.color} size={70} stroke={6} />
                    <div className="absolute inset-0 flex items-center justify-center"><span className="text-lg">{item.icon}</span></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-gray-800">{item.category}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-500">{Math.round(item.score)}/100</span>
                        <span className="text-sm font-extrabold px-2 py-0.5 rounded-full" style={{ backgroundColor: item.grade.bg, color: item.grade.color }}>{item.grade.letter}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                      <div className="h-2 rounded-full transition-all duration-1000" style={{ width: animate ? `${item.score}%` : '0%', backgroundColor: item.color }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>{item.value}</span><span>{item.target}</span>
                    </div>
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">💡 {item.tip}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Share */}
          <div className="rounded-2xl p-6 text-center text-white" style={{ background: 'linear-gradient(to right, #7c3aed, #4f46e5)' }}>
            <p className="text-xl font-extrabold mb-2">Share your {activePeriod} score — Grade {overall.grade.letter}! 🏆</p>
            <p className="text-purple-200 text-sm mb-4">{profile.name} scored {overall.avg}/100</p>
            <button
              onClick={() => {
                const text = `I scored ${overall.avg}/100 (Grade ${overall.grade.letter}) on my NutriCart ${activePeriod} nutrition report! 🥗 nutri-cart-beta.vercel.app`
                if (navigator.share) { navigator.share({ text }) }
                else { navigator.clipboard.writeText(text); alert('Copied!') }
              }}
              className="bg-white text-purple-700 font-bold px-8 py-3 rounded-full hover:bg-purple-50 transition">
              📤 Share My Score
            </button>
          </div>
        </>
      )}
    </div>
  )
}