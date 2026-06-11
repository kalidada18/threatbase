import React, { useEffect, useRef } from 'react'

// Simple SVG path data for a world map outline (simplified for performance)
const WORLD_MAP_SVG = "M85.3,169.5c0,0-0.4-0.1-1.1-0.3c-0.6-0.2-1.3-0.5-2.2-0.8c-0.9-0.3-1.8-0.8-2.6-1.2c-0.8-0.5-1.5-1.1-1.9-1.6c-0.4-0.5-0.6-0.8-0.6-0.8l-1.3-1.4l-1.1-0.9l-0.9-0.4l-1.1-0.2l-1.1,0.2c0,0-0.4,0.1-0.8,0.4c-0.5,0.3-0.9,0.7-1.3,1.1c-0.4,0.4-0.7,0.8-0.9,1.1c-0.2,0.3-0.2,0.4-0.2,0.4l-0.8,2l-0.8,1.4l-0.8,0.5l-0.7-0.1l-0.5-1.1c0,0,0.1-0.6,0.2-1.3c0.1-0.8,0.3-1.7,0.5-2.7c0.2-1,0.4-2,0.6-2.9c0.2-0.9,0.3-1.6,0.3-1.6l0.2-1.8l0-1.7l-0.4-1l-0.9-0.2l-1.3,0.3c0,0-0.7,0-1.4,0.1c-0.8,0-1.6,0.2-2.3,0.3c-0.8,0.2-1.5,0.3-1.9,0.5c-0.4,0.2-0.6,0.2-0.6,0.2l-1.9-0.1l-1.8-0.8l-1.2-1.8l-0.1-2.4l1.1-2.1c0,0,0.7-1.1,1.5-2.2c0.8-1.2,1.7-2.4,2.4-3.5c0.7-1.1,1.3-2,1.6-2.5c0.3-0.5,0.4-0.8,0.4-0.8l1.7-1.6l1.3-1l0.9-0.3l0.7,0l0.7,0.3c0,0,0.3,0.2,0.7,0.5c0.4,0.3,0.9,0.8,1.4,1.4c0.5,0.6,0.9,1.2,1.2,1.8c0.3,0.6,0.4,1,0.4,1l0,1.4l-0.6,1.4l-1.2,1.1l-1.6,0.5l-1.8-0.3c0,0-0.7-0.4-1.5-0.9c-0.8-0.6-1.7-1.3-2.4-2c-0.7-0.8-1.3-1.6-1.6-2.1c-0.3-0.5-0.5-0.8-0.5-0.8l-0.8-2l-0.1-2l0.9-1.5l1.6-0.6l2.1,0.1c0,0,1,0.1,2.1,0.4c1.1,0.2,2.3,0.6,3.2,1.1c0.9,0.5,1.7,0.9,2.1,1.3c0.4,0.4,0.5,0.5,0.5,0.5l1.9,1.8l1.4,1.4l0.7,1l0.3,0.8l-0.1,0.8c0,0-0.3,0.4-0.6,0.9c-0.4,0.5-0.8,1-1.2,1.5c-0.4,0.4-0.7,0.8-0.8,1.1c-0.1,0.2-0.2,0.3-0.2,0.3l-0.1,1l0.3,1.1l0.8,0.8l1.2,0.3l1.3-0.3c0,0,0.6-0.3,1.3-0.8c0.7-0.5,1.4-1.1,2-1.7c0.6-0.6,1.1-1.2,1.4-1.6c0.3-0.4,0.4-0.6,0.4-0.6l1-1.2l1.3-1.1l1.4-0.5l1.4,0.2l1.1,0.9c0,0,0.4,0.4,0.9,1c0.4,0.6,0.9,1.3,1.3,1.9c0.4,0.7,0.7,1.2,0.9,1.6c0.2,0.4,0.3,0.6,0.3,0.6l0.3,1.5l-0.3,1.3l-0.8,0.9l-1.3,0.4l-1.5-0.3z"

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

