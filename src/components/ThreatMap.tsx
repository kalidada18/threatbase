import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3-geo'
import * as topojson from 'topojson-client'

// Major city coordinates [longitude, latitude]
const CITIES = [
  { name: "New York", coords: [-74.006, 40.7128] },
  { name: "London", coords: [-0.1276, 51.5074] },
  { name: "Tokyo", coords: [139.6917, 35.6895] },
  { name: "Moscow", coords: [37.6173, 55.7558] },
  { name: "Beijing", coords: [116.4074, 39.9042] },
  { name: "Sydney", coords: [151.2093, -33.8688] },
  { name: "São Paulo", coords: [-46.6333, -23.5505] },
  { name: "Johannesburg", coords: [28.0473, -26.2041] },
  { name: "San Francisco", coords: [-122.4194, 37.7749] },
  { name: "Singapore", coords: [103.8198, 1.3521] },
  { name: "Frankfurt", coords: [8.6821, 50.1109] },
  { name: "Dubai", coords: [55.2708, 25.2048] }
]

interface Attack {
  id: number
  source: { x: number, y: number }
  target: { x: number, y: number }
  progress: number
  speed: number
  color: string
}

export default function ThreatMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    let animationFrameId: number
    let attacks: Attack[] = []
    let width = 0
    let height = 0
    let dots: {x: number, y: number}[] = []

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    window.addEventListener('resize', resize)
    resize()

    // Fetch world topology and generate dots
    fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json')
      .then(r => r.json())
      .then(world => {
        const land = topojson.feature(world, world.objects.countries)
        
        // Setup D3 Projection
        const projection = d3.geoEquirectangular()
          .fitSize([width, height * 1.2], land as any) // Scale to fit screen
          .translate([width / 2, height / 2 + 50])

        // Create a hidden canvas to draw the solid map
        const hiddenCanvas = document.createElement('canvas')
        hiddenCanvas.width = width
        hiddenCanvas.height = height
        const hiddenCtx = hiddenCanvas.getContext('2d')
        if (!hiddenCtx) return

        const path = d3.geoPath().projection(projection).context(hiddenCtx)
        hiddenCtx.fillStyle = 'black'
        hiddenCtx.fillRect(0, 0, width, height)
        hiddenCtx.fillStyle = 'white'
        hiddenCtx.beginPath()
        path(land as any)
        hiddenCtx.fill()

        // Scan hidden canvas to create the dotted effect
        const imageData = hiddenCtx.getImageData(0, 0, width, height).data
        const newDots = []
        const step = 8 // Space between dots

        for (let y = 0; y < height; y += step) {
          for (let x = 0; x < width; x += step) {
            const index = (y * width + x) * 4
            // If the pixel is white (land)
            if (imageData[index] > 128) {
              newDots.push({ x, y })
            }
          }
        }
        dots = newDots

        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b']

        const spawnAttack = () => {
          const srcCity = CITIES[Math.floor(Math.random() * CITIES.length)]
          let tgtCity = CITIES[Math.floor(Math.random() * CITIES.length)]
          while (tgtCity.name === srcCity.name) {
            tgtCity = CITIES[Math.floor(Math.random() * CITIES.length)]
          }

          const srcProj = projection(srcCity.coords as [number, number])
          const tgtProj = projection(tgtCity.coords as [number, number])

          if (!srcProj || !tgtProj) return

          attacks.push({
            id: Math.random(),
            source: { x: srcProj[0], y: srcProj[1] },
            target: { x: tgtProj[0], y: tgtProj[1] },
            progress: 0,
            speed: 0.008 + Math.random() * 0.015, // Slightly faster
            color: colors[Math.floor(Math.random() * colors.length)]
          })
        }

        // Spawn initial attacks
        for (let i = 0; i < 5; i++) spawnAttack()

        const render = () => {
          // Clear with heavier trailing effect (faster fade)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.15)'
          ctx.fillRect(0, 0, width, height)
          
          // Draw map dots with slightly lower opacity so attacks pop more
          ctx.fillStyle = 'rgba(51, 65, 85, 0.6)' // slate-700
          dots.forEach(dot => {
            ctx.beginPath()
            ctx.arc(dot.x, dot.y, 1, 0, Math.PI * 2)
            ctx.fill()
          })

          // Spawn new attacks randomly
          if (Math.random() < 0.04 && attacks.length < 20) {
            spawnAttack()
          }

          // Update and draw attacks
          for (let i = attacks.length - 1; i >= 0; i--) {
            const a = attacks[i]
            a.progress += a.speed

            if (a.progress >= 1) {
              attacks.splice(i, 1)
              
              // Draw explosion ripple
              ctx.beginPath()
              ctx.strokeStyle = a.color
              ctx.lineWidth = 2
              ctx.arc(a.target.x, a.target.y, 10, 0, Math.PI * 2)
              ctx.stroke()
              continue
            }

            const midX = (a.source.x + a.target.x) / 2
            const midY = (a.source.y + a.target.y) / 2
            
            const dist = Math.sqrt(Math.pow(a.target.x - a.source.x, 2) + Math.pow(a.target.y - a.source.y, 2))
            const cpY = midY - dist * 0.3

            const t = a.progress
            const invT = 1 - t
            const currX = invT * invT * a.source.x + 2 * invT * t * midX + t * t * a.target.x
            const currY = invT * invT * a.source.y + 2 * invT * t * cpY + t * t * a.target.y

            // Calculate previous frame position to draw a short segment (comet head)
            const prevT = Math.max(0, t - a.speed)
            const invPrevT = 1 - prevT
            const prevX = invPrevT * invPrevT * a.source.x + 2 * invPrevT * prevT * midX + prevT * prevT * a.target.x
            const prevY = invPrevT * invPrevT * a.source.y + 2 * invPrevT * prevT * cpY + prevT * prevT * a.target.y

            // Draw glowing comet head
            ctx.beginPath()
            ctx.moveTo(prevX, prevY)
            ctx.lineTo(currX, currY)
            ctx.strokeStyle = a.color
            ctx.lineWidth = 3
            ctx.lineCap = 'round'
            ctx.shadowBlur = 12
            ctx.shadowColor = a.color
            ctx.stroke()
            
            ctx.shadowBlur = 0
          }

          animationFrameId = requestAnimationFrame(render)
        }

        render()
      })
      .catch(err => {
        console.error('Failed to load map data:', err)
      })

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-20 w-full h-full bg-slate-900"
    />
  )
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
    : '255, 255, 255';
}
