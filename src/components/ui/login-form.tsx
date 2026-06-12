"use client";
import { useEffect, useRef, useState } from "react";
import { User, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from "../../AuthContext";
import { useNavigate } from "react-router-dom";

// Vertex shader source code
const vertexSmokeySource = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`;

// Fragment shader source code for the smokey background effect
const fragmentSmokeySource = `
precision mediump float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform vec3 u_color;

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = fragCoord / iResolution;
    vec2 centeredUV = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

    float time = iTime * 0.5;

    // Normalize mouse input (0.0 - 1.0) and remap to -1.0 ~ 1.0
    vec2 mouse = iMouse / iResolution;
    vec2 rippleCenter = 2.0 * mouse - 1.0;

    vec2 distortion = centeredUV;
    // Apply distortion for a wavy, smokey effect
    for (float i = 1.0; i < 8.0; i++) {
        distortion.x += 0.5 / i * cos(i * 2.0 * distortion.y + time + rippleCenter.x * 3.1415);
        distortion.y += 0.5 / i * cos(i * 2.0 * distortion.x + time + rippleCenter.y * 3.1415);
    }

    // Create a glowing wave pattern
    float wave = abs(sin(distortion.x + distortion.y + time));
    float glow = smoothstep(0.9, 0.2, wave);

    fragColor = vec4(u_color * glow, 1.0);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

/**
 * Valid blur sizes supported by Tailwind CSS.
 */
type BlurSize = "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

/**
 * Props for the SmokeyBackground component.
 */
interface SmokeyBackgroundProps {
  backdropBlurAmount?: string;
  color?: string;
  className?: string;
}

/**
 * A mapping from blur size names to Tailwind CSS classes.
 */
const blurClassMap: Record<BlurSize, string> = {
  none: "backdrop-blur-none",
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
  "2xl": "backdrop-blur-2xl",
  "3xl": "backdrop-blur-3xl",
};

/**
 * A React component that renders an interactive WebGL shader background.
 */
export function SmokeyBackground({
  backdropBlurAmount = "sm",
  color = "#022c22", // Default dark emerald/slate to match himalayafeed theme
  className = "",
}: SmokeyBackgroundProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  // Helper to convert hex color to RGB (0-1 range)
  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    return [r, g, b];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGL not supported");
      return;
    }

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSmokeySource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSmokeySource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program linking error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const iResolutionLocation = gl.getUniformLocation(program, "iResolution");
    const iTimeLocation = gl.getUniformLocation(program, "iTime");
    const iMouseLocation = gl.getUniformLocation(program, "iMouse");
    const uColorLocation = gl.getUniformLocation(program, "u_color");

    let startTime = Date.now();
    const [r, g, b] = hexToRgb(color);
    gl.uniform3f(uColorLocation, r, g, b);

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);

      const currentTime = (Date.now() - startTime) / 1000;

      gl.uniform2f(iResolutionLocation, width, height);
      gl.uniform1f(iTimeLocation, currentTime);
      gl.uniform2f(iMouseLocation, isHovering ? mousePosition.x : width / 2, isHovering ? height - mousePosition.y : height / 2);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(render);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      setMousePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => setIsHovering(false);

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseenter", handleMouseEnter);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    render();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseenter", handleMouseEnter);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isHovering, mousePosition, color]);

  const finalBlurClass = blurClassMap[backdropBlurAmount as BlurSize] || blurClassMap["sm"];

  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className={`absolute inset-0 ${finalBlurClass}`}></div>
    </div>
  );
}

interface LoginFormProps {
  addToast: (msg: string, type: string) => void;
}

/**
 * A glassmorphism-style login form component with animated labels and Google login.
 */
