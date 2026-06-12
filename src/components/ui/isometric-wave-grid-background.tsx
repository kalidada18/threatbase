import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface IsoLevelWarpProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Primary line color (Tailwind hex or rgb).
   * Default: cyan/teal mix
   */
  color?: string;
  /**
   * Animation speed multiplier.
   * Default: 1
   */
  speed?: number;
  /**
   * Grid density. Lower = larger cells.
   * Default: 40
   */
  density?: number;
}

const IsoLevelWarp = ({
  className,
  color = "14, 165, 233", // RGB for Tailwind sky-500
  speed = 1,
  density = 40,
  ...props
}: IsoLevelWarpProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = container.offsetWidth;
    let height = container.offsetHeight;
    let animationFrameId: number;

    // Grid Configuration
    const gridGap = density;
    const rows = Math.ceil(height / gridGap) + 5; // Extra buffer
    const cols = Math.ceil(width / gridGap) + 5;
    
    // Mouse Interaction
    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
    
    // Wave Physics
    let time = 0;

    const resize = () => {
      width = container.offsetWidth;
      height = container.offsetHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    // Math Helper: Smoothstep
    const smoothMix = (a: number, b: number, t: number) => {
      return a + (b - a) * t;
    };

    const draw = () => {
      // Clear Screen with trail effect (optional, simplified here for clarity)
      ctx.clearRect(0, 0, width, height);
      
      // Smooth mouse movement
      mouse.x = smoothMix(mouse.x, mouse.targetX, 0.1);
      mouse.y = smoothMix(mouse.y, mouse.targetY, 0.1);

      time += 0.01 * speed;

      ctx.beginPath();
      
      // Calculate Grid Points
      for (let y = 0; y <= rows; y++) {
        // We draw lines row by row
        // To make it look 3D/Topographic, we offset Y based on noise/sine
        
        let isFirst = true;

        for (let x = 0; x <= cols; x++) {
          const baseX = (x * gridGap) - (gridGap * 2);
          const baseY = (y * gridGap) - (gridGap * 2);

          // DISTORTION LOGIC
          // 1. Ambient Wave (The "Breathing")
          const wave = Math.sin(x * 0.2 + time) * Math.cos(y * 0.2 + time) * 15;
          
          // 2. Mouse Repulsion (The "Interaction")
          const dx = baseX - mouse.x;
          const dy = baseY - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 300;
          
          // Calculate force: 0 at edge, 1 at center
          const force = Math.max(0, (maxDist - dist) / maxDist);
          // Apply a "Z-push" effect by moving points UP (negative Y) based on proximity
          const interactionY = -(force * force) * 80; // Non-linear falloff

          // Final Coordinates
          const finalX = baseX;
          const finalY = baseY + wave + interactionY;

          // Draw the line
          if (isFirst) {
            ctx.moveTo(finalX, finalY);
            isFirst = false;
          } else {
            // Bezier smoothing for organic feel
            // We simplify to lineTo for performance in high density, 
            // but could use quadraticCurveTo for liquid feel
            ctx.lineTo(finalX, finalY);
          }
        }
      }

      // STYLING
      // Gradient Stroke
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `rgba(${color}, 0)`); // Fade top-left
      gradient.addColorStop(0.5, `rgba(${color}, 0.5)`); // Bright center
      gradient.addColorStop(1, `rgba(${color}, 0)`); // Fade bottom-right

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;
      ctx.stroke();

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    
    resize();
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [color, speed, density]);

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 z-0 overflow-hidden bg-black", className)}
      {...props}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Optional: Vignette overlay for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#0A0C10_100%)] opacity-80 pointer-events-none" />
    </div>
  );
};

export default IsoLevelWarp;
