const express = require('express')
const cors    = require('cors')
const dotenv  = require('dotenv')
const Groq    = require('groq-sdk')

dotenv.config()

const app    = express()
const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'NutriCart backend is running ✅' })
})

app.post('/api/mealplan', async (req, res) => {
  try {
    const profile = req.body

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
Daily fats target: ${profile.fats}g

Respond ONLY with a valid JSON object in this exact format, no other text, no markdown, no backticks:
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
      max_tokens: 4000,
      temperature: 0.7,
    })

    const responseText = completion.choices[0].message.content
    const cleanJson    = responseText.replace(/```json|```/g, '').trim()
    const mealPlan     = JSON.parse(cleanJson)

    res.json({ success: true, mealPlan })

  } catch (error) {
    console.error('Error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`✅ NutriCart backend running on http://localhost:${PORT}`)
})