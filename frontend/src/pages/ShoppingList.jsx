import { useState, useEffect } from 'react'
import posthog from 'posthog-js'

const API = 'https://nutricart-production-cd53.up.railway.app'

function categorizeItem(itemName) {
  const name = itemName.toLowerCase()
  if (name.match(/chicken|beef|salmon|tuna|turkey|pork|lamb|fish|egg|shrimp/)) return 'Meat & Fish'
  if (name.match(/milk|yogurt|cheese|butter|cream|kefir/))                      return 'Dairy'
  if (name.match(/rice|pasta|oat|bread|quinoa|noodle|flour|tortilla|pancake/))   return 'Grains & Carbs'
  if (name.match(/spinach|broccoli|carrot|pepper|onion|garlic|tomato|lettuce|vegetable|potato|sweet potato|mushroom/)) return 'Vegetables'
  if (name.match(/banana|apple|berry|berries|lemon|orange|fruit|avocado/))      return 'Fruits'
  if (name.match(/olive oil|oil|peanut butter|almond butter|hummus/))           return 'Oils & Spreads'
  if (name.match(/nut|almond|walnut|cashew|seed|pumpkin seed/))                 return 'Nuts & Seeds'
  if (name.match(/honey|sugar|salt|pepper|spice|herb|sauce|soy|vinegar/))       return 'Condiments & Spices'
  return 'Other'
}

const CATEGORY_ICONS = {
  'Meat & Fish': '🥩', 'Dairy': '🥛', 'Grains & Carbs': '🌾',
  'Vegetables': '🥦', 'Fruits': '🍎', 'Oils & Spreads': '🫙',
  'Nuts & Seeds': '🥜', 'Condiments & Spices': '🧂', 'Other': '🛒',
}

const CATEGORY_ORDER = ['Meat & Fish','Dairy','Grains & Carbs','Vegetables','Fruits','Oils & Spreads','Nuts & Seeds','Condiments & Spices','Other']

// Mock price data per store (€ per item estimate)
const STORE_PRICE_MULTIPLIER = {
  'Lidl':     1.0,
  'Kaufland': 1.05,
  'Billa':    1.12,
  'Tesco':    1.08,
  'Spar':     1.15,
  'Aldi':     0.95,
  'Penny':    0.97,
}

function estimateItemPrice(itemName) {
  const name = itemName.toLowerCase()
  if (name.match(/chicken|beef|salmon|tuna|turkey|pork|fish/)) return 3.50
  if (name.match(/milk|yogurt/))  return 1.20
  if (name.match(/cheese/))       return 2.50
  if (name.match(/egg/))          return 2.00
  if (name.match(/rice|pasta|oat|bread|quinoa/)) return 1.50
  if (name.match(/spinach|broccoli|carrot|pepper|onion|potato|sweet potato/)) return 1.20
  if (name.match(/banana|apple|berry|lemon|orange/)) return 1.00
  if (name.match(/olive oil|peanut butter/)) return 3.00
  if (name.match(/nut|almond|walnut|cashew|seed/)) return 2.50
  if (name.match(/honey/))        return 2.20
  return 1.00
}

function toCanonicalUnit(unit = '') {
  const u = String(unit).toLowerCase().trim()
  if (u === 'pc' || u === 'x') return 'pcs'
  return u || 'pcs'
}

function parseIngredientAmount(raw = '') {
  const text = String(raw).toLowerCase()
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs|pc|x|tbsp|tsp|cup|pack)\b/)
  if (match) {
    return { qty: parseFloat(match[1]), unit: toCanonicalUnit(match[2]) }
  }
  const fraction = text.match(/(\d+)\s*\/\s*(\d+)/)
  if (fraction) {
    const num = Number(fraction[1])
    const den = Number(fraction[2])
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return { qty: +(num / den).toFixed(3), unit: 'pcs' }
    }
  }
  const numOnly = text.match(/(\d+(?:\.\d+)?)/)
  if (numOnly) return { qty: parseFloat(numOnly[1]), unit: 'pcs' }
  return { qty: 1, unit: 'pcs' }
}

