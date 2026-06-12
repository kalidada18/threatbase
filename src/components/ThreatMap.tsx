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
      const parent = canvas.parentElement
      if (!parent) return
      width = parent.clientWidth
      height = parent.clientHeight
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
          .fitSize([width, height * 1.4], land as any) // Scale slightly larger
          .translate([width / 2, height / 2 + 80])

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
        const step = 7 // Space between dots

        for (let y = 0; y < height; y += step) {
          for (let x = 0; x < width; x += step) {
            const index = (y * width + x) * 4
            // If the pixel is white (land)
            if (imageData[index] > 128) {
              newDots.push({ x, y })
            }
          }
        }
        
        // Cache map dots to an offscreen canvas for extreme performance
        const dotCanvas = document.createElement('canvas')
        dotCanvas.width = width
        dotCanvas.height = height
        const dotCtx = dotCanvas.getContext('2d')
        if (dotCtx) {
          dotCtx.beginPath()
          newDots.forEach(dot => {
            dotCtx.moveTo(dot.x, dot.y)
            dotCtx.arc(dot.x, dot.y, 1.6, 0, Math.PI * 2)
          })
          dotCtx.shadowColor = 'rgba(255, 30, 30, 0.8)'
          dotCtx.shadowBlur = 6
          dotCtx.fillStyle = 'rgba(255, 60, 60, 0.95)'
          dotCtx.fill()
        }

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
            speed: 0.003 + Math.random() * 0.004, // Slower, more beautiful animation
            color: colors[Math.floor(Math.random() * colors.length)]
          })
        }

        // Spawn initial attacks
        for (let i = 0; i < 5; i++) spawnAttack()

        const render = () => {
          // Clear the canvas completely every frame for crisp 60fps (no smudging)
          ctx.clearRect(0, 0, width, height)
          
          // Draw cached background map
          ctx.drawImage(dotCanvas, 0, 0)

          // Spawn new attacks randomly
          if (Math.random() < 0.02 && attacks.length < 15) {
            spawnAttack()
          }

          // Enable screen blending for beautiful neon overlap
          ctx.globalCompositeOperation = 'screen'

          // Update and draw attacks
          for (let i = attacks.length - 1; i >= 0; i--) {
            const a = attacks[i]
            a.progress += a.speed

            if (a.progress >= 1) {
              attacks.splice(i, 1)
              continue
            }

            const midX = (a.source.x + a.target.x) / 2
            const midY = (a.source.y + a.target.y) / 2
            const dist = Math.sqrt(Math.pow(a.target.x - a.source.x, 2) + Math.pow(a.target.y - a.source.y, 2))
            const cpY = midY - dist * 0.3

            // Procedurally draw the comet tail (20 trailing segments)
            const tailLength = 0.15 // Length of the tail relative to the curve
            const segments = 20
            
            for (let j = 0; j < segments; j++) {
              const pointT = a.progress - (tailLength * (j / segments))
              if (pointT < 0) continue

              const invT = 1 - pointT
              const px = invT * invT * a.source.x + 2 * invT * pointT * midX + pointT * pointT * a.target.x
              const py = invT * invT * a.source.y + 2 * invT * pointT * cpY + pointT * pointT * a.target.y

              const opacity = 1 - (j / segments)
              const radius = 2.5 * opacity
              
              ctx.beginPath()
              ctx.arc(px, py, radius, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(${hexToRgb(a.color)}, ${opacity})`
              
              // Only the head of the comet glows intensely
              if (j === 0) {
                ctx.shadowBlur = 15
                ctx.shadowColor = a.color
              } else {
                ctx.shadowBlur = 0
              }
              
              ctx.fill()
              ctx.shadowBlur = 0
            }
          }

          // Reset composite operation for next frame
          ctx.globalCompositeOperation = 'source-over'
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
      className="absolute inset-0 pointer-events-none z-0 w-full h-full bg-slate-900"
    />
  )
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
    : '255, 255, 255';
}
