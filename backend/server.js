const express = require('express')
const cors    = require('cors')
const dotenv  = require('dotenv')
const Groq    = require('groq-sdk')
const axios   = require('axios')

dotenv.config()

// ── In-memory holiday cache (24 h) ──────────────────
const holidayCache = {}

const app    = express()

function getGroqClient() {
  const rawKey = process.env.GROQ_API_KEY || ''
  const apiKey = rawKey.trim().replace(/^['\"]+|['\"]+$/g, '')
  if (!apiKey) {
    throw new Error('Server misconfigured: GROQ_API_KEY is missing in runtime environment')
  }
  return new Groq({ apiKey })
}

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'NutriCart backend is running ✅' })
})

// ── Holidays Route ───────────────────────────────────
app.get('/api/holidays', async (req, res) => {
  try {
    const { country, year } = req.query
    if (!country || !year) {
      return res.status(400).json({ success: false, error: 'country and year are required' })
    }
    const key = `${country}-${year}`
    const now = Date.now()
    if (holidayCache[key] && now - holidayCache[key].fetchedAt < 24 * 60 * 60 * 1000) {
      return res.json({ success: true, holidays: holidayCache[key].data })
    }
    const response = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`)
    holidayCache[key] = { data: response.data, fetchedAt: now }
    res.json({ success: true, holidays: response.data })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── Meal Plan Route ──────────────────────────────────
app.post('/api/mealplan', async (req, res) => {
  try {
    const profile = req.body
    const client = getGroqClient()

    const holidays     = Array.isArray(profile.holidays) ? profile.holidays : []
    const holidayMode  = profile.holidayMode || 'normal'
    const holidayLines = holidays.length > 0
      ? `\nPublic holidays in this plan window: ${holidays.map(h => `${h.date} (${h.localName || h.name})`).join(', ')}
Holiday handling mode: ${holidayMode} (festive = suggest festive/traditional meals; normal = treat as any day; skip = mark day as rest/skip with skipDay:true)`
      : ''

    const prompt = `You are a professional nutritionist AI for NutriCart app.
Generate a personalized 7-day meal plan for this user:
Name: ${profile.name}
Age: ${profile.age}
Current weight: ${profile.currentWeight}kg
Target weight: ${profile.targetWeight}kg
Height: ${profile.height}cm
Goal: ${profile.goal}
Health symptoms: ${Array.isArray(profile.symptoms) ? profile.symptoms.join(', ') : profile.symptoms}
Preferred stores: ${Array.isArray(profile.store) ? profile.store.join(', ') : profile.store}
Daily calorie target: ${profile.calories} kcal
Daily protein target: ${profile.protein}g
Daily carbs target: ${profile.carbs}g
Daily fats target: ${profile.fats}g${holidayLines}

Respond ONLY with a valid JSON object in this exact format, no other text, no markdown:
{
  "days": [
    {
      "day": "Monday",
      "meals": [
        {
          "meal": "Breakfast",
          "time": "7:30 AM",
          "name": "meal name",
          "calories": 600,
          "protein": 25,
          "carbs": 70,
          "fats": 20,
          "items": ["ingredient 1 with amount", "ingredient 2 with amount"],
          "store": "Lidl"
        }
      ],
      "totalCalories": 2500,
      "totalProtein": 140
    }
  ]
}

Rules:
- 4 meals per day: Breakfast, Lunch, Snack, Dinner
- Use products available at ${Array.isArray(profile.store) ? profile.store[0] : profile.store}
- Address these symptoms with specific foods: ${Array.isArray(profile.symptoms) ? profile.symptoms.join(', ') : 'none'}
- Keep meals realistic and easy to prepare
- Vary meals across the 7 days
- Respond with ONLY the JSON, no other text, no backticks`

    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.7,
    })

    const responseText = completion.choices[0].message.content
    const cleanJson    = responseText.replace(/```json|```/g, '').trim()
    const mealPlan     = JSON.parse(cleanJson)

    // Stamp date, holidayName, skipDay server-side
    const planStart = profile.startDate ? new Date(profile.startDate) : new Date()
    const holidayMap = {}
    holidays.forEach(h => { holidayMap[h.date] = h })
    mealPlan.days = mealPlan.days.map((day, i) => {
      const d = new Date(planStart)
      d.setDate(d.getDate() + i)
      const dateStr   = d.toISOString().split('T')[0]
      const holiday   = holidayMap[dateStr] || null
      const skipDay   = holiday && holidayMode === 'skip'
      return { ...day, date: dateStr, holidayName: holiday ? (holiday.localName || holiday.name) : null, skipDay: !!skipDay }
    })

    res.json({ success: true, mealPlan })

  } catch (error) {
    console.error('Error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── Meal Swap Route ──────────────────────────────────
app.post('/api/swapmeal', async (req, res) => {
  try {
    const { meal, profile } = req.body
    const client = getGroqClient()

    const prompt = `You are a professional nutritionist AI for NutriCart app.

The user does not like this meal:
- Name: ${meal.name}
- Calories: ${meal.calories} kcal
- Protein: ${meal.protein}g
- Carbs: ${meal.carbs}g
- Fats: ${meal.fats}g
- Meal type: ${meal.meal} (${meal.time})
- Preferred store: ${Array.isArray(profile.store) ? profile.store[0] : profile.store}
- User goal: ${profile.goal}
- User symptoms: ${Array.isArray(profile.symptoms) ? profile.symptoms.join(', ') : profile.symptoms}

Generate exactly 3 alternative meals that:
1. Match the same meal type (${meal.meal})
2. Have similar calories (within 100 kcal of ${meal.calories})
3. Have similar protein (within 10g of ${meal.protein}g)
4. Are completely different from "${meal.name}"
5. Use products available at ${Array.isArray(profile.store) ? profile.store[0] : profile.store}

Respond ONLY with valid JSON, no other text:
{
  "alternatives": [
    {
      "meal": "${meal.meal}",
      "time": "${meal.time}",
      "name": "meal name here",
      "calories": 600,
      "protein": 25,
      "carbs": 70,
      "fats": 20,
      "items": ["ingredient 1 with amount", "ingredient 2 with amount"],
      "store": "${Array.isArray(profile.store) ? profile.store[0] : profile.store}"
    }
  ]
}`

    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.8,
    })

    const responseText = completion.choices[0].message.content
    const cleanJson    = responseText.replace(/```json|```/g, '').trim()
    const result       = JSON.parse(cleanJson)

    res.json({ success: true, alternatives: result.alternatives })

  } catch (error) {
    console.error('Swap meal error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── Insights helpers (pre-compute stats so AI grounds claims in real numbers) ──
function dayOfWeek(dateStr) {
  return new Date(dateStr).getDay() // 0 = Sunday
}

function isWeekend(dateStr) {
  const d = dayOfWeek(dateStr)
  return d === 0 || d === 6
}

function computeInsightStats({ profile, mealLogs, weightLogs, checkins }) {
  const meals    = Array.isArray(mealLogs)   ? mealLogs   : []
  const weights  = Array.isArray(weightLogs) ? weightLogs : []
  const checks   = Array.isArray(checkins)   ? checkins   : []

  const eaten   = meals.filter(m => !m.skipped)
  const skipped = meals.filter(m =>  m.skipped)

  // Per-day rollups
  const byDate = {}
  for (const m of meals) {
    const d = m.log_date
    if (!byDate[d]) byDate[d] = { date: d, eaten: [], skipped: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 }
    if (m.skipped) byDate[d].skipped.push(m)
    else {
      byDate[d].eaten.push(m)
      byDate[d].totalCalories += +m.calories || 0
      byDate[d].totalProtein  += +m.protein  || 0
      byDate[d].totalCarbs    += +m.carbs    || 0
      byDate[d].totalFats     += +m.fats     || 0
    }
  }
  for (const w of weights) {
    if (!byDate[w.log_date]) byDate[w.log_date] = { date: w.log_date, eaten: [], skipped: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 }
    byDate[w.log_date].weight       = +w.weight       || null
    byDate[w.log_date].energyLevel  = +w.energy_level || null
    byDate[w.log_date].notes        = w.notes || ''
  }
  for (const c of checks) {
    if (!byDate[c.checkin_date]) byDate[c.checkin_date] = { date: c.checkin_date, eaten: [], skipped: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 }
    byDate[c.checkin_date].mood       = +c.mood        || null
    byDate[c.checkin_date].sleep      = +c.sleep       || null
    byDate[c.checkin_date].brainFog   = !!c.brain_fog
    byDate[c.checkin_date].energyLevel = byDate[c.checkin_date].energyLevel ?? (+c.energy || null)
  }

  const days = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  const daysWithMeals    = days.filter(d => d.eaten.length > 0)
  const daysWithEnergy   = days.filter(d => typeof d.energyLevel === 'number')
  const daysSkippedBkfst = daysWithMeals.filter(d => !d.eaten.some(m => /breakfast/i.test(m.meal_name) || (m.meal && /breakfast/i.test(m.meal))))

  function avg(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null }

  const goalCalories = +profile?.calories || 0
  const goalProtein  = +profile?.protein  || 0

  // Weekend vs weekday adherence
  const weekendDays = daysWithMeals.filter(d => isWeekend(d.date))
  const weekdayDays = daysWithMeals.filter(d => !isWeekend(d.date))
  const weekendAdh  = goalCalories ? avg(weekendDays.map(d => (d.totalCalories / goalCalories) * 100)) : null
  const weekdayAdh  = goalCalories ? avg(weekdayDays.map(d => (d.totalCalories / goalCalories) * 100)) : null

  // Skip-breakfast vs full breakfast → energy comparison
  const energyOnSkippedBkfst = avg(daysSkippedBkfst.filter(d => typeof d.energyLevel === 'number').map(d => d.energyLevel))
  const energyOnFullBkfst    = avg(daysWithMeals
    .filter(d => !daysSkippedBkfst.includes(d) && typeof d.energyLevel === 'number')
    .map(d => d.energyLevel))

  // Protein quartile vs energy
  const proteinDays = daysWithMeals.filter(d => d.totalProtein > 0 && typeof d.energyLevel === 'number')
  const sortedByProtein = [...proteinDays].sort((a, b) => a.totalProtein - b.totalProtein)
  const cutoff = Math.floor(sortedByProtein.length * 0.5)
  const lowProtein  = sortedByProtein.slice(0, cutoff)
  const highProtein = sortedByProtein.slice(-cutoff)
  const energyLowProtein  = avg(lowProtein.map(d => d.energyLevel))
  const energyHighProtein = avg(highProtein.map(d => d.energyLevel))

  // Weight trend (if at least 2 weighings)
  const weightSeries = weights.map(w => ({ date: w.log_date, weight: +w.weight })).filter(w => !!w.weight).sort((a,b)=>a.date.localeCompare(b.date))
  let weightTrend = null
  if (weightSeries.length >= 2) {
    const first = weightSeries[0]
    const last  = weightSeries[weightSeries.length - 1]
    const days  = (new Date(last.date) - new Date(first.date)) / 86400000
    weightTrend = { firstDate: first.date, firstWeight: first.weight, lastDate: last.date, lastWeight: last.weight, deltaKg: +(last.weight - first.weight).toFixed(2), days, target: +profile?.targetWeight || null }
  }

  // Skip rate
  const skipRate = meals.length ? skipped.length / meals.length : 0

  // Top eaten meals (by frequency)
  const mealFreq = {}
  for (const m of eaten) {
    const k = m.meal_name
    mealFreq[k] = (mealFreq[k] || 0) + 1
  }
  const topMeals = Object.entries(mealFreq).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Brain fog incidence vs nutrition (if checkins present)
  const fogDays = days.filter(d => d.brainFog === true && d.totalCalories > 0)
  const okDays  = days.filter(d => d.brainFog === false && d.totalCalories > 0)
  const fogCarbs = avg(fogDays.map(d => d.totalCarbs))
  const okCarbs  = avg(okDays.map(d => d.totalCarbs))

  return {
    sampleDays:                daysWithMeals.length,
    daysWithEnergy:            daysWithEnergy.length,
    daysWithCheckins:          checks.length,
    avgDailyCalories:          avg(daysWithMeals.map(d => d.totalCalories)),
    avgDailyProtein:           avg(daysWithMeals.map(d => d.totalProtein)),
    avgDailyCarbs:             avg(daysWithMeals.map(d => d.totalCarbs)),
    avgDailyFats:              avg(daysWithMeals.map(d => d.totalFats)),
    goalCalories,
    goalProtein,
    overallAdherencePct:       goalCalories ? avg(daysWithMeals.map(d => (d.totalCalories / goalCalories) * 100)) : null,
    weekendAdherencePct:       weekendAdh,
    weekdayAdherencePct:       weekdayAdh,
    skipRate:                  +(skipRate * 100).toFixed(1),
    avgEnergy:                 avg(daysWithEnergy.map(d => d.energyLevel)),
    energyOnSkippedBkfst,
    energyOnFullBkfst,
    energyHighProtein,
    energyLowProtein,
    weightTrend,
    topMeals,
    fogCarbs,
    okCarbs,
    symptoms:                  Array.isArray(profile?.symptoms) ? profile.symptoms : [],
  }
}

// ── Insights Route ───────────────────────────────────
app.post('/api/insights', async (req, res) => {
  try {
    const { profile = {}, mealLogs = [], weightLogs = [], checkins = [] } = req.body || {}
    const client = getGroqClient()

    const stats = computeInsightStats({ profile, mealLogs, weightLogs, checkins })

    // Not enough data — return empty list with a friendly hint, not an error
    if (stats.sampleDays < 3) {
      return res.json({
        success: true,
        insights: [],
        stats,
        hint: `Log meals on at least 3 days to unlock insights (currently ${stats.sampleDays}).`,
      })
    }

    const prompt = `You are a behavioral nutritionist AI. Analyze this user's data and produce 3-5 actionable insights.

USER PROFILE:
- Goal: ${profile.goal || 'unspecified'}
- Current weight: ${profile.currentWeight}kg → target ${profile.targetWeight}kg
- Reported symptoms: ${(stats.symptoms || []).join(', ') || 'none'}
- Daily targets: ${stats.goalCalories} kcal / ${stats.goalProtein}g protein

PRE-COMPUTED STATS (use these — do NOT invent numbers):
- Sample size: ${stats.sampleDays} days with meal logs, ${stats.daysWithEnergy} with energy ratings, ${stats.daysWithCheckins} daily check-ins
- Average intake: ${Math.round(stats.avgDailyCalories || 0)} kcal · ${Math.round(stats.avgDailyProtein || 0)}g protein · ${Math.round(stats.avgDailyCarbs || 0)}g carbs · ${Math.round(stats.avgDailyFats || 0)}g fats
- Adherence: ${stats.overallAdherencePct ? Math.round(stats.overallAdherencePct) : 'n/a'}% of daily goal on average
- Weekend adherence: ${stats.weekendAdherencePct ? Math.round(stats.weekendAdherencePct) : 'n/a'}%, Weekday: ${stats.weekdayAdherencePct ? Math.round(stats.weekdayAdherencePct) : 'n/a'}%
- Skip rate: ${stats.skipRate}% of logged meals
- Average energy (1-5): ${stats.avgEnergy ? stats.avgEnergy.toFixed(2) : 'n/a'}
- Energy on days breakfast was skipped: ${stats.energyOnSkippedBkfst ? stats.energyOnSkippedBkfst.toFixed(2) : 'n/a'} (vs. full-breakfast days: ${stats.energyOnFullBkfst ? stats.energyOnFullBkfst.toFixed(2) : 'n/a'})
- Energy on high-protein days (top half): ${stats.energyHighProtein ? stats.energyHighProtein.toFixed(2) : 'n/a'} (vs. low-protein days: ${stats.energyLowProtein ? stats.energyLowProtein.toFixed(2) : 'n/a'})
- Weight trend: ${stats.weightTrend ? `${stats.weightTrend.deltaKg >= 0 ? '+' : ''}${stats.weightTrend.deltaKg}kg over ${Math.round(stats.weightTrend.days)} days (${stats.weightTrend.firstWeight}→${stats.weightTrend.lastWeight}kg)` : 'not enough weighings'}
- Brain fog days avg carbs: ${stats.fogCarbs ? Math.round(stats.fogCarbs) : 'n/a'}g vs clear days: ${stats.okCarbs ? Math.round(stats.okCarbs) : 'n/a'}g
- Top eaten meals: ${stats.topMeals.map(([n, c]) => `${n} (${c}×)`).join('; ') || 'none'}

INSTRUCTIONS:
1. Choose the 3-5 MOST INTERESTING patterns from the stats above
2. Skip stats with insufficient data (n/a or fewer than 3 supporting days)
3. NEVER invent numbers — only use the stats provided
4. Each insight needs: a snappy headline, the supporting evidence (cite the actual numbers), a concrete recommendation, a category, and a confidence score (1-5 stars based on sample size)

Respond ONLY with valid JSON, no other text:
{
  "insights": [
    {
      "headline": "Your energy drops 23% on days you skip breakfast",
      "evidence": "Energy averaged 2.8/5 on the 4 days you skipped breakfast vs. 3.6/5 on full-breakfast days.",
      "recommendation": "Try keeping breakfast simple — overnight oats or a smoothie — to test if your morning energy improves.",
      "category": "energy",
      "confidence": 3,
      "icon": "⚡"
    }
  ]
}

Categories must be one of: energy | weight | adherence | macros | symptoms | habit | sleep | mood
Icons should be a single emoji: ⚡ 🏋️ 🎯 🥩 🩺 🔁 😴 😊 🍳 🧠 🌙 ☀️ 🛒 ⚖️
Confidence: 1-2 = small sample, 3 = solid trend, 4-5 = strong pattern with many data points
Headlines must be specific (use real numbers from the stats), not generic ("eat better").`

    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.4, // Lower temp = more grounded, less creative
    })

    const responseText = completion.choices[0].message.content
    const cleanJson    = responseText.replace(/```json|```/g, '').trim()
    const parsed       = JSON.parse(cleanJson)

    res.json({
      success:     true,
      insights:    Array.isArray(parsed.insights) ? parsed.insights : [],
      stats,
      generatedAt: new Date().toISOString(),
    })

  } catch (error) {
    console.error('Insights error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── Start Server ─────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ NutriCart backend running on port ${PORT}`)
})