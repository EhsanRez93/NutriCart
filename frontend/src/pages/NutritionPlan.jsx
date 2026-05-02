import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ShoppingList from './ShoppingList'
import ScoreCard from './ScoreCard'
import ProgressTracker from './ProgressTracker'
import {
  fetchHolidaysWindow,
  findHoliday,
  upcomingHolidays,
  formatHolidayDate,
  countryHasHolidaySupport,
} from '../utils/holidays'

function calculateNutrition(profile) {
  const weight = parseFloat(profile.currentWeight)
  const target = parseFloat(profile.targetWeight)
  const height = parseFloat(profile.height)
  const age    = parseFloat(profile.age)
  const goal   = profile.goal || 'Eat healthier'
  const bmr    = (10 * weight) + (6.25 * height) - (5 * age) + 5
  const tdee   = Math.round(bmr * 1.375)
  let calories = tdee
  if (goal === 'Gain weight' || goal === 'Build muscle') calories = tdee + 500
  if (goal === 'Lose weight') calories = tdee - 500
  const protein      = Math.round(target * 2)
  const fats         = Math.round((calories * 0.25) / 9)
  const carbs        = Math.round((calories - (protein * 4) - (fats * 9)) / 4)
  const weightDiff   = Math.abs(target - weight)
  const weeksNeeded  = Math.round(weightDiff / 0.5)
  const monthsNeeded = Math.round(weeksNeeded / 4)
  return { calories, protein, carbs, fats, bmr: Math.round(bmr), tdee, weeksNeeded, monthsNeeded }
}

