import { useEffect, useRef, useState } from 'react';

const Helper = {
  createShader: (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  },
  createProgram: (gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) => {
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
  },
  pixel2DVertexVaryingShader: `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    attribute vec2 a_color;
    varying vec2 v_color;
    void main(){
      gl_Position = vec4( vec2( 1, -1 ) * ( ( a_position / u_resolution ) * 2.0 - 1.0 ), 0, 1 );
      v_color = a_color;
    }
  `,
  uniform2DFragmentVaryingShader: `
    precision mediump float;
    varying vec2 v_color;
    uniform float u_tick;
    float frac = 1.0/6.0;
    void main(){
      float hue = v_color.x + u_tick;
      hue = abs(hue - floor(hue));
      vec4 color = vec4( 0, 0, 0, 1 );
      if( hue < frac ){
        color.r = 1.0;
        color.g = hue / frac;
        color.b = 0.0;
      } else if( hue < frac * 2.0 ){
        color.r = 1.0 - ( hue - frac ) / frac;
        color.g = 1.0;
        color.b = 0.0;
      } else if( hue < frac * 3.0 ){
        color.r = 0.0;
        color.g = 1.0;
        color.b = ( hue - frac * 2.0 ) / frac;
      } else if( hue < frac * 4.0 ){
        color.r = 0.0;
        color.g = 1.0 - ( hue - frac * 3.0 ) / frac;
        color.b = 1.0;
      } else if( hue < frac * 5.0 ){
        color.r = ( hue - frac * 4.0 ) / frac;
        color.g = 0.0;
        color.b = 1.0;
      } else {
        color.r = 1.0;
        color.g = 0.0;
        color.b = 1.0 - ( hue - frac * 5.0 ) / frac;
      }
      color = vec4( color.rgb * v_color.y, 1.0 );
      gl_FragColor = color;
    }
  `
};

interface ParticleCanvasProps {
  maxParticles?: number;
  particleSizeMin?: number;
  particleSizeMax?: number;
  speedScale?: number;
}

const ParticleCanvas = ({ maxParticles = 1000, particleSizeMin = 2, particleSizeMax = 5, speedScale = 2 }: ParticleCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webglRef = useRef<any>({});
  const particlesRef = useRef<any[]>([]);
  const tickRef = useRef(0);
  const dimensionsRef = useRef({ width: 0, height: 0, cx: 0, cy: 0 });
  const [isAnimating] = useState(true);
  const animationFrameIdRef = useRef<number>(0);

  function getCircleTriangles(x: number, y: number, r: number) {
    const triangles = [];
    const inc = Math.PI * 2 / 6;
    let px = x + r;
    let py = y;
    for (let i = 0; i <= Math.PI * 2 + inc; i += inc) {
      const nx = x + r * Math.cos(i);
      const ny = y + r * Math.sin(i);
      triangles.push(x, y, px, py, nx, ny);
      px = nx;
      py = ny;
    }
    return triangles;
  }

  function Particle(this: any) {
    this.reset = () => {
      this.size = particleSizeMin + (particleSizeMax - particleSizeMin) * Math.random();
      this.x = dimensionsRef.current.cx;
      this.y = dimensionsRef.current.cy;
      this.vx = (Math.random() - 0.5) * 2 * speedScale;
      this.vy = -2 - speedScale * Math.random();
      this.time = 1;
    };
    this.step = () => {
      this.x += (this.vx *= 0.995);
      this.y += (this.vy += 0.05);
      this.time *= 0.99;
      const triangles = getCircleTriangles(this.x, this.y, this.size * this.time);
      const hue = this.vy / 10;
      for (let i = 0; i < triangles.length; i += 2) {
        webglRef.current.data.triangles.push(triangles[i], triangles[i + 1]);
        webglRef.current.data.colors.push(hue, this.time);
      }
      if (this.y - this.size > dimensionsRef.current.height) {
        this.reset();
      }
    };
    this.reset();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = canvas.getContext('webgl', { alpha: true }); // enable alpha
    if (!gl) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    dimensionsRef.current = { width: w, height: h, cx: w / 2, cy: h / 2 };

    const vs = Helper.createShader(gl, gl.VERTEX_SHADER, Helper.pixel2DVertexVaryingShader);
    const fs = Helper.createShader(gl, gl.FRAGMENT_SHADER, Helper.uniform2DFragmentVaryingShader);
    
    if (!vs || !fs) return;

    webglRef.current.shaderProgram = Helper.createProgram(gl, vs, fs);
    if (!webglRef.current.shaderProgram) return;

    webglRef.current.attribLocs = {
      position: gl.getAttribLocation(webglRef.current.shaderProgram, 'a_position'),
      color: gl.getAttribLocation(webglRef.current.shaderProgram, 'a_color')
    };
    webglRef.current.buffers = {
      position: gl.createBuffer(),
      color: gl.createBuffer()
    };
    webglRef.current.uniformLocs = {
      resolution: gl.getUniformLocation(webglRef.current.shaderProgram, 'u_resolution'),
      tick: gl.getUniformLocation(webglRef.current.shaderProgram, 'u_tick')
    };
    webglRef.current.data = { triangles: [], colors: [] };

    gl.viewport(0, 0, w, h);
    gl.useProgram(webglRef.current.shaderProgram);
    gl.enableVertexAttribArray(webglRef.current.attribLocs.position);
    gl.enableVertexAttribArray(webglRef.current.attribLocs.color);
    gl.bindBuffer(gl.ARRAY_BUFFER, webglRef.current.buffers.position);
    gl.vertexAttribPointer(webglRef.current.attribLocs.position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, webglRef.current.buffers.color);
    gl.vertexAttribPointer(webglRef.current.attribLocs.color, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(webglRef.current.uniformLocs.resolution, w, h);

    // transparent clear
    gl.clearColor(0, 0, 0, 0);

    webglRef.current.clear = () => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      webglRef.current.data.triangles = [];
      webglRef.current.data.colors = [];
    };

    webglRef.current.draw = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, webglRef.current.buffers.position);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(webglRef.current.data.triangles), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, webglRef.current.buffers.color);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(webglRef.current.data.colors), gl.STATIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, webglRef.current.data.triangles.length / 2);
    };

    const animate = () => {
      if (!isAnimating) return;
      webglRef.current.clear();
      tickRef.current++;
      if (particlesRef.current.length < maxParticles) {
        // @ts-ignore
        particlesRef.current.push(new Particle(), new Particle());
      }
      particlesRef.current.sort((a, b) => a.time - b.time);
      particlesRef.current.forEach(particle => particle.step());
      gl.uniform1f(webglRef.current.uniformLocs.tick, tickRef.current / 100);
      webglRef.current.draw();
      animationFrameIdRef.current = requestAnimationFrame(animate);
    };

    animationFrameIdRef.current = requestAnimationFrame(animate);

    const handleMouseMove = (e: MouseEvent) => {
      dimensionsRef.current.cx = e.clientX;
      dimensionsRef.current.cy = e.clientY;
    };

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      dimensionsRef.current.width = w;
      dimensionsRef.current.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(webglRef.current.uniformLocs.resolution, w, h);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [isAnimating, maxParticles, particleSizeMin, particleSizeMax, speedScale]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none", // so it doesn't block clicks
        zIndex: 0,
      }}
    />
  );
};

export { ParticleCanvas };
