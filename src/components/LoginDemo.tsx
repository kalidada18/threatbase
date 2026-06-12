import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { SmokeyBackground, LoginForm } from "@/components/ui/login-form";

interface LoginDemoProps {
  addToast: (msg: string, type: string) => void;
}

export default function LoginDemo({ addToast }: LoginDemoProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/");
    }
  }, [user, loading, navigate]);

  return (
    <main className="relative w-screen h-screen bg-[#0B0F19] overflow-hidden flex items-center justify-center">
      <SmokeyBackground className="absolute inset-0" color="#042f1a" />
      <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
        <LoginForm addToast={addToast} />
      </div>
    </main>
  );
}
