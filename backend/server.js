const express = require('express')
const cors    = require('cors')
const dotenv  = require('dotenv')
const Groq    = require('groq-sdk')
const axios   = require('axios')

dotenv.config()

// ── In-memory holiday cache (24 h) ──────────────────
const holidayCache = {}

const app    = express()
const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

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

// ── Start Server ─────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ NutriCart backend running on port ${PORT}`)
})