function getTodayStr() { return new Date().toISOString().split('T')[0] }
function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
function getDayIndex(startDate) {
  if (!startDate) return 0
  const start = new Date(startDate)
  const today = new Date()
  start.setHours(0,0,0,0); today.setHours(0,0,0,0)
  return Math.max(0, Math.min(Math.floor((today - start) / 86400000), 6))
}
function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatShort(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const symptomAdvice = {
  'Fatigue / low energy': { icon: '⚡', color: 'bg-yellow-50 border-yellow-300', title: 'Low Energy Detected', advice: 'Your meal plan prioritises iron-rich foods (spinach, red meat, lentils) and B12 sources (eggs, salmon, dairy).', nutrients: ['Iron', 'B12', 'Vitamin D', 'Magnesium'] },
  'Poor sleep':           { icon: '🌙', color: 'bg-blue-50 border-blue-300',     title: 'Sleep Quality Flag',   advice: 'We include magnesium-rich foods (nuts, seeds, dark chocolate) and avoid high-sugar meals after 6pm.', nutrients: ['Magnesium', 'Tryptophan', 'Zinc'] },
  'Brain fog':            { icon: '🧠', color: 'bg-purple-50 border-purple-300', title: 'Cognitive Support',    advice: 'Omega-3 fatty acids from salmon and walnuts are prioritised.', nutrients: ['Omega-3', 'B6', 'Choline'] },
  'Digestive issues':     { icon: '🫁', color: 'bg-green-50 border-green-300',   title: 'Gut Health Support',   advice: 'Probiotic foods (yogurt, kefir) and prebiotic fibre are included.', nutrients: ['Probiotics', 'Fibre', 'Zinc'] },
  'Frequent illness':     { icon: '🛡️', color: 'bg-red-50 border-red-300',      title: 'Immune System Support', advice: 'Vitamin C sources and zinc-rich foods are prioritised.', nutrients: ['Vitamin C', 'Zinc', 'Vitamin D'] },
}

const MICRONUTRIENT_INFO = {
  'Iron':      { why: 'Carries oxygen in blood, prevents anemia', symptoms: 'Fatigue, weakness, pale skin', foods: 'Spinach, red meat, lentils' },
  'Vitamin D': { why: 'Bone health, immune function, mood', symptoms: 'Fatigue, depression, bone pain', foods: 'Salmon, egg yolks, sunlight' },
  'Magnesium': { why: 'Muscle function, sleep quality, energy', symptoms: 'Muscle cramps, poor sleep, anxiety', foods: 'Nuts, seeds, dark chocolate' },
  'B12':       { why: 'Nervous system health, energy production', symptoms: 'Fatigue, memory issues, tingling', foods: 'Meat, fish, eggs, dairy' },
  'Zinc':      { why: 'Immune system, wound healing, testosterone', symptoms: 'Frequent illness, slow healing', foods: 'Pumpkin seeds, beef, chickpeas' },
}

const MACRO_TOOLTIPS = {
  'Protein':       { why: 'Essential for muscle building and repair', daily: 'Spread across all meals', sources: 'Chicken, eggs, Greek yogurt, fish' },
  'Carbohydrates': { why: 'Primary fuel for brain and muscles', daily: 'Time around workouts', sources: 'Oats, rice, sweet potato, fruit' },
  'Fats':          { why: 'Hormone production and nutrient absorption', daily: 'Include healthy fats each meal', sources: 'Olive oil, nuts, avocado, salmon' },
}

function generateDayPlan() {
  return [
    { meal: 'Breakfast', time: '7:30 AM',  name: 'Oats with banana, peanut butter & whole milk', calories: 620, protein: 22, carbs: 78, fats: 24, store: 'Lidl',     items: ['Rolled oats 80g', 'Banana 1x', 'Peanut butter 2 tbsp', 'Whole milk 300ml'] },
    { meal: 'Lunch',     time: '12:30 PM', name: 'Chicken thighs with basmati rice & spinach',   calories: 780, protein: 52, carbs: 85, fats: 22, store: 'Kaufland', items: ['Chicken thighs 200g', 'Basmati rice 150g', 'Fresh spinach 100g', 'Olive oil 1 tbsp'] },
    { meal: 'Snack',     time: '4:00 PM',  name: 'Greek yogurt with mixed nuts & honey',         calories: 430, protein: 18, carbs: 32, fats: 26, store: 'Billa',    items: ['Greek yogurt 200g', 'Mixed nuts 30g', 'Honey 1 tsp'] },
    { meal: 'Dinner',    time: '7:30 PM',  name: 'Salmon fillet with sweet potato & broccoli',   calories: 680, protein: 42, carbs: 58, fats: 24, store: 'Lidl',     items: ['Salmon fillet 200g', 'Sweet potato 200g', 'Broccoli 150g', 'Lemon 1/2'] },
  ]
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

function Tooltip({ children, content }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-gray-800 text-white text-xs rounded-xl p-3 shadow-xl pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  )
}

function MacroRing({ label, value, unit, color, bgColor, textColor, desc, percentage }) {
  const size = 140, stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference
  const tip = MACRO_TOOLTIPS[label]
  return (
    <Tooltip content={tip ? <div><p className="font-bold mb-1">{label}</p><p className="mb-1">💡 {tip.why}</p><p className="mb-1">⏰ {tip.daily}</p><p>🥗 {tip.sources}</p></div> : label}>
      <div className="flex flex-col items-center bg-white rounded-2xl p-5 shadow-sm cursor-help">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={bgColor} strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-extrabold ${textColor}`}>{value}</span>
            <span className={`text-xs font-semibold ${textColor} opacity-70`}>{unit}</span>
          </div>
        </div>
        <p className={`font-bold text-sm mt-3 ${textColor}`}>{label}</p>
        <p className="text-gray-400 text-xs mt-0.5 text-center">{desc}</p>
        <div className="text-xs font-bold mt-2 px-3 py-1 rounded-full" style={{ backgroundColor: bgColor, color }}>{Math.round(percentage)}% of target</div>
      </div>
    </Tooltip>
  )
}

function CalorieRing({ calories, tdee, bmr, adjustment }) {
  const size = 200, stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min((calories / (tdee + 600)) * 100, 100) / 100) * circumference
  return (
    <Tooltip content={<div><p className="font-bold mb-1">Daily Calories</p><p className="mb-1">Total energy based on your weight, height, age and goal.</p><p>BMR {bmr} × activity = {tdee} kcal maintenance</p></div>}>
      <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center cursor-help">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Daily Calorie Target</p>
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#dcfce7" strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#16a34a" strokeWidth={stroke}
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-extrabold text-green-700">{calories}</span>
            <span className="text-sm text-gray-400 font-semibold">kcal / day</span>
          </div>
        </div>
        <div className="flex gap-6 mt-4 w-full justify-center">
          <div className="text-center"><p className="text-xs text-gray-400">Maintenance</p><p className="font-bold text-gray-700">{tdee} kcal</p></div>
          <div className="text-center"><p className="text-xs text-gray-400">BMR</p><p className="font-bold text-gray-700">{bmr} kcal</p></div>
          <div className="text-center"><p className="text-xs text-gray-400">Adjustment</p><p className="font-bold text-green-700">{adjustment > 0 ? '+' : ''}{adjustment} kcal</p></div>
        </div>
      </div>
    </Tooltip>
  )
}

function IntakeTracker({ eaten, targets }) {
  const pct = (a, t) => Math.min(Math.round((a / t) * 100), 100)
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">🍴 Today's Actual Intake</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Updates as you log meals</span>
      </div>
      {[
        { label: 'Calories', actual: eaten.calories, target: targets.calories, unit: 'kcal', color: '#16a34a' },
        { label: 'Protein',  actual: eaten.protein,  target: targets.protein,  unit: 'g',    color: '#3b82f6' },
        { label: 'Carbs',    actual: eaten.carbs,    target: targets.carbs,    unit: 'g',    color: '#eab308' },
        { label: 'Fats',     actual: eaten.fats,     target: targets.fats,     unit: 'g',    color: '#f97316' },
      ].map((item, i) => {
        const p = pct(item.actual, item.target)
        const ok = p >= 85 && p <= 115
        return (
          <div key={i} className="mb-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold text-gray-700">{item.label}</span>
              <span className={`font-bold ${ok ? 'text-green-600' : p > 115 ? 'text-red-500' : 'text-gray-500'}`}>
                {item.actual}{item.unit} / {item.target}{item.unit}{ok ? ' ✓' : p > 115 ? ' ⚠️' : ''}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="h-3 rounded-full transition-all duration-700" style={{ width: `${p}%`, backgroundColor: item.color }} />
            </div>
          </div>
        )
      })}
      {eaten.calories === 0 && <p className="text-center text-gray-400 text-sm mt-2">Mark meals as eaten in the Meal Plan tab to track your intake</p>}
    </div>
  )
}

function EditGoalsModal({ profile, onSave, onClose }) {
  const [currentWeight, setCurrentWeight] = useState(profile.currentWeight || '')
  const [targetWeight, setTargetWeight]   = useState(profile.targetWeight || '')
  const [goal, setGoal]                   = useState(profile.goal || 'Gain weight')
  const [holidayMode, setHolidayMode]     = useState(profile.holidayMode || 'festive')
  const goals = ['Gain weight', 'Lose weight', 'Build muscle', 'Eat healthier', 'Manage a condition']
  const holidayModes = [
    { value: 'festive', icon: '🎉', label: 'Festive meals',  desc: 'Traditional / celebratory foods on holidays' },
    { value: 'normal',  icon: '🍽️', label: 'Normal meals',   desc: 'Treat holidays like any other day' },
    { value: 'skip',    icon: '⊘',  label: 'Rest day',       desc: 'Light / minimal meals on holidays' },
  ]
  const showHolidaySection = countryHasHolidaySupport(profile.country)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-extrabold text-gray-800">✏️ Edit Goals</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1 block">Current Weight (kg)</label>
            <input type="number" value={currentWeight} onChange={e => setCurrentWeight(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1 block">Target Weight (kg)</label>
            <input type="number" value={targetWeight} onChange={e => setTargetWeight(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1 block">Goal</label>
            <div className="space-y-2">
              {goals.map((g, i) => (
                <button key={i} onClick={() => setGoal(g)}
                  className={`w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition border-2 ${goal === g ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-700 hover:border-green-300'}`}>
                  {goal === g ? '✅' : '○'} {g}
                </button>
              ))}
            </div>
          </div>

          {showHolidaySection && (
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                🎉 Holiday handling for {profile.country}
              </label>
              <div className="space-y-2">
                {holidayModes.map(m => (
                  <button key={m.value} onClick={() => setHolidayMode(m.value)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition border-2 flex items-start gap-3
                      ${holidayMode === m.value ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-700 hover:border-amber-300'}`}>
                    <span className="text-base flex-shrink-0">{m.icon}</span>
                    <div>
                      <p className="font-semibold">{m.label}</p>
                      <p className="text-xs text-gray-400">{m.desc}</p>
                    </div>
                    {holidayMode === m.value && <span className="ml-auto text-amber-500 font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={() => onSave({ currentWeight, targetWeight, goal, holidayMode })}
          className="mt-6 bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition">
          Save Changes
        </button>
      </div>
    </div>
  )
}

function MicronutrientModal({ onClose, onSave, existing }) {
  const nutrients = ['Iron', 'Vitamin D', 'Magnesium', 'B12', 'Zinc']
  const [values, setValues] = useState(existing || {})
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-800">🔬 My Medical Data</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Enter values from your doctor's blood test. Leave empty to use AI estimates.</p>
        {nutrients.map(n => (
          <div key={n} className="mb-3">
            <label className="text-sm font-semibold text-gray-700 mb-1 block">{n}</label>
            <input type="number" placeholder="Leave empty for AI estimate"
              value={values[n] || ''}
              onChange={e => setValues(prev => ({ ...prev, [n]: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-green-500 focus:outline-none" />
          </div>
        ))}
        <button onClick={() => { onSave(values); onClose() }}
          className="mt-4 bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition">
          Save Medical Data
        </button>
      </div>
    </div>
  )
}

function StartDateModal({ onConfirm, onClose }) {
  const [startDate, setStartDate] = useState(getTodayStr())
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-800">📅 Plan Start Date</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">When would you like your 7-day plan to start?</p>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          min={getTodayStr()}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none mb-4" />
        <button onClick={() => onConfirm(startDate)}
          className="bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition">
          Generate Plan from {formatDate(startDate)}
        </button>
      </div>
    </div>
  )
}

function DayPopup({ dayIndex, aiMealPlan, eatenMeals, skippedMeals, startDate }) {
  const dayKey  = `day-${dayIndex}`
  const meals   = aiMealPlan?.days[dayIndex]?.meals || []
  const eaten   = eatenMeals[dayKey]   || {}
  const skipped = skippedMeals[dayKey] || {}
  const active  = meals.filter(m => !skipped[m.name])
  const total   = active.reduce((s, m) => s + m.calories, 0)
  const date    = startDate ? addDays(startDate, dayIndex) : ''
  return (
    <div className="w-56">
      <p className="font-bold mb-2">{formatDate(date)}</p>
      {meals.length === 0 ? <p className="text-gray-300">No meals planned</p> : (
        <>
          {meals.map((m, i) => (
            <div key={i} className={`flex justify-between text-xs py-0.5 ${skipped[m.name] ? 'line-through opacity-50' : ''}`}>
              <span>{mealIcon(m.meal)} {m.name.substring(0, 22)}{m.name.length > 22 ? '…' : ''}</span>
              <span className="ml-2">{eaten[m.name] ? '✅' : skipped[m.name] ? '⊘' : ''}</span>
            </div>
          ))}
          <div className="border-t border-gray-600 mt-2 pt-1 flex justify-between font-bold text-xs">
            <span>Total</span><span>{total} kcal</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function NutritionPlan({ profile, onBack, onSignOut, onSaveMealPlan, onUpdateGoals, userId }) {
  const [activeTab, setActiveTab]           = useState('dashboard')
  const [activeDay, setActiveDay]           = useState(0)
  const [aiMealPlan, setAiMealPlan]         = useState(profile.savedMealPlan || null)
  const [startDate, setStartDate]           = useState(profile.mealPlanStartDate || getTodayStr())
  const [loading, setLoading]               = useState(false)
  const [aiError, setAiError]               = useState(null)
  const [swapMeal, setSwapMeal]             = useState(null)
  const [alternatives, setAlternatives]     = useState([])
  const [swapLoading, setSwapLoading]       = useState(false)
  const [eatenMeals, setEatenMeals]         = useState({})
  const [skippedMeals, setSkippedMeals]     = useState({})
  const [showEditGoals, setShowEditGoals]   = useState(false)
  const [showMicroModal, setShowMicroModal] = useState(false)
  const [showStartDate, setShowStartDate]   = useState(false)
  const [medicalData, setMedicalData]       = useState({})
  const [currentTime, setCurrentTime]       = useState(new Date())
  const [calendarView, setCalendarView]     = useState('week')
  const [calendarOffset, setCalendarOffset] = useState(0)
  const [planHolidays, setPlanHolidays]     = useState([])   // holidays in current 7-day plan window
  const [upcomingHols, setUpcomingHols]     = useState([])   // next 3 upcoming holidays
  const [calendarHolidays, setCalendarHolidays] = useState([]) // holidays for the calendar display range

  // ── Update clock ──
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // ── Load holiday data ──
  useEffect(() => {
    if (!profile.country || !countryHasHolidaySupport(profile.country)) return
    const planStart = startDate || getTodayStr()
    fetchHolidaysWindow(profile.country, planStart, 7).then(setPlanHolidays)
    upcomingHolidays(profile.country, 3).then(setUpcomingHols)
  }, [profile.country, startDate])

  // ── Load holidays for calendar display range ──
  useEffect(() => {
    if (!profile.country || !countryHasHolidaySupport(profile.country)) return
    let rangeStart, rangeDays
    if (calendarView === 'week') {
      const base = startDate || getTodayStr()
      const d = new Date(base)
      d.setDate(d.getDate() + calendarOffset * 7)
      rangeStart = d.toISOString().split('T')[0]
      rangeDays  = 7
    } else if (calendarView === 'month') {
      const base = new Date(startDate || getTodayStr())
      base.setMonth(base.getMonth() + calendarOffset)
      base.setDate(1)
      rangeStart = base.toISOString().split('T')[0]
      rangeDays  = 42 // covers full month
    } else {
      rangeStart = startDate || getTodayStr()
      rangeDays  = 7
    }
    fetchHolidaysWindow(profile.country, rangeStart, rangeDays).then(setCalendarHolidays)
  }, [profile.country, startDate, calendarView, calendarOffset])

  // ── Load meal logs from Supabase ──
  useEffect(() => {
    if (!userId) return
    async function loadLogs() {
      if (!startDate) return
      const planStart = startDate
      const planEnd   = addDays(startDate, 6)
      const { data, error } = await supabase
        .from('meal_logs')
        select('*')
        .eq('user_id', userId)
        .gte('log_date', planStart)
        .lte('log_date', planEnd)

      if (data && !error) {
        const eaten   = {}
        const skipped = {}
        data.forEach(log => {
          const dayKey = `day-${log.plan_day_index}`
          if (log.skipped) {
            if (!skipped[dayKey]) skipped[dayKey] = {}
            skipped[dayKey][log.meal_name] = { name: log.meal_name, calories: log.calories, protein: log.protein, carbs: log.carbs, fats: log.fats }
          } else {
            if (!eaten[dayKey]) eaten[dayKey] = {}
            eaten[dayKey][log.meal_name] = { name: log.meal_name, calories: log.calories, protein: log.protein, carbs: log.carbs, fats: log.fats }
          }
        })
        setEatenMeals(eaten)
        setSkippedMeals(skipped)
      }
    }
    loadLogs()
  }, [userId])

  // ── Auto set active day ──
  useEffect(() => {
    if (startDate) setActiveDay(getDayIndex(startDate))
  }, [startDate])

  const nutrition       = calculateNutrition(profile)
  const staticDayPlan   = generateDayPlan()
  const symptoms        = Array.isArray(profile.symptoms) ? profile.symptoms : []
  const activeSymptoms  = symptoms.filter(s => symptomAdvice[s])
  const currentDayMeals = aiMealPlan ? aiMealPlan.days[activeDay]?.meals || staticDayPlan : staticDayPlan
  const todayKey        = `day-${activeDay}`
  const eatenToday      = eatenMeals[todayKey]   || {}
  const skippedToday    = skippedMeals[todayKey] || {}

  const actualIntake = {
    calories: Object.values(eatenToday).reduce((s, m) => s + (m.calories || 0), 0),
    protein:  Object.values(eatenToday).reduce((s, m) => s + (m.protein  || 0), 0),
    carbs:    Object.values(eatenToday).reduce((s, m) => s + (m.carbs    || 0), 0),
    fats:     Object.values(eatenToday).reduce((s, m) => s + (m.fats     || 0), 0),
  }

  // ── Toggle eaten — saves to Supabase ──
  async function toggleEaten(meal) {
    const key              = meal.name
    const isCurrentlyEaten = !!(eatenMeals[todayKey] || {})[key]

    setEatenMeals(prev => {
      const d = { ...(prev[todayKey] || {}) }
      if (d[key]) delete d[key]; else d[key] = meal
      return { ...prev, [todayKey]: d }
    })
    setSkippedMeals(prev => {
      const d = { ...(prev[todayKey] || {}) }
      delete d[key]
      return { ...prev, [todayKey]: d }
    })

    if (!userId) return
    if (isCurrentlyEaten) {
      await supabase.from('meal_logs').delete()
        .eq('user_id', userId)
        .eq('meal_name', key)
        .eq('plan_day_index', activeDay)
    } else {
      await supabase.from('meal_logs').upsert({
        user_id:        userId,
        plan_day_index: activeDay,
        log_date:       addDays(startDate || getTodayStr(), activeDay),
        meal_name:      meal.name,
        calories:       meal.calories,
        protein:        meal.protein,
        carbs:          meal.carbs,
        fats:           meal.fats,
        skipped:        false,
      })
    }
  }

  // ── Toggle skipped — saves to Supabase ──
  async function toggleSkipped(meal) {
    const key                = meal.name
    const isCurrentlySkipped = !!(skippedMeals[todayKey] || {})[key]

    setSkippedMeals(prev => {
      const d = { ...(prev[todayKey] || {}) }
      if (d[key]) delete d[key]; else d[key] = meal
      return { ...prev, [todayKey]: d }
    })
    setEatenMeals(prev => {
      const d = { ...(prev[todayKey] || {}) }
      delete d[key]
      return { ...prev, [todayKey]: d }
    })

    if (!userId) return
    if (isCurrentlySkipped) {
      await supabase.from('meal_logs').delete()
        .eq('user_id', userId)
        .eq('meal_name', key)
        .eq('plan_day_index', activeDay)
    } else {
      await supabase.from('meal_logs').upsert({
        user_id:        userId,
        plan_day_index: activeDay,
        log_date:       addDays(startDate || getTodayStr(), activeDay),
        meal_name:      meal.name,
        calories:       meal.calories,
        protein:        meal.protein,
        carbs:          meal.carbs,
        fats:           meal.fats,
        skipped:        true,
      })
    }
  }

  function isMealEaten(meal)   { return !!(eatenMeals[todayKey]   || {})[meal.name] }
  function isMealSkipped(meal) { return !!(skippedMeals[todayKey] || {})[meal.name] }

  const activeMeals   = currentDayMeals.filter(m => !isMealSkipped(m))
  const totalCalories = activeMeals.reduce((s, m) => s + (m.calories || 0), 0)
  const totalProtein  = activeMeals.reduce((s, m) => s + (m.protein  || 0), 0)
  const totalCarbs    = activeMeals.reduce((s, m) => s + (m.carbs    || 0), 0)
  const totalFats     = activeMeals.reduce((s, m) => s + (m.fats     || 0), 0)

  async function generateAIPlan(chosenStartDate) {
    setLoading(true); setAiError(null); setShowStartDate(false)
    const planStart = chosenStartDate || startDate
    try {
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/mealplan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          calories:     nutrition.calories,
          protein:      nutrition.protein,
          carbs:        nutrition.carbs,
          fats:         nutrition.fats,
          startDate:    planStart,
          holidays:     planHolidays,
          holidayMode:  profile.holidayMode || 'festive',
        })
      })
      const data = await response.json()
      if (data.success) {
        setAiMealPlan(data.mealPlan)
        setStartDate(planStart)
        setActiveDay(getDayIndex(planStart))
        setActiveTab('meals')
        await onSaveMealPlan(data.mealPlan, planStart)
      } else {
        setAiError('Could not generate plan. Please try again.')
      }
    } catch { setAiError('Backend not reachable.') }
    finally { setLoading(false) }
  }

  async function handleSwapMeal(meal) {
    setSwapMeal(meal); setSwapLoading(true); setAlternatives([])
    try {
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/swapmeal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal, profile })
      })
      const data = await response.json()
      if (data.success) setAlternatives(data.alternatives)
    } catch (err) { console.error(err) }
    finally { setSwapLoading(false) }
  }

  function confirmSwap(alternative) {
    if (!aiMealPlan) return
    const updatedDays = aiMealPlan.days.map((day, i) =>
      i !== activeDay ? day : { ...day, meals: day.meals.map(m => m.name === swapMeal.name ? alternative : m) }
    )
    const updated = { ...aiMealPlan, days: updatedDays }
    setAiMealPlan(updated)
    onSaveMealPlan(updated, startDate)
    setSwapMeal(null); setAlternatives([])
  }

  function getWeekDays(offset = 0) {
    const base = startDate || getTodayStr()
    return Array.from({ length: 7 }, (_, i) => ({ date: addDays(base, i + offset * 7), index: i }))
  }

  function getMonthDays(offset = 0) {
    const base = new Date(startDate || getTodayStr())
    base.setMonth(base.getMonth() + offset)
    const year = base.getFullYear(), month = base.getMonth()
    const lastDay = new Date(year, month + 1, 0)
    const days = []
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d).toISOString().split('T')[0]
      const planDayIndex = startDate ? Math.floor((new Date(date) - new Date(startDate)) / 86400000) : -1
      days.push({ date, planDayIndex: planDayIndex >= 0 && planDayIndex <= 6 ? planDayIndex : -1 })
    }
    return { days, year, month, firstDayOfWeek: new Date(year, month, 1).getDay() }
  }

  const weekDays  = getWeekDays(calendarOffset)
  const monthData = getMonthDays(calendarOffset)
  const todayStr  = getTodayStr()
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  function getDayColor(planDayIndex, date) {
    if (!date || date > todayStr || planDayIndex < 0) return '⬜'
    const key     = `day-${planDayIndex}`
    const eaten   = Object.keys(eatenMeals[key]   || {}).length
    const skipped = Object.keys(skippedMeals[key] || {}).length
    if (eaten >= 4)  return '🟢'
    if (eaten >= 2)  return '🟡'
    if (skipped > 0) return '🔴'
    return '🔵'
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛒</span>
          <span className="font-bold text-green-700 text-lg">NutriCart</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-gray-50 text-gray-600 text-xs px-3 py-1 rounded-full font-mono">
            🕐 {currentTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">👤 {profile.name}</div>
          <div className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">🏪 {Array.isArray(profile.store) ? profile.store.join(', ') : profile.store}</div>
          <button onClick={onSignOut} className="bg-red-50 text-red-600 text-sm px-3 py-1 rounded-full hover:bg-red-100 transition font-semibold">Sign Out</button>
        </div>
      </nav>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6 max-w-5xl mx-auto overflow-x-auto">
          {[
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'meals',     label: '🍽️ Meal Plan' },
            { id: 'week',      label: '📅 Weekly View' },
            { id: 'flags',     label: `⚠️ Health Flags${activeSymptoms.length > 0 ? ` (${activeSymptoms.length})` : ''}` },
            { id: 'shopping',  label: '🛒 Shopping List' },
            { id: 'score',     label: '🏆 Score Card' },
            { id: 'progress',  label: '📈 Progress' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap
                ${activeTab === tab.id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ══ DASHBOARD ══ */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-800">{profile.name}'s Nutrition Plan</h1>
                <p className="text-gray-500 mt-1">
                  Goal: <span className="font-semibold text-green-700">{profile.goal}</span> ·
                  {' '}{profile.currentWeight}kg → {profile.targetWeight}kg · ~{nutrition.monthsNeeded} months
                </p>
                {aiMealPlan && profile.planGeneratedAt && (
                  <p className="text-xs text-gray-400 mt-1">Plan generated: {new Date(profile.planGeneratedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                )}
              </div>
              <button onClick={() => setShowStartDate(true)} disabled={loading}
                className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white transition shadow-lg disabled:opacity-60"
                style={{ background: loading ? '#9ca3af' : 'linear-gradient(to right, #7c3aed, #4f46e5)' }}>
                {loading ? <><span>⏳</span> Generating...</> : <>✨ {aiMealPlan ? 'Regenerate AI Plan' : 'Generate AI Meal Plan'}</>}
              </button>
            </div>

            {aiError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">⚠️ {aiError}</div>}
            {aiMealPlan && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
                <p className="text-purple-700 text-sm font-semibold">✨ AI meal plan active · Starting {formatDate(startDate)}</p>
                <button onClick={() => setActiveTab('meals')} className="text-purple-700 text-sm font-bold underline">View Meal Plan →</button>
              </div>
            )}

            <IntakeTracker eaten={actualIntake} targets={nutrition} />

            {/* Upcoming holidays card */}
            {upcomingHols.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-amber-800">🎉 Upcoming Holidays — {profile.country}</h3>
                  <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-semibold capitalize">
                    Mode: {profile.holidayMode || 'festive'}
                  </span>
                </div>
                <div className="space-y-2">
                  {upcomingHols.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-amber-700 font-semibold">🎉 {h.localName || h.name}</span>
                      <span className="text-amber-600 text-xs">{formatHolidayDate(h.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 mb-6">
              <CalorieRing calories={nutrition.calories} tdee={nutrition.tdee} bmr={nutrition.bmr} adjustment={nutrition.calories - nutrition.tdee} />
              <MacroRing label="Protein"       value={nutrition.protein} unit="g" color="#3b82f6" bgColor="#dbeafe" textColor="text-blue-600"   desc="Muscle building & repair" percentage={(nutrition.protein / 200) * 100} />
              <MacroRing label="Carbohydrates" value={nutrition.carbs}   unit="g" color="#eab308" bgColor="#fef9c3" textColor="text-yellow-600" desc="Energy & brain fuel"       percentage={(nutrition.carbs / 400) * 100} />
              <MacroRing label="Fats"          value={nutrition.fats}    unit="g" color="#f97316" bgColor="#ffedd5" textColor="text-orange-600" desc="Hormones & absorption"     percentage={(nutrition.fats / 100) * 100} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">⏱ Your Timeline</h3>
                  <button onClick={() => setShowEditGoals(true)} className="text-xs bg-green-50 text-green-700 font-bold px-3 py-1 rounded-full hover:bg-green-100 transition">✏️ Edit Goals</button>
                </div>
                {[
                  { label: 'Starting weight',  value: `${profile.currentWeight}kg`, color: 'text-gray-600' },
                  { label: 'Target weight',    value: `${profile.targetWeight}kg`,  color: 'text-green-700' },
                  { label: 'Weight to change', value: `${Math.abs(parseFloat(profile.targetWeight) - parseFloat(profile.currentWeight))}kg`, color: 'text-blue-700' },
                  { label: 'Estimated time',   value: `${nutrition.weeksNeeded} weeks`, color: 'text-purple-700' },
                  { label: 'Weekly change',    value: '~0.5kg/week', color: 'text-gray-600' },
                  { label: 'Plan started',     value: formatDate(startDate) || 'Not started', color: 'text-gray-500' },
                  { label: 'Holidays this plan', value: planHolidays.length > 0 ? `${planHolidays.length} day(s)` : 'None', color: planHolidays.length > 0 ? 'text-amber-600' : 'text-gray-400' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-500">{item.label}</span>
                    <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800">💊 Priority Micronutrients</h3>
                  <button onClick={() => setShowMicroModal(true)} className="text-xs bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full hover:bg-blue-100 transition">🔬 Add Medical Data</button>
                </div>
                <div className="mb-3">
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                    {Object.keys(medicalData).length > 0 ? '🔬 Using your medical data' : '🤖 AI estimated'}
                  </span>
                </div>
                {[
                  { name: 'Iron',      pct: medicalData['Iron']      ? Math.min((parseFloat(medicalData['Iron']) / 15) * 100, 100)       : 85 },
                  { name: 'Vitamin D', pct: medicalData['Vitamin D'] ? Math.min((parseFloat(medicalData['Vitamin D']) / 50) * 100, 100)  : 70 },
                  { name: 'Magnesium', pct: medicalData['Magnesium'] ? Math.min((parseFloat(medicalData['Magnesium']) / 400) * 100, 100) : 75 },
                  { name: 'B12',       pct: medicalData['B12']       ? Math.min((parseFloat(medicalData['B12']) / 500) * 100, 100)       : 90 },
                  { name: 'Zinc',      pct: medicalData['Zinc']      ? Math.min((parseFloat(medicalData['Zinc']) / 11) * 100, 100)       : 65 },
                ].map((item, i) => {
                  const info = MICRONUTRIENT_INFO[item.name]
                  return (
                    <Tooltip key={i} content={
                      <div>
                        <p className="font-bold mb-1">{item.name}</p>
                        <p className="mb-1">💡 {info.why}</p>
                        <p className="mb-1">⚠️ Low: {info.symptoms}</p>
                        <p>🥗 {info.foods}</p>
                        {medicalData[item.name] && <p className="mt-1 text-green-300">🔬 Your level: {medicalData[item.name]}</p>}
                      </div>
                    }>
                      <div className="mb-3 cursor-help">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-700">{item.name}</span>
                          <span className="text-xs text-gray-400">{Math.round(item.pct)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-700 ${item.pct < 50 ? 'bg-red-400' : item.pct < 75 ? 'bg-yellow-400' : 'bg-green-500'}`}
                            style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ MEAL PLAN ══ */}
        {activeTab === 'meals' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-gray-800">{aiMealPlan ? '🤖 AI Generated Meal Plan' : "Today's Meal Plan"}</h2>
                {aiMealPlan && startDate && (
                  <p className="text-sm text-gray-400 mt-1">
                    📅 {formatDate(addDays(startDate, activeDay))}
                    {addDays(startDate, activeDay) === todayStr && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Today</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {aiMealPlan && (
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: 7 }, (_, i) => {
                      const date      = addDays(startDate, i)
                      const isToday   = date === todayStr
                      const holiday   = findHoliday(calendarHolidays, date)
                      const isSkip    = holiday && (profile.holidayMode || 'festive') === 'skip'
                      return (
                        <Tooltip key={i} content={holiday ? <span>{holiday.localName || holiday.name}</span> : null}>
                          <button onClick={() => setActiveDay(i)}
                            className={`relative px-2 py-1 rounded-full text-xs font-bold transition
                              ${activeDay === i ? 'bg-green-600 text-white' : isToday ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}
                              ${holiday ? 'ring-2 ring-amber-400' : ''}`}>
                            {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}{isToday && ' •'}
                            {holiday && (
                              <span className="absolute -top-1.5 -right-1.5 text-xs leading-none">
                                {isSkip ? '⊘' : '🎉'}
                              </span>
                            )}
                          </button>
                        </Tooltip>
                      )
                    })}
                  </div>
                )}
                <div className="bg-green-50 text-green-700 text-sm font-semibold px-4 py-2 rounded-full">
                  {totalCalories} kcal {Object.keys(skippedToday).length > 0 ? '(adjusted)' : ''}
                </div>
              </div>
            </div>

            {actualIntake.calories > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 mb-4 flex items-center justify-between">
                <p className="text-green-700 text-sm font-semibold">🍴 Eaten today: {actualIntake.calories} kcal · {actualIntake.protein}g protein</p>
                <p className="text-green-600 text-xs">{Math.round((actualIntake.calories / nutrition.calories) * 100)}% of daily target</p>
              </div>
            )}

            {/* Holiday banner */}
            {(() => {
              const activeDate    = startDate ? addDays(startDate, activeDay) : null
              const todayHoliday  = activeDate ? findHoliday(planHolidays, activeDate) : null
              if (!todayHoliday) return null
              const mode = profile.holidayMode || 'festive'
              return (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-3 mb-4 flex items-center gap-3">
                  <span className="text-2xl">{mode === 'skip' ? '⊘' : '🎉'}</span>
                  <div>
                    <p className="text-amber-800 font-bold text-sm">{todayHoliday.localName || todayHoliday.name}</p>
                    <p className="text-amber-600 text-xs">
                      {mode === 'festive' ? 'Festive meals suggested for this holiday' : mode === 'skip' ? 'Rest day — light meals for this holiday' : 'Holiday — treated as a normal day'}
                    </p>
                  </div>
                </div>
              )
            })()}

            <div className="space-y-4 mb-8">
              {currentDayMeals.map((meal, i) => {
                const eaten   = isMealEaten(meal)
                const skipped = isMealSkipped(meal)
                return (
                  <div key={i} className={`bg-white rounded-2xl p-5 shadow-sm transition border-2
                    ${eaten ? 'border-green-400 bg-green-50' : skipped ? 'border-gray-200 opacity-60' : 'border-transparent hover:shadow-md'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{mealIcon(meal.meal)}</span>
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">{meal.meal} · {meal.time}</p>
                          <p className={`font-bold ${eaten ? 'text-green-700 line-through opacity-70' : skipped ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{meal.name}</p>
                          {skipped && <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Skipped</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-extrabold ${skipped ? 'text-gray-400 line-through' : 'text-green-700'}`}>{meal.calories} kcal</p>
                        <p className="text-xs text-gray-400">🏪 {meal.store}</p>
                      </div>
                    </div>
                    {!skipped && (
                      <>
                        <div className="flex gap-4 mb-3">
                          {[{ label: 'Protein', value: meal.protein, color: 'text-blue-600' }, { label: 'Carbs', value: meal.carbs, color: 'text-yellow-600' }, { label: 'Fats', value: meal.fats, color: 'text-orange-600' }].map((m, j) => (
                            <div key={j} className="bg-gray-50 rounded-lg px-3 py-1">
                              <span className={`text-xs font-bold ${m.color}`}>{m.label}: </span>
                              <span className="text-xs text-gray-700">{m.value}g</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {meal.items && meal.items.map((item, j) => <span key={j} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{item}</span>)}
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-2">
                        <button onClick={() => toggleEaten(meal)}
                          className={`text-sm font-bold px-4 py-1.5 rounded-full transition ${eaten ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'}`}>
                          {eaten ? '✅ Eaten' : '○ Mark as eaten'}
                        </button>
                        <button onClick={() => toggleSkipped(meal)}
                          className={`text-sm font-bold px-4 py-1.5 rounded-full transition ${skipped ? 'bg-gray-400 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {skipped ? '↩ Undo skip' : '⊘ Skip'}
                        </button>
                      </div>
                      {aiMealPlan && !eaten && !skipped && (
                        <button onClick={() => handleSwapMeal(meal)} className="text-xs text-orange-600 font-semibold hover:text-orange-700 transition">🔄 Swap this meal</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="bg-gray-800 text-white rounded-2xl p-5">
              <h3 className="font-bold mb-4">📊 Daily Totals vs Targets</h3>
              <div className="grid grid-cols-4 gap-4">
                {[{ label: 'Calories', actual: totalCalories, target: nutrition.calories, unit: 'kcal' }, { label: 'Protein', actual: totalProtein, target: nutrition.protein, unit: 'g' }, { label: 'Carbs', actual: totalCarbs, target: nutrition.carbs, unit: 'g' }, { label: 'Fats', actual: totalFats, target: nutrition.fats, unit: 'g' }].map((item, i) => {
                  const pct = Math.round((item.actual / item.target) * 100)
                  const ok  = pct >= 85 && pct <= 115
                  return (
                    <div key={i}>
                      <p className="text-gray-400 text-xs mb-1">{item.label}</p>
                      <p className="text-2xl font-extrabold">{item.actual}<span className="text-sm text-gray-400">/{item.target}{item.unit}</span></p>
                      <p className={`text-xs font-bold mt-1 ${ok ? 'text-green-400' : 'text-yellow-400'}`}>{pct}% {ok ? '✓' : '⚠'}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ WEEKLY VIEW ══ */}
        {activeTab === 'week' && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-2xl font-extrabold text-gray-800">Weekly Overview</h2>
              <div className="flex gap-2">
                {['day', 'week', 'month'].map(v => (
                  <button key={v} onClick={() => { setCalendarView(v); setCalendarOffset(0) }}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition capitalize
                      ${calendarView === v ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCalendarOffset(o => o - 1)}
                  className="text-gray-500 hover:text-green-700 font-bold px-3 py-1 rounded-lg hover:bg-green-50 transition">← Prev</button>
                <p className="font-bold text-gray-700 text-sm">
                  {calendarView === 'day'   && formatDate(addDays(startDate || getTodayStr(), activeDay + calendarOffset))}
                  {calendarView === 'week'  && `${formatShort(weekDays[0]?.date)} — ${formatShort(weekDays[6]?.date)}`}
                  {calendarView === 'month' && `${MONTH_NAMES[monthData.month]} ${monthData.year}`}
                </p>
                <button onClick={() => setCalendarOffset(o => o + 1)}
                  className="text-gray-500 hover:text-green-700 font-bold px-3 py-1 rounded-lg hover:bg-green-50 transition">Next →</button>
              </div>

              {/* DAY VIEW */}
              {calendarView === 'day' && (() => {
                const dayIdx  = activeDay + calendarOffset
                const date    = startDate ? addDays(startDate, dayIdx) : getTodayStr()
                const meals   = aiMealPlan?.days[dayIdx]?.meals || staticDayPlan
                const eaten   = eatenMeals[`day-${dayIdx}`]   || {}
                const skipped = skippedMeals[`day-${dayIdx}`] || {}
                const active  = meals.filter(m => !skipped[m.name])
                const total   = active.reduce((s, m) => s + m.calories, 0)
                return (
                  <div className="space-y-2">
                    <p className="font-bold text-gray-700 mb-3">{formatDate(date)}</p>
                    {meals.map((m, i) => (
                      <div key={i} className={`flex justify-between items-center text-sm py-2 border-b border-gray-100 last:border-0 ${skipped[m.name] ? 'opacity-50' : ''}`}>
                        <span className={`text-gray-600 flex items-center gap-2 ${skipped[m.name] ? 'line-through' : ''}`}>
                          {mealIcon(m.meal)} {m.name}
                          {eaten[m.name]   && <span className="text-xs bg-green-100 text-green-600 px-1 rounded">✓ Eaten</span>}
                          {skipped[m.name] && <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Skipped</span>}
                        </span>
                        <span className={`font-semibold ${skipped[m.name] ? 'text-gray-400 line-through' : 'text-green-700'}`}>{m.calories} kcal</span>
                      </div>
                    ))}
                    <div className="pt-2 flex justify-between font-bold text-gray-800">
                      <span>Adjusted Total</span><span>{total} kcal</span>
                    </div>
                  </div>
                )
              })()}

              {/* WEEK VIEW */}
              {calendarView === 'week' && (
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day, i) => {
                    const isToday  = day.date === todayStr
                    const planIdx  = startDate ? Math.floor((new Date(day.date) - new Date(startDate)) / 86400000) : -1
                    const validIdx = planIdx >= 0 && planIdx <= 6 ? planIdx : -1
                    const dayMeals = validIdx >= 0 ? (aiMealPlan?.days[validIdx]?.meals || []) : []
                    const skippedD = skippedMeals[`day-${validIdx}`] || {}
                    const active   = dayMeals.filter(m => !skippedD[m.name])
                    const total    = active.reduce((s, m) => s + m.calories, 0)
                    const emoji    = getDayColor(validIdx, day.date)
                    const holiday  = findHoliday(calendarHolidays, day.date)
                    return (
                      <Tooltip key={i} content={
                        holiday
                          ? <div><p className="font-bold mb-1">🎉 {holiday.localName || holiday.name}</p>{validIdx >= 0 && <DayPopup dayIndex={validIdx} aiMealPlan={aiMealPlan} eatenMeals={eatenMeals} skippedMeals={skippedMeals} startDate={startDate} />}</div>
                          : validIdx >= 0 ? <DayPopup dayIndex={validIdx} aiMealPlan={aiMealPlan} eatenMeals={eatenMeals} skippedMeals={skippedMeals} startDate={startDate} />
                          : <p>No plan for this day</p>}>
                        <div onClick={() => { if (validIdx >= 0) setActiveDay(validIdx) }}
                          className={`relative rounded-xl p-3 text-center cursor-pointer transition
                            ${validIdx === activeDay ? 'bg-green-600 text-white shadow-lg' :
                              isToday ? 'bg-green-100 border-2 border-green-400 text-green-700' :
                              'bg-gray-50 hover:bg-green-50 text-gray-600'}
                            ${holiday ? 'ring-2 ring-amber-400' : ''}`}>
                          {holiday && (
                            <span className="absolute -top-1.5 -right-1.5 text-xs leading-none">🎉</span>
                          )}
                          <p className="text-xs font-bold">{new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short' })}</p>
                          <p className="text-sm font-semibold">{new Date(day.date).getDate()}</p>
                          <p className="text-base mt-1">{emoji}</p>
                          {total > 0 && <p className="text-xs mt-1 font-semibold">{total} kcal</p>}
                          {isToday && <p className="text-xs font-bold mt-0.5">Today</p>}
                        </div>
                      </Tooltip>
                    )
                  })}
                </div>
              )}

              {/* MONTH VIEW */}
              {calendarView === 'month' && (
                <div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {DAY_NAMES.map(d => <p key={d} className="text-xs text-gray-400 font-bold text-center py-1">{d}</p>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: monthData.firstDayOfWeek }, (_, i) => <div key={`e-${i}`} />)}
                    {monthData.days.map((day, i) => {
                      const isToday  = day.date === todayStr
                      const validIdx = day.planDayIndex
                      const emoji    = getDayColor(validIdx, day.date)
                      const holiday  = findHoliday(calendarHolidays, day.date)
                      const dayMeals = validIdx >= 0 ? (aiMealPlan?.days[validIdx]?.meals || []) : []
                      const skippedD = skippedMeals[`day-${validIdx}`] || {}
                      const total    = dayMeals.filter(m => !skippedD[m.name]).reduce((s, m) => s + m.calories, 0)
                      return (
                        <Tooltip key={i} content={
                          holiday
                            ? <div><p className="font-bold mb-1">🎉 {holiday.localName || holiday.name}</p>{validIdx >= 0 && <DayPopup dayIndex={validIdx} aiMealPlan={aiMealPlan} eatenMeals={eatenMeals} skippedMeals={skippedMeals} startDate={startDate} />}</div>
                            : validIdx >= 0 ? <DayPopup dayIndex={validIdx} aiMealPlan={aiMealPlan} eatenMeals={eatenMeals} skippedMeals={skippedMeals} startDate={startDate} />
                            : <p>{formatDate(day.date)}</p>}>
                          <div onClick={() => { if (validIdx >= 0) { setActiveDay(validIdx); setCalendarView('day') } }}
                            className={`relative rounded-lg p-1.5 text-center cursor-pointer transition min-h-12
                              ${isToday ? 'bg-green-100 border-2 border-green-400' : validIdx >= 0 ? 'bg-gray-50 hover:bg-green-50' : 'bg-white opacity-40'}
                              ${holiday ? 'ring-2 ring-amber-400' : ''}`}>
                            {holiday && (
                              <span className="absolute -top-1 -right-1 text-xs leading-none">🎉</span>
                            )}
                            <p className={`text-xs font-bold ${holiday ? 'text-amber-600' : isToday ? 'text-green-700' : 'text-gray-600'}`}>
                              {new Date(day.date).getDate()}
                            </p>
                            {validIdx >= 0 && <p className="text-sm">{emoji}</p>}
                            {total > 0 && <p className="text-xs text-gray-500">{Math.round(total / 100) * 100}</p>}
                          </div>
                        </Tooltip>
                      )
                    })}
                  </div>
                  <div className="flex gap-4 mt-4 justify-center text-xs text-gray-500 flex-wrap">
                    {[['🟢','4 meals eaten'],['🟡','2-3 meals'],['🔴','Some skipped'],['🔵','Planned'],['⬜','No data'],['🎉','Public holiday']].map(([e,l]) => (
                      <span key={l} className="flex items-center gap-1">{e} {l}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 bg-green-50 border border-green-200 rounded-2xl p-4">
              <p className="text-green-800 text-sm">
                <span className="font-bold">🛒 Weekly Shopping Estimate: </span>
                ~€45–55 at {Array.isArray(profile.store) ? profile.store[0] : profile.store}
              </p>
            </div>
          </div>
        )}

        {/* ══ HEALTH FLAGS ══ */}
        {activeTab === 'flags' && (
          <div>
            <h2 className="text-2xl font-extrabold text-gray-800 mb-2">Health Flags</h2>
            <p className="text-gray-500 mb-6">Based on your symptoms, we've made specific adjustments to your nutrition plan.</p>
            {activeSymptoms.length === 0 ? (
              <div className="bg-green-50 rounded-2xl p-8 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="font-bold text-green-700">No major health flags detected</p>
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
                      <div className="flex flex-wrap gap-2 mb-3">
                        {info.nutrients.map((n, j) => <span key={j} className="bg-white text-gray-700 text-xs font-semibold px-3 py-1 rounded-full border border-gray-200">💊 {n}</span>)}
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-dashed border-gray-200">
                        <p className="text-xs text-gray-500 font-semibold mb-1">🛒 Order supplements online</p>
                        <a href="https://www.drmax.sk" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-bold">
                          Browse {info.nutrients.join(', ')} at Dr.Max Slovakia →
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-6 bg-gray-100 rounded-2xl p-4">
              <p className="text-xs text-gray-500"><span className="font-bold">⚠️ Disclaimer: </span>NutriCart provides nutrition guidance based on general principles. This is not medical advice.</p>
            </div>
          </div>
        )}

        {activeTab === 'shopping' && <ShoppingList profile={profile} aiMealPlan={aiMealPlan} />}
        {activeTab === 'progress' && (
          <ProgressTracker profile={profile} userId={userId} />
        )}
        {activeTab === 'score' && (
          <ScoreCard profile={profile} aiMealPlan={aiMealPlan} actualIntake={actualIntake}
            eatenMeals={eatenMeals} skippedMeals={skippedMeals} startDate={startDate} />
        )}

      </div>

      {/* Modals */}
      {showStartDate  && <StartDateModal onConfirm={generateAIPlan} onClose={() => setShowStartDate(false)} />}
      {showEditGoals  && <EditGoalsModal profile={profile} onSave={(g) => { onUpdateGoals(g); setShowEditGoals(false) }} onClose={() => setShowEditGoals(false)} />}
      {showMicroModal && <MicronutrientModal existing={medicalData} onSave={setMedicalData} onClose={() => setShowMicroModal(false)} />}

      {swapMeal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-gray-800">🔄 Alternative Meals</h3>
              <button onClick={() => { setSwapMeal(null); setAlternatives([]) }} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 mb-4">
              <p className="text-sm text-orange-700"><span className="font-bold">Replacing:</span> {swapMeal.name}</p>
              <p className="text-xs text-orange-500 mt-1">{swapMeal.calories} kcal · {swapMeal.protein}g protein</p>
            </div>
            {swapLoading && <div className="text-center py-8"><div className="text-4xl mb-3">🤖</div><p className="text-gray-500 font-semibold">AI is finding alternatives...</p></div>}
            {!swapLoading && alternatives.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-3">Choose a replacement:</p>
                {alternatives.map((alt, i) => (
                  <div key={i} onClick={() => confirmSwap(alt)} className="border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 rounded-2xl p-4 cursor-pointer transition">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-bold text-gray-800 text-sm">{alt.name}</p>
                      <span className="text-green-700 font-bold text-sm">{alt.calories} kcal</span>
                    </div>
                    <div className="flex gap-3 mb-2">
                      {[{ label: 'Protein', value: alt.protein, color: 'text-blue-600' }, { label: 'Carbs', value: alt.carbs, color: 'text-yellow-600' }, { label: 'Fats', value: alt.fats, color: 'text-orange-600' }].map((m, j) => (
                        <span key={j} className="text-xs"><span className={`font-bold ${m.color}`}>{m.label}: </span><span className="text-gray-600">{m.value}g</span></span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {alt.items && alt.items.slice(0, 3).map((item, j) => <span key={j} className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">{item}</span>)}
                    </div>
                    <p className="text-green-600 text-xs font-bold mt-2">✓ Tap to swap this meal</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}