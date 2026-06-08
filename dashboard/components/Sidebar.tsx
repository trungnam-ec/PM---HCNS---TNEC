"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calculator,
  Building2,
  FileText,
  Settings,
  Briefcase,
  Users,
  CalendarRange,
  X
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Quản lý Công việc", href: "/tasks", icon: ClipboardList },
  { label: "Lịch công việc", href: "/calendar", icon: CalendarRange },
  { label: "Tuyển dụng", href: "/recruitment", icon: Briefcase },
  { label: "Quản lý Nhân sự", href: "/employees", icon: Users },
  { label: "Lương & Phúc lợi (C&B)", href: "/cb", icon: Calculator },
  { label: "Hành chính & Tài sản", href: "/administration", icon: Building2 },
  { label: "Văn Thư", href: "/document-control", icon: FileText },
  { label: "Cài đặt hệ thống", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useSidebar();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden transition-all duration-300"
        />
      )}

      <aside className={`w-60 h-screen flex flex-col fixed left-0 top-0 z-40 bg-white border-r border-slate-200/60 shadow-sm transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Brand Logo & Header */}
        <div className="px-6 py-6 border-b border-slate-200/60 relative">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center font-heading font-extrabold text-white text-xs shadow-md shadow-blue-500/25">
              TN
            </div>
            <div>
              <h1 className="text-[#1D1D1F] font-heading font-bold text-sm tracking-tight leading-tight">PM - HCNS - TNEC</h1>
              <p className="text-slate-450 text-[10px] uppercase font-bold tracking-wider mt-0.5">Hệ thống HCNS</p>
            </div>
          </div>
          {/* Mobile Close Button */}
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
            title="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-2.5 overflow-y-auto">
        <div className="px-3 mb-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
          Chức năng chính
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-200 active:scale-[0.97] hover:translate-x-1 border ${
                isActive
                  ? "bg-[#1D1D1F] border-[#1D1D1F] text-white shadow-sm"
                  : "bg-[#EBEBEB]/70 border-slate-200/40 text-[#1D1D1F] hover:bg-slate-200/90"
              }`}
            >
              <Icon size={15} className={isActive ? "text-white" : "text-slate-500"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
    </>
  );
}
