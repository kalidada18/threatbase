import createGlobe from 'cobe'
import { useEffect, useRef } from 'react'

export default function ThreatMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let phi = 0
    let width = 0
    let globe: any

    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth
      }
    }
    
    window.addEventListener('resize', onResize)
    onResize()

    if (!canvasRef.current) return

    globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.15,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 24000,
      mapBrightness: 5,
      baseColor: [15 / 255, 23 / 255, 42 / 255], // slate-900
      markerColor: [239 / 255, 68 / 255, 68 / 255], // red-500
      glowColor: [8 / 255, 12 / 255, 24 / 255], // dark edge glow
      markers: [
        { location: [40.7128, -74.006], size: 0.05 },
        { location: [51.5074, -0.1276], size: 0.05 },
        { location: [35.6895, 139.6917], size: 0.08 },
        { location: [55.7558, 37.6173], size: 0.1 },
        { location: [39.9042, 116.4074], size: 0.1 },
        { location: [37.7749, -122.4194], size: 0.04 },
        { location: [28.0473, -26.2041], size: 0.06 },
        { location: [55.2708, 25.2048], size: 0.05 },
        { location: [-23.5505, -46.6333], size: 0.07 }
      ],
      onRender: (state) => {
        // Called on every animation frame.
        state.phi = phi
        phi += 0.003
        state.width = width * 2
        state.height = width * 2
      }
    })

    return () => {
      globe.destroy()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-end overflow-hidden opacity-60 pointer-events-none md:pr-12 lg:pr-24">
      <div className="w-full max-w-[800px] aspect-square translate-x-[15%] md:translate-x-[10%] md:translate-y-[5%]">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
        />
      </div>
    </div>
  )
}
