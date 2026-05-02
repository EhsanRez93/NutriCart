// Country → ISO-2 mapping for Nager.Date (22 countries; "Other" → no holidays)
const COUNTRY_ISO = {
  'Slovakia':       'SK',
  'Czech Republic': 'CZ',
  'Austria':        'AT',
  'Hungary':        'HU',
  'Germany':        'DE',
  'Poland':         'PL',
  'Romania':        'RO',
  'Bulgaria':       'BG',
  'Croatia':        'HR',
  'Slovenia':       'SI',
  'United Kingdom': 'GB',
  'Ireland':        'IE',
  'France':         'FR',
  'Italy':          'IT',
  'Spain':          'ES',
  'Portugal':       'PT',
  'Netherlands':    'NL',
  'Belgium':        'BE',
  'Sweden':         'SE',
  'Norway':         'NO',
  'Denmark':        'DK',
  'Finland':        'FI',
}

// In-tab cache so switching tabs doesn't refetch
// Key: 'SK-2026' → { data: [...], fetchedAt: timestamp }
const _cache = {}

export function countryToISO(country) {
  return COUNTRY_ISO[country] || null
}

export function countryHasHolidaySupport(country) {
  return !!COUNTRY_ISO[country]
}

async function _fetchByYear(isoCode, year) {
  const key = `${isoCode}-${year}`
  const now = Date.now()
  if (_cache[key] && now - _cache[key].fetchedAt < 24 * 60 * 60 * 1000) {
    return _cache[key].data
  }
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${isoCode}`)
    if (!res.ok) return []
    const data = await res.json()
    _cache[key] = { data, fetchedAt: now }
    return data
  } catch {
    return []
  }
}

// Fetch holidays in the window [startDate, startDate + days - 1]
export async function fetchHolidaysWindow(country, startDate, days = 7) {
  const iso = countryToISO(country)
  if (!iso) return []
  const start = new Date(startDate)
  const end   = new Date(startDate)
  end.setDate(end.getDate() + days - 1)
  const years = [start.getFullYear()]
  if (end.getFullYear() !== start.getFullYear()) years.push(end.getFullYear())
  const results = await Promise.all(years.map(y => _fetchByYear(iso, y)))
  const all = results.flat()
  const startStr = start.toISOString().split('T')[0]
  const endStr   = end.toISOString().split('T')[0]
  return all.filter(h => h.date >= startStr && h.date <= endStr)
}

// Find a holiday object for a specific date string (YYYY-MM-DD), or null
export function findHoliday(holidays, dateStr) {
  return holidays.find(h => h.date === dateStr) || null
}

// Get next `count` upcoming holidays from today
export async function upcomingHolidays(country, count = 3) {
  const iso = countryToISO(country)
  if (!iso) return []
  const today    = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const year     = today.getFullYear()
  let all = await _fetchByYear(iso, year)
  const upcoming = all.filter(h => h.date >= todayStr)
  if (upcoming.length < count) {
    const next = await _fetchByYear(iso, year + 1)
    all = [...all, ...next]
  }
  return all.filter(h => h.date >= todayStr).slice(0, count)
}

// Returns holidays that fall within the plan window (already pre-fetched)
export function holidaysInPlanWindow(holidays) {
  return holidays
}

// Format a holiday date for display
export function formatHolidayDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  })
}