export function LoginForm({ addToast }: LoginFormProps) {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      addToast("Please fill in all credentials fields", "error");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email.trim(), password.trim());
        addToast("Welcome back! Successfully logged in.", "success");
      } else {
        await signUpWithEmail(email.trim(), password.trim());
        addToast("Registration initiated! Please verify your email check if a verification mail was sent.", "success");
      }
      navigate("/");
    } catch (err: any) {
      console.error("Authentication action failed:", err);
      addToast(err.message || "Authentication failed. Please verify credentials.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google authentication failed:", err);
      addToast(err.message || "Google authentication failed", "error");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm p-8 space-y-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-white/10 shadow-2xl relative z-10 select-none">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white tracking-tight">
          {mode === "signin" ? "Welcome Back" : "Register Intel Account"}
        </h2>
        <p className="mt-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">
          {mode === "signin" ? "Sign in to access threat database" : "Create alias details to join database"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 pt-4">
        {/* Email Input with Animated Label */}
        <div className="relative z-0">
          <input
            type="email"
            id="floating_email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block py-2.5 px-0 w-full text-sm text-white bg-transparent border-0 border-b-2 border-slate-700 appearance-none focus:outline-none focus:ring-0 focus:border-emerald-500 peer transition-colors font-medium"
            placeholder=" " 
            required
            disabled={loading}
          />
          <label
            htmlFor="floating_email"
            className="absolute text-sm text-slate-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-emerald-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6 flex items-center font-semibold"
          >
            <User className="inline-block mr-2" size={14} />
            Email Address
          </label>
        </div>

        {/* Password Input with Animated Label */}
        <div className="relative z-0">
          <input
            type="password"
            id="floating_password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block py-2.5 px-0 w-full text-sm text-white bg-transparent border-0 border-b-2 border-slate-700 appearance-none focus:outline-none focus:ring-0 focus:border-emerald-500 peer transition-colors font-mono"
            placeholder=" "
            required
            disabled={loading}
          />
          <label
            htmlFor="floating_password"
            className="absolute text-sm text-slate-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-emerald-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6 flex items-center font-semibold"
          >
            <Lock className="inline-block mr-2" size={14} />
            Password
          </label>
        </div>

        <div className="flex items-center justify-between">
          <a href="#" className="text-xs text-slate-400 hover:text-white transition font-medium">Forgot Password?</a>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="group w-full flex items-center justify-center py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed rounded-xl text-white font-bold text-xs uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-lg active:scale-95"
        >
          {loading ? (
            <Loader2 className="animate-spin h-4 w-4" />
          ) : (
            <>
              <span>{mode === "signin" ? "Sign In" : "Sign Up"}</span>
              <ArrowRight className="ml-2 h-4 w-4 transform group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-4 text-slate-500 text-[10px] font-bold tracking-widest uppercase">OR CONTINUE WITH</span>
            <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {/* Google Login Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center py-2.5 px-4 bg-white hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl text-slate-800 font-bold text-xs uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-md active:scale-95"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039L38.802 8.841C34.553 4.806 29.613 2.5 24 2.5C11.983 2.5 2.5 11.983 2.5 24s9.483 21.5 21.5 21.5S45.5 36.017 45.5 24c0-1.538-.135-3.022-.389-4.417z"></path><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12.5 24 12.5c3.059 0 5.842 1.154 7.961 3.039l5.839-5.841C34.553 4.806 29.613 2.5 24 2.5C16.318 2.5 9.642 6.723 6.306 14.691z"></path><path fill="#4CAF50" d="M24 45.5c5.613 0 10.553-2.306 14.802-6.341l-5.839-5.841C30.842 35.846 27.059 38 24 38c-5.039 0-9.345-2.608-11.124-6.481l-6.571 4.819C9.642 41.277 16.318 45.5 24 45.5z"></path><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l5.839 5.841C44.196 35.123 45.5 29.837 45.5 24c0-1.538-.135-3.022-.389-4.417z"></path>
          </svg>
          Sign in with Google
        </button>
      </form>

      <p className="text-center text-xs text-slate-400 font-semibold">
        {mode === "signin" ? (
          <>
            Don't have an account?{" "}
            <button
              onClick={() => setMode("signup")}
              className="font-bold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
            >
              Sign Up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              onClick={() => setMode("signin")}
              className="font-bold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
            >
              Sign In
            </button>
          </>
        )}
      </p>
    </div>
  );
}