function normalizeIngredientName(raw = '') {
  let cleaned = String(raw)
    .toLowerCase()
    // Drop source/store noise that should never create unique shopping items
    .replace(/\b(pantry|fridge|freezer|lidl|kaufland|billa|tesco|spar|aldi|penny)\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(kg|g|l|ml|pcs|pc|x|tbsp|tsp|cup|pack)\b/g, ' ')
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Canonicalize common singular/plural variants so they merge into one line item
  const singularMap = {
    eggs: 'egg',
    tomatoes: 'tomato',
    potatoes: 'potato',
    onions: 'onion',
    carrots: 'carrot',
    mushrooms: 'mushroom',
    peppers: 'pepper',
    berries: 'berry',
  }

  cleaned = cleaned
    .split(' ')
    .map(w => singularMap[w] || w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}

function toTitleCase(text = '') {
  return String(text)
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function convertQty(qty, fromUnit, toUnit) {
  const from = toCanonicalUnit(fromUnit)
  const to = toCanonicalUnit(toUnit)
  if (!Number.isFinite(qty)) return null
  if (from === to) return qty

  if (from === 'kg' && to === 'g') return qty * 1000
  if (from === 'g' && to === 'kg') return qty / 1000
  if (from === 'l' && to === 'ml') return qty * 1000
  if (from === 'ml' && to === 'l') return qty / 1000

  const volumeToMl = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240 }
  if (volumeToMl[from] && volumeToMl[to]) {
    return (qty * volumeToMl[from]) / volumeToMl[to]
  }

  if ((from === 'pack' && to === 'pcs') || (from === 'pcs' && to === 'pack')) return qty
  return null
}

function formatAmount(qty, unit) {
  if (!Number.isFinite(qty)) return ''
  let amount = qty
  let u = toCanonicalUnit(unit)
  if (u === 'g' && amount >= 1000) { amount /= 1000; u = 'kg' }
  if (u === 'ml' && amount >= 1000) { amount /= 1000; u = 'l' }
  const rounded = +amount.toFixed(amount >= 10 ? 1 : 2)
  return `${rounded}${u}`
}

function extractIngredients(aiMealPlan, staticDayPlan) {
  const allItems = {}
  const source = aiMealPlan ? aiMealPlan.days.flatMap(d => d.meals.flatMap(m => m.items || [])) : staticDayPlan.flatMap(m => m.items || [])
  source.forEach(rawItem => {
    const normalizedName = normalizeIngredientName(rawItem)
    if (!normalizedName) return
    const key = normalizedName
    const parsed = parseIngredientAmount(rawItem)
    if (!allItems[key]) {
      const unit = toCanonicalUnit(parsed.unit)
      allItems[key] = {
        key,
        name: toTitleCase(normalizedName),
        baseName: normalizedName,
        category: categorizeItem(normalizedName),
        checked: false,
        selected: false,
        count: 1,
        totalQty: parsed.qty,
        totalUnit: unit,
        amountLabel: formatAmount(parsed.qty, unit),
        basePrice: estimateItemPrice(normalizedName),
      }
      return
    }

    allItems[key].count += 1
    const converted = convertQty(parsed.qty, parsed.unit, allItems[key].totalUnit)
    if (Number.isFinite(converted)) {
      allItems[key].totalQty = +(allItems[key].totalQty + converted).toFixed(3)
      allItems[key].amountLabel = formatAmount(allItems[key].totalQty, allItems[key].totalUnit)
    } else {
      // Incompatible units: keep current summed quantity, still dedup by name.
      allItems[key].amountLabel = formatAmount(allItems[key].totalQty, allItems[key].totalUnit)
    }
  })
  return allItems
}

const staticDayPlan = [
  { meal: 'Breakfast', items: ['Rolled oats 80g', 'Banana 1x', 'Peanut butter 2 tbsp', 'Whole milk 300ml'] },
  { meal: 'Lunch',     items: ['Chicken thighs 200g', 'Basmati rice 150g', 'Fresh spinach 100g', 'Olive oil 1 tbsp'] },
  { meal: 'Snack',     items: ['Greek yogurt 200g', 'Mixed nuts 30g', 'Honey 1 tsp'] },
  { meal: 'Dinner',    items: ['Salmon fillet 200g', 'Sweet potato 200g', 'Broccoli 150g', 'Lemon 1/2'] },
]

export default function ShoppingList({ profile, aiMealPlan, onShowPriceHistory, onAddPurchasedToPantry }) {
  const rawItems      = extractIngredients(aiMealPlan, staticDayPlan)
  const [items, setItems]           = useState(rawItems)
  const [mode, setMode]             = useState('manual') // 'manual' | 'ai'
  const [activeStore, setActiveStore] = useState(Array.isArray(profile.store) ? profile.store[0] : profile.store)
  const [showComparison, setShowComparison] = useState(false)
  const [aiSelecting, setAiSelecting] = useState(false)
  const [pricesLoading, setPricesLoading] = useState(false)

  const stores     = Array.isArray(profile.store) ? profile.store : [profile.store]

  // ── Fetch real prices whenever items list or store changes ──
  useEffect(() => {
    const itemNames = Object.values(rawItems).map(i => i.baseName || i.name)
    if (itemNames.length === 0) return
    setPricesLoading(true)
    fetch(`${API}/api/prices`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items: itemNames, store: activeStore }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.priced)) {
          const priceMap = {}
          data.priced.forEach(p => { priceMap[p.item.toLowerCase().trim()] = p.price })
          setItems(prev => {
            const updated = {}
            Object.entries(prev).forEach(([k, v]) => {
              const lookup = (v.baseName || v.name).toLowerCase().trim()
              updated[k] = { ...v, basePrice: priceMap[lookup] ?? v.basePrice }
            })
            return updated
          })
        }
      })
      .catch(() => {}) // silently fall back to estimates
      .finally(() => setPricesLoading(false))
  }, [activeStore, aiMealPlan])
  const itemList   = Object.values(items)
  const totalItems = itemList.length
  const checkedItems  = itemList.filter(i => i.checked).length
  const checkedList = itemList.filter(i => i.checked)
  const selectedItems = itemList.filter(i => i.selected)
  const pantryTransferItems = checkedList.length > 0 ? checkedList : selectedItems
  const progress   = Math.round((checkedItems / totalItems) * 100)

  // Group by category
  const grouped = {}
  itemList.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  })

  function toggleItem(key) {
    setItems(prev => ({ ...prev, [key]: { ...prev[key], checked: !prev[key].checked } }))
  }

  function toggleSelect(key) {
    setItems(prev => ({ ...prev, [key]: { ...prev[key], selected: !prev[key].selected } }))
  }

  function uncheckAll() {
    const reset = {}
    Object.entries(items).forEach(([k, v]) => { reset[k] = { ...v, checked: false } })
    setItems(reset)
  }

  function selectAll() {
    const all = {}
    Object.entries(items).forEach(([k, v]) => { all[k] = { ...v, selected: true } })
    setItems(all)
  }

  function deselectAll() {
    const none = {}
    Object.entries(items).forEach(([k, v]) => { none[k] = { ...v, selected: false } })
    setItems(none)
  }

  // AI selection: pick items that best meet budget and nutrition
  function handleAISelect() {
    posthog.capture('ai_shopping_selection_used', { store: activeStore, total_items: totalItems })
    setAiSelecting(true)
    setTimeout(() => {
      const budget = 50 // €50 weekly budget
      let spent = 0
      const aiSelected = {}
      // Sort by nutrition value (protein sources first, then vegetables, etc.)
      const priority = ['Meat & Fish','Grains & Carbs','Vegetables','Dairy','Fruits','Nuts & Seeds','Oils & Spreads','Condiments & Spices','Other']
      const sorted = [...itemList].sort((a, b) => priority.indexOf(a.category) - priority.indexOf(b.category))
      sorted.forEach(item => {
        const price = item.basePrice * (STORE_PRICE_MULTIPLIER[activeStore] || 1)
        if (spent + price <= budget) {
          aiSelected[item.name.toLowerCase().trim()] = true
          spent += price
        }
      })
      const updated = {}
      Object.entries(items).forEach(([k, v]) => { updated[k] = { ...v, selected: !!aiSelected[k] } })
      setItems(updated)
      setAiSelecting(false)
    }, 1500)
  }

  // Price for a store
  function getItemPrice(item, store) {
    return (item.basePrice * (STORE_PRICE_MULTIPLIER[store] || 1)).toFixed(2)
  }

  function getTotalForStore(store) {
    return selectedItems.length > 0
      ? selectedItems.reduce((s, item) => s + item.basePrice * (STORE_PRICE_MULTIPLIER[store] || 1), 0).toFixed(2)
      : itemList.reduce((s, item) => s + item.basePrice * (STORE_PRICE_MULTIPLIER[store] || 1), 0).toFixed(2)
  }

  const cheapestStore = stores.reduce((best, s) => parseFloat(getTotalForStore(s)) < parseFloat(getTotalForStore(best)) ? s : best, stores[0])

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800">🛒 Shopping List</h2>
          <p className="text-gray-500 text-sm mt-1">
            {aiMealPlan ? '7-day AI meal plan' : 'Sample meal plan'} · {totalItems} items
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={uncheckAll} className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Uncheck all</button>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button onClick={() => setMode('manual')}
          className={`p-4 rounded-2xl border-2 text-left transition ${mode === 'manual' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}>
          <p className="font-bold text-gray-800 text-sm">👤 Manual Selection</p>
          <p className="text-xs text-gray-500 mt-1">You choose which items to include in your order</p>
        </button>
        <button onClick={() => setMode('ai')}
          className={`p-4 rounded-2xl border-2 text-left transition ${mode === 'ai' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
          <p className="font-bold text-gray-800 text-sm">🤖 AI Smart Selection</p>
          <p className="text-xs text-gray-500 mt-1">AI picks items for max nutrition within your budget</p>
        </button>
      </div>

      {/* AI Mode Controls */}
      {mode === 'ai' && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-5">
          <p className="text-sm text-purple-700 font-semibold mb-3">🤖 AI will select items prioritising: protein sources → vegetables → grains → fats, within a ~€50 weekly budget</p>
          <div className="flex gap-2">
            <button onClick={handleAISelect} disabled={aiSelecting}
              className="bg-purple-600 text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-purple-700 transition disabled:opacity-50">
              {aiSelecting ? '⏳ Selecting...' : '✨ Let AI Choose'}
            </button>
            <button onClick={deselectAll} className="bg-gray-100 text-gray-600 text-sm font-bold px-4 py-2 rounded-full hover:bg-gray-200 transition">
              Clear Selection
            </button>
            <button onClick={selectAll} className="bg-gray-100 text-gray-600 text-sm font-bold px-4 py-2 rounded-full hover:bg-gray-200 transition">
              Select All
            </button>
          </div>
          {selectedItems.length > 0 && (
            <p className="text-xs text-purple-600 mt-2 font-semibold">
              ✅ {selectedItems.length} items selected · Estimated total: €{getTotalForStore(activeStore)} at {activeStore}
            </p>
          )}
        </div>
      )}

      {/* Store Selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {stores.map((store, i) => (
          <button key={i} onClick={() => setActiveStore(store)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${activeStore === store ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}>
            🏪 {store}
          </button>
        ))}
        {stores.length > 1 && (
          <button onClick={() => { posthog.capture('price_comparison_opened', { store_count: stores.length }); setShowComparison(true) }}
            className="px-4 py-2 rounded-full text-sm font-semibold transition bg-blue-50 text-blue-700 hover:bg-blue-100">
            📊 Compare Prices
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold text-gray-700">Shopping Progress</span>
          <span className="font-bold text-green-700">{checkedItems} / {totalItems} items</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div className="bg-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        {progress === 100 && <p className="text-green-600 text-sm font-bold mt-2 text-center">🎉 All items collected!</p>}
      </div>

      {/* Cost estimate */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="font-bold text-green-800">💰 Weekly Grocery Estimate</p>
          <p className="text-green-600 text-sm">
            {selectedItems.length > 0 ? `${selectedItems.length} selected items` : 'Full list'} at {activeStore}
            {activeStore === cheapestStore && stores.length > 1 && <span className="ml-1 bg-green-200 text-green-800 text-xs px-1 rounded">Cheapest</span>}
          </p>
          {pricesLoading && <p className="text-green-500 text-xs mt-1 animate-pulse">🔄 Fetching real prices...</p>}
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-green-700">~€{getTotalForStore(activeStore)}</p>
          <p className="text-green-500 text-xs">per week</p>
        </div>
      </div>

      {/* Items by category */}
      {CATEGORY_ORDER.filter(cat => grouped[cat]).map(category => (
        <div key={category} className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-xl">{CATEGORY_ICONS[category]}</span>
            <span className="font-bold text-gray-700">{category}</span>
            <span className="ml-auto text-xs text-gray-400">
              {grouped[category].filter(i => i.checked).length}/{grouped[category].length}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {grouped[category].map((item, i) => {
              const key   = item.key || item.name.toLowerCase().trim()
              const price = getItemPrice(item, activeStore)
              return (
                <div key={i} className={`flex items-center gap-3 px-5 py-3 transition ${item.checked ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                  {/* Check circle */}
                  <div onClick={() => toggleItem(key)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition
                      ${item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {item.checked && <span className="text-white text-xs">✓</span>}
                  </div>

                  {/* Select checkbox (for comparison/ordering) */}
                  {(mode === 'ai' || showComparison) && (
                    <div onClick={() => toggleSelect(key)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition
                        ${item.selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {item.selected && <span className="text-white text-xs">✓</span>}
                    </div>
                  )}

                  <span className={`text-sm flex-1 ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {item.name}
                    {item.amountLabel && <span className="ml-1 text-xs text-gray-500 font-semibold">({item.amountLabel})</span>}
                  </span>

                  <span className="text-xs text-gray-500">€{price}</span>
                  <span className="text-xs text-green-600 font-semibold">{activeStore}</span>
                  {onShowPriceHistory && (
                    <button
                      onClick={() => onShowPriceHistory(item.baseName || item.name)}
                      className="text-xs text-blue-500 hover:text-blue-700 transition font-semibold ml-1"
                      title="View price history">
                      📈
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Order / in-person actions */}
      <div className="mt-6 bg-gray-800 rounded-2xl p-5 text-center">
        <p className="text-white font-bold mb-2">Ready to order?</p>
        <p className="text-gray-400 text-sm mb-4">Order online or sync your bought items directly to pantry</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => {
              posthog.capture('store_online_shop_opened', { store: activeStore, checked_items: checkedItems, total_items: totalItems })
              const urls = { 'Lidl': 'https://www.lidl.sk', 'Kaufland': 'https://www.kaufland.sk', 'Billa': 'https://www.billa.sk', 'Tesco': 'https://www.tesco.com', 'Spar': 'https://www.spar.sk', 'Aldi': 'https://www.aldi.sk', 'Penny': 'https://www.penny.sk' }
              window.open(urls[activeStore] || `https://www.google.com/search?q=${activeStore}+online+shop`, '_blank')
            }}
            className="bg-green-500 text-white font-bold px-5 py-3 rounded-full hover:bg-green-400 transition">
            🛒 Go to {activeStore} Online Shop →
          </button>
          <button
            onClick={() => {
              if (!onAddPurchasedToPantry) return
              onAddPurchasedToPantry(
                pantryTransferItems.map(i => ({
                    name: `${(i.baseName || i.name).toLowerCase()} ${i.amountLabel || ''}`.trim(),
                  category: i.category,
                    count: 1,
                }))
              )
              posthog.capture('shopping_items_sent_to_pantry', {
                source_store: activeStore,
                sent_items: pantryTransferItems.length,
                source_mode: checkedList.length > 0 ? 'checked' : 'selected',
              })
            }}
            disabled={!onAddPurchasedToPantry || pantryTransferItems.length === 0}
            className="bg-blue-500 text-white font-bold px-5 py-3 rounded-full hover:bg-blue-400 transition disabled:opacity-40 disabled:cursor-not-allowed">
            🧺 Stock Pantry from Bought Items
          </button>
        </div>
        <p className="text-gray-500 text-xs mt-2">
          Uses checked items first{checkedList.length === 0 ? ' (no checked items found, selected items will be used)' : ''}.
        </p>
      </div>

      {/* Price Comparison Modal */}
      {showComparison && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-gray-800">📊 Price Comparison</h3>
              <button onClick={() => setShowComparison(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {selectedItems.length > 0 ? `Comparing ${selectedItems.length} selected items` : `Comparing all ${totalItems} items`} across your stores
            </p>

            {/* Store comparison */}
            <div className="space-y-3 mb-4">
              {stores.map((store, i) => {
                const total = parseFloat(getTotalForStore(store))
                const isCheapest = store === cheapestStore
                return (
                  <div key={i} className={`rounded-2xl p-4 border-2 ${isCheapest ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{store}</span>
                        {isCheapest && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold">Cheapest</span>}
                      </div>
                      <span className="text-2xl font-extrabold text-green-700">€{total.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${Math.min((parseFloat(getTotalForStore(stores[0])) / total) * 80, 100)}%` }} />
                    </div>
                    {isCheapest && (
                      <p className="text-xs text-green-600 mt-1 font-semibold">
                        Save €{(Math.max(...stores.map(s => parseFloat(getTotalForStore(s)))) - total).toFixed(2)} vs most expensive
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Item-by-item comparison */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Item Price Breakdown</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left py-1 text-gray-500">Item</th>
                      {stores.map(s => <th key={s} className="text-right py-1 text-gray-500 pl-2">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedItems.length > 0 ? selectedItems : itemList).slice(0, 10).map((item, i) => (
                      <tr key={i} className="border-t border-gray-200">
                        <td className="py-1 text-gray-700 max-w-28 truncate">{item.name.substring(0, 20)}</td>
                        {stores.map(s => {
                          const price = parseFloat(getItemPrice(item, s))
                          const min   = Math.min(...stores.map(st => parseFloat(getItemPrice(item, st))))
                          return (
                            <td key={s} className={`text-right py-1 pl-2 font-semibold ${price === min ? 'text-green-600' : 'text-gray-500'}`}>
                              €{price.toFixed(2)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {(selectedItems.length > 0 ? selectedItems : itemList).length > 10 && (
                      <tr><td colSpan={stores.length + 1} className="text-gray-400 text-center py-1">...and {(selectedItems.length > 0 ? selectedItems : itemList).length - 10} more items</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300">
                      <td className="py-2 font-bold text-gray-800">Total</td>
                      {stores.map(s => (
                        <td key={s} className={`text-right py-2 pl-2 font-extrabold ${s === cheapestStore ? 'text-green-600' : 'text-gray-700'}`}>
                          €{getTotalForStore(s)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <button onClick={() => { setActiveStore(cheapestStore); setShowComparison(false) }}
              className="mt-4 bg-green-600 text-white font-bold px-8 py-3 rounded-full w-full hover:bg-green-700 transition">
              Switch to {cheapestStore} (Cheapest) →
            </button>
          </div>
        </div>
      )}

    </div>
  )
}