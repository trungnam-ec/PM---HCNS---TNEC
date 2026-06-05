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
  const [authError, setAuthError] = useState<string | null>(null);

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
      setAuthError(null);
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
          console.warn("User email not in allowed_users:", userEmail, error);
          setAuthError(error.message || JSON.stringify(error));
          setIsAdmin(false);
        } else if (data && data.role === "Admin") {
          setIsAdmin(true);
          setAuthError(null);
        } else {
          setAuthError("Quyền hạn không phải Admin");
          setIsAdmin(false);
        }
      } catch (err: any) {
        console.error("Error checking admin status:", err);
        setAuthError(err?.message || String(err));
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
      <div className="relative flex items-center justify-center min-h-screen bg-[#090D1A] overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-md w-full mx-4 p-10 bg-slate-900/80 border border-slate-800/80 rounded-[2rem] shadow-2xl flex flex-col items-center text-center space-y-7 backdrop-blur-xl">
          {/* Logo TNEC */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#005BAC] to-[#00AEEF] flex items-center justify-center font-heading font-extrabold text-white text-2xl shadow-lg ring-4 ring-blue-500/10">
            TN
          </div>
          
          <div className="space-y-2.5">
            <h1 className="font-heading font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              PM - HCNS - TNEC
            </h1>
            <p className="text-[#00AEEF] text-xs font-bold uppercase tracking-widest">
              Hệ thống Quản lý Hành chính Nhân sự
            </p>
          </div>

          <p className="text-slate-300 text-xs leading-relaxed px-2 font-medium">
            Chào mừng bạn đến với hệ thống quản trị nội bộ của **Trung Nam E&C**. Vui lòng kết nối bằng tài khoản Google để tiếp tục.
          </p>

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-900 text-xs font-bold py-3.5 rounded-2xl shadow-xl hover:shadow-blue-500/10 transition-all cursor-pointer border border-slate-200"
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
      <div className="relative flex items-center justify-center min-h-screen bg-[#090D1A] overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-rose-600/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-md w-full mx-4 p-10 bg-slate-900/80 border border-slate-800 rounded-[2rem] shadow-2xl flex flex-col items-center text-center space-y-6 backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 shadow-md ring-4 ring-rose-500/5">
            <ShieldAlert size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-white font-heading font-extrabold text-base">Từ chối truy cập</h2>
            <p className="text-rose-400 font-mono text-xs font-semibold bg-rose-950/30 px-3 py-1 rounded-xl border border-rose-900/20 truncate max-w-[280px]" title={userEmail || undefined}>
              {userEmail}
            </p>
          </div>

          <p className="text-slate-350 text-xs leading-relaxed px-2 font-medium">
            Tài khoản Google của bạn hiện **chưa có quyền** truy cập hệ thống quản trị này. Vui lòng liên hệ với ban nhân sự hoặc Quản trị viên để được phê duyệt email của bạn.
          </p>

          {authError && (
            <div className="text-[11px] text-rose-300 font-mono max-w-full break-all bg-rose-950/20 p-3 rounded-xl border border-rose-900/30 text-left mt-2">
              <span className="font-bold text-rose-400 block mb-0.5">Chi tiết lỗi (Debug):</span>
              {authError}
            </div>
          )}

          <div className="flex flex-col w-full pt-4">
            <button
              onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-750 text-white text-xs font-bold py-3.5 rounded-2xl transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              Đăng xuất & Thử tài khoản khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Logged in & Is Admin -> Render dashboard
  return <>{children}</>;
}
