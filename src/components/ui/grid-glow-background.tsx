"use client";

import React, { useRef, useEffect } from "react";

// GridGlowBackground Props
interface GridGlowBackgroundProps {
  children: React.ReactNode;
  backgroundColor?: string;    // default "#0a0a0a"
  gridColor?: string;          // default "rgba(255,255,255,0.05)"
  gridSize?: number;           // default 50
  glowColors?: string[];       // default ["#4A00E0","#8E2DE2","#4A00E0"]
  glowCount?: number;          // default 10
}

export const GridGlowBackground: React.FC<GridGlowBackgroundProps> = ({
  children,
  backgroundColor = "#0a0a0a",
  gridColor = "rgba(255, 255, 255, 0.05)",
  gridSize = 50,
  glowColors = ["#4A00E0", "#8E2DE2", "#4A00E0"],
  glowCount = 3, // Toned down glow count to 3
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let glows: Glow[] = [];
    let frameId: number;

    class Glow {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      radius: number;
      speed: number;
      color: string;
      alpha: number;

      constructor() {
        this.x =
          Math.floor(Math.random() * (canvas.width / gridSize)) * gridSize;
        this.y =
          Math.floor(Math.random() * (canvas.height / gridSize)) * gridSize;
        this.targetX = this.x;
        this.targetY = this.y;
        this.radius = Math.random() * 80 + 40;
        this.speed = Math.random() * 0.015 + 0.01;
        this.color = glowColors[
          Math.floor(Math.random() * glowColors.length)
        ];
        this.alpha = 0;
        this.setNewTarget();
      }

      setNewTarget() {
        this.targetX =
          Math.floor(Math.random() * (canvas.width / gridSize)) * gridSize;
        this.targetY =
          Math.floor(Math.random() * (canvas.height / gridSize)) * gridSize;
      }

      update() {
        this.x += (this.targetX - this.x) * this.speed;
        this.y += (this.targetY - this.y) * this.speed;

        if (
          Math.abs(this.targetX - this.x) < 1 &&
          Math.abs(this.targetY - this.y) < 1
        ) {
          this.setNewTarget();
        }
        if (this.alpha < 1) this.alpha += 0.01;
      }

      draw() {
        ctx.globalAlpha = this.alpha;
        const grad = ctx.createRadialGradient(
          this.x,
          this.y,
          0,
          this.x,
          this.y,
          this.radius
        );
        grad.addColorStop(0, this.color);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      glows = Array.from({ length: glowCount }, () => new Glow());
    };

    const drawGrid = () => {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();
      glows.forEach((g) => {
        g.update();
        g.draw();
      });
      frameId = requestAnimationFrame(animate);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameId);
    };
  }, [gridColor, gridSize, glowColors, glowCount]);

  return (
    <div
      className="relative min-h-screen w-full"
      style={{ backgroundColor }}
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-0 h-full w-full opacity-30 pointer-events-none"
      />
      <div className="relative z-10 w-full">
        {children}
      </div>
    </div>
  );
};

export default GridGlowBackground;
