import { useState } from 'react'

// ─────────────────────────────────────────────
// CATEGORY MAPPER
// Groups ingredients into store sections
// ─────────────────────────────────────────────
function categorizeItem(itemName) {
  const name = itemName.toLowerCase()
  if (name.match(/chicken|beef|salmon|tuna|turkey|pork|lamb|fish|egg|shrimp/))
    return 'Meat & Fish'
  if (name.match(/milk|yogurt|cheese|butter|cream|kefir/))
    return 'Dairy'
  if (name.match(/rice|pasta|oat|bread|quinoa|noodle|flour|tortilla|pancake/))
    return 'Grains & Carbs'
  if (name.match(/spinach|broccoli|carrot|pepper|onion|garlic|tomato|lettuce|salad|vegetable|celery|asparagus|bean|pea|corn|mushroom|potato|sweet potato/))
    return 'Vegetables'
  if (name.match(/banana|apple|berry|berries|lemon|orange|fruit|grape|mango|avocado/))
    return 'Fruits'
  if (name.match(/olive oil|oil|butter|peanut butter|almond butter|hummus/))
    return 'Oils & Spreads'
  if (name.match(/nut|almond|walnut|cashew|seed|pumpkin seed/))
    return 'Nuts & Seeds'
  if (name.match(/honey|sugar|salt|pepper|spice|herb|sauce|soy|vinegar|mustard/))
    return 'Condiments & Spices'
  if (name.match(/protein powder|supplement/))
    return 'Supplements'
  return 'Other'
}

const CATEGORY_ICONS = {
  'Meat & Fish':        '🥩',
  'Dairy':              '🥛',
  'Grains & Carbs':     '🌾',
  'Vegetables':         '🥦',
  'Fruits':             '🍎',
  'Oils & Spreads':     '🫙',
  'Nuts & Seeds':       '🥜',
  'Condiments & Spices':'🧂',
  'Supplements':        '💊',
  'Other':              '🛒',
}

const CATEGORY_ORDER = [
  'Meat & Fish', 'Dairy', 'Grains & Carbs', 'Vegetables',
  'Fruits', 'Oils & Spreads', 'Nuts & Seeds',
  'Condiments & Spices', 'Supplements', 'Other'
]

// ─────────────────────────────────────────────
// EXTRACT INGREDIENTS FROM MEAL PLAN
// ─────────────────────────────────────────────
function extractIngredients(aiMealPlan, staticDayPlan) {
  const allItems = {}

  const days = aiMealPlan ? aiMealPlan.days : null

  if (days) {
    days.forEach(day => {
      day.meals.forEach(meal => {
        if (meal.items) {
          meal.items.forEach(item => {
            const key = item.toLowerCase().trim()
            if (!allItems[key]) {
              allItems[key] = {
                name: item,
                category: categorizeItem(item),
                checked: false,
                days: 1,
              }
            } else {
              allItems[key].days += 1
            }
          })
        }
      })
    })
  } else {
    staticDayPlan.forEach(meal => {
      meal.items.forEach(item => {
        const key = item.toLowerCase().trim()
        if (!allItems[key]) {
          allItems[key] = {
            name: item,
            category: categorizeItem(item),
            checked: false,
            days: 1,
          }
        }
      })
    })
  }

  return allItems
}

