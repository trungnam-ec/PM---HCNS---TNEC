"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  FileDown,
  FileUp,
  FileCheck,
  Search,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  MoreHorizontal
} from "lucide-react";

const TIMELINE_EVENTS = [
  { id: "e1", doc: "Tờ trình phê duyệt vật tư xây dựng Q2", step: "Hành chính trình nộp", time: "09:30 AM", date: "Jun 04", status: "completed" },
  { id: "e2", doc: "Tờ trình phê duyệt vật tư xây dựng Q2", step: "Trưởng phòng HCNS ký duyệt", time: "11:15 AM", date: "Jun 04", status: "completed" },
  { id: "e3", doc: "Tờ trình phê duyệt vật tư xây dựng Q2", step: "Ban Tổng Giám đốc xem xét", time: "Đang chờ", date: "Hôm nay", status: "pending" }
];

export default function DocumentControlPage() {
  const [activeTab, setActiveTab] = useState("incoming"); // incoming, outgoing, timeline

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quản lý Văn thư" subtitle="Quản lý và số hóa công văn đi/đến, tờ trình phê duyệt hành chính" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigator */}
          <div className="flex border-b border-slate-200">
            {[
              { id: "incoming", label: "Công văn đến", icon: FileDown },
              { id: "outgoing", label: "Công văn đi", icon: FileUp },
              { id: "timeline", label: "Trình duyệt & Ký số", icon: FileCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search bar & Action */}
          <div className="flex justify-between items-center">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Tìm số văn bản, nội dung tóm tắt..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
              />
            </div>
            <button className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md">
              <Plus size={14} /> Lưu công văn mới
            </button>
          </div>

          {/* Document Content Panels */}
          {activeTab === "incoming" && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Nhật ký Công văn đến văn phòng</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="pb-3">Số văn bản</th>
                      <th className="pb-3">Ngày văn bản</th>
                      <th className="pb-3">Cơ quan gửi đến</th>
                      <th className="pb-3">Nội dung chính</th>
                      <th className="pb-3">Trạng thái xử lý</th>
                      <th className="pb-3">Tải về</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                    {[
                      { num: "CV-248/SXD", date: "2025-06-01", sender: "Sở Xây dựng TP.HCM", summary: "V/v Hướng dẫn kiểm tra nghiệm thu chất lượng công trình hạ tầng.", status: "Đang xử lý", scan: "Tải xuống PDF" },
                      { num: "CV-012/PC", date: "2025-05-28", sender: "Công an PCCC", summary: "Thông báo kế hoạch kiểm tra phòng cháy chữa cháy định kỳ.", status: "Đã hoàn thành", scan: "Tải xuống PDF" }
                    ].map((doc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 font-mono font-bold text-slate-800">{doc.num}</td>
                        <td className="py-3">{doc.date}</td>
                        <td className="py-3 text-slate-700">{doc.sender}</td>
                        <td className="py-3 max-w-[280px] truncate">{doc.summary}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            doc.status === "Đã hoàn thành" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-3 text-blue-600 hover:underline cursor-pointer">{doc.scan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "outgoing" && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Nhật ký Công văn đi cơ quan ngoài</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="pb-3">Số công văn đi</th>
                      <th className="pb-3">Ngày gửi</th>
                      <th className="pb-3">Đơn vị nhận</th>
                      <th className="pb-3">Tóm tắt nội dung</th>
                      <th className="pb-3">Người ký duyệt</th>
                      <th className="pb-3">Bản Scan gốc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                    {[
                      { num: "TNEC-CV/085", date: "2025-06-03", receiver: "Ủy ban nhân dân Quận 2", summary: "Báo cáo tiến độ nghiệm thu hoàn thành dự án nâng cấp đường.", signer: "Giám đốc Dự án", scan: "Xem bản quét.jpg" },
                      { num: "TNEC-CV/084", date: "2025-05-30", receiver: "Công ty Cung ứng Việt Nam", summary: "Yêu cầu cung cấp báo giá thép xây dựng bổ sung công trình.", signer: "Trưởng phòng Vật tư", scan: "Xem bản quét.pdf" }
                    ].map((doc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 font-mono font-bold text-slate-800">{doc.num}</td>
                        <td className="py-3">{doc.date}</td>
                        <td className="py-3 text-slate-700">{doc.receiver}</td>
                        <td className="py-3 max-w-[280px] truncate">{doc.summary}</td>
                        <td className="py-3 font-bold text-slate-700">{doc.signer}</td>
                        <td className="py-3 text-blue-600 hover:underline cursor-pointer">{doc.scan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Approval List */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="font-heading font-bold text-slate-800 text-sm">Yêu cầu trình duyệt đang xử lý</h3>
                {[
                  { name: "Tờ trình mua sắm laptop quý 2", booker: "Hành chính", date: "Hôm nay", status: "pending", desc: "Hành chính xin phê duyệt cấp ngân sách 120.000.000 VNĐ để mua sắm thiết bị làm việc." },
                  { name: "Hồ sơ thanh toán nghiệm thu gói thầu phụ", booker: "Phòng Dự Án", date: "2 ngày trước", status: "rejected", desc: "Thanh quyết toán đợt 3 cho nhà thầu thi công hạ tầng đường." }
                ].map((item, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/40 hover-elevate space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-heading font-bold text-slate-800 text-xs">{item.name}</h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                        item.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                      }`}>
                        {item.status === "pending" ? "Đang chờ duyệt" : "Yêu cầu chỉnh sửa"}
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed font-medium">{item.desc}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                      <span>Người tạo: <strong>{item.booker}</strong></span>
                      <span>Ngày gửi: {item.date}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline Flow */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-6">
                <h3 className="font-heading font-bold text-slate-800 text-sm">Lịch sử phê duyệt gần đây</h3>
                <div className="relative border-l border-slate-150 pl-4 ml-2 space-y-6">
                  {TIMELINE_EVENTS.map((event) => (
                    <div key={event.id} className="relative space-y-1">
                      {/* Event dot */}
                      <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        event.status === "completed" ? "bg-emerald-500" : "bg-amber-400"
                      }`} />
                      <div className="flex justify-between items-start">
                        <p className="font-heading font-bold text-slate-800 text-xs leading-none">{event.step}</p>
                        <span className="text-slate-400 text-[9px]">{event.time}</span>
                      </div>
                      <p className="text-slate-400 text-[10px] font-semibold">{event.doc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
