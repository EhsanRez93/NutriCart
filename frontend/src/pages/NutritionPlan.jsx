import { useState } from 'react'
import ShoppingList from './ShoppingList'

// ─────────────────────────────────────────────
// NUTRITION CALCULATION ENGINE
// Uses Mifflin-St Jeor formula
// ─────────────────────────────────────────────
function calculateNutrition(profile) {
  const weight = parseFloat(profile.currentWeight)
  const target = parseFloat(profile.targetWeight)
  const height = parseFloat(profile.height)
  const age    = parseFloat(profile.age)
  const goal   = profile.goal || 'Eat healthier'

  const bmr  = (10 * weight) + (6.25 * height) - (5 * age) + 5
  const tdee = Math.round(bmr * 1.375)

  let calories = tdee
  if (goal === 'Gain weight' || goal === 'Build muscle') calories = tdee + 500
  if (goal === 'Lose weight') calories = tdee - 500

  const protein = Math.round(target * 2)
  const fats    = Math.round((calories * 0.25) / 9)
  const carbs   = Math.round((calories - (protein * 4) - (fats * 9)) / 4)

  const weightDiff   = Math.abs(target - weight)
  const weeksNeeded  = Math.round(weightDiff / 0.5)
  const monthsNeeded = Math.round(weeksNeeded / 4)

  return { calories, protein, carbs, fats, bmr: Math.round(bmr), tdee, weeksNeeded, monthsNeeded }
}

// ─────────────────────────────────────────────
// SYMPTOM FLAGS
// ─────────────────────────────────────────────
const symptomAdvice = {
  'Fatigue / low energy': {
    icon: '⚡',
    color: 'bg-yellow-50 border-yellow-300',
    title: 'Low Energy Detected',
    advice: 'Your meal plan prioritises iron-rich foods (spinach, red meat, lentils) and B12 sources (eggs, salmon, dairy). Consider checking your ferritin levels with your doctor.',
    nutrients: ['Iron', 'B12', 'Vitamin D', 'Magnesium'],
  },
  'Poor sleep': {
    icon: '🌙',
    color: 'bg-blue-50 border-blue-300',
    title: 'Sleep Quality Flag',
    advice: 'We include magnesium-rich foods (nuts, seeds, dark chocolate) and avoid high-sugar meals after 6pm. Tryptophan sources like turkey and oats are added to dinner.',
    nutrients: ['Magnesium', 'Tryptophan', 'Zinc'],
  },
  'Brain fog': {
    icon: '🧠',
    color: 'bg-purple-50 border-purple-300',
    title: 'Cognitive Support',
    advice: 'Omega-3 fatty acids from salmon and walnuts are prioritised. Consistent meal timing helps stabilise blood sugar which directly impacts mental clarity.',
    nutrients: ['Omega-3', 'B6', 'Choline'],
  },
  'Digestive issues': {
    icon: '🫁',
    color: 'bg-green-50 border-green-300',
    title: 'Gut Health Support',
    advice: 'Probiotic foods (yogurt, kefir) and prebiotic fibre (oats, garlic, onion) are included. Highly processed foods are avoided in your plan.',
    nutrients: ['Probiotics', 'Fibre', 'Zinc'],
  },
  'Frequent illness': {
    icon: '🛡️',
    color: 'bg-red-50 border-red-300',
    title: 'Immune System Support',
    advice: 'Vitamin C sources (peppers, citrus, broccoli) and zinc-rich foods (pumpkin seeds, chickpeas) are prioritised throughout your weekly plan.',
    nutrients: ['Vitamin C', 'Zinc', 'Vitamin D'],
  },
}

