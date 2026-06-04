"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, ShieldAlert } from "lucide-react";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUserEmail(session?.user?.email || null);
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUserEmail(session?.user?.email || null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !userEmail) {
      setIsAdmin(false);
      return;
    }

    const checkAdminStatus = async () => {
      setCheckingAdmin(true);
      try {
        const { data, error } = await supabase
          .from("allowed_users")
          .select("role")
          .eq("email", userEmail.toLowerCase())
          .single();

        if (error) {
          console.warn("User email not in allowed_users:", userEmail);
          setIsAdmin(false);
        } else if (data && data.role === "Admin") {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    checkAdminStatus();
  }, [session, userEmail]);

  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : "",
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Login error:", err);
      alert("Lỗi khi đăng nhập bằng Google!");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F9FC] text-slate-500 gap-3">
        <Loader2 className="animate-spin text-[#005BAC]" size={36} />
        <p className="text-xs font-semibold">Đang kiểm tra trạng thái đăng nhập...</p>
      </div>
    );
  }

  // 1. Not Logged In -> Show Login Page
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#0F172A] to-[#1E293B]">
        <div className="glass max-w-md w-full mx-4 p-8 bg-slate-900/60 border border-slate-800/80 rounded-3xl shadow-2xl flex flex-col items-center text-center space-y-6">
          {/* Logo TNEC */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-heading font-extrabold text-white text-2xl shadow-lg">
            TN
          </div>
          
          <div className="space-y-2">
            <h1 className="text-white font-heading font-extrabold text-xl tracking-tight">PM - HCNS - TNEC</h1>
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Hệ thống Quản lý Hành chính Nhân sự</p>
          </div>

          <p className="text-slate-400 text-xs leading-relaxed px-4">
            Chào mừng bạn đến với hệ thống nội bộ Trung Nam E&C. Vui lòng đăng nhập bằng tài khoản Google để tiếp tục.
          </p>

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-850 text-xs font-bold py-3 rounded-2xl shadow-lg transition-all active:scale-[0.98] border border-slate-200 cursor-pointer"
          >
            {/* Google Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.97 1 12 1 7.37 1 3.42 3.66 1.5 7.57l3.92 3.04c.92-2.76 3.51-4.57 6.58-4.57z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-1.99 3.43-4.91 3.43-8.55z"
              />
              <path
                fill="#FBBC05"
                d="M5.42 15.35A7.14 7.14 0 0 1 5 12c0-1.18.2-2.31.57-3.37L1.65 5.59A11.96 11.96 0 0 0 0 12c0 2.45.62 4.76 1.7 6.81l3.72-3.46z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.7-2.87c-1.03.69-2.34 1.1-4.26 1.1-3.07 0-5.66-1.81-6.58-4.57L1.5 16.79C3.42 20.34 7.37 23 12 23z"
              />
            </svg>
            Đăng nhập bằng tài khoản Google
          </button>
        </div>
      </div>
    );
  }

  // 2. Logged In, but checking allowed list
  if (checkingAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F9FC] text-slate-500 gap-3">
        <Loader2 className="animate-spin text-[#005BAC]" size={36} />
        <p className="text-xs font-semibold">Đang kiểm tra quyền truy cập hệ thống...</p>
      </div>
    );
  }

  // 3. Logged in but NOT Admin (not in allowed list)
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="glass max-w-md w-full mx-4 p-8 bg-slate-900/60 border border-slate-800 rounded-3xl shadow-2xl flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 shadow-md">
            <ShieldAlert size={32} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-white font-heading font-bold text-base">Truy cập bị từ chối</h2>
            <p className="text-rose-400 text-xs font-semibold truncate max-w-[300px]" title={userEmail || undefined}>
              {userEmail}
            </p>
          </div>

          <p className="text-slate-400 text-xs leading-relaxed px-2">
            Tài khoản Google của bạn chưa được cấp quyền truy cập hệ thống quản trị này. Vui lòng liên hệ với Quản trị viên (Admin) để được phê duyệt email.
          </p>

          <div className="flex flex-col w-full gap-2 pt-2">
            <button
              onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Đăng xuất và thử tài khoản khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Logged in & Is Admin -> Render dashboard
  return <>{children}</>;
}
