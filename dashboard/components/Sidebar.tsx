"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calculator,
  Building2,
  FileText,
  TrendingUp,
  Settings,
  Briefcase,
  Users
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Bảng điều khiển", href: "/", icon: LayoutDashboard },
  { label: "Quản lý Công việc", href: "/tasks", icon: ClipboardList },
  { label: "Tuyển dụng (AI Scorer)", href: "/recruitment", icon: Briefcase },
  { label: "Quản lý Nhân sự", href: "/employees", icon: Users },
  { label: "Lương & Phúc lợi (C&B)", href: "/cb", icon: Calculator },
  { label: "Hành chính & Tài sản", href: "/administration", icon: Building2 },
  { label: "Quản lý Văn thư", href: "/document-control", icon: FileText },
  { label: "Báo cáo & Phân tích", href: "/reports", icon: TrendingUp },
  { label: "Cài đặt hệ thống", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen flex flex-col fixed left-0 top-0 z-40 bg-slate-900 border-r border-slate-800">
      {/* Brand Logo & Header */}
      <div className="px-6 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-heading font-extrabold text-white text-sm shadow-md">
            TN
          </div>
          <div>
            <h1 className="text-white font-heading font-bold text-sm tracking-tight leading-tight">PM - HCNS - TNEC</h1>
            <p className="text-slate-400 text-[10px] uppercase font-semibold tracking-wider mt-0.5">Hệ thống HCNS</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        <div className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Chức năng chính
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
              }`}
            >
              <Icon size={18} className={isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
