import posthog from 'posthog-js'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import ShoppingList from './ShoppingList'
import ScoreCard from './ScoreCard'
import ProgressTracker from './ProgressTracker'
import RecipeStepsModal from './RecipeStepsModal'
import BarcodeScanner from './BarcodeScanner'
import PriceHistoryModal from './PriceHistoryModal'
import StepTimer, { parseDuration } from '../utils/StepTimer'
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

function PantryPlanOptionsModal({ options, onChange, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-800">🧺 Pantry Plan Options</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
        </div>

        <div className="mb-5">
          <p className="text-sm font-bold text-gray-700 mb-2">1) Ingredient source</p>
          <div className="space-y-2">
            {[{ value: 'pantry_only', label: 'Only pantry items', desc: 'Use only ingredients currently in your pantry.' },
              { value: 'mixed', label: 'Mixed (pantry + AI suggested)', desc: 'Prioritize pantry items and add smart extras when needed.' }].map(opt => (
              <button key={opt.value}
                onClick={() => onChange({ ...options, pantryMode: opt.value })}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${options.pantryMode === opt.value ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm font-bold text-gray-700 mb-2">2) Plan scope</p>
          <div className="space-y-2">
            {[{ value: 'today', label: 'Today only', desc: 'Only update today. Keep all other days unchanged.' },
              { value: 'week', label: 'Whole remaining week', desc: 'Update all remaining days and track pantry depletion with buy reminders.' }].map(opt => (
              <button key={opt.value}
                onClick={() => onChange({ ...options, planScope: opt.value })}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${options.planScope === opt.value ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <button onClick={onConfirm} disabled={loading}
          className="bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-60">
          {loading ? '⏳ Generating…' : 'Generate Plan'}
        </button>
      </div>
    </div>
  )
}

function InsightCard({ insight }) {
  const cat = (insight.category || 'habit').toLowerCase()
  const palette = {
    energy:    { bg: 'bg-yellow-50',   border: 'border-yellow-200',   chip: 'bg-yellow-100 text-yellow-700',   header: 'text-yellow-800' },
    weight:    { bg: 'bg-blue-50',     border: 'border-blue-200',     chip: 'bg-blue-100 text-blue-700',       header: 'text-blue-800' },
    adherence: { bg: 'bg-green-50',    border: 'border-green-200',    chip: 'bg-green-100 text-green-700',     header: 'text-green-800' },
    macros:    { bg: 'bg-orange-50',   border: 'border-orange-200',   chip: 'bg-orange-100 text-orange-700',   header: 'text-orange-800' },
    symptoms:  { bg: 'bg-red-50',      border: 'border-red-200',      chip: 'bg-red-100 text-red-700',         header: 'text-red-800' },
    habit:     { bg: 'bg-purple-50',   border: 'border-purple-200',   chip: 'bg-purple-100 text-purple-700',   header: 'text-purple-800' },
    sleep:     { bg: 'bg-indigo-50',   border: 'border-indigo-200',   chip: 'bg-indigo-100 text-indigo-700',   header: 'text-indigo-800' },
    mood:      { bg: 'bg-pink-50',     border: 'border-pink-200',     chip: 'bg-pink-100 text-pink-700',       header: 'text-pink-800' },
  }
  const c = palette[cat] || palette.habit
  const conf = Math.max(1, Math.min(5, parseInt(insight.confidence, 10) || 3))
  return (
    <div className={`rounded-2xl p-5 border-2 ${c.bg} ${c.border} shadow-sm`}>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-3xl flex-shrink-0">{insight.icon || '💡'}</span>
          <h3 className={`font-extrabold text-base ${c.header}`}>{insight.headline}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.chip} capitalize`}>{cat}</span>
          <span className="text-xs font-bold text-gray-400" title={`Confidence: ${conf}/5`}>
            {'★'.repeat(conf)}{'☆'.repeat(5 - conf)}
          </span>
        </div>
      </div>
      {insight.evidence && (
        <p className="text-sm text-gray-700 mb-3 leading-relaxed">
          <span className="font-bold">📊 Evidence: </span>{insight.evidence}
        </p>
      )}
      {insight.recommendation && (
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-sm text-gray-700 leading-relaxed">
            <span className="font-bold text-gray-800">💪 Try this: </span>{insight.recommendation}
          </p>
        </div>
      )}
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
  const [swapMode, setSwapMode]             = useState('ai_suggested')
  const [swapModeMeal, setSwapModeMeal]     = useState(null)
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

  // ── v13.0 Insights state ──
  const [insights, setInsights]                 = useState(profile.cachedInsights?.insights || [])
  const [insightsStats, setInsightsStats]       = useState(profile.cachedInsights?.stats || null)
  const [insightsGeneratedAt, setInsightsGenAt] = useState(profile.insightsGeneratedAt || null)
  const [insightsLoading, setInsightsLoading]   = useState(false)
  const [insightsError, setInsightsError]       = useState(null)
  const [allMealLogs, setAllMealLogs]           = useState([])   // last 30 days
  const [allWeightLogs, setAllWeightLogs]       = useState([])   // last 30 days
  const [allCheckins, setAllCheckins]           = useState([])   // last 30 days
  const [todayCheckin, setTodayCheckin]         = useState(null) // today's check-in row, if any
  const [checkinSaving, setCheckinSaving]       = useState(false)

  // ── v14.0 Re-tune state ──
  const [replanLoading, setReplanLoading] = useState(false)
  const [replanError, setReplanError]     = useState(null)
  const [replanResult, setReplanResult]   = useState(null) // { adjustments } shown in confirmation banner

  // ── v15.0 Pantry state ──
  const [pantryItems, setPantryItems] = useState([])
  const [pantryLoading, setPantryLoading] = useState(false)
  const [pantryDraft, setPantryDraft] = useState({ name: '', quantity: '', unit: 'pcs', category: 'pantry', expiry_date: '' })
  const receiptUploadInputRef = useRef(null)
  const receiptCameraInputRef = useRef(null)
  const [receiptOcrLoading, setReceiptOcrLoading] = useState(false)
  const [receiptOcrError, setReceiptOcrError] = useState(null)
  const [receiptOcrItems, setReceiptOcrItems] = useState([])
  const [receiptOcrStore, setReceiptOcrStore] = useState('')
  const [showReceiptSourcePicker, setShowReceiptSourcePicker] = useState(false)
  const [initialPantryQtyById, setInitialPantryQtyById] = useState({})
  const [stockWarnings, setStockWarnings] = useState([])
  const [mealConsumptionMap, setMealConsumptionMap] = useState({}) // key: day-{i}:{mealName}

  // ── v16.0 Recipe steps + barcode state ──
  const [recipeModal, setRecipeModal]     = useState(null) // meal object or null
  const [showBarcode, setShowBarcode]     = useState(false)

  // ── v17.0 Priority 1: "Use what I have" smart replanning ──
  const [pantryReplanLoading, setPantryReplanLoading] = useState(false)
  const [pantryReplanError, setPantryReplanError] = useState(null)
  const [showPantryPlanOptions, setShowPantryPlanOptions] = useState(false)
  const [pantryPlanOptions, setPantryPlanOptions] = useState({ pantryMode: 'mixed', planScope: 'week' })
  const [pantryShoppingReminders, setPantryShoppingReminders] = useState([])

  // ── v17.0 Priority 2: Meal prep multiplier ──
  const [scaledMealId, setScaledMealId] = useState(null) // "mealName@HH:MM" format to identify meal
  const [mealScaleMultiplier, setMealScaleMultiplier] = useState(1)
  const [scaledMealIngredients, setScaledMealIngredients] = useState([])
  const [scaleLoading, setScaleLoading] = useState(false)

  // ── v17.0 Priority 3: Price history & prediction ──
  const [priceHistoryItem, setPriceHistoryItem] = useState(null) // null or { name, store }
  const [priceHistory, setPriceHistory] = useState([])
  const [priceStats, setPriceStats] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)

  // ── v18.0 Mood → Meal nudge ──
  const [moodNudge, setMoodNudge] = useState(null) // null | 'low_energy' | 'low_mood'
  const [moodNudgeDismissed, setMoodNudgeDismissed] = useState(false)
  const [moodNudgeLoading, setMoodNudgeLoading] = useState(false)

  // ── v18.0 Cook Now (instant pantry recipe) ──
  const [cookNowLoading, setCookNowLoading] = useState(false)
  const [cookNowRecipe, setCookNowRecipe]   = useState(null) // recipe object | null
  const [cookNowError, setCookNowError]     = useState(null)
  const [cookNowUsed, setCookNowUsed]       = useState(false) // true after pantry deducted

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
        .select('*')
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
  }, [userId, startDate])

  // ── v13.0: Load last 30 days of data for Insights ──
  useEffect(() => {
    if (!userId) return
    const today  = getTodayStr()
    const since  = addDays(today, -30)
    async function loadAll() {
      const [{ data: meals }, { data: weights }, { data: checks }, { data: todayRow }] = await Promise.all([
        supabase.from('meal_logs').select('*').eq('user_id', userId).gte('log_date', since).order('log_date', { ascending: true }),
        supabase.from('weight_logs').select('*').eq('user_id', userId).gte('log_date', since).order('log_date', { ascending: true }),
        supabase.from('daily_checkins').select('*').eq('user_id', userId).gte('checkin_date', since).order('checkin_date', { ascending: true }),
        supabase.from('daily_checkins').select('*').eq('user_id', userId).eq('checkin_date', today).maybeSingle(),
      ])
      setAllMealLogs(meals || [])
      setAllWeightLogs(weights || [])
      setAllCheckins(checks || [])
      setTodayCheckin(todayRow || null)
    }
    loadAll().catch(err => console.warn('insights data load failed:', err.message))
  }, [userId])

  // ── v15.0: Load pantry items ──
  useEffect(() => {
    if (!userId) return
    async function loadPantry() {
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('❌ Pantry load error:', error)
      } else {
        console.log('📦 Pantry loaded:', data?.length || 0, 'items')
        if (data) {
          setPantryItems(data)
          setInitialPantryQtyById(prev => {
            const next = { ...prev }
            data.forEach(p => {
              if (next[p.id] === undefined && Number.isFinite(Number(p.quantity))) {
                next[p.id] = Number(p.quantity)
              }
            })
            return next
          })
        }
      }
    }
    loadPantry()
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
  const firstUpcomingMealName = currentDayMeals.find(m => !(eatenMeals[todayKey] || {})[m.name] && !(skippedMeals[todayKey] || {})[m.name])?.name
  const stockWarningStorageKey = `nutricart:stockWarnings:${userId || 'anon'}:${todayKey}`

  const actualIntake = {
    calories: Object.values(eatenToday).reduce((s, m) => s + (m.calories || 0), 0),
    protein:  Object.values(eatenToday).reduce((s, m) => s + (m.protein  || 0), 0),
    carbs:    Object.values(eatenToday).reduce((s, m) => s + (m.carbs    || 0), 0),
    fats:     Object.values(eatenToday).reduce((s, m) => s + (m.fats     || 0), 0),
  }

  function toCanonicalUnit(u = '') {
    const unit = String(u || '').trim().toLowerCase()
    if (unit === 'x' || unit === 'pc') return 'pcs'
    return unit
  }

  function normalizeItemText(raw = '') {
    return String(raw)
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const VOL_TO_ML = { tbsp: 15, tsp: 5, cup: 240 }

  function parseItemAmount(raw = '') {
    const text = String(raw).toLowerCase()
    const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs|pc|x|tbsp|tsp|cup|pack)\b/)
    if (match) {
      let qty = parseFloat(match[1])
      let unit = toCanonicalUnit(match[2])
      // Normalize volume cooking units → mL for consistent pantry deduction
      if (VOL_TO_ML[unit]) { qty = +(qty * VOL_TO_ML[unit]).toFixed(1); unit = 'ml' }
      return { qty, unit }
    }
    const numOnly = text.match(/(\d+(?:\.\d+)?)/)
    if (numOnly) return { qty: parseFloat(numOnly[1]), unit: 'pcs' }
    return { qty: 1, unit: 'pcs' }
  }

  function convertToUnit(qty, fromUnit, toUnit) {
    const from = toCanonicalUnit(fromUnit)
    const to = toCanonicalUnit(toUnit)
    if (!Number.isFinite(qty)) return null
    if (!from || !to || from === to) return qty

    // Mass conversions
    if (from === 'kg' && to === 'g') return qty * 1000
    if (from === 'g' && to === 'kg') return qty / 1000

    // Volume conversions via ml base unit
    const volumeToMl = {
      ml: 1,
      l: 1000,
      tsp: 5,
      tbsp: 15,
      cup: 240,
    }
    if (volumeToMl[from] && volumeToMl[to]) {
      return (qty * volumeToMl[from]) / volumeToMl[to]
    }

    // Piece-like units
    if ((from === 'pack' && to === 'pcs') || (from === 'pcs' && to === 'pack')) return qty

    return null
  }

  function getMealPantryRequirements(meal) {
    const mealItems = Array.isArray(meal?.items) ? meal.items : []
    const reqs = []
    for (const rawItem of mealItems) {
      const normalized = normalizeItemText(rawItem)
      const amount = parseItemAmount(rawItem)
      const candidates = pantryItems
        .filter(p => normalized.includes(String(p.name || '').toLowerCase()))
        .sort((a, b) => (String(b.name || '').length - String(a.name || '').length))
      const match = candidates[0]
      if (!match) continue
      const pantryUnit = toCanonicalUnit(match.unit || amount.unit || 'pcs')
      const converted = convertToUnit(amount.qty, amount.unit, pantryUnit)
      reqs.push({
        id: match.id,
        name: match.name,
        unit: pantryUnit,
        neededQty: Number.isFinite(converted) ? converted : amount.qty,
      })
    }
    return reqs
  }

  function isMealBlockedByPantry(meal) {
    const reqs = getMealPantryRequirements(meal)
    if (reqs.length === 0) return false
    return reqs.some(r => {
      const item = pantryItems.find(p => p.id === r.id)
      const available = Number(item?.quantity)
      return Number.isFinite(available) && available <= 0
    })
  }

  function getOutOfStockForMeal(meal) {
    const reqs = getMealPantryRequirements(meal)
    const out = reqs
      .filter(r => {
        const item = pantryItems.find(p => p.id === r.id)
        const available = Number(item?.quantity)
        return Number.isFinite(available) && available <= 0
      })
      .map(r => String(r.name || '').toLowerCase())
    return Array.from(new Set(out))
  }

  function pushStockWarning(warning) {
    setStockWarnings(prev => {
      if (prev.some(w => w.key === warning.key)) return prev
      return [warning, ...prev].slice(0, 5)
    })
  }

  const firstUpcomingMeal = currentDayMeals.find(m => m.name === firstUpcomingMealName)
  const persistentOutOfStockWarning = firstUpcomingMeal && isMealBlockedByPantry(firstUpcomingMeal)
    ? {
        key: `persist:${todayKey}:${firstUpcomingMeal.name}`,
        type: 'out',
        itemName: getOutOfStockForMeal(firstUpcomingMeal).join(', ') || firstUpcomingMeal.name,
        qtyLeft: 0,
        unit: '',
      }
    : null
  const visibleStockWarning = stockWarnings[0] || persistentOutOfStockWarning

  useEffect(() => {
    try {
      const raw = localStorage.getItem(stockWarningStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setStockWarnings(parsed)
    } catch (_) {}
  }, [stockWarningStorageKey])

  useEffect(() => {
    try {
      localStorage.setItem(stockWarningStorageKey, JSON.stringify(stockWarnings))
    } catch (_) {}
  }, [stockWarnings, stockWarningStorageKey])

  // ── Toggle eaten — saves to Supabase ──
  async function toggleEaten(meal) {
    const key              = meal.name
    const isCurrentlyEaten = !!(eatenMeals[todayKey] || {})[key]

    if (!isCurrentlyEaten && isMealBlockedByPantry(meal)) {
      pushStockWarning({
        key: `blocked:${todayKey}:${meal.name}`,
        type: 'blocked',
        itemName: meal.name,
        qtyLeft: 0,
        unit: '',
        time: Date.now(),
      })
      return
    }

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

      // Restore pantry quantities when unmarking as eaten
      const consumeKey = `${todayKey}:${key}`
      const consumed = mealConsumptionMap[consumeKey] || []
      if (consumed.length > 0) {
        for (const c of consumed) {
          const item = pantryItems.find(p => p.id === c.id)
          if (!item) continue
          const current = Number(item.quantity)
          if (!Number.isFinite(current)) continue
          await updatePantryItem(c.id, { quantity: +(current + c.qty).toFixed(3) })
        }
        setMealConsumptionMap(prev => {
          const next = { ...prev }
          delete next[consumeKey]
          return next
        })
      }
    } else {
      // Consume pantry quantities for this meal
      const requirements = getMealPantryRequirements(meal)
      const consumed = []
      for (const req of requirements) {
        const item = pantryItems.find(p => p.id === req.id)
        if (!item) continue
        const available = Number(item.quantity)
        if (!Number.isFinite(available)) continue
        const nextQty = Math.max(0, +(available - req.neededQty).toFixed(3))
        await updatePantryItem(req.id, { quantity: nextQty })
        consumed.push({ id: req.id, qty: req.neededQty, unit: req.unit })

        const initial = Number(initialPantryQtyById[item.id])
        if (Number.isFinite(initial) && initial > 0) {
          const threshold = initial * 0.2
          if (available > threshold && nextQty <= threshold && nextQty > 0) {
            pushStockWarning({
              key: `low:${item.id}`,
              type: 'low',
              itemName: item.name,
              qtyLeft: nextQty,
              unit: item.unit || '',
              time: Date.now(),
            })
          }
          if (nextQty <= 0) {
            pushStockWarning({
              key: `out:${item.id}`,
              type: 'out',
              itemName: item.name,
              qtyLeft: 0,
              unit: item.unit || '',
              time: Date.now(),
            })
          }
        }
      }
      if (consumed.length > 0) {
        const consumeKey = `${todayKey}:${key}`
        setMealConsumptionMap(prev => ({ ...prev, [consumeKey]: consumed }))
      }

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
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() },
        body: JSON.stringify({
          ...profile,
          calories:     nutrition.calories,
          protein:      nutrition.protein,
          carbs:        nutrition.carbs,
          fats:         nutrition.fats,
          startDate:    planStart,
          holidays:     planHolidays,
          holidayMode:  profile.holidayMode || 'festive',
          pantry:       pantryItems,
        })
      })
      const data = await response.json()
      if (data.success) {
        setAiMealPlan(data.mealPlan)
        setStartDate(planStart)
        setActiveDay(getDayIndex(planStart))
        setActiveTab('meals')
        posthog.capture('meal_plan_generated', { start_date: planStart, pantry_items: pantryItems.length })
        await onSaveMealPlan(data.mealPlan, planStart)
      } else {
        setAiError('Could not generate plan. Please try again.')
      }
    } catch { setAiError('Backend not reachable.') }
    finally { setLoading(false) }
  }

  async function handleSwapMeal(meal, mode = 'ai_suggested') {
    setSwapMode(mode)
    setSwapMeal(meal); setSwapLoading(true); setAlternatives([])
    try {
      const outOfStockItems = getOutOfStockForMeal(meal)
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/swapmeal', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() },
        body: JSON.stringify({ meal, profile, swapMode: mode, pantryItems, outOfStockItems })
      })
      const data = await response.json()
      if (data.success) setAlternatives(data.alternatives)
    } catch (err) { console.error(err) }
    finally { setSwapLoading(false) }
  }

  function openSwapChooserForMeal(meal, disableMealActions) {
    if (disableMealActions) {
      setSwapModeMeal(meal)
      return
    }
    handleSwapMeal(meal, 'ai_suggested')
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

  // ── v13.0: Daily check-in widget ──
  async function saveCheckin(field, value) {
    if (!userId) return
    setCheckinSaving(true)
    const today = getTodayStr()
    const next  = { ...(todayCheckin || { user_id: userId, checkin_date: today }), [field]: value }
    setTodayCheckin(next) // optimistic
    const { data, error } = await supabase
      .from('daily_checkins')
      .upsert({ user_id: userId, checkin_date: today, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,checkin_date' })
      .select()
      .maybeSingle()
    if (data && !error) {
      setTodayCheckin(data)
      setAllCheckins(prev => {
        const without = prev.filter(c => c.checkin_date !== today)
        return [...without, data].sort((a, b) => a.checkin_date.localeCompare(b.checkin_date))
      })
    }
    // ── v18.0 Mood nudge: show banner when energy or mood ≤ 2 ──
    if ((field === 'energy' || field === 'mood') && value <= 2 && !moodNudgeDismissed) {
      setMoodNudge(field === 'energy' ? 'low_energy' : 'low_mood')
    }
    posthog.capture('daily_checkin_submitted', { field, value })
    setCheckinSaving(false)
  }

  // ── v15.0: Pantry CRUD ──
  async function addPantryItem(draft) {
    if (!userId || !draft.name?.trim()) return
    setPantryLoading(true)
    const payload = {
      user_id:     userId,
      name:        draft.name.trim().toLowerCase(),
      quantity:    draft.quantity ? parseFloat(draft.quantity) : null,
      unit:        draft.unit || null,
      category:    draft.category || 'pantry',
      expiry_date: draft.expiry_date || null,
    }
    const { data, error } = await supabase.from('pantry_items').insert(payload).select().single()
    if (data && !error) {
      setPantryItems(prev => [data, ...prev])
      if (Number.isFinite(Number(data.quantity))) {
        setInitialPantryQtyById(prev => ({ ...prev, [data.id]: Number(data.quantity) }))
      }
    }
    setPantryLoading(false)
  }

  async function deletePantryItem(id) {
    setPantryItems(prev => prev.filter(p => p.id !== id))
    setInitialPantryQtyById(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (!userId) return
    await supabase.from('pantry_items').delete().eq('id', id).eq('user_id', userId)
  }

  async function updatePantryItem(id, patch) {
    setPantryItems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    if (!userId) return
    await supabase.from('pantry_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  }

  async function adjustPantryQuantity(item, mode) {
    const unit = item.unit || 'pcs'
    const action = mode === 'add' ? 'add' : 'reduce'
    const input = window.prompt(`${action === 'add' ? 'Add' : 'Reduce'} how many ${unit} for ${item.name}?`)
    if (input === null) return
    const amount = Number.parseFloat(String(input).replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert('Please enter a valid positive number.')
      return
    }

    const current = Number(item.quantity)
    const safeCurrent = Number.isFinite(current) ? current : 0
    const nextQty = mode === 'add'
      ? +(safeCurrent + amount).toFixed(3)
      : +Math.max(0, safeCurrent - amount).toFixed(3)

    await updatePantryItem(item.id, { quantity: nextQty })

    if (mode === 'add') {
      setInitialPantryQtyById(prev => {
        const previousInitial = Number(prev[item.id])
        const baseline = Number.isFinite(previousInitial) ? previousInitial : 0
        return { ...prev, [item.id]: Math.max(baseline, nextQty) }
      })
    } else {
      const initial = Number(initialPantryQtyById[item.id])
      if (Number.isFinite(initial) && initial > 0) {
        const threshold = initial * 0.2
        if (safeCurrent > threshold && nextQty <= threshold && nextQty > 0) {
          pushStockWarning({
            key: `low:${item.id}`,
            type: 'low',
            itemName: item.name,
            qtyLeft: nextQty,
            unit: item.unit || '',
            time: Date.now(),
          })
        }
        if (nextQty <= 0) {
          pushStockWarning({
            key: `out:${item.id}`,
            type: 'out',
            itemName: item.name,
            qtyLeft: 0,
            unit: item.unit || '',
            time: Date.now(),
          })
        }
      }
    }
  }

  function mapShoppingCategoryToPantry(category = '') {
    const c = String(category).toLowerCase()
    if (c.includes('meat') || c.includes('fish')) return 'freezer'
    if (c.includes('dairy') || c.includes('vegetables') || c.includes('fruits') || c.includes('produce') || c.includes('fresh')) return 'fridge'
    if (c.includes('condiments') || c.includes('spices')) return 'spices'
    return 'pantry'
  }

  function stripAmountFromItemName(raw = '') {
    const cleaned = String(raw)
      .toLowerCase()
      .replace(/\b\d+(?:\.\d+)?\s*(kg|g|l|ml|pcs|pc|x|tbsp|tsp|cup|pack)\b/g, ' ')
      .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return cleaned || normalizeItemText(raw) || 'item'
  }

  async function addBoughtItemsToPantry(boughtItems = []) {
    if (!userId || !Array.isArray(boughtItems) || boughtItems.length === 0) return
    setPantryLoading(true)
    let added = 0
    let updated = 0
    const localPantry = [...pantryItems]

    for (const b of boughtItems) {
      const parsed = parseItemAmount(b.name || '')
      const multiplier = Math.max(1, Number(b.count) || 1)
      const qtyToAdd = +(parsed.qty * multiplier).toFixed(3)
      const unit = toCanonicalUnit(parsed.unit || 'pcs')
      const name = stripAmountFromItemName(b.name || '')
      const category = mapShoppingCategoryToPantry(b.category)

      const existing = localPantry.find(p => {
        return normalizeItemText(p.name) === normalizeItemText(name)
          && toCanonicalUnit(p.unit || unit) === unit
      })

      if (existing) {
        const current = Number(existing.quantity)
        const nextQty = +((Number.isFinite(current) ? current : 0) + qtyToAdd).toFixed(3)
        await updatePantryItem(existing.id, {
          quantity: nextQty,
          category: existing.category || category,
          unit: existing.unit || unit,
        })
        existing.quantity = nextQty
        existing.category = existing.category || category
        existing.unit = existing.unit || unit
        setInitialPantryQtyById(prev => {
          const baseline = Number(prev[existing.id])
          return { ...prev, [existing.id]: Math.max(Number.isFinite(baseline) ? baseline : 0, nextQty) }
        })
        updated++
      } else {
        const payload = {
          user_id: userId,
          name,
          quantity: qtyToAdd,
          unit,
          category,
          expiry_date: null,
        }
        const { data, error } = await supabase.from('pantry_items').insert(payload).select().single()
        if (data && !error) {
          setPantryItems(prev => [data, ...prev])
          localPantry.unshift(data)
          if (Number.isFinite(Number(data.quantity))) {
            setInitialPantryQtyById(prev => ({ ...prev, [data.id]: Number(data.quantity) }))
          }
          added++
        }
      }
    }

    setPantryLoading(false)
    setActiveTab('pantry')
    posthog.capture('bought_items_added_to_pantry', { added, updated, total: boughtItems.length })
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsDataURL(file)
    })
  }

  async function parseReceiptImage(file) {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setReceiptOcrError('Please upload a photo file (jpg, png, heic).')
      return
    }
    setReceiptOcrLoading(true)
    setReceiptOcrError(null)
    setReceiptOcrItems([])
    try {
      const imageDataUrl = await readFileAsDataUrl(file)
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/receipt-ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
        },
        body: JSON.stringify({ imageDataUrl, storeHint: profile.store?.[0] || profile.store || 'Lidl' }),
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Could not parse receipt')
      const parsedItems = Array.isArray(data.items) ? data.items : []
      if (parsedItems.length === 0) {
        setReceiptOcrError('No grocery items detected. Try a clearer, closer photo.')
      } else {
        setReceiptOcrItems(parsedItems)
        setReceiptOcrStore(data.store || '')
      }
    } catch (err) {
      setReceiptOcrError(err.message || 'Receipt OCR failed. Please try again.')
    } finally {
      setReceiptOcrLoading(false)
      if (receiptUploadInputRef.current) receiptUploadInputRef.current.value = ''
      if (receiptCameraInputRef.current) receiptCameraInputRef.current.value = ''
    }
  }

  async function addReceiptItemsToPantry(parsedItems = receiptOcrItems) {
    if (!userId || !Array.isArray(parsedItems) || parsedItems.length === 0) return
    setPantryLoading(true)
    setReceiptOcrError(null)
    let added = 0
    let updated = 0
    const localPantry = [...pantryItems]

    for (const r of parsedItems) {
      const name = stripAmountFromItemName(r.name || '')
      if (!name) continue
      let qtyToAdd = Number(r.quantity)
      if (!Number.isFinite(qtyToAdd) || qtyToAdd <= 0) qtyToAdd = 1
      let unit = toCanonicalUnit(r.unit || 'pcs')
      if (unit === 'tbsp') { qtyToAdd = +(qtyToAdd * 15).toFixed(1); unit = 'ml' }
      if (unit === 'tsp') { qtyToAdd = +(qtyToAdd * 5).toFixed(1); unit = 'ml' }
      if (unit === 'cup') { qtyToAdd = +(qtyToAdd * 240).toFixed(1); unit = 'ml' }
      const category = mapShoppingCategoryToPantry(r.category || 'pantry')

      const existing = localPantry.find(p => {
        if (normalizeItemText(p.name) !== normalizeItemText(name)) return false
        const pUnit = toCanonicalUnit(p.unit || unit)
        return pUnit === unit || Number.isFinite(convertToUnit(qtyToAdd, unit, pUnit)) || (pUnit === 'pcs' && unit !== 'pcs')
      })

      if (existing) {
        const existingUnit = toCanonicalUnit(existing.unit || unit)
        let qtyForExisting = convertToUnit(qtyToAdd, unit, existingUnit)
        let patchUnit = existing.unit || existingUnit
        if (!Number.isFinite(qtyForExisting) && existingUnit === 'pcs' && unit !== 'pcs') {
          qtyForExisting = qtyToAdd
          patchUnit = unit
        }
        if (!Number.isFinite(qtyForExisting)) continue

        const current = Number(existing.quantity)
        const nextQty = +((Number.isFinite(current) ? current : 0) + qtyForExisting).toFixed(3)
        await updatePantryItem(existing.id, {
          quantity: nextQty,
          category: existing.category || category,
          unit: patchUnit,
        })
        existing.quantity = nextQty
        existing.category = existing.category || category
        existing.unit = patchUnit
        setInitialPantryQtyById(prev => {
          const baseline = Number(prev[existing.id])
          return { ...prev, [existing.id]: Math.max(Number.isFinite(baseline) ? baseline : 0, nextQty) }
        })
        updated++
      } else {
        const payload = {
          user_id: userId,
          name,
          quantity: qtyToAdd,
          unit,
          category,
          expiry_date: null,
        }
        const { data, error } = await supabase.from('pantry_items').insert(payload).select().single()
        if (data && !error) {
          setPantryItems(prev => [data, ...prev])
          localPantry.unshift(data)
          if (Number.isFinite(Number(data.quantity))) {
            setInitialPantryQtyById(prev => ({ ...prev, [data.id]: Number(data.quantity) }))
          }
          added++
        }
      }
    }

    setPantryLoading(false)
    setReceiptOcrItems([])
    setReceiptOcrStore('')
    setActiveTab('pantry')
    posthog.capture('receipt_ocr_items_added_to_pantry', {
      added,
      updated,
      total: parsedItems.length,
      store: receiptOcrStore || 'unknown',
    })
  }

  // Helper: find pantry items expiring within N days
  function expiringPantry(daysAhead = 3) {
    const today = getTodayStr()
    return pantryItems.filter(p => {
      if (!p.expiry_date) return false
      const days = (new Date(p.expiry_date) - new Date(today)) / 86400000
      return days >= 0 && days <= daysAhead
    })
  }

  // ── v14.0: Re-tune remaining days based on actual logs ──
  async function replanRemainingDays() {
    if (!aiMealPlan || !startDate) return
    setReplanLoading(true)
    setReplanError(null)
    setReplanResult(null)
    try {
      const planStart = startDate
      const planEnd   = addDays(startDate, 6)
      // Use the meals already loaded for this plan window
      const windowLogs = allMealLogs.filter(m => m.log_date >= planStart && m.log_date <= planEnd)
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/replan', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() },
        body: JSON.stringify({
          profile:     { ...profile, pantry: pantryItems },
          currentPlan: aiMealPlan,
          mealLogs:    windowLogs,
          todayDate:   getTodayStr(),
        }),
      })
      const data = await response.json()
      if (data.success) {
        setAiMealPlan(data.mealPlan)
        await onSaveMealPlan(data.mealPlan, startDate)
        setReplanResult(data.adjustments)
      } else {
        setReplanError(data.error || 'Could not re-tune plan right now.')
      }
    } catch (err) {
      setReplanError('Backend not reachable.')
    } finally {
      setReplanLoading(false)
    }
  }

  // ── v17.0: Regenerate plan to prioritize pantry items ──
  async function replanUsingPantry(opts = pantryPlanOptions) {
    if (!aiMealPlan || !startDate || pantryItems.length === 0) return
    setPantryReplanLoading(true)
    setPantryReplanError(null)
    setPantryShoppingReminders([])
    try {
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/replan-with-pantry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
        },
        body: JSON.stringify({
          profile: { ...profile, pantry: pantryItems },
          currentPlan: aiMealPlan,
          pantryItems: pantryItems,
          pantryMode: opts.pantryMode,
          planScope: opts.planScope,
          todayDate: getTodayStr(),
        }),
      })
      const data = await response.json()
      if (data.success) {
        setAiMealPlan(data.mealPlan)
        await onSaveMealPlan(data.mealPlan, startDate)
        setPantryShoppingReminders(Array.isArray(data.shoppingReminders) ? data.shoppingReminders : [])
        setShowPantryPlanOptions(false)
        posthog.capture('pantry_replan_generated', {
          pantry_items: pantryItems.length,
          days: data.mealPlan.days.length,
          pantry_mode: opts.pantryMode,
          plan_scope: opts.planScope,
        })
      } else {
        setPantryReplanError(data.error || 'Could not regenerate plan right now.')
      }
    } catch (err) {
      setPantryReplanError('Backend not reachable. Please try again.')
    } finally {
      setPantryReplanLoading(false)
    }
  }

  // ── v18.0: Swap today's meals to comfort food when mood/energy is low ──
  async function swapTodayToComfort() {
    if (!aiMealPlan || !startDate) return
    setMoodNudgeLoading(true)
    try {
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/replan-with-pantry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
        },
        body: JSON.stringify({
          profile: { ...profile, pantry: pantryItems, moodOverride: 'comfort' },
          currentPlan: aiMealPlan,
          pantryItems: pantryItems,
          pantryMode: 'mixed',
          planScope: 'today',
          todayDate: getTodayStr(),
          comfortMode: true,
        }),
      })
      const data = await response.json()
      if (data.success) {
        setAiMealPlan(data.mealPlan)
        await onSaveMealPlan(data.mealPlan, startDate)
        posthog.capture('comfort_swap_used', { reason: moodNudge })
      }
    } catch (_) {}
    setMoodNudgeLoading(false)
    setMoodNudge(null)
    setMoodNudgeDismissed(true)
  }

  // ── v18.0: Cook Now — instant recipe from pantry ──
  async function cookNow() {
    const availablePantry = pantryItems.filter(p => {
      const qty = Number(p.quantity)
      return Number.isFinite(qty) && qty > 0
    })
    if (availablePantry.length === 0) {
      setCookNowError('No in-stock pantry items available. Add or restock items first.')
      return
    }
    setCookNowLoading(true)
    setCookNowError(null)
    setCookNowRecipe(null)
    setCookNowUsed(false)
    try {
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/cook-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
        },
        body: JSON.stringify({ pantryItems: availablePantry, profile, userId }),
      })
      const data = await response.json()
      if (data.success) {
        setCookNowRecipe(data.recipe)
        posthog.capture('cook_now_recipe_received', { recipe: data.recipe?.name })
      } else {
        setCookNowError(data.error || 'Could not generate a recipe right now.')
      }
    } catch (_) {
      setCookNowError('Network error — please try again.')
    }
    setCookNowLoading(false)
  }

  // Deduct pantry quantities after cooking a Cook Now recipe
  async function markCookNowCooked() {
    if (!cookNowRecipe || cookNowUsed) return
    const usedIngredients = cookNowRecipe.usedIngredients || []
    let deductedCount = 0
    for (const ing of usedIngredients) {
      // Support both old string format and new {name, qty} format
      const ingName = typeof ing === 'object' ? ing.name : ing
      const ingQty  = typeof ing === 'object' ? ing.qty  : null
      // Find matching pantry item
      const match = pantryItems
        .filter(p => {
          const pn = String(p.name || '').toLowerCase()
          const ign = String(ingName || '').toLowerCase()
          return pn.includes(ign) || ign.includes(pn)
        })
        .sort((a, b) => String(b.name).length - String(a.name).length)[0]
      if (!match) continue
      const available = Number(match.quantity)
      if (!Number.isFinite(available)) continue
      // Parse the qty string from AI (e.g. "150g", "2 tbsp", "1 pcs") or fall back to 1
      const parsed = ingQty ? parseItemAmount(ingQty) : { qty: 1, unit: 'pcs' }
      const pantryUnit = toCanonicalUnit(match.unit || parsed.unit || 'pcs')
      const converted = convertToUnit(parsed.qty, parsed.unit, pantryUnit)
      const deductQty = Number.isFinite(converted) ? converted : parsed.qty
      const nextQty = Math.max(0, +(available - deductQty).toFixed(3))
      await updatePantryItem(match.id, { quantity: nextQty })
      deductedCount++
      const initial = Number(initialPantryQtyById[match.id])
      if (Number.isFinite(initial) && initial > 0) {
        const threshold = initial * 0.2
        if (available > threshold && nextQty <= threshold && nextQty > 0) {
          pushStockWarning({ key: `low:${match.id}`, type: 'low', itemName: match.name, qtyLeft: nextQty, unit: match.unit || '', time: Date.now() })
        }
        if (nextQty <= 0) {
          pushStockWarning({ key: `out:${match.id}`, type: 'out', itemName: match.name, qtyLeft: 0, unit: match.unit || '', time: Date.now() })
        }
      }
    }
    setCookNowUsed(true)
    posthog.capture('cook_now_pantry_deducted', { recipe: cookNowRecipe.name, items_deducted: deductedCount })
  }

  // ── v17.0: Scale meal ingredients for meal prep (2x, 3x, etc) ──
  async function scaleMeal(meal, multiplier) {
    if (multiplier < 1) return
    setScaleLoading(true)
    try {
      const mealId = `${meal.name}@${meal.time}`
      setScaledMealId(mealId)
      setMealScaleMultiplier(multiplier)
      
      console.log('🍳 Scaling meal:', meal.name, 'x', multiplier, 'items:', meal.items)
      
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/scale-meal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
        },
        body: JSON.stringify({
          meal,
          multiplier,
        }),
      })
      const data = await response.json()
      console.log('📊 Scale response:', data)
      if (data.success) {
        setScaledMealIngredients(data.scaledIngredients)
        posthog.capture('meal_scaled', { meal_name: meal.name, multiplier })
      } else {
        console.error('❌ Scale error:', data.error)
      }
    } catch (err) {
      console.error('❌ Scale meal error:', err)
    } finally {
      setScaleLoading(false)
    }
  }

  function getScaledMealForCooking(meal) {
    const mealId = `${meal.name}@${meal.time}`
    const isScaledSelection =
      scaledMealId === mealId &&
      mealScaleMultiplier > 1 &&
      Array.isArray(scaledMealIngredients) &&
      scaledMealIngredients.length > 0

    if (!isScaledSelection) return { ...meal, multiplier: 1 }

    const scaledItems = scaledMealIngredients.map((ing) => {
      const qty = ing.quantity ? `${ing.quantity}` : ''
      const unit = ing.unit ? ` ${ing.unit}` : ''
      const item = ing.item || ''
      return `${qty}${unit} ${item}`.trim()
    })

    return {
      ...meal,
      items: scaledItems,
      calories: Math.round((+meal.calories || 0) * mealScaleMultiplier),
      protein: Math.round((+meal.protein || 0) * mealScaleMultiplier),
      carbs: Math.round((+meal.carbs || 0) * mealScaleMultiplier),
      fats: Math.round((+meal.fats || 0) * mealScaleMultiplier),
      multiplier: mealScaleMultiplier,
    }
  }

  // ── v17.0 Priority 3: Fetch price history for an item ──
  async function showPriceHistory(itemName) {
    setPriceLoading(true)
    setPriceHistoryItem({ name: itemName, store: profile.store?.[0] || 'Lidl' })
    try {
      const response = await fetch(`https://nutricart-production-cd53.up.railway.app/api/price-history/${encodeURIComponent(itemName)}?store=${profile.store?.[0] || 'Lidl'}&days=90`, {
        headers: {
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
        },
      })
      const data = await response.json()
      if (data.success) {
        setPriceHistory(data.history || [])
        setPriceStats(data.stats || {})
        posthog.capture('price_history_viewed', { item: itemName })
      }
    } catch (err) {
      console.error('Price history error:', err)
    } finally {
      setPriceLoading(false)
    }
  }

  // ── Compute current adherence to flag the user when re-tuning is recommended ──
  function computeCurrentAdherence() {
    if (!aiMealPlan || !startDate) return null
    const today = getTodayStr()
    let goalCalSum = 0, actualCalSum = 0, pastDayCount = 0
    for (const day of aiMealPlan.days) {
      if (!day.date || day.date >= today) continue
      pastDayCount++
      goalCalSum += day.totalCalories || day.meals?.reduce((s, m) => s + (+m.calories || 0), 0) || 0
      const dayLogs = allMealLogs.filter(m => m.log_date === day.date && !m.skipped)
      actualCalSum += dayLogs.reduce((s, m) => s + (+m.calories || 0), 0) || (goalCalSum / Math.max(pastDayCount, 1)) // assume planned if no logs
    }
    if (pastDayCount < 2 || goalCalSum === 0) return null
    const adherencePct = Math.round((actualCalSum / goalCalSum) * 100)
    return { adherencePct, pastDayCount, deviation: actualCalSum - goalCalSum }
  }
  const currentAdherence = computeCurrentAdherence()

  // ── v13.0: Generate insights ──
  async function refreshInsights() {
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      const response = await fetch('https://nutricart-production-cd53.up.railway.app/api/insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id() },
        body: JSON.stringify({
          profile,
          mealLogs:   allMealLogs,
          weightLogs: allWeightLogs,
          checkins:   allCheckins,
        }),
      })
      const data = await response.json()
      if (data.success) {
        setInsights(data.insights || [])
        setInsightsStats(data.stats || null)
        setInsightsGenAt(data.generatedAt || new Date().toISOString())
        posthog.capture('insights_generated', { insight_count: (data.insights || []).length, sample_days: data.stats?.sampleDays })
        // Persist to profile so they show on next login
        if (userId) {
          await supabase.from('profiles').update({
            cached_insights:       { insights: data.insights, stats: data.stats, hint: data.hint },
            insights_generated_at: new Date().toISOString(),
          }).eq('id', userId)
        }
      } else {
        setInsightsError(data.error || 'Could not generate insights right now.')
      }
    } catch (err) {
      setInsightsError('Backend not reachable.')
    } finally {
      setInsightsLoading(false)
    }
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
            { id: 'insights',  label: '💡 Insights' },
            { id: 'pantry',    label: '🧺 Pantry' },
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

            {/* v13.0 Daily Check-in widget */}
            <div className="bg-white rounded-2xl p-5 shadow-sm mb-6 border border-purple-100">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold text-gray-800">📝 Daily check-in</h3>
                <div className="flex items-center gap-2">
                  {todayCheckin && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✓ Today logged</span>}
                  <button onClick={() => setActiveTab('insights')}
                    className="text-xs bg-purple-50 text-purple-700 font-bold px-3 py-1 rounded-full hover:bg-purple-100 transition">
                    💡 See insights →
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">⚡ Energy</p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} disabled={checkinSaving} onClick={() => saveCheckin('energy', n)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition border ${todayCheckin?.energy === n ? 'bg-yellow-400 text-white border-yellow-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-yellow-50'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">😊 Mood</p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} disabled={checkinSaving} onClick={() => saveCheckin('mood', n)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition border ${todayCheckin?.mood === n ? 'bg-pink-400 text-white border-pink-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-pink-50'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">😴 Sleep</p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} disabled={checkinSaving} onClick={() => saveCheckin('sleep', n)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition border ${todayCheckin?.sleep === n ? 'bg-indigo-400 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-indigo-50'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <button onClick={() => saveCheckin('brain_fog', !todayCheckin?.brain_fog)} disabled={checkinSaving}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${todayCheckin?.brain_fog ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-purple-50'}`}>
                  🧠 Brain fog{todayCheckin?.brain_fog ? ': yes' : '?'}
                </button>
                <p className="text-xs text-gray-400">1 = poor · 5 = excellent. Builds your insights over time.</p>
              </div>
            </div>

            {/* v18.0 Mood nudge banner */}
            {moodNudge && !moodNudgeDismissed && aiMealPlan && (
              <div className="mb-6 rounded-2xl border-2 border-pink-300 bg-gradient-to-r from-pink-50 to-orange-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-3xl flex-shrink-0">{moodNudge === 'low_energy' ? '😴' : '💙'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-pink-900 text-sm">
                      {moodNudge === 'low_energy'
                        ? 'Feeling low on energy today?'
                        : 'Not feeling your best today?'}
                    </p>
                    <p className="text-pink-700 text-xs mt-0.5">
                      {moodNudge === 'low_energy'
                        ? "Let NutriCart swap today's meals for easy, energising comfort food — light, warming, and quick to make."
                        : "Let NutriCart swap today's meals for comforting food that soothes the soul. You deserve it."}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={swapTodayToComfort}
                        disabled={moodNudgeLoading}
                        className="text-xs font-bold px-4 py-2 rounded-full bg-pink-600 text-white hover:bg-pink-700 transition disabled:opacity-50">
                        {moodNudgeLoading ? '⏳ Swapping…' : '🍲 Yes, swap today\'s meals'}
                      </button>
                      <button
                        onClick={() => { setMoodNudge(null); setMoodNudgeDismissed(true) }}
                        className="text-xs font-bold px-4 py-2 rounded-full border border-pink-300 text-pink-600 hover:bg-pink-50 transition">
                        No thanks
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                      const isAdjusted = aiMealPlan?.days?.[i]?.adjusted
                      return (
                        <Tooltip key={i} content={
                          <span>
                            {holiday && <>🎉 {holiday.localName || holiday.name}<br/></>}
                            {isAdjusted && <>⚖️ Re-tuned by AI<br/></>}
                            {!holiday && !isAdjusted && new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                          </span>
                        }>
                          <button onClick={() => setActiveDay(i)}
                            className={`relative px-2 py-1 rounded-full text-xs font-bold transition
                              ${activeDay === i ? 'bg-green-600 text-white' : isToday ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}
                              ${holiday ? 'ring-2 ring-amber-400' : ''}
                              ${isAdjusted && !holiday ? 'ring-2 ring-purple-400' : ''}`}>
                            {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}{isToday && ' •'}
                            {holiday && (
                              <span className="absolute -top-1.5 -right-1.5 text-xs leading-none">
                                {isSkip ? '⊘' : '🎉'}
                              </span>
                            )}
                            {isAdjusted && !holiday && (
                              <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none">⚖️</span>
                            )}
                          </button>
                        </Tooltip>
                      )
                    })}
                  </div>
                )}
                {/* v14.0 — Manual re-tune button (always visible when a plan exists with at least one past day) */}
                {aiMealPlan && currentAdherence && (
                  <button onClick={replanRemainingDays} disabled={replanLoading}
                    className="text-xs font-bold px-4 py-2 rounded-full transition border-2 border-purple-300 text-purple-700 bg-white hover:bg-purple-50 disabled:opacity-60">
                    {replanLoading ? '⏳ Re-tuning…' : '🔁 Re-tune remaining'}
                  </button>
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

            {/* v14.0 — Re-tune confirmation (after success) */}
            {replanResult && !replanLoading && (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl px-5 py-3 mb-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-purple-800 font-bold text-sm">✅ Plan re-tuned!</p>
                  <p className="text-purple-700 text-xs mt-1">
                    Compensating for {replanResult.netCalDeviation >= 0 ? '+' : ''}{replanResult.netCalDeviation} kcal over your last {replanResult.pastDayCount} day(s).
                    Remaining {replanResult.futureDayCount} day(s) now target {replanResult.adjustedDailyCal} kcal &middot; {replanResult.adjustedDailyPro}g protein.
                  </p>
                </div>
                <button onClick={() => setReplanResult(null)} className="text-purple-600 hover:text-purple-800 font-bold text-lg leading-none flex-shrink-0">×</button>
              </div>
            )}

            {/* v14.0 — Re-tune error */}
            {replanError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">⚠️ {replanError}</div>
            )}

            {/* v14.0 — Auto-suggest banner when adherence drifts >25% off-target */}
            {aiMealPlan && currentAdherence && Math.abs(currentAdherence.adherencePct - 100) > 25 && !replanResult && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl px-5 py-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0">🔁</span>
                  <div>
                    <p className="text-purple-800 font-bold text-sm">
                      You're at {currentAdherence.adherencePct}% of your goal over the last {currentAdherence.pastDayCount} day{currentAdherence.pastDayCount === 1 ? '' : 's'}
                    </p>
                    <p className="text-purple-700 text-xs mt-0.5">
                      {currentAdherence.deviation > 0
                        ? `${Math.abs(currentAdherence.deviation)} kcal over plan — let AI re-tune the rest of the week to compensate.`
                        : `${Math.abs(currentAdherence.deviation)} kcal under plan — let AI rebalance the rest of the week to keep you on track.`}
                    </p>
                  </div>
                </div>
                <button onClick={replanRemainingDays} disabled={replanLoading}
                  className="px-5 py-2 rounded-full font-bold text-white text-sm transition shadow disabled:opacity-60 flex-shrink-0"
                  style={{ background: replanLoading ? '#9ca3af' : 'linear-gradient(to right, #7c3aed, #4f46e5)' }}>
                  {replanLoading ? '⏳ Re-tuning…' : '🔁 Re-tune now'}
                </button>
              </div>
            )}

            {/* v14.0 — "Day adjusted by AI" banner */}
            {aiMealPlan?.days?.[activeDay]?.adjusted && (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl px-5 py-3 mb-4 flex items-center gap-3">
                <span className="text-2xl">⚖️</span>
                <div>
                  <p className="text-purple-800 font-bold text-sm">This day was re-tuned by AI</p>
                  <p className="text-purple-600 text-xs">
                    {aiMealPlan.days[activeDay].reason || 'Adjusted to keep your weekly totals on track based on what you actually ate.'}
                  </p>
                </div>
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
              {visibleStockWarning && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-amber-800 font-bold text-sm">⚠ Pantry stock alert</p>
                      <p className="text-amber-700 text-xs mt-0.5">
                        {visibleStockWarning.type === 'low' && `Running low on ${visibleStockWarning.itemName} (${visibleStockWarning.qtyLeft}${visibleStockWarning.unit || ''} left)`}
                        {visibleStockWarning.type === 'out' && `${visibleStockWarning.itemName} is out of stock`}
                        {visibleStockWarning.type === 'blocked' && `Cannot mark this meal as eaten until pantry items are replenished`}
                      </p>
                    </div>
                    <button
                      onClick={() => setStockWarnings(prev => prev.slice(1))}
                      className="text-amber-700 hover:text-amber-900 text-xl leading-none">
                      ×
                    </button>
                  </div>
                </div>
              )}

              {currentDayMeals.map((meal, i) => {
                const eaten   = isMealEaten(meal)
                const skipped = isMealSkipped(meal)
                const blockedByPantry = isMealBlockedByPantry(meal)
                const isFirstUpcoming = meal.name === firstUpcomingMealName
                const disableMealActions = blockedByPantry && isFirstUpcoming && !eaten && !skipped
                return (
                  <div key={i} className={`bg-white rounded-2xl p-5 shadow-sm transition border-2
                    ${eaten ? 'border-green-400 bg-green-50' : skipped ? 'border-gray-200 opacity-60' : disableMealActions ? 'border-gray-300 bg-gray-100 opacity-70' : 'border-transparent hover:shadow-md'}`}>
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
                        {Array.isArray(meal.usesPantry) && meal.usesPantry.length > 0 && (
                          <div className="mb-3 inline-flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-full px-3 py-1">
                            <span className="text-xs font-bold text-purple-700">🧺 Uses your pantry:</span>
                            <span className="text-xs text-purple-700 capitalize">{meal.usesPantry.join(', ')}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Meal Prep Multiplier Section */}
                    <div className="mb-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-xs font-bold text-indigo-800">📦 Cook multiple portions</p>
                          <p className="text-xs text-indigo-700">Scale ingredients for meal prep</p>
                        </div>
                        <div className="flex gap-2">
                          {[1, 2, 3].map(mult => (
                            <button
                              key={mult}
                              onClick={() => scaleMeal(meal, mult)}
                              disabled={scaleLoading}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                                scaledMealId === `${meal.name}@${meal.time}` && mealScaleMultiplier === mult
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-indigo-600 border border-indigo-300 hover:bg-indigo-100'
                              }`}>
                              {mult}x
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Scaled Ingredients Display */}
                      {scaledMealId === `${meal.name}@${meal.time}` && scaledMealIngredients.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-200">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {scaledMealIngredients.map((ing, j) => (
                              <div key={j} className="bg-white rounded px-2 py-1.5 text-xs">
                                <p className="font-semibold text-gray-800">{ing.item}</p>
                                <p className="text-indigo-700 font-bold">{ing.quantity} {ing.unit}</p>
                                {ing.baseCost && ing.scaledCost && (
                                  <p className="text-gray-500 text-xs mt-0.5">
                                    {ing.baseCost}×{mealScaleMultiplier} = €{ing.scaledCost.toFixed(2)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                          {scaledMealIngredients[0]?.totalCost && (
                            <div className="mt-2 p-2 bg-white rounded border-l-4 border-green-500">
                              <p className="text-xs text-gray-600">Total cost for {mealScaleMultiplier}x:</p>
                              <p className="font-bold text-green-700">€{(scaledMealIngredients[0].totalCost * mealScaleMultiplier).toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-2">
                        <button onClick={() => toggleEaten(meal)}
                          disabled={disableMealActions}
                          className={`text-sm font-bold px-4 py-1.5 rounded-full transition ${disableMealActions ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : eaten ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'}`}>
                          {eaten ? '✅ Eaten' : '○ Mark as eaten'}
                        </button>
                        <button onClick={() => toggleSkipped(meal)}
                          className={`text-sm font-bold px-4 py-1.5 rounded-full transition ${skipped ? 'bg-gray-400 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {skipped ? '↩ Undo skip' : '⊘ Skip'}
                        </button>
                      </div>
                      {aiMealPlan && !eaten && !skipped && (
                        <button onClick={() => openSwapChooserForMeal(meal, disableMealActions)} className="text-xs text-orange-600 font-semibold hover:text-orange-700 transition">🔄 Swap this meal</button>
                      )}
                      <button
                        onClick={() => !disableMealActions && setRecipeModal(getScaledMealForCooking(meal))}
                        disabled={disableMealActions}
                        className={`text-xs font-semibold transition ${disableMealActions ? 'text-gray-400 cursor-not-allowed' : 'text-green-700 hover:text-green-800'}`}>
                        🍳 Cook this
                      </button>
                    </div>
                    {disableMealActions && (
                      <p className="text-xs text-gray-500 mt-2 font-semibold">🔒 Out of pantry stock for this upcoming meal. Refill item(s) to enable Cook/Eaten actions.</p>
                    )}
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

        {/* ══ INSIGHTS ══ (v13.0) */}
        {activeTab === 'insights' && (
          <div>
            <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-extrabold text-gray-800">💡 Your Insights</h2>
                <p className="text-gray-500 mt-1">AI-found patterns from your meal logs, weight trend, energy ratings, and check-ins over the last 30 days.</p>
                {insightsGeneratedAt && (
                  <p className="text-xs text-gray-400 mt-1">Last updated: {new Date(insightsGeneratedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                )}
              </div>
              <button onClick={refreshInsights} disabled={insightsLoading}
                className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white transition shadow-lg disabled:opacity-60"
                style={{ background: insightsLoading ? '#9ca3af' : 'linear-gradient(to right, #7c3aed, #4f46e5)' }}>
                {insightsLoading ? <><span>⏳</span> Analyzing…</> : <>✨ {insights.length > 0 ? 'Refresh insights' : 'Generate insights'}</>}
              </button>
            </div>

            {insightsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">⚠️ {insightsError}</div>
            )}

            {insightsStats && insightsStats.sampleDays > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Days logged', value: insightsStats.sampleDays, color: 'text-purple-700' },
                  { label: 'Avg adherence', value: insightsStats.overallAdherencePct ? `${Math.round(insightsStats.overallAdherencePct)}%` : '—', color: 'text-green-700' },
                  { label: 'Avg energy', value: insightsStats.avgEnergy ? `${insightsStats.avgEnergy.toFixed(1)}/5` : '—', color: 'text-yellow-600' },
                  { label: 'Skip rate', value: typeof insightsStats.skipRate === 'number' ? `${insightsStats.skipRate}%` : '—', color: 'text-orange-600' },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm text-center">
                    <p className="text-xs text-gray-400 font-semibold uppercase">{s.label}</p>
                    <p className={`text-2xl font-extrabold mt-1 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {insights.length === 0 && !insightsLoading && (
              <div className="bg-purple-50 rounded-2xl p-10 text-center border border-purple-100">
                <p className="text-5xl mb-3">💡</p>
                <p className="font-bold text-purple-800 text-lg mb-1">No insights yet</p>
                {insightsStats && insightsStats.sampleDays < 3 ? (
                  <p className="text-purple-700 text-sm">Log meals on at least 3 days to unlock your first insights. Currently: <span className="font-bold">{insightsStats.sampleDays}</span> day(s).</p>
                ) : (
                  <p className="text-purple-700 text-sm">Click <span className="font-bold">Generate insights</span> above to have the AI analyze your last 30 days.</p>
                )}
                <div className="mt-4 inline-block text-left bg-white rounded-xl p-4 text-xs text-gray-600 shadow-sm">
                  <p className="font-bold text-gray-700 mb-2">What you'll see:</p>
                  <ul className="space-y-1">
                    <li>⚡ Whether skipping breakfast affects your energy</li>
                    <li>🎯 Where your adherence drops (e.g. weekends)</li>
                    <li>⚖️ How your weight trend matches the plan</li>
                    <li>🥩 Macro patterns linked to how you feel</li>
                    <li>🧠 Brain-fog days vs nutrition</li>
                  </ul>
                </div>
              </div>
            )}

            {insightsLoading && (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
                <div className="text-5xl mb-3 animate-pulse">🤖</div>
                <p className="font-bold text-gray-700">Analyzing 30 days of your data…</p>
                <p className="text-sm text-gray-400 mt-1">Looking for patterns across meals, weight, energy, and check-ins.</p>
              </div>
            )}

            {insights.length > 0 && (
              <div className="space-y-4">
                {insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} />
                ))}
                <p className="text-xs text-gray-400 text-center mt-2">
                  Insights are generated by AI from your data. Always pair with your own judgment — and a real doctor for medical decisions.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══ PANTRY ══ (v15.0) */}
        {activeTab === 'pantry' && (
          <div>
            <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-extrabold text-gray-800">🧺 Your Pantry</h2>
                <p className="text-gray-500 mt-1">Tell NutriCart what you have at home — your next meal plan will prioritize using these ingredients.</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Items in pantry</p>
                <p className="text-3xl font-extrabold text-purple-700">{pantryItems.length}</p>
              </div>
            </div>

            {/* v18.0 Cook Now — instant recipe */}
            {pantryItems.length > 0 && (
              <div className="mb-6 rounded-2xl border-2 border-orange-300 bg-gradient-to-r from-orange-50 to-yellow-50 px-5 py-4">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                  <div>
                    <p className="font-extrabold text-orange-900 text-base">🍳 Cook with what I have RIGHT NOW</p>
                    <p className="text-orange-700 text-xs mt-0.5">AI instantly creates a recipe using your current pantry — no planning needed.</p>
                  </div>
                  <button
                    onClick={cookNow}
                    disabled={cookNowLoading}
                    className="flex-shrink-0 bg-orange-500 text-white font-bold px-5 py-2.5 rounded-full text-sm hover:bg-orange-600 transition disabled:opacity-50 shadow-md">
                    {cookNowLoading ? '⏳ Creating…' : '⚡ Cook Now'}
                  </button>
                </div>
                {cookNowError && <p className="text-red-600 text-xs mt-2">❌ {cookNowError}</p>}
                {cookNowRecipe && (
                  <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm border border-orange-200">
                    <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                      <div>
                        <p className="font-extrabold text-gray-800 text-base">{cookNowRecipe.name}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs">
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold capitalize">{cookNowRecipe.mealType}</span>
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">⏱ {cookNowRecipe.readyIn}</span>
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">👤 {cookNowRecipe.difficulty}</span>
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">{cookNowRecipe.calories} kcal</span>
                        </div>
                      </div>
                      <button onClick={() => setCookNowRecipe(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
                    </div>
                    <div className="flex gap-3 text-center mb-4">
                      {[
                        { label: 'Protein', value: cookNowRecipe.protein, unit: 'g', color: 'text-blue-700' },
                        { label: 'Carbs',   value: cookNowRecipe.carbs,   unit: 'g', color: 'text-yellow-700' },
                        { label: 'Fats',    value: cookNowRecipe.fats,    unit: 'g', color: 'text-orange-700' },
                      ].map((n, i) => (
                        <div key={i} className="flex-1 bg-gray-50 rounded-xl py-2">
                          <p className={`text-sm font-extrabold ${n.color}`}>{n.value}<span className="text-xs font-normal text-gray-400">{n.unit}</span></p>
                          <p className="text-xs text-gray-400">{n.label}</p>
                        </div>
                      ))}
                    </div>
                    {cookNowRecipe.usedIngredients?.length > 0 && (() => {
                      // Validate each used ingredient against actual pantry items
                      const inPantry = []
                      const notInPantry = []
                      for (const ing of cookNowRecipe.usedIngredients) {
                        const name = typeof ing === 'object' ? ing.name : ing
                        const found = pantryItems.some(p =>
                          String(p.name || '').toLowerCase().includes(String(name || '').toLowerCase()) ||
                          String(name || '').toLowerCase().includes(String(p.name || '').toLowerCase())
                        )
                        if (found) inPantry.push(ing)
                        else notInPantry.push(ing)
                      }
                      return (
                        <div className="mb-3 space-y-2">
                          {inPantry.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-gray-500 mb-1.5">✅ In your pantry</p>
                              <div className="flex flex-wrap gap-1.5">
                                {inPantry.map((ing, i) => {
                                  const name = typeof ing === 'object' ? ing.name : ing
                                  const qty  = typeof ing === 'object' ? ing.qty  : null
                                  return (
                                    <span key={i} className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded-lg">
                                      {name}{qty ? ` — ${qty}` : ''}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {notInPantry.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                              <p className="text-xs font-bold text-red-700 mb-1.5">⚠️ Not found in pantry</p>
                              <div className="flex flex-wrap gap-1.5">
                                {notInPantry.map((ing, i) => {
                                  const name = typeof ing === 'object' ? ing.name : ing
                                  return (
                                    <span key={i} className="text-xs bg-white border border-red-200 text-red-600 px-2 py-1 rounded-lg">{name}</span>
                                  )
                                })}
                              </div>
                              <p className="text-xs text-red-500 mt-1.5">Add these to your pantry first, or generate another recipe.</p>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {cookNowRecipe.missingIngredients?.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-bold text-gray-500 mb-1.5">🛒 You may also need</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cookNowRecipe.missingIngredients.map((ing, i) => (
                            <span key={i} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-lg">{ing}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {cookNowRecipe.tip && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 text-xs text-amber-800">
                        💡 {cookNowRecipe.tip}
                      </div>
                    )}
                    {cookNowRecipe.steps?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-500 mb-1">📋 Steps</p>
                        {cookNowRecipe.steps.map((s, i) => (
                          <div key={i} className="relative flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2 pb-3">
                            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{s.step}</span>
                            <div className="flex-1 min-w-0 pr-8">
                              <p className="font-bold text-xs text-gray-700">{s.icon} {s.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{s.instruction}</p>
                              <StepTimer
                                storageKey={`nc_cooknow_${cookNowRecipe.name}_step_${i}`}
                                defaultSeconds={parseDuration(s.duration)}
                                stepTitle={s.title}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex flex-col gap-2">
                      {!cookNowUsed ? (
                        <button
                          onClick={markCookNowCooked}
                          className="w-full bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-green-700 transition flex items-center justify-center gap-2">
                          ✅ I cooked this — deduct ingredients from pantry
                        </button>
                      ) : (
                        <div className="w-full bg-green-50 border border-green-300 text-green-700 font-bold py-2.5 rounded-xl text-sm text-center">
                          ✅ Pantry updated!
                        </div>
                      )}
                      <button
                        onClick={cookNow}
                        className="w-full border-2 border-orange-300 text-orange-700 font-bold py-2 rounded-xl text-sm hover:bg-orange-50 transition">
                        🔄 Generate another idea
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* What you have summary */}
            {pantryItems.length > 0 && (
              <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl px-5 py-4 mb-6">
                <p className="text-purple-900 font-bold text-sm mb-3">📦 What you have</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['fridge', 'freezer', 'pantry', 'spices'].map(cat => {
                    const count = pantryItems.filter(p => (p.category || 'pantry') === cat).length
                    const icons = { fridge: '🥬', freezer: '🧊', pantry: '🥫', spices: '🧂' }
                    return count > 0 ? (
                      <div key={cat} className="bg-white rounded-lg p-3 text-center">
                        <p className="text-2xl">{icons[cat]}</p>
                        <p className="text-xs font-bold text-purple-700 mt-1 capitalize">{cat}</p>
                        <p className="text-sm font-bold text-purple-900">{count}</p>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}

            {/* Expiring soon banner */}
            {expiringPantry(3).length > 0 && (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-5 py-4 mb-6">
                <div className="flex items-start gap-3 flex-wrap">
                  <span className="text-2xl flex-shrink-0">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-red-800 font-bold text-sm">Items expiring within 3 days — use them first!</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {expiringPantry(3).map(p => (
                        <span key={p.id} className="text-xs bg-white text-red-700 border border-red-200 px-2 py-1 rounded-full font-semibold">
                          {p.name} {p.expiry_date && <span className="text-red-500">({Math.max(0, Math.round((new Date(p.expiry_date) - new Date(getTodayStr())) / 86400000))}d)</span>}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-red-600 mt-2">Generate (or re-tune) your meal plan and these will be used in the first 2 days.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Add item form */}
            <div className="bg-white rounded-2xl p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">➕ Add to pantry</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowReceiptSourcePicker(true)}
                    disabled={receiptOcrLoading}
                    className="flex items-center gap-1.5 text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full hover:bg-emerald-200 transition disabled:opacity-60">
                    {receiptOcrLoading ? '⏳ Reading receipt...' : '🧾 Scan Receipt'}
                  </button>
                  <button
                    onClick={() => setShowBarcode(true)}
                    className="flex items-center gap-1.5 text-xs font-bold bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full hover:bg-purple-200 transition">
                    📷 Scan Barcode
                  </button>
                </div>
              </div>
              {showReceiptSourcePicker && (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-bold text-emerald-800 mb-2">Add receipt photo from:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setShowReceiptSourcePicker(false); receiptUploadInputRef.current?.click() }}
                      className="text-xs font-bold bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition">
                      📁 Upload Photo
                    </button>
                    <button
                      onClick={() => { setShowReceiptSourcePicker(false); receiptCameraInputRef.current?.click() }}
                      className="text-xs font-bold bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition">
                      📷 Take Photo
                    </button>
                    <button
                      onClick={() => setShowReceiptSourcePicker(false)}
                      className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-200 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={receiptUploadInputRef}
                type="file"
                accept="image/*"
                onChange={e => parseReceiptImage(e.target.files?.[0])}
                className="hidden"
              />
              <input
                ref={receiptCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => parseReceiptImage(e.target.files?.[0])}
                className="hidden"
              />
              {receiptOcrError && <p className="text-xs text-red-600 mb-2">❌ {receiptOcrError}</p>}
              {receiptOcrItems.length > 0 && (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-bold text-emerald-800">🧾 Receipt parsed{receiptOcrStore ? ` · ${receiptOcrStore}` : ''} · {receiptOcrItems.length} items</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {receiptOcrItems.slice(0, 8).map((it, idx) => (
                      <span key={`${it.name}-${idx}`} className="text-xs bg-white border border-emerald-200 text-emerald-700 px-2 py-1 rounded-full">
                        {it.name} ({formatAmount(Number(it.quantity) || 1, it.unit || 'pcs')})
                      </span>
                    ))}
                    {receiptOcrItems.length > 8 && (
                      <span className="text-xs text-emerald-700 font-semibold px-1">+{receiptOcrItems.length - 8} more</span>
                    )}
                  </div>
                  <button
                    onClick={() => addReceiptItemsToPantry(receiptOcrItems)}
                    disabled={pantryLoading}
                    className="mt-3 w-full sm:w-auto bg-emerald-600 text-white px-5 py-2 rounded-full font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50">
                    {pantryLoading ? '⏳ Importing…' : `🧺 Add ${receiptOcrItems.length} receipt items to pantry`}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-12 gap-2">
                <input type="text" placeholder="Item name (e.g. spinach)"
                  value={pantryDraft.name}
                  onChange={e => setPantryDraft({ ...pantryDraft, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') { addPantryItem(pantryDraft); setPantryDraft({ name: '', quantity: '', unit: 'pcs', category: 'pantry', expiry_date: '' }) } }}
                  className="col-span-12 sm:col-span-4 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-purple-500 focus:outline-none" />
                <input type="number" placeholder="Qty" min="0" step="0.1"
                  value={pantryDraft.quantity}
                  onChange={e => setPantryDraft({ ...pantryDraft, quantity: e.target.value })}
                  className="col-span-4 sm:col-span-2 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-purple-500 focus:outline-none" />
                <select value={pantryDraft.unit}
                  onChange={e => setPantryDraft({ ...pantryDraft, unit: e.target.value })}
                  className="col-span-4 sm:col-span-2 border-2 border-gray-200 rounded-xl px-2 py-2 text-sm focus:border-purple-500 focus:outline-none bg-white">
                  {['pcs', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pack'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <select value={pantryDraft.category}
                  onChange={e => setPantryDraft({ ...pantryDraft, category: e.target.value })}
                  className="col-span-4 sm:col-span-2 border-2 border-gray-200 rounded-xl px-2 py-2 text-sm focus:border-purple-500 focus:outline-none bg-white">
                  <option value="pantry">Pantry</option>
                  <option value="fridge">Fridge</option>
                  <option value="freezer">Freezer</option>
                  <option value="spices">Spices</option>
                </select>
                <input type="date" placeholder="Expiry (optional)"
                  value={pantryDraft.expiry_date}
                  min={getTodayStr()}
                  onChange={e => setPantryDraft({ ...pantryDraft, expiry_date: e.target.value })}
                  className="col-span-12 sm:col-span-2 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-purple-500 focus:outline-none" />
              </div>
              <button onClick={() => { addPantryItem(pantryDraft); setPantryDraft({ name: '', quantity: '', unit: 'pcs', category: 'pantry', expiry_date: '' }) }}
                disabled={pantryLoading || !pantryDraft.name?.trim()}
                className="mt-3 w-full sm:w-auto bg-purple-600 text-white px-6 py-2 rounded-full font-bold text-sm hover:bg-purple-700 transition disabled:opacity-50">
                {pantryLoading ? '⏳ Adding…' : '➕ Add item'}
              </button>
            </div>

            {/* Regenerate plan button */}
            {pantryItems.length > 0 && aiMealPlan && (
              <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-2xl">
                {pantryReplanError && (
                  <p className="text-red-600 text-sm mb-3">❌ {pantryReplanError}</p>
                )}
                {pantryShoppingReminders.length > 0 && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-amber-800 mb-2">🛒 Pantry may run out — buy reminders</p>
                    <ul className="space-y-1">
                      {pantryShoppingReminders.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-xs text-amber-700">• {r.item || 'Item'} {r.neededBy ? `(by ${r.neededBy})` : ''} {r.reason ? `— ${r.reason}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => setShowPantryPlanOptions(true)}
                  disabled={pantryReplanLoading}
                  className="w-full bg-green-600 text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {pantryReplanLoading ? (
                    <>⏳ Regenerating plan…</>
                  ) : (
                    <>🔄 Generate pantry-based plan</>
                  )}
                </button>
                <p className="text-xs text-green-700 mt-2 text-center">Choose pantry-only or mixed, and choose today-only or whole-week before generating.</p>
              </div>
            )}

            {/* Items grouped by category */}
            {pantryItems.length === 0 ? (
              <div className="bg-purple-50 rounded-2xl p-10 text-center border border-purple-100">
                <p className="text-5xl mb-3">🧺</p>
                <p className="font-bold text-purple-800 text-lg mb-1">Your pantry is empty</p>
                <p className="text-purple-700 text-sm">Add a few items above so the AI can plan around what you already have.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {['fridge', 'freezer', 'pantry', 'spices'].map(cat => {
                  const items = pantryItems.filter(p => (p.category || 'pantry') === cat)
                  if (items.length === 0) return null
                  const icons = { fridge: '🥬', freezer: '🧊', pantry: '🥫', spices: '🧂' }
                  return (
                    <div key={cat} className="bg-white rounded-2xl p-5 shadow-sm">
                      <h3 className="font-bold text-gray-700 mb-3 capitalize flex items-center gap-2">
                        <span>{icons[cat]}</span>{cat} <span className="text-xs text-gray-400 font-normal">({items.length})</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {items.map(p => {
                          const daysToExpiry = p.expiry_date ? Math.round((new Date(p.expiry_date) - new Date(getTodayStr())) / 86400000) : null
                          const expiringSoon = daysToExpiry !== null && daysToExpiry <= 3 && daysToExpiry >= 0
                          return (
                            <div key={p.id} className={`flex items-center justify-between border rounded-xl px-3 py-2 ${expiringSoon ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 text-sm capitalize truncate">{p.name}</p>
                                <p className="text-xs text-gray-500">
                                  {p.quantity ? `${p.quantity}${p.unit || ''}` : ''}
                                  {p.expiry_date && (
                                    <span className={expiringSoon ? 'text-red-600 font-bold ml-2' : 'text-gray-400 ml-2'}>
                                      {daysToExpiry < 0 ? 'EXPIRED' : daysToExpiry === 0 ? 'expires today' : `expires in ${daysToExpiry}d`}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                <button
                                  onClick={() => adjustPantryQuantity(p, 'reduce')}
                                  className="w-7 h-7 rounded-full border border-amber-300 bg-amber-50 text-amber-700 font-extrabold text-sm hover:bg-amber-100"
                                  title="Reduce quantity">−</button>
                                <button
                                  onClick={() => adjustPantryQuantity(p, 'add')}
                                  className="w-7 h-7 rounded-full border border-green-300 bg-green-50 text-green-700 font-extrabold text-sm hover:bg-green-100"
                                  title="Add quantity">+</button>
                                <button onClick={() => deletePantryItem(p.id)}
                                  className="w-7 h-7 rounded-full border border-red-200 bg-red-50 text-red-500 hover:text-red-700 text-sm font-bold"
                                  title="Remove">×</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-xs text-gray-400 text-center mt-4">
              When you generate or re-tune your meal plan, items in your pantry will be prioritized. Look for the 🧺 badge on meal cards.
            </p>
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

        {activeTab === 'shopping' && <ShoppingList profile={profile} aiMealPlan={aiMealPlan} onShowPriceHistory={showPriceHistory} onAddPurchasedToPantry={addBoughtItemsToPantry} />}
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
      {showPantryPlanOptions && (
        <PantryPlanOptionsModal
          options={pantryPlanOptions}
          onChange={setPantryPlanOptions}
          onConfirm={() => replanUsingPantry(pantryPlanOptions)}
          onClose={() => setShowPantryPlanOptions(false)}
          loading={pantryReplanLoading}
        />
      )}

      {/* v16.0 Recipe Steps modal */}
      {recipeModal && (
        <RecipeStepsModal
          meal={recipeModal}
          userId={userId}
          onClose={() => setRecipeModal(null)}
        />
      )}

      {/* v16.0 Barcode Scanner */}
      {showBarcode && (
        <BarcodeScanner
          onDetected={(product) => {
            setShowBarcode(false)
            setPantryDraft(prev => ({
              ...prev,
              name:     product.name     || prev.name,
              quantity: product.quantity || prev.quantity,
              unit:     product.unit     || prev.unit,
              category: product.category || prev.category,
            }))
            posthog.capture('barcode_scanned', { product_name: product.name, barcode: product.barcode })
          }}
          onClose={() => setShowBarcode(false)}
        />
      )}

      {/* v17.0 Price History Modal */}
      {priceHistoryItem && (
        <PriceHistoryModal
          itemName={priceHistoryItem.name}
          history={priceHistory}
          stats={priceStats}
          loading={priceLoading}
          onClose={() => setPriceHistoryItem(null)}
        />
      )}

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
              <p className="text-xs text-orange-600 mt-1 font-semibold">Mode: {swapMode === 'pantry_based' ? 'Pantry-based alternatives' : 'AI suggested alternatives'}</p>
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

      {swapModeMeal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-gray-800">🔄 Choose Swap Type</h3>
              <button onClick={() => setSwapModeMeal(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">This meal is out of stock. How do you want alternatives generated?</p>
            <div className="space-y-2">
              <button
                onClick={() => { const meal = swapModeMeal; setSwapModeMeal(null); handleSwapMeal(meal, 'pantry_based') }}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-green-300 bg-green-50 hover:bg-green-100 transition">
                <p className="font-bold text-green-800 text-sm">🧺 Pantry-based alternatives</p>
                <p className="text-xs text-green-700 mt-0.5">Prioritize ingredients you still have.</p>
              </button>
              <button
                onClick={() => { const meal = swapModeMeal; setSwapModeMeal(null); handleSwapMeal(meal, 'ai_suggested') }}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-purple-300 bg-purple-50 hover:bg-purple-100 transition">
                <p className="font-bold text-purple-800 text-sm">🤖 AI suggested alternatives</p>
                <p className="text-xs text-purple-700 mt-0.5">Suggest best meals regardless of pantry constraints.</p>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}