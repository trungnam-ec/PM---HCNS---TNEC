"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Settings, Database, Info, Key, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [saved, setSaved] = useState(false);

  // Load configuration from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key") || "");
      setWebhookUrl(localStorage.getItem("apps_script_url") || "");
      setModel(localStorage.getItem("openai_model") || "gpt-4o-mini");
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key", apiKey.trim());
      localStorage.setItem("apps_script_url", webhookUrl.trim());
      localStorage.setItem("openai_model", model);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Cài đặt hệ thống" subtitle="Cấu hình hệ thống, khoá bảo mật và kết nối Google Sheets" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto max-w-4xl">
          {/* Toast Alert */}
          {saved && (
            <div className="fixed bottom-6 right-6 z-50 animate-bounce">
              <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 font-semibold text-sm">
                <CheckCircle className="w-5 h-5 text-emerald-200" />
                Cập nhật cấu hình thành công!
              </div>
            </div>
          )}

          {/* Setup Configuration Form */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <Key size={18} className="text-blue-600" /> Cấu hình bảo mật & Kết nối
            </h2>

            <form onSubmit={handleSave} className="space-y-5 text-xs text-slate-600 font-semibold">
              {/* API Key */}
              <div className="space-y-1">
                <label className="text-slate-500">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                />
                <p className="text-[10px] text-slate-400 font-normal mt-1">Khoá bảo mật API dùng để thực hiện chấm điểm và trích xuất dữ liệu CV bằng AI.</p>
              </div>

              {/* Webhook Url */}
              <div className="space-y-1">
                <label className="text-slate-500">Google Apps Script Webhook URL</label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                />
                <p className="text-[10px] text-slate-400 font-normal mt-1">Đường dẫn Webhook được sinh ra sau khi Deploy Apps Script để ghi dữ liệu thời gian thực.</p>
              </div>

              {/* ChatGPT Model */}
              <div className="space-y-1">
                <label className="text-slate-500">ChatGPT Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tối ưu chi phí)</option>
                  <option value="gpt-4o">gpt-4o (Độ chính xác cao hơn)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow"
                >
                  Lưu cấu hình hệ thống
                </button>
              </div>
            </form>
          </div>

          {/* System Info */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
              <Info size={18} className="text-blue-600" /> Thông tin nền tảng
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-600">
              <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                <p className="text-slate-400 text-[10px]">Phiên bản</p>
                <p className="text-[#005BAC] font-bold">HRA Platform v2.5</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                <p className="text-slate-400 text-[10px]">Phòng ban kết nối</p>
                <p className="text-emerald-600 font-bold">Hành Chính Nhân Sự</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                <p className="text-slate-400 text-[10px]">Cơ sở dữ liệu</p>
                <p className="text-blue-600 font-bold">Google Sheets API</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                <p className="text-slate-400 text-[10px]">Môi trường</p>
                <p className="text-emerald-600 font-bold">Online Production</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
