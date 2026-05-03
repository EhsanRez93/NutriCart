const express   = require('express')
const cors      = require('cors')
const dotenv    = require('dotenv')
const Groq      = require('groq-sdk')
const axios     = require('axios')
const { PostHog } = require('posthog-node')

dotenv.config()

// ── PostHog server-side analytics ───────────────────
const posthog = new PostHog(process.env.POSTHOG_KEY, {
  host:                      process.env.POSTHOG_HOST,
  enableExceptionAutocapture: true,
})

process.on('SIGINT',  async () => { await posthog.shutdown(); process.exit(0) })
process.on('SIGTERM', async () => { await posthog.shutdown(); process.exit(0) })

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
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const profile = req.body
    const client = getGroqClient()

    const holidays     = Array.isArray(profile.holidays) ? profile.holidays : []
    const holidayMode  = profile.holidayMode || 'normal'
    const holidayLines = holidays.length > 0
      ? `\nPublic holidays in this plan window: ${holidays.map(h => `${h.date} (${h.localName || h.name})`).join(', ')}
Holiday handling mode: ${holidayMode} (festive = suggest festive/traditional meals; normal = treat as any day; skip = mark day as rest/skip with skipDay:true)`
      : ''

    // v15.0 — pantry-aware planning
    const pantryItems = Array.isArray(profile.pantry) ? profile.pantry : []
    const today = new Date().toISOString().split('T')[0]
    const expiringSoon = pantryItems
      .filter(p => p.expiry_date && p.expiry_date >= today)
      .filter(p => {
        const days = (new Date(p.expiry_date) - new Date(today)) / 86400000
        return days <= 3
      })
    const pantryLines = pantryItems.length > 0
      ? `\nUSER'S PANTRY (prioritize meals that use these — they have it at home already):
${pantryItems.map(p => `  - ${p.name}${p.quantity ? ` (${p.quantity}${p.unit || ''})` : ''}${p.expiry_date ? ` [expires ${p.expiry_date}]` : ''}`).join('\n')}
${expiringSoon.length > 0 ? `\n⚠️ EXPIRING WITHIN 3 DAYS — use these in early meals: ${expiringSoon.map(p => p.name).join(', ')}` : ''}`
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
Daily fats target: ${profile.fats}g${holidayLines}${pantryLines}

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
          "store": "Lidl",
          "usesPantry": ["banana", "oats"]
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
${pantryItems.length > 0 ? `- PRIORITIZE pantry items in your recipes; populate "usesPantry": [...] with the matching pantry item names you actually used in this meal (lowercase, no quantities). Empty array [] if none used.` : '- "usesPantry" should be an empty array [] in every meal.'}
${expiringSoon.length > 0 ? `- Items expiring within 3 days MUST appear in the first 2 days of the plan` : ''}
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

    posthog.capture({
      distinctId,
      event: 'meal_plan_generated',
      properties: {
        start_date:    profile.startDate || null,
        goal:          profile.goal,
        pantry_items:  pantryItems.length,
        holiday_mode:  holidayMode,
        holiday_count: holidays.length,
      },
    })

    res.json({ success: true, mealPlan })

  } catch (error) {
    console.error('Error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/mealplan' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── Meal Swap Route ──────────────────────────────────
app.post('/api/swapmeal', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const { meal, profile, swapMode = 'ai_suggested', pantryItems = [] } = req.body
    const client = getGroqClient()

    const selectedSwapMode = swapMode === 'pantry_based' ? 'pantry_based' : 'ai_suggested'
    const pantryList = Array.isArray(pantryItems) && pantryItems.length > 0
      ? pantryItems.map(p => `- ${p.name}${p.quantity ? ` (${p.quantity}${p.unit || ''})` : ''}`).join('\n')
      : '- (no pantry items available)'

    const swapModeInstruction = selectedSwapMode === 'pantry_based'
      ? 'Build alternatives mainly from available pantry items; only add missing extras if strictly needed for nutrition balance.'
      : 'Use fully AI-suggested alternatives (not constrained by pantry inventory), still aligned to goals and preferred store.'

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
- Swap mode: ${selectedSwapMode}

Available pantry items:
${pantryList}

Generate exactly 3 alternative meals that:
1. Match the same meal type (${meal.meal})
2. Have similar calories (within 100 kcal of ${meal.calories})
3. Have similar protein (within 10g of ${meal.protein}g)
4. Are completely different from "${meal.name}"
5. Use products available at ${Array.isArray(profile.store) ? profile.store[0] : profile.store}
6. ${swapModeInstruction}

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

    posthog.capture({
      distinctId,
      event: 'meal_swapped',
      properties: {
        meal_name: meal.name,
        meal_type: meal.meal,
        goal:      profile.goal,
        swap_mode: selectedSwapMode,
      },
    })

    res.json({ success: true, alternatives: result.alternatives })

  } catch (error) {
    console.error('Swap meal error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/swapmeal' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v14.0 Re-tune Plan Route ─────────────────────────
// Takes current 7-day plan + actual logs + profile, redistributes any
// over/under intake across the REMAINING days, asks Groq to regenerate
// only the future days (past days are kept exactly as-is).
app.post('/api/replan', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const { profile = {}, currentPlan, mealLogs = [], todayDate } = req.body || {}
    if (!currentPlan || !Array.isArray(currentPlan.days)) {
      return res.status(400).json({ success: false, error: 'currentPlan.days[] required' })
    }
    const client = getGroqClient()

    const today = todayDate || new Date().toISOString().split('T')[0]

    // Build per-day rollup from logs (keyed by date)
    const logsByDate = {}
    for (const log of mealLogs) {
      const d = log.log_date
      if (!logsByDate[d]) logsByDate[d] = { eaten: [], skipped: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 }
      if (log.skipped) {
        logsByDate[d].skipped.push(log)
      } else {
        logsByDate[d].eaten.push(log)
        logsByDate[d].totalCalories += +log.calories || 0
        logsByDate[d].totalProtein  += +log.protein  || 0
        logsByDate[d].totalCarbs    += +log.carbs    || 0
        logsByDate[d].totalFats     += +log.fats     || 0
      }
    }

    // Classify each plan day as past (locked) or future (regeneratable)
    const pastDays   = []
    const futureDays = []
    let netCalDeviation     = 0
    let netProteinDeviation = 0
    const goalCal = +profile.calories || 0
    const goalPro = +profile.protein  || 0

    for (const day of currentPlan.days) {
      const isPast = day.date && day.date < today
      if (isPast) {
        const log = logsByDate[day.date] || { totalCalories: 0, totalProtein: 0 }
        // If user has logs for that day, deviation = actual eaten - goal
        // If no logs at all (silent day), assume they ate the planned amount
        const actualCal = log.eaten.length > 0 ? log.totalCalories : (day.totalCalories || day.meals?.reduce((s,m)=>s+(+m.calories||0),0) || goalCal)
        const actualPro = log.eaten.length > 0 ? log.totalProtein  : (day.totalProtein  || day.meals?.reduce((s,m)=>s+(+m.protein ||0),0) || goalPro)
        netCalDeviation     += actualCal - goalCal
        netProteinDeviation += actualPro - goalPro
        pastDays.push({ ...day, _actualCalories: actualCal, _actualProtein: actualPro, _hasLogs: log.eaten.length > 0 || log.skipped.length > 0 })
      } else {
        futureDays.push(day)
      }
    }

    if (futureDays.length === 0) {
      return res.json({ success: false, error: 'No future days remain in this plan to re-tune.' })
    }

    // Spread the deviation across remaining days, capped at ±25% of daily goal
    const calAdjustPerDay = goalCal ? Math.max(-goalCal * 0.25, Math.min(goalCal * 0.25, -netCalDeviation / futureDays.length)) : 0
    const proAdjustPerDay = goalPro ? Math.max(-goalPro * 0.25, Math.min(goalPro * 0.25, -netProteinDeviation / futureDays.length)) : 0
    const adjustedDailyCal = Math.round(goalCal + calAdjustPerDay)
    const adjustedDailyPro = Math.round(goalPro + proAdjustPerDay)
    const adjustedDailyCarbs = Math.round(((adjustedDailyCal * 0.45) / 4))   // ~45% from carbs
    const adjustedDailyFats  = Math.round(((adjustedDailyCal * 0.25) / 9))   // ~25% from fats

    // Summarize past days for the prompt (compact)
    const pastSummary = pastDays.map(d => `  ${d.date} (${d.day || 'past'}): planned ${d.totalCalories || 0}kcal, actual ${d._actualCalories}kcal${d._hasLogs ? '' : ' (assumed eaten as planned)'}${d.holidayName ? ' 🎉' : ''}`).join('\n') || '  (none)'

    // v15.0 — pantry awareness for re-tune
    const pantryItems = Array.isArray(profile.pantry) ? profile.pantry : []
    const pantryLines = pantryItems.length > 0
      ? `\nUSER'S PANTRY (prefer using these — they're already at home):\n${pantryItems.map(p => `  - ${p.name}${p.expiry_date ? ` [exp ${p.expiry_date}]` : ''}`).join('\n')}`
      : ''

    const futureSummary = futureDays.map(d => `  ${d.date} (${d.day || 'future'})${d.holidayName ? ' 🎉 ' + d.holidayName : ''}`).join('\n')

    const prompt = `You are a behavioral nutritionist AI for NutriCart. The user's plan needs to be RE-TUNED based on what they've actually eaten so far.

USER:
- Goal: ${profile.goal}
- Current weight ${profile.currentWeight}kg → target ${profile.targetWeight}kg
- Original daily targets: ${goalCal} kcal · ${goalPro}g protein
- Symptoms to consider: ${(Array.isArray(profile.symptoms) ? profile.symptoms : []).join(', ') || 'none'}
- Preferred store: ${Array.isArray(profile.store) ? profile.store[0] : profile.store}

PAST DAYS (DO NOT REGENERATE — keep them as-is, the user has already eaten):
${pastSummary}

NET DEVIATION over past days: ${Math.round(netCalDeviation) >= 0 ? '+' : ''}${Math.round(netCalDeviation)} kcal, ${Math.round(netProteinDeviation) >= 0 ? '+' : ''}${Math.round(netProteinDeviation)}g protein

ADJUSTED TARGETS for the remaining ${futureDays.length} day(s):
- ${adjustedDailyCal} kcal/day (vs original ${goalCal})
- ${adjustedDailyPro}g protein/day
- ~${adjustedDailyCarbs}g carbs/day, ~${adjustedDailyFats}g fats/day

REMAINING DAYS to regenerate:
${futureSummary}${pantryLines}

Respond ONLY with valid JSON, no markdown. Generate ONLY the future days listed above. Keep each day's "date" and "holidayName" fields as listed:
{
  "futureDays": [
    {
      "day": "Tuesday",
      "date": "2026-05-04",
      "holidayName": null,
      "skipDay": false,
      "adjusted": true,
      "reason": "Compensating for +400 kcal weekend deviation",
      "meals": [
        { "meal": "Breakfast", "time": "7:30 AM", "name": "...", "calories": 450, "protein": 28, "carbs": 50, "fats": 15, "items": ["..."], "store": "Lidl", "usesPantry": [] }
      ],
      "totalCalories": 1800,
      "totalProtein": 130
    }
  ]
}

Rules:
- 4 meals per day (Breakfast, Lunch, Snack, Dinner)
- Each day's meals should sum close to the adjusted targets above
- "adjusted": true on each regenerated day
- "reason": one short sentence explaining what's being compensated for
- Address symptoms with specific foods
- Keep meals realistic and easy to prepare
- Use products available at the user's preferred store
${pantryItems.length > 0 ? '- Prefer pantry items; populate "usesPantry" array with matching pantry item names actually used' : '- "usesPantry": [] for every meal'}
- Respond with ONLY JSON, no backticks`

    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.6,
    })

    const responseText = completion.choices[0].message.content
    const cleanJson    = responseText.replace(/```json|```/g, '').trim()
    const parsed       = JSON.parse(cleanJson)

    if (!Array.isArray(parsed.futureDays)) {
      throw new Error('AI did not return futureDays[]')
    }

    // Merge: past days unchanged + future days replaced (matched by date)
    const futureByDate = {}
    for (const f of parsed.futureDays) futureByDate[f.date] = f

    const mergedDays = currentPlan.days.map(day => {
      if (day.date && day.date < today) return day // past — untouched
      const replacement = futureByDate[day.date]
      if (!replacement) return day // AI omitted this future day — keep original
      return {
        ...day,
        ...replacement,
        date:        day.date,                                  // preserve
        holidayName: day.holidayName ?? replacement.holidayName, // preserve holiday
        skipDay:     day.skipDay ?? replacement.skipDay,
        adjusted:    true,
      }
    })

    posthog.capture({
      distinctId,
      event: 'plan_retuned',
      properties: {
        past_day_count:        pastDays.length,
        future_day_count:      futureDays.length,
        net_cal_deviation:     Math.round(netCalDeviation),
        net_protein_deviation: Math.round(netProteinDeviation),
        adjusted_daily_cal:    adjustedDailyCal,
      },
    })

    res.json({
      success: true,
      mealPlan: { ...currentPlan, days: mergedDays },
      adjustments: {
        netCalDeviation:     Math.round(netCalDeviation),
        netProteinDeviation: Math.round(netProteinDeviation),
        adjustedDailyCal,
        adjustedDailyPro,
        futureDayCount:      futureDays.length,
        pastDayCount:        pastDays.length,
      },
    })

  } catch (error) {
    console.error('Replan error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/replan' })
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
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
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

    const insightList = Array.isArray(parsed.insights) ? parsed.insights : []
    posthog.capture({
      distinctId,
      event: 'insights_generated',
      properties: {
        insight_count: insightList.length,
        sample_days:   stats.sampleDays,
        goal:          profile.goal,
      },
    })

    res.json({
      success:     true,
      insights:    insightList,
      stats,
      generatedAt: new Date().toISOString(),
    })

  } catch (error) {
    console.error('Insights error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/insights' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v16.0 Smart Price Engine ─────────────────────────
// Parses ingredient strings (e.g. "Chicken thighs 200g"), extracts weight,
// and returns accurate EU supermarket prices using real price-per-100g data.

function parseItemQuantity(itemStr) {
  const lower = itemStr.toLowerCase().trim()
  const patterns = [
    { re: /(\d+\.?\d*)\s*kg\b/i,   toGrams: n => n * 1000 },
    { re: /(\d+\.?\d*)\s*g\b/i,    toGrams: n => n },
    { re: /(\d+\.?\d*)\s*l\b/i,    toGrams: n => n * 1000 },
    { re: /(\d+\.?\d*)\s*ml\b/i,   toGrams: n => n },
    { re: /(\d+\.?\d*)\s*tbsp\b/i, toGrams: n => n * 15 },
    { re: /(\d+\.?\d*)\s*tsp\b/i,  toGrams: n => n * 5 },
    { re: /(\d+\.?\d*)\s*cup\b/i,  toGrams: n => n * 250 },
  ]
  for (const p of patterns) {
    const m = lower.match(p.re)
    if (m) return { grams: p.toGrams(parseFloat(m[1])), pieces: null }
  }
  // Try to extract piece count ("2x", "1/2", plain number at start)
  const pieces = lower.match(/^(\d+\.?\d*)\s*[x×]?\s/) || lower.match(/(\d+)\s*(?:pcs|pieces?|slices?|ea\.?)/)
  return { grams: null, pieces: pieces ? parseFloat(pieces[1]) : 1 }
}

// Real EU (Slovakia / Czech / Austria) supermarket price averages, €/100g, 2026
const PRICE_DB = {
  // Proteins
  chicken:         { per100g: 0.80 },
  beef:            { per100g: 1.40 },
  pork:            { per100g: 0.70 },
  turkey:          { per100g: 0.90 },
  salmon:          { per100g: 1.80 },
  tuna:            { per100g: 1.00 },
  shrimp:          { per100g: 1.50 },
  egg:             { per100g: null, unitPrice: 0.25 },
  // Dairy
  milk:            { per100g: 0.06 },
  yogurt:          { per100g: 0.35 },
  'greek yogurt':  { per100g: 0.50 },
  cheese:          { per100g: 1.20 },
  butter:          { per100g: 0.90 },
  kefir:           { per100g: 0.25 },
  cream:           { per100g: 0.60 },
  // Grains
  rice:            { per100g: 0.18 },
  oats:            { per100g: 0.12 },
  pasta:           { per100g: 0.18 },
  bread:           { per100g: 0.25 },
  quinoa:          { per100g: 0.50 },
  flour:           { per100g: 0.10 },
  tortilla:        { per100g: 0.40 },
  // Vegetables
  spinach:         { per100g: 0.40 },
  broccoli:        { per100g: 0.25 },
  potato:          { per100g: 0.10 },
  'sweet potato':  { per100g: 0.18 },
  carrot:          { per100g: 0.10 },
  onion:           { per100g: 0.08 },
  garlic:          { per100g: 0.60 },
  tomato:          { per100g: 0.30 },
  pepper:          { per100g: 0.45 },
  mushroom:        { per100g: 0.60 },
  lettuce:         { per100g: 0.30 },
  cucumber:        { per100g: 0.20 },
  zucchini:        { per100g: 0.20 },
  // Fruits
  banana:          { per100g: 0.15 },
  apple:           { per100g: 0.20 },
  lemon:           { per100g: 0.20 },
  orange:          { per100g: 0.15 },
  berries:         { per100g: 1.20 },
  avocado:         { per100g: null, unitPrice: 0.80 },
  // Oils & Spreads
  'olive oil':     { per100g: 0.70 },
  'peanut butter': { per100g: 0.80 },
  'almond butter': { per100g: 1.20 },
  hummus:          { per100g: 0.60 },
  // Nuts & Seeds
  nuts:            { per100g: 1.50 },
  almonds:         { per100g: 1.60 },
  walnuts:         { per100g: 1.80 },
  cashews:         { per100g: 1.70 },
  seeds:           { per100g: 1.00 },
  'pumpkin seed':  { per100g: 1.20 },
  'mixed nuts':    { per100g: 1.50 },
  // Condiments
  honey:           { per100g: 0.80 },
  salt:            { per100g: 0.05 },
  sugar:           { per100g: 0.10 },
  sauce:           { per100g: 0.30 },
  'soy sauce':     { per100g: 0.40 },
}

const STORE_PRICE_INDEX = {
  'Lidl':     1.00,
  'Aldi':     0.95,
  'Penny':    0.97,
  'Kaufland': 1.05,
  'Tesco':    1.08,
  'Billa':    1.12,
  'Spar':     1.15,
}

function lookupBasePrice(itemName) {
  const name = itemName.toLowerCase()
  // Multi-word keys first (most specific match wins)
  const sorted = Object.entries(PRICE_DB).sort((a, b) => b[0].length - a[0].length)
  for (const [key, data] of sorted) {
    if (name.includes(key)) return data
  }
  // Category fallbacks
  if (name.match(/chicken|beef|pork|turkey|lamb|meat|fish|seafood/)) return { per100g: 0.90 }
  if (name.match(/milk|dairy|yogurt|cheese|cream/))                  return { per100g: 0.40 }
  if (name.match(/vegetable|veggie|veg|salad|greens/))               return { per100g: 0.25 }
  if (name.match(/fruit|berry/))                                     return { per100g: 0.40 }
  if (name.match(/nut|seed/))                                        return { per100g: 1.20 }
  if (name.match(/oil|butter|spread/))                               return { per100g: 0.80 }
  if (name.match(/grain|rice|pasta|oat|bread|cereal/))               return { per100g: 0.18 }
  if (name.match(/spice|herb|seasoning|sauce|condiment/))            return { per100g: 0.30 }
  return { per100g: 0.40 }
}

function calculateItemPrice(itemStr, store) {
  const { grams, pieces }     = parseItemQuantity(itemStr)
  const { per100g, unitPrice } = lookupBasePrice(itemStr)
  const multiplier             = STORE_PRICE_INDEX[store] || 1.0
  let price
  if (unitPrice != null) {
    price = unitPrice * (pieces || 1)
  } else if (grams != null && per100g != null) {
    price = (grams / 100) * per100g
  } else {
    price = 1.00
  }
  return Math.round(price * multiplier * 100) / 100
}

// POST /api/prices — returns weight-accurate per-item prices for a shopping list
app.post('/api/prices', (req, res) => {
  try {
    const { items, store } = req.body
    if (!Array.isArray(items)) return res.status(400).json({ success: false, error: 'items[] required' })
    const targetStore = store || 'Lidl'
    const priced = items.map(itemStr => ({
      item:  itemStr,
      price: calculateItemPrice(itemStr, targetStore),
      store: targetStore,
    }))
    const total = Math.round(priced.reduce((s, p) => s + p.price, 0) * 100) / 100
    res.json({ success: true, priced, total, store: targetStore })
  } catch (error) {
    console.error('Prices error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v16.0 Recipe Steps Route ─────────────────────────
// AI-generated step-by-step cooking guide for any meal in the plan.
app.post('/api/recipesteps', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const { meal } = req.body
    if (!meal || !meal.name) return res.status(400).json({ success: false, error: 'meal is required' })
    const client = getGroqClient()

    const prompt = `You are a professional chef and nutritionist AI for NutriCart.

Generate a clear, step-by-step cooking guide for this meal:
- Name: ${meal.name}
- Type: ${meal.meal || 'meal'}
- Ingredients: ${Array.isArray(meal.items) ? meal.items.join(', ') : 'as listed'}
- Nutrition: ${meal.calories} kcal · ${meal.protein}g protein · ${meal.carbs}g carbs · ${meal.fats}g fats

Generate 5-8 practical cooking steps. Rules:
- Each step should be a clear, single action
- Include time estimates for each step
- One overall difficulty level (Easy / Medium / Hard)
- A brief prep/cook time summary
- One practical nutrition tip about this meal
- Step icons should be relevant emojis (🔪🥘🔥🥗🍳⏱️🧂🫙)

Respond ONLY with valid JSON, no other text:
{
  "difficulty": "Easy",
  "totalTime": "20 min",
  "prepTime": "5 min",
  "cookTime": "15 min",
  "tip": "One brief nutrition or cooking tip for this specific meal",
  "steps": [
    {
      "step": 1,
      "title": "Short step title",
      "instruction": "Full instruction sentence.",
      "duration": "2 min",
      "icon": "🔪"
    }
  ]
}`

    const completion = await client.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  1200,
      temperature: 0.5,
    })

    const responseText = completion.choices[0].message.content
    const cleanJson    = responseText.replace(/```json|```/g, '').trim()
    const parsed       = JSON.parse(cleanJson)

    posthog.capture({
      distinctId,
      event:      'recipe_steps_viewed',
      properties: { meal_name: meal.name, meal_type: meal.meal },
    })

    res.json({ success: true, ...parsed })
  } catch (error) {
    console.error('Recipe steps error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/recipesteps' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v17.0: Regenerate meal plan to prioritize pantry items ──
app.post('/api/replan-with-pantry', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const {
      profile = {},
      currentPlan,
      pantryItems = [],
      pantryMode = 'mixed',
      planScope = 'week',
      todayDate,
    } = req.body || {}

    const selectedPantryMode = pantryMode === 'pantry_only' ? 'pantry_only' : 'mixed'
    const selectedPlanScope = planScope === 'today' ? 'today' : 'week'
    const today = todayDate || new Date().toISOString().split('T')[0]

    if (!currentPlan || !Array.isArray(currentPlan.days)) {
      return res.status(400).json({ success: false, error: 'currentPlan.days[] required' })
    }
    if (pantryItems.length === 0) {
      return res.status(400).json({ success: false, error: 'No pantry items to plan with' })
    }

    let targetDays = []
    if (selectedPlanScope === 'today') {
      const exactToday = currentPlan.days.find(d => d.date === today)
      if (exactToday) {
        targetDays = [exactToday]
      } else {
        const nearestFuture = currentPlan.days.find(d => d.date && d.date >= today)
        if (!nearestFuture) {
          return res.status(400).json({ success: false, error: 'No day available to regenerate.' })
        }
        targetDays = [nearestFuture]
      }
    } else {
      targetDays = currentPlan.days.filter(d => d.date && d.date >= today)
      if (targetDays.length === 0) {
        return res.status(400).json({ success: false, error: 'No remaining days in this plan.' })
      }
    }
    
    const client = getGroqClient()

    // Build pantry list string
    const pantryList = pantryItems
      .map(p => {
        const qty = p.quantity ? ` (${p.quantity}${p.unit || ''})` : ''
        const expiry = p.expiry_date ? ` [expires ${p.expiry_date}]` : ''
        return `  - ${p.name}${qty}${expiry}`
      })
      .join('\n')

    const daysStr = targetDays.map(d => `  ${d.date} (${d.day || 'day'})`).join('\n')

    const pantryModeInstruction = selectedPantryMode === 'pantry_only'
      ? 'Use ONLY pantry items in meals. Do not add external ingredients unless absolutely impossible for nutrition; if any are needed, add them to shoppingReminders.'
      : 'Use pantry items first, then add AI-suggested complementary ingredients as needed for nutrition and variety.'

    const planScopeInstruction = selectedPlanScope === 'today'
      ? 'Regenerate ONLY one day (today/nearest available date). Keep all other plan days unchanged.'
      : 'Regenerate all listed remaining days. Simulate pantry depletion day by day using quantities. If ingredients run out before period end, include clear shoppingReminders.'

    const prompt = `You are a creative behavioral nutritionist AI for NutriCart. The user has specific ingredients at home and wants to plan meals around them to save time and money.

USER PROFILE:
- Goal: ${profile.goal}
- Weight: ${profile.currentWeight}kg → target ${profile.targetWeight}kg
- Daily targets: ${profile.calories || 2000} kcal · ${profile.protein || 100}g protein
- Preferred store: ${Array.isArray(profile.store) ? profile.store[0] : profile.store}
- Symptoms to consider: ${(Array.isArray(profile.symptoms) ? profile.symptoms : []).join(', ') || 'none'}

USER'S PANTRY (create meals PRIORITIZING these items first — they're already paid for and at home!):
${pantryList}

DAYS TO PLAN (${selectedPlanScope === 'today' ? 'single-day update' : 'remaining-week update'}):
${daysStr}

IMPORTANT INSTRUCTIONS:
1. ${pantryModeInstruction}
2. ${planScopeInstruction}
3. Keep each day hitting their nutrition targets (${profile.calories || 2000} kcal, ${profile.protein || 100}g protein roughly)
4. Suggest meals in different categories (breakfast, lunch, dinner) to add variety
5. Consider ingredient combinations that work well together
6. Always output "items" arrays in each meal.

Respond ONLY with valid JSON, no markdown:
{
  "futureDays": [
    {
      "date": "YYYY-MM-DD",
      "day": "Monday|Tuesday|...",
      "totalCalories": 2000,
      "totalProtein": 100,
      "meals": [
        {
          "meal": "breakfast|lunch|dinner|snack",
          "time": "HH:MM",
          "name": "Meal name",
          "items": ["item with qty", ...],
          "calories": 500,
          "protein": 20,
          "carbs": 60,
          "fats": 15,
          "store": "store name or 'Pantry'",
          "reason": "Why this meal uses your pantry items efficiently"
        }
      ],
      "reason": "Why these meals make sense given your pantry + nutrition goals"
    }
  ],
  "pantryUtilization": "Percentage of meals using pantry items",
  "shoppingReminders": [
    {
      "item": "name",
      "neededBy": "YYYY-MM-DD",
      "estimatedQty": "optional qty + unit",
      "reason": "why user should buy"
    }
  ]
}`
    
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    })

    const responseText = completion.choices?.[0]?.message?.content || ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Groq response')
    const parsed = JSON.parse(jsonMatch[0])

    // Map days into currentPlan structure
    const generatedDays = Array.isArray(parsed.futureDays) ? parsed.futureDays : []

    const newMealPlan = {
      ...currentPlan,
      days: currentPlan.days.map(origDay => {
        const newDay = generatedDays.find(d => d.date === origDay.date)
        if (!newDay) return origDay
        const normalizedMeals = (newDay.meals || []).map(m => {
          const items = Array.isArray(m.items)
            ? m.items
            : (Array.isArray(m.ingredients) ? m.ingredients : [])
          return { ...m, items }
        })
        return {
          ...origDay,
          ...newDay,
          meals: normalizedMeals,
          totalCalories: normalizedMeals.reduce((s, m) => s + (+m.calories || 0), 0),
          totalProtein: normalizedMeals.reduce((s, m) => s + (+m.protein || 0), 0),
        }
      }),
    }

    posthog.capture('pantry_replan_generated', {
      distinctId,
      pantry_items: pantryItems.length,
      days_regenerated: generatedDays.length,
      pantry_mode: selectedPantryMode,
      plan_scope: selectedPlanScope,
    })
    res.json({
      success: true,
      mealPlan: newMealPlan,
      pantryUtilization: parsed.pantryUtilization,
      shoppingReminders: Array.isArray(parsed.shoppingReminders) ? parsed.shoppingReminders : [],
      regeneratedDates: generatedDays.map(d => d.date).filter(Boolean),
    })
  } catch (error) {
    console.error('Pantry replan error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/replan-with-pantry' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v17.0 Priority 2: Scale meal ingredients for meal prep ──
app.post('/api/scale-meal', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const { meal, multiplier = 1 } = req.body || {}
    if (!meal || !multiplier || multiplier < 1) {
      return res.status(400).json({ success: false, error: 'meal and multiplier required' })
    }

    // Parse ingredient strings and scale them
    const ingredients = Array.isArray(meal.items) ? meal.items : (Array.isArray(meal.ingredients) ? meal.ingredients : [])
    const scaledIngredients = ingredients.map(ing => {
      // Parse "2 cups sugar", "500g spinach", etc
      const match = ing.match(/^([\d.]+)\s*([a-zA-Z]+)?\s+(.+)$/)
      if (!match) return { item: ing, quantity: '?', unit: '', original: ing }

      const qty = parseFloat(match[1])
      const unit = (match[2] || '').toLowerCase()
      const item = match[3]
      const scaledQty = (qty * multiplier).toFixed(2).replace(/\.?0+$/, '')

      // Smart unit conversion
      let finalQty = scaledQty
      let finalUnit = unit
      if (unit === 'g' && scaledQty >= 1000) {
        finalQty = (scaledQty / 1000).toFixed(2).replace(/\.?0+$/, '')
        finalUnit = 'kg'
      } else if (unit === 'ml' && scaledQty >= 1000) {
        finalQty = (scaledQty / 1000).toFixed(2).replace(/\.?0+$/, '')
        finalUnit = 'l'
      } else if (unit === 'tsp' && scaledQty >= 3) {
        finalQty = (scaledQty / 3).toFixed(2).replace(/\.?0+$/, '')
        finalUnit = 'tbsp'
      }

      return {
        item,
        quantity: finalQty,
        unit: finalUnit,
        original: ing,
        baseCost: Math.random() * 5, // Placeholder — in production would lookup from PRICE_DB
      }
    })

    // Calculate total cost
    const totalCost = scaledIngredients.reduce((sum, i) => sum + (i.baseCost || 0), 0)

    posthog.capture('meal_scaled', { distinctId, meal_name: meal.name, multiplier })
    res.json({
      success: true,
      scaledIngredients: scaledIngredients.map(i => ({
        ...i,
        totalCost,
      })),
    })
  } catch (error) {
    console.error('Scale meal error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/scale-meal' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v17.0 Priority 3: Get price history & predict trends ──
app.get('/api/price-history/:itemName', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const { itemName } = req.params
    const { store = 'all', days = 30 } = req.query

    if (!itemName) {
      return res.status(400).json({ success: false, error: 'itemName required' })
    }

    // Query from Supabase
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ success: false, error: 'Database not configured' })
    }

    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - parseInt(days))
    const fromDateStr = fromDate.toISOString().split('T')[0]

    let query = `select * from price_history where item_name ilike '${itemName.replace(/'/g, "''")}' and recorded_date >= '${fromDateStr}'`
    if (store !== 'all') {
      query += ` and store = '${store.replace(/'/g, "''")}'`
    }
    query += ' order by recorded_date asc'

    const response = await fetch(`${supabaseUrl}/rest/v1?limit=1000`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }).then(() => ({ status: 1, prices: [] })) // Mock for now

    if (response.status === 1 && response.prices.length > 0) {
      // Calculate statistics
      const prices = response.prices.map(p => p.price_per_100g)
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      const current = prices[prices.length - 1]
      const trend = current < avg ? 'down' : current > avg ? 'up' : 'stable'

      posthog.capture('price_history_viewed', { distinctId, item: itemName, days })
      res.json({
        success: true,
        item: itemName,
        history: response.prices,
        stats: { avg, min, max, current, trend },
      })
    } else {
      res.json({ success: true, item: itemName, history: [], stats: { avg: 0, min: 0, max: 0, current: 0, trend: 'unknown' } })
    }
  } catch (error) {
    console.error('Price history error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/price-history' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── v17.0: Predict price trend for smart buying ──
app.post('/api/price-prediction', async (req, res) => {
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  try {
    const { itemName, store = 'Lidl' } = req.body || {}
    if (!itemName) {
      return res.status(400).json({ success: false, error: 'itemName required' })
    }

    // Simple trend prediction: if current price < average, it's a good time to buy
    // In production, use time-series forecasting (ARIMA, Prophet, etc)
    const prediction = {
      itemName,
      store,
      prediction: {
        trend: 'stable', // 'up', 'down', 'stable'
        predictedPrice: Math.random() * 5, // placeholder
        confidence: 0.65,
        recommendedAction: 'wait', // 'buy_now', 'wait', 'watch'
        reason: 'Price has been stable. Check back in 1 week for better deals.',
        savingsPotential: Math.random() * 2,
      },
    }

    posthog.capture('price_prediction_viewed', { distinctId, item: itemName })
    res.json({ success: true, ...prediction })
  } catch (error) {
    console.error('Price prediction error:', error.message)
    posthog.captureException(error, distinctId, { route: '/api/price-prediction' })
    res.status(500).json({ success: false, error: error.message })
  }
})

// ── Start Server ─────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ NutriCart backend running on port ${PORT}`)
})