// ─────────────────────────────────────────────
// STATIC FALLBACK MEALS
// ─────────────────────────────────────────────
const staticDayPlan = [
  { meal: 'Breakfast', items: ['Rolled oats 80g', 'Banana 1x', 'Peanut butter 2 tbsp', 'Whole milk 300ml'] },
  { meal: 'Lunch',     items: ['Chicken thighs 200g', 'Basmati rice 150g', 'Fresh spinach 100g', 'Olive oil 1 tbsp'] },
  { meal: 'Snack',     items: ['Greek yogurt 200g', 'Mixed nuts 30g', 'Honey 1 tsp'] },
  { meal: 'Dinner',    items: ['Salmon fillet 200g', 'Sweet potato 200g', 'Broccoli 150g', 'Lemon 1/2'] },
]

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function ShoppingList({ profile, aiMealPlan }) {
  const rawItems   = extractIngredients(aiMealPlan, staticDayPlan)
  const [items, setItems] = useState(rawItems)
  const [activeStore, setActiveStore] = useState(
    Array.isArray(profile.store) ? profile.store[0] : profile.store
  )

  const stores = Array.isArray(profile.store) ? profile.store : [profile.store]

  // Group items by category
  const grouped = {}
  Object.values(items).forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  })

  const totalItems    = Object.values(items).length
  const checkedItems  = Object.values(items).filter(i => i.checked).length
  const progress      = Math.round((checkedItems / totalItems) * 100)

  function toggleItem(key) {
    setItems(prev => ({
      ...prev,
      [key]: { ...prev[key], checked: !prev[key].checked }
    }))
  }

  function uncheckAll() {
    const reset = {}
    Object.entries(items).forEach(([k, v]) => {
      reset[k] = { ...v, checked: false }
    })
    setItems(reset)
  }

  function checkAll() {
    const all = {}
    Object.entries(items).forEach(([k, v]) => {
      all[k] = { ...v, checked: true }
    })
    setItems(all)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800">🛒 Shopping List</h2>
          <p className="text-gray-500 text-sm mt-1">
            {aiMealPlan ? '7-day AI meal plan' : 'Sample meal plan'} · {totalItems} items
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={uncheckAll}
            className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            Uncheck all
          </button>
          <button
            onClick={checkAll}
            className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition">
            Check all
          </button>
        </div>
      </div>

      {/* Store selector */}
      <div className="flex gap-2 mb-6">
        {stores.map((store, i) => (
          <button
            key={i}
            onClick={() => setActiveStore(store)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeStore === store
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}>
            🏪 {store}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold text-gray-700">Shopping Progress</span>
          <span className="font-bold text-green-700">{checkedItems} / {totalItems} items</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-green-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {progress === 100 && (
          <p className="text-green-600 text-sm font-bold mt-2 text-center">
            🎉 All items collected!
          </p>
        )}
      </div>

      {/* Weekly cost estimate */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="font-bold text-green-800">💰 Weekly Grocery Estimate</p>
          <p className="text-green-600 text-sm">Based on average prices at {activeStore}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-green-700">~€{aiMealPlan ? '48' : '35'}</p>
          <p className="text-green-500 text-xs">per week</p>
        </div>
      </div>

      {/* Shopping items by category */}
      {CATEGORY_ORDER.filter(cat => grouped[cat]).map(category => (
        <div key={category} className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          {/* Category header */}
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-xl">{CATEGORY_ICONS[category]}</span>
            <span className="font-bold text-gray-700">{category}</span>
            <span className="ml-auto text-xs text-gray-400">
              {grouped[category].filter(i => i.checked).length}/{grouped[category].length}
            </span>
          </div>

          {/* Items */}
          <div className="divide-y divide-gray-50">
            {grouped[category].map((item, i) => {
              const key = item.name.toLowerCase().trim()
              return (
                <div
                  key={i}
                  onClick={() => toggleItem(key)}
                  className={`flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 transition
                    ${item.checked ? 'opacity-50' : ''}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition
                    ${item.checked
                      ? 'bg-green-500 border-green-500'
                      : 'border-gray-300'}`}>
                    {item.checked && <span className="text-white text-xs">✓</span>}
                  </div>
                  <span className={`text-sm flex-1 ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {item.name}
                  </span>
                  {item.days > 1 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {item.days}x week
                    </span>
                  )}
                  <span className="text-xs text-green-600 font-semibold">
                    {activeStore}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Order button */}
      <div className="mt-6 bg-gray-800 rounded-2xl p-5 text-center">
        <p className="text-white font-bold mb-2">Ready to order?</p>
        <p className="text-gray-400 text-sm mb-4">
          Open {activeStore} online shop and add your items
        </p>
        <button
          onClick={() => {
            const storeUrls = {
              'Lidl':     'https://www.lidl.sk',
              'Kaufland': 'https://www.kaufland.sk',
              'Billa':    'https://www.billa.sk',
              'Tesco':    'https://www.tesco.com',
              'Spar':     'https://www.spar.sk',
              'Aldi':     'https://www.aldi.sk',
              'Penny':    'https://www.penny.sk',
            }
            window.open(storeUrls[activeStore] || 'https://www.google.com/search?q=' + activeStore + '+online+shop', '_blank')
          }}
          className="bg-green-500 text-white font-bold px-8 py-3 rounded-full hover:bg-green-400 transition">
          🛒 Go to {activeStore} Online Shop →
        </button>
      </div>

    </div>
  )
}