// Project lat/lng to x/y coordinates (Equirectangular projection simplified)
function project(lng: number, lat: number, width: number, height: number) {
  const x = (lng + 180) * (width / 360)
  const y = (height / 2) - (lat * (height / 180))
  return { x, y }
}

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
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let attacks: Attack[] = []
    let width = 0
    let height = 0

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    window.addEventListener('resize', resize)
    resize()

    // Create dot matrix map
    const cols = 80
    const rows = 40
    const dots: {x: number, y: number, a: number}[] = []
    
    // Instead of precise raycasting against SVG, we create a stylized scatter of dots 
    // that roughly outlines the continents based on predefined boundaries
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i / cols) * width
        const y = (j / rows) * height
        // Simple noise/boundary filter to create a stylized map appearance
        const isLand = Math.sin(i * 0.2) * Math.cos(j * 0.2) > 0.1 || (j > rows*0.2 && j < rows*0.8 && Math.random() > 0.4)
        if (isLand && Math.random() > 0.3) {
          dots.push({ x, y, a: Math.random() * 0.3 + 0.1 })
        }
      }
    }

    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b']

    const spawnAttack = () => {
      const srcCity = CITIES[Math.floor(Math.random() * CITIES.length)]
      let tgtCity = CITIES[Math.floor(Math.random() * CITIES.length)]
      while (tgtCity.name === srcCity.name) {
        tgtCity = CITIES[Math.floor(Math.random() * CITIES.length)]
      }

      const src = project(srcCity.coords[0], srcCity.coords[1], width, height)
      const tgt = project(tgtCity.coords[0], tgtCity.coords[1], width, height)

      attacks.push({
        id: Math.random(),
        source: src,
        target: tgt,
        progress: 0,
        speed: 0.005 + Math.random() * 0.01,
        color: colors[Math.floor(Math.random() * colors.length)]
      })
    }

    // Spawn initial attacks
    for (let i = 0; i < 5; i++) spawnAttack()

    const drawMap = () => {
      ctx.fillStyle = '#0f172a' // slate-900
      ctx.fillRect(0, 0, width, height)

      // Draw stylized dotted background map
      dots.forEach(dot => {
        ctx.fillStyle = `rgba(148, 163, 184, ${dot.a})` // slate-400
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    const render = () => {
      // Semi-transparent clear for trailing effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)'
      ctx.fillRect(0, 0, width, height)
      
      // Redraw solid background then map dots every few frames to keep map sharp
      drawMap()

      // Spawn new attacks randomly
      if (Math.random() < 0.03 && attacks.length < 15) {
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

        // Calculate bezier curve
        // Control point is above the midpoint to make an arc
        const midX = (a.source.x + a.target.x) / 2
        const midY = (a.source.y + a.target.y) / 2
        
        // Arc height depends on distance
        const dist = Math.sqrt(Math.pow(a.target.x - a.source.x, 2) + Math.pow(a.target.y - a.source.y, 2))
        const cpY = midY - dist * 0.3

        // Current position along the curve
        const t = a.progress
        const invT = 1 - t
        const currX = invT * invT * a.source.x + 2 * invT * t * midX + t * t * a.target.x
        const currY = invT * invT * a.source.y + 2 * invT * t * cpY + t * t * a.target.y

        // Draw trail
        ctx.beginPath()
        ctx.moveTo(a.source.x, a.source.y)
        ctx.quadraticCurveTo(midX, cpY, currX, currY)
        ctx.strokeStyle = `rgba(${hexToRgb(a.color)}, 0.3)`
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Draw moving particle (glow)
        ctx.beginPath()
        ctx.arc(currX, currY, 3, 0, Math.PI * 2)
        ctx.fillStyle = a.color
        ctx.shadowBlur = 15
        ctx.shadowColor = a.color
        ctx.fill()
        
        // Reset shadow
        ctx.shadowBlur = 0
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-20 w-full h-full"
      style={{ background: '#0f172a' }}
    />
  )
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
    : '255, 255, 255';
}
