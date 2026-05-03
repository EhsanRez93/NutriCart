export default function PriceHistoryModal({ itemName, history = [], stats = {}, onClose, loading = false }) {
  const chartHeight = 200
  const prices = history.length > 0 ? history.map(h => h.price_per_100g) : []
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 10
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0

  const getTrendColor = (trend) => {
    if (trend === 'down') return 'text-green-600'
    if (trend === 'up') return 'text-red-600'
    return 'text-gray-600'
  }

  const getTrendEmoji = (trend) => {
    if (trend === 'down') return '📉'
    if (trend === 'up') return '📈'
    return '➡️'
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] overflow-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-gray-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-800">📈 Price Trends</h2>
            <p className="text-sm text-gray-500">{itemName} · Last 30 days</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">📊 Loading price history...</p>
            </div>
          ) : prices.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <p className="text-gray-600 text-sm">No price history available for {itemName} yet.</p>
              <p className="text-gray-400 text-xs mt-2">Prices will be tracked when you search for this item.</p>
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-bold">Current</p>
                  <p className="text-xl font-extrabold text-blue-700">€{stats.current?.toFixed(2) || '—'}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-bold">Min (30d)</p>
                  <p className="text-xl font-extrabold text-green-700">€{stats.min?.toFixed(2) || '—'}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-600 font-bold">Max (30d)</p>
                  <p className="text-xl font-extrabold text-red-700">€{stats.max?.toFixed(2) || '—'}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-xs text-purple-600 font-bold">Average</p>
                  <p className="text-xl font-extrabold text-purple-700">€{stats.avg?.toFixed(2) || '—'}</p>
                </div>
              </div>

              {/* Trend Badge */}
              <div className={`p-4 rounded-lg border-2 ${stats.trend === 'down' ? 'border-green-300 bg-green-50' : stats.trend === 'up' ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getTrendEmoji(stats.trend)}</span>
                  <div className="flex-1">
                    <p className={`font-bold ${getTrendColor(stats.trend)}`}>
                      {stats.trend === 'down' ? '📉 Price is dropping' : stats.trend === 'up' ? '📈 Price is rising' : '➡️ Price is stable'}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {stats.trend === 'down'
                        ? 'Good time to buy! Prices have been declining.'
                        : stats.trend === 'up'
                        ? 'Prices are going up. Consider buying elsewhere or waiting for a sale.'
                        : 'Prices have been stable. Lock in your purchase anytime.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Simple Bar Chart */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-bold text-gray-700 mb-3">Price Timeline (€/100g)</p>
                <div className="flex items-end justify-between gap-1 h-32 bg-white rounded p-3">
                  {prices.length > 0 &&
                    prices.map((price, i) => {
                      const height = ((price - minPrice) / (maxPrice - minPrice)) * 100 || 5
                      const isLatest = i === prices.length - 1
                      return (
                        <div
                          key={i}
                          style={{ height: `${height}%` }}
                          className={`flex-1 rounded-t transition hover:opacity-80 cursor-pointer ${
                            isLatest ? 'bg-blue-500' : 'bg-blue-200'
                          }`}
                          title={`€${price.toFixed(2)}`}
                        />
                      )
                    })}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">← Older | Newer →</p>
              </div>

              {/* Recommendation */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-lg p-4">
                <p className="text-sm font-bold text-amber-900 mb-2">💡 Smart Buying Recommendation</p>
                <p className="text-sm text-amber-800">
                  {stats.current && stats.min && stats.current <= stats.min * 1.1
                    ? `✅ Current price (€${stats.current.toFixed(2)}) is near 30-day low. Buy now!`
                    : stats.current && stats.avg && stats.current > stats.avg * 1.2
                    ? `⏱️ Current price is 20%+ above average. Wait for a price drop or check other stores.`
                    : `✓ Current price is reasonable. You can buy anytime.`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