// ─────────────────────────────────────────────
// STATIC FALLBACK MEAL PLAN (Day 1)
// Shown before AI plan is generated
// ─────────────────────────────────────────────
function generateDayPlan() {
  return [
    {
      meal: 'Breakfast', time: '7:30 AM', icon: '🌅',
      name: 'Oats with banana, peanut butter & whole milk',
      calories: 620, protein: 22, carbs: 78, fats: 24, store: 'Lidl',
      items: ['Rolled oats 80g', 'Banana 1x', 'Peanut butter 2 tbsp', 'Whole milk 300ml'],
    },
    {
      meal: 'Lunch', time: '12:30 PM', icon: '☀️',
      name: 'Chicken thighs with basmati rice & spinach',
      calories: 780, protein: 52, carbs: 85, fats: 22, store: 'Kaufland',
      items: ['Chicken thighs 200g', 'Basmati rice 150g', 'Fresh spinach 100g', 'Olive oil 1 tbsp'],
    },
    {
      meal: 'Snack', time: '4:00 PM', icon: '🍎',
      name: 'Greek yogurt with mixed nuts & honey',
      calories: 430, protein: 18, carbs: 32, fats: 26, store: 'Billa',
      items: ['Greek yogurt 200g', 'Mixed nuts 30g', 'Honey 1 tsp'],
    },
    {
      meal: 'Dinner', time: '7:30 PM', icon: '🌙',
      name: 'Salmon fillet with sweet potato & broccoli',
      calories: 680, protein: 42, carbs: 58, fats: 24, store: 'Lidl',
      items: ['Salmon fillet 200g', 'Sweet potato 200g', 'Broccoli 150g', 'Lemon 1/2'],
    },
  ]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const weeklyMeals = [
  'Oats + Chicken + Yogurt + Salmon',
  'Eggs + Tuna wrap + Nuts + Beef stir-fry',
  'Smoothie + Lentil soup + Banana + Pasta',
  'Oats + Turkey + Greek yogurt + Salmon',
  'Eggs + Chicken salad + Nuts + Beef',
  'Pancakes + Fish tacos + Fruit + Pasta',
  'Smoothie + Leftovers + Yogurt + Roast',
]

// ─────────────────────────────────────────────
// MEAL ICONS helper
// ─────────────────────────────────────────────
function mealIcon(mealName) {
  if (!mealName) return '🍽️'
  const n = mealName.toLowerCase()
  if (n === 'breakfast') return '🌅'
  if (n === 'lunch')     return '☀️'
  if (n === 'snack')     return '🍎'
  if (n === 'dinner')    return '🌙'
  return '🍽️'
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function NutritionPlan({ profile, onBack, onSignOut }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [activeDay, setActiveDay] = useState(0)
  const [aiMealPlan, setAiMealPlan] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [aiError, setAiError]       = useState(null)

  const nutrition      = calculateNutrition(profile)
  const staticDayPlan  = generateDayPlan()
  const symptoms       = Array.isArray(profile.symptoms) ? profile.symptoms : []
  const activeSymptoms = symptoms.filter(s => symptomAdvice[s])

  // Use AI plan if available, otherwise static fallback
  const currentDayMeals = aiMealPlan
    ? aiMealPlan.days[activeDay]?.meals || staticDayPlan
    : staticDayPlan

  const totalCalories = currentDayMeals.reduce((s, m) => s + (m.calories || 0), 0)
  const totalProtein  = currentDayMeals.reduce((s, m) => s + (m.protein  || 0), 0)
  const totalCarbs    = currentDayMeals.reduce((s, m) => s + (m.carbs    || 0), 0)
  const totalFats     = currentDayMeals.reduce((s, m) => s + (m.fats     || 0), 0)

  // ── AI Plan Generator ─────────────────────
  async function generateAIPlan() {
    setLoading(true)
    setAiError(null)
    try {
      const response = await fetch('https://nutricart-production-55b2.up.railway.app/api/mealplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          calories: nutrition.calories,
          protein:  nutrition.protein,
          carbs:    nutrition.carbs,
          fats:     nutrition.fats,
        })
      })
      const data = await response.json()
      if (data.success) {
        setAiMealPlan(data.mealPlan)
        setActiveTab('meals')
      } else {
        setAiError('Could not generate plan. Please try again.')
      }
    } catch (err) {
      setAiError('Backend not reachable. Make sure the server is running on port 3001.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top Nav ── */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛒</span>
          <span className="font-bold text-green-700 text-lg">NutriCart</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">
            👤 {profile.name}
          </div>
          <div className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">
            🏪 {Array.isArray(profile.store) ? profile.store.join(', ') : profile.store}
          </div>
          <button
            onClick={onSignOut}
            className="bg-red-50 text-red-600 text-sm px-3 py-1 rounded-full hover:bg-red-100 transition font-semibold">
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Tab Bar ── */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6 max-w-5xl mx-auto">
          {[
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'meals',     label: '🍽️ Meal Plan' },
            { id: 'week',      label: '📅 Weekly View' },
            { id: 'flags',     label: `⚠️ Health Flags${activeSymptoms.length > 0 ? ` (${activeSymptoms.length})` : ''}` },
            { id: 'shopping', label: '🛒 Shopping List' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-semibold border-b-2 transition
                ${activeTab === tab.id
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ══════════════════════════════════════
            TAB: DASHBOARD
        ══════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Header + AI Button */}
            <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-800">
                  {profile.name}'s Nutrition Plan
                </h1>
                <p className="text-gray-500 mt-1">
                  Goal: <span className="font-semibold text-green-700">{profile.goal}</span> ·
                  {' '}{profile.currentWeight}kg → {profile.targetWeight}kg ·
                  {' '}~{nutrition.monthsNeeded} months
                </p>
              </div>
              <button
                onClick={generateAIPlan}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white transition shadow-lg disabled:opacity-60"
                style={{ background: loading ? '#9ca3af' : 'linear-gradient(to right, #7c3aed, #4f46e5)' }}>
                {loading ? (
                  <><span className="animate-spin">⏳</span> Generating your plan...</>
                ) : (
                  <>✨ {aiMealPlan ? 'Regenerate AI Plan' : 'Generate AI Meal Plan'}</>
                )}
              </button>
            </div>

            {/* Error message */}
            {aiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
                ⚠️ {aiError}
              </div>
            )}

            {/* AI Plan Success Banner */}
            {aiMealPlan && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
                <p className="text-purple-700 text-sm font-semibold">
                  ✨ Your personalised AI meal plan is ready!
                </p>
                <button
                  onClick={() => setActiveTab('meals')}
                  className="text-purple-700 text-sm font-bold underline">
                  View Meal Plan →
                </button>
              </div>
            )}

            {/* Calorie Target Card */}
            <div
              className="rounded-2xl p-6 text-white mb-6 shadow-lg"
              style={{ background: 'linear-gradient(to right, #16a34a, #22c55e)' }}>
              <p className="text-green-100 text-sm font-semibold mb-1">DAILY CALORIE TARGET</p>
              <div className="flex items-end gap-3">
                <span className="text-6xl font-extrabold">{nutrition.calories}</span>
                <span className="text-green-200 mb-2">kcal / day</span>
              </div>
              <div className="flex gap-6 mt-4 text-sm">
                <div>
                  <p className="text-green-200">Maintenance</p>
                  <p className="font-bold text-lg">{nutrition.tdee} kcal</p>
                </div>
                <div>
                  <p className="text-green-200">BMR (at rest)</p>
                  <p className="font-bold text-lg">{nutrition.bmr} kcal</p>
                </div>
                <div>
                  <p className="text-green-200">Adjustment</p>
                  <p className="font-bold text-lg">
                    {nutrition.calories > nutrition.tdee ? '+' : ''}{nutrition.calories - nutrition.tdee} kcal
                  </p>
                </div>
              </div>
            </div>

            {/* Macro Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Protein',       value: nutrition.protein, unit: 'g', color: 'bg-blue-500',   light: 'bg-blue-50',   text: 'text-blue-700',   desc: 'Muscle building & repair' },
                { label: 'Carbohydrates', value: nutrition.carbs,   unit: 'g', color: 'bg-yellow-500', light: 'bg-yellow-50', text: 'text-yellow-700', desc: 'Energy & brain fuel' },
                { label: 'Fats',          value: nutrition.fats,    unit: 'g', color: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-700', desc: 'Hormones & absorption' },
              ].map((macro, i) => (
                <div key={i} className={`${macro.light} rounded-2xl p-5`}>
                  <p className={`text-xs font-bold ${macro.text} uppercase tracking-wide mb-1`}>{macro.label}</p>
                  <p className={`text-4xl font-extrabold ${macro.text}`}>{macro.value}<span className="text-xl">{macro.unit}</span></p>
                  <p className="text-gray-500 text-xs mt-1">{macro.desc}</p>
                  <div className="w-full bg-white rounded-full h-1.5 mt-3">
                    <div className={`${macro.color} h-1.5 rounded-full`} style={{ width: '70%' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline + Micronutrients */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-4">⏱ Your Timeline</h3>
                {[
                  { label: 'Starting weight',  value: `${profile.currentWeight}kg`, color: 'text-gray-600' },
                  { label: 'Target weight',    value: `${profile.targetWeight}kg`,  color: 'text-green-700' },
                  { label: 'Weight to change', value: `${Math.abs(parseFloat(profile.targetWeight) - parseFloat(profile.currentWeight))}kg`, color: 'text-blue-700' },
                  { label: 'Estimated time',   value: `${nutrition.weeksNeeded} weeks`, color: 'text-purple-700' },
                  { label: 'Weekly change',    value: '~0.5kg/week', color: 'text-gray-600' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-500">{item.label}</span>
                    <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-4">💊 Priority Micronutrients</h3>
                {[
                  { name: 'Iron',       reason: 'Energy & oxygen transport', pct: 85 },
                  { name: 'Vitamin D',  reason: 'Mood & morning energy',     pct: 70 },
                  { name: 'Magnesium',  reason: 'Sleep quality & muscle',    pct: 75 },
                  { name: 'B12',        reason: 'Nervous system & energy',   pct: 90 },
                  { name: 'Zinc',       reason: 'Immunity & recovery',       pct: 65 },
                ].map((item, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-semibold text-gray-700">{item.name}</span>
                      <span className="text-gray-400">{item.reason}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: MEAL PLAN
        ══════════════════════════════════════ */}
        {activeTab === 'meals' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-extrabold text-gray-800">
                {aiMealPlan ? '🤖 AI Generated Meal Plan' : "Today's Meal Plan"}
              </h2>
              <div className="flex items-center gap-3">
                {aiMealPlan && (
                  <div className="flex gap-1">
                    {DAYS.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveDay(i)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition
                          ${activeDay === i
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                <div className="bg-green-50 text-green-700 text-sm font-semibold px-4 py-2 rounded-full">
                  {totalCalories} kcal total
                </div>
              </div>
            </div>

            {/* Meal Cards */}
            <div className="space-y-4 mb-8">
              {currentDayMeals.map((meal, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{mealIcon(meal.meal)}</span>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase">
                          {meal.meal} · {meal.time}
                        </p>
                        <p className="font-bold text-gray-800">{meal.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-green-700">{meal.calories} kcal</p>
                      <p className="text-xs text-gray-400">🏪 {meal.store}</p>
                    </div>
                  </div>

                  {/* Macros */}
                  <div className="flex gap-4 mb-3">
                    {[
                      { label: 'Protein', value: meal.protein, color: 'text-blue-600' },
                      { label: 'Carbs',   value: meal.carbs,   color: 'text-yellow-600' },
                      { label: 'Fats',    value: meal.fats,    color: 'text-orange-600' },
                    ].map((m, j) => (
                      <div key={j} className="bg-gray-50 rounded-lg px-3 py-1">
                        <span className={`text-xs font-bold ${m.color}`}>{m.label}: </span>
                        <span className="text-xs text-gray-700">{m.value}g</span>
                      </div>
                    ))}
                  </div>

                  {/* Ingredients */}
                  <div className="flex flex-wrap gap-2">
                    {meal.items && meal.items.map((item, j) => (
                      <span key={j} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Daily Totals */}
            <div className="bg-gray-800 text-white rounded-2xl p-5">
              <h3 className="font-bold mb-4">📊 Daily Totals vs Targets</h3>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Calories', actual: totalCalories, target: nutrition.calories, unit: 'kcal' },
                  { label: 'Protein',  actual: totalProtein,  target: nutrition.protein,  unit: 'g' },
                  { label: 'Carbs',    actual: totalCarbs,    target: nutrition.carbs,    unit: 'g' },
                  { label: 'Fats',     actual: totalFats,     target: nutrition.fats,     unit: 'g' },
                ].map((item, i) => {
                  const pct = Math.round((item.actual / item.target) * 100)
                  const ok  = pct >= 85 && pct <= 115
                  return (
                    <div key={i}>
                      <p className="text-gray-400 text-xs mb-1">{item.label}</p>
                      <p className="text-2xl font-extrabold">
                        {item.actual}
                        <span className="text-sm text-gray-400">/{item.target}{item.unit}</span>
                      </p>
                      <p className={`text-xs font-bold mt-1 ${ok ? 'text-green-400' : 'text-yellow-400'}`}>
                        {pct}% of target {ok ? '✓' : '⚠'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: WEEKLY VIEW
        ══════════════════════════════════════ */}
        {activeTab === 'week' && (
          <div>
            <h2 className="text-2xl font-extrabold text-gray-800 mb-6">Weekly Overview</h2>
            <div className="flex gap-2 mb-6">
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  onClick={() => setActiveDay(i)}
                  className={`rounded-xl py-3 px-4 text-center transition flex-1
                    ${activeDay === i
                      ? 'bg-green-600 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-green-50 shadow-sm'}`}>
                  <p className="text-xs font-bold">{day}</p>
                  <p className="text-lg mt-1">{['🟢','🟢','🟡','🟢','🟢','🔵','🔵'][i]}</p>
                </button>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-2">{DAYS[activeDay]}'s Meals</h3>
              {aiMealPlan ? (
                <div className="space-y-2">
                  {aiMealPlan.days[activeDay]?.meals.map((meal, i) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                      <span className="text-gray-600">{mealIcon(meal.meal)} {meal.name}</span>
                      <span className="font-semibold text-green-700">{meal.calories} kcal</span>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between font-bold text-gray-800">
                    <span>Total</span>
                    <span>{aiMealPlan.days[activeDay]?.totalCalories} kcal</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 text-sm mb-4">{weeklyMeals[activeDay]}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Estimated Calories', value: `${nutrition.calories - 50 + (activeDay * 30)} kcal` },
                      { label: 'Protein',            value: `${nutrition.protein - 5 + activeDay}g` },
                      { label: 'Prep Time',          value: activeDay >= 5 ? '45 min' : '25 min' },
                      { label: 'Complexity',         value: activeDay >= 5 ? 'Weekend special' : 'Weekday easy' },
                    ].map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className="font-bold text-gray-800">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 bg-green-50 border border-green-200 rounded-2xl p-4">
              <p className="text-green-800 text-sm">
                <span className="font-bold">🛒 Weekly Shopping Estimate: </span>
                ~€45–55 at {Array.isArray(profile.store) ? profile.store[0] : profile.store}
              </p>
            </div>

            {!aiMealPlan && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-2xl p-4 text-center">
                <p className="text-purple-700 text-sm mb-3">
                  Generate your AI meal plan to see a unique personalised plan for each day
                </p>
                <button
                  onClick={() => { setActiveTab('dashboard') }}
                  className="text-purple-700 font-bold text-sm underline">
                  Go to Dashboard → Generate AI Plan
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: HEALTH FLAGS
        ══════════════════════════════════════ */}
        {activeTab === 'flags' && (
          <div>
            <h2 className="text-2xl font-extrabold text-gray-800 mb-2">Health Flags</h2>
            <p className="text-gray-500 mb-6">
              Based on your symptoms, we've made these specific adjustments to your nutrition plan.
            </p>

            {activeSymptoms.length === 0 ? (
              <div className="bg-green-50 rounded-2xl p-8 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="font-bold text-green-700">No major health flags detected</p>
                <p className="text-gray-500 text-sm mt-1">Your plan is built on standard nutrition principles.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeSymptoms.map((symptom, i) => {
                  const info = symptomAdvice[symptom]
                  return (
                    <div key={i} className={`border-2 ${info.color} rounded-2xl p-5`}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">{info.icon}</span>
                        <div>
                          <p className="font-bold text-gray-800">{info.title}</p>
                          <p className="text-xs text-gray-500">Detected from: {symptom}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">{info.advice}</p>
                      <div className="flex flex-wrap gap-2">
                        {info.nutrients.map((n, j) => (
                          <span key={j} className="bg-white text-gray-700 text-xs font-semibold px-3 py-1 rounded-full border border-gray-200">
                            💊 {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-6 bg-gray-100 rounded-2xl p-4">
              <p className="text-xs text-gray-500">
                <span className="font-bold">⚠️ Disclaimer: </span>
                NutriCart provides nutrition guidance based on general principles.
                This is not medical advice. Always consult a healthcare professional
                before making significant dietary changes, especially if managing a health condition.
              </p>
            </div>
          </div>
        )}

      </div>
      {/* SHOPPING LIST TAB */}
      {activeTab === 'shopping' && (
      <ShoppingList profile={profile} aiMealPlan={aiMealPlan} />
      )}
    </div>
  )
}