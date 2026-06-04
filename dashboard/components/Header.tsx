"use client";

import { Bell, Search, Globe, ChevronDown } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: Props) {
  return (
    <header className="glass sticky top-0 z-30 flex items-center justify-between px-8 py-4">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="font-heading font-extrabold text-slate-800 text-lg tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>}
      </div>

      {/* Search Bar & Actions */}
      <div className="flex items-center gap-6">
        {/* Notian-like Search Bar */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Tìm kiếm mọi thứ..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-xs text-slate-700 placeholder:text-slate-400 border border-slate-200/60 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-inner"
          />
        </div>

        {/* Global Notifications & Tools */}
        <div className="flex items-center gap-2">
          {/* Company Site Link */}
          <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all" title="Cổng thông tin Công ty">
            <Globe size={16} />
          </button>

          {/* Notifications */}
          <button className="relative p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all" title="Thông báo">
            <Bell size={16} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </button>
        </div>

        {/* User Info (Material 3 Profile Button) */}
        <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200/80">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-white text-xs shadow-sm">
            HR
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-bold text-slate-800 leading-none">Trung Nam E&C</span>
            <span className="text-[10px] text-slate-400 font-semibold mt-0.5">Tài khoản Quản trị</span>
          </div>
          <ChevronDown size={12} className="text-slate-400" />
        </div>
      </div>
    </header>
  );
}
