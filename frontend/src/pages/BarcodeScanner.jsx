import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const SCANNER_ID = 'nutricart-barcode-reader'

export default function BarcodeScanner({ onDetected, onClose }) {
  const scannerRef  = useRef(null)
  const startedRef  = useRef(false)
  const [status, setStatus]   = useState('starting') // 'starting' | 'scanning' | 'looking_up' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false })
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 100 } },
      async (barcode) => {
        if (startedRef.current) return // prevent double fire
        startedRef.current = true
        try {
          await scanner.stop()
        } catch (_) {}
        setStatus('looking_up')
        await lookupBarcode(barcode)
      },
      null
    )
      .then(() => setStatus('scanning'))
      .catch((err) => {
        const msg = typeof err === 'string' ? err : (err?.message || 'Camera error')
        setStatus('error')
        setErrorMsg(msg.includes('permission') ? 'Camera permission denied. Please allow camera access.' : msg)
      })

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  async function lookupBarcode(barcode) {
    try {
      const res  = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
      const data = await res.json()
      if (data.status === 1 && data.product) {
        const p = data.product
        // Parse quantity from product: e.g. "500 g" or "1 l"
        const qtyMatch = (p.quantity || '').match(/(\d+\.?\d*)\s*(g|kg|ml|l|pcs)?/i)
        const quantity = qtyMatch ? qtyMatch[1] : ''
        const unit     = qtyMatch ? (qtyMatch[2] || 'pcs').toLowerCase() : 'pcs'
        // Map OFF category to our pantry categories
        const offCat   = (p.categories_tags?.[0] || '').toLowerCase()
        let category   = 'pantry'
        if (offCat.includes('fridge') || offCat.includes('dairy') || offCat.includes('fresh') || offCat.includes('meat') || offCat.includes('yogurt')) category = 'fridge'
        else if (offCat.includes('frozen'))  category = 'freezer'
        else if (offCat.includes('spice') || offCat.includes('herb') || offCat.includes('seasoning')) category = 'spices'

        onDetected({
          name:     (p.product_name || p.product_name_en || '').trim(),
          quantity,
          unit,
          category,
          brand:    p.brands || '',
          barcode,
        })
      } else {
        setStatus('error')
        setErrorMsg(`Product not found for barcode ${barcode}. You can enter it manually.`)
      }
    } catch {
      setStatus('error')
      setErrorMsg('Lookup failed — check your internet connection.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-black/80">
        <div>
          <h3 className="text-white font-bold text-lg">📷 Scan Barcode</h3>
          <p className="text-gray-400 text-xs mt-0.5">Point at barcode on food packaging</p>
        </div>
        <button
          onClick={onClose}
          className="text-white text-3xl leading-none hover:text-gray-300 transition">
          ×
        </button>
      </div>

      {/* Scanner viewport */}
      <div className="flex-1 flex items-center justify-center relative bg-black">
        <div id={SCANNER_ID} className="w-full max-w-sm" />
        {/* Scanning frame overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-24 border-2 border-green-400 rounded-xl relative">
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-green-400 text-xs font-bold whitespace-nowrap">Align barcode here</span>
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-400 rounded-br" />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-5 py-4 bg-black/80">
        {status === 'starting' && (
          <p className="text-gray-300 text-sm text-center">⏳ Starting camera...</p>
        )}
        {status === 'scanning' && (
          <p className="text-green-400 text-sm text-center animate-pulse">● Scanning — move slowly if needed</p>
        )}
        {status === 'looking_up' && (
          <p className="text-blue-300 text-sm text-center">🔍 Found barcode — looking up product...</p>
        )}
        {status === 'error' && (
          <div className="space-y-3">
            <p className="text-red-400 text-sm text-center">{errorMsg || 'Something went wrong.'}</p>
            <button
              onClick={onClose}
              className="w-full bg-gray-700 text-white py-2 rounded-xl text-sm font-semibold hover:bg-gray-600 transition">
              Close & Enter Manually
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
