import { useEffect, useRef, useState } from 'react'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const detectorRef = useRef(null)
  const rafRef      = useRef(null)
  const doneRef     = useRef(false)

  const [status, setStatus]     = useState('starting') // starting | scanning | looking_up | error
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        // 1. Request camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // 2. Set up BarcodeDetector (Chrome/Edge/Android) or fallback
        if ('BarcodeDetector' in window) {
          detectorRef.current = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          })
          setStatus('scanning')
          scanLoop()
        } else {
          // Fallback: no BarcodeDetector — show manual entry prompt
          setStatus('error')
          setErrorMsg('Barcode scanning is not supported in this browser. Try Chrome on Android or desktop Chrome.')
        }
      } catch (err) {
        if (cancelled) return
        const msg = err?.message || String(err)
        setStatus('error')
        setErrorMsg(
          msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : `Camera error: ${msg}`
        )
      }
    }

    function scanLoop() {
      if (cancelled || doneRef.current || !videoRef.current || !detectorRef.current) return
      if (videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(scanLoop)
        return
      }
      detectorRef.current.detect(videoRef.current)
        .then(barcodes => {
          if (cancelled || doneRef.current) return
          if (barcodes.length > 0) {
            doneRef.current = true
            stopCamera()
            const code = barcodes[0].rawValue
            setStatus('looking_up')
            lookupBarcode(code)
          } else {
            rafRef.current = requestAnimationFrame(scanLoop)
          }
        })
        .catch(() => {
          if (!cancelled) rafRef.current = requestAnimationFrame(scanLoop)
        })
    }

    start()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [])

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  async function lookupBarcode(barcode) {
    try {
      const res  = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
      const data = await res.json()
      if (data.status === 1 && data.product) {
        const p        = data.product
        const qtyMatch = (p.quantity || '').match(/(\d+\.?\d*)\s*(g|kg|ml|l|pcs)?/i)
        const quantity = qtyMatch ? qtyMatch[1] : ''
        const unit     = qtyMatch ? (qtyMatch[2] || 'pcs').toLowerCase() : 'pcs'
        const offCat   = (p.categories_tags?.[0] || '').toLowerCase()
        let category   = 'pantry'
        if (offCat.includes('dairy') || offCat.includes('fresh') || offCat.includes('meat') || offCat.includes('yogurt')) category = 'fridge'
        else if (offCat.includes('frozen'))  category = 'freezer'
        else if (offCat.includes('spice') || offCat.includes('herb')) category = 'spices'
        onDetected({ name: (p.product_name || p.product_name_en || '').trim(), quantity, unit, category, brand: p.brands || '', barcode })
      } else {
        setStatus('error')
        setErrorMsg(`Product not found (barcode: ${barcode}). Enter it manually below.`)
      }
    } catch {
      setStatus('error')
      setErrorMsg('Lookup failed — check your connection and try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-black/80 flex-shrink-0">
        <div>
          <h3 className="text-white font-bold text-lg">📷 Scan Barcode</h3>
          <p className="text-gray-400 text-xs mt-0.5">Point camera at barcode on food packaging</p>
        </div>
        <button onClick={onClose} className="text-white text-3xl leading-none hover:text-gray-300 transition">×</button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        {/* Alignment overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-24">
              {/* Corner marks */}
              <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-green-400" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-green-400" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-green-400" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-green-400" />
              {/* Scan line */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-400 opacity-70 animate-pulse" />
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-green-400 text-xs font-bold whitespace-nowrap">
                Align barcode here
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-5 py-4 bg-black/80 flex-shrink-0">
        {status === 'starting' && (
          <p className="text-gray-300 text-sm text-center">⏳ Starting camera...</p>
        )}
        {status === 'scanning' && (
          <p className="text-green-400 text-sm text-center animate-pulse">● Scanning — move slowly if needed</p>
        )}
        {status === 'looking_up' && (
          <p className="text-blue-300 text-sm text-center">🔍 Barcode detected — looking up product...</p>
        )}
        {status === 'error' && (
          <div className="space-y-3">
            <p className="text-red-400 text-sm text-center">{errorMsg}</p>
            <button
              onClick={onClose}
              className="w-full bg-gray-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-600 transition">
              Close &amp; Enter Manually
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


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
