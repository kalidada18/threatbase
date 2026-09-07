import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface IsoLevelWarpProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Primary line color as an `r, g, b` triple.
   * Default: the house ruby accent (#cf1733).
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
  color = "207, 23, 51", // ruby #cf1733 — the one site accent
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

    let width = 0;
    let height = 0;
    let gridGap = density;
    let rows = 0;
    let cols = 0;
    let animationFrameId = 0;

    // Wave Physics
    let time = 0;

    // The page container stretches to the full document height; size the canvas to
    // the viewport so we never stroke thousands of off-screen points per frame.
    const resize = () => {
      gridGap = density;
      width = container.offsetWidth;
      height = Math.min(container.offsetHeight, window.innerHeight);
      rows = Math.ceil(height / gridGap) + 5; // Extra buffer
      cols = Math.ceil(width / gridGap) + 5;
      canvas.width = width;
      canvas.height = height;
      canvas.style.height = `${height}px`;
      // Re-stroke the static frame while the loop is paused (off-screen or reduced-motion).
      if (!animationFrameId) draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

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
          // Ambient Wave (The "Breathing")
          const wave = Math.sin(x * 0.2 + time) * Math.cos(y * 0.2 + time) * 15;

          // Final Coordinates
          const finalX = baseX;
          const finalY = baseY + wave;

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
    };

    const play = () => {
      if (animationFrameId) return;
      const loop = () => {
        draw();
        animationFrameId = requestAnimationFrame(loop);
      };
      animationFrameId = requestAnimationFrame(loop);
    };

    const stop = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    };

    window.addEventListener("resize", resize);

    resize();

    // prefers-reduced-motion: one static frame, no loop (MotionConfig can't
    // reach a raw canvas rAF); otherwise pause while scrolled out of view.
    let observer: IntersectionObserver | undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw();
    } else {
      play();
      observer = new IntersectionObserver(
        ([entry]) => (entry.isIntersecting ? play() : stop()),
      );
      observer.observe(canvas);
    }

    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      stop();
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#0B0F19_100%)] opacity-80 pointer-events-none" />
    </div>
  );
};

export default IsoLevelWarp;
