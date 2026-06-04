"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Monitor,
  Calendar,
  Car,
  Package,
  CheckCircle,
  Clock,
  User,
  Plus,
  Search,
  MoreHorizontal
} from "lucide-react";

const ASSETS_DATA = [
  { id: "AST-101", name: "Laptop Dell Latitude 5420", type: "Thiết bị văn phòng", assignee: "Lê Thành Đạt", status: "Đang sử dụng", date: "2024-01-10" },
  { id: "AST-102", name: "Màn hình Dell UltraSharp 24", type: "Thiết bị văn phòng", assignee: "Phạm Minh Tâm", status: "Đang sử dụng", date: "2023-08-15" },
  { id: "AST-103", name: "Xe Toyota Fortuner (7 chỗ)", type: "Phương tiện công tác", assignee: "Tài xế Nguyễn Văn A", status: "Đang sử dụng", date: "2022-05-20" },
  { id: "AST-104", name: "Xe Ford Ranger (Bán tải)", type: "Phương tiện công tác", assignee: "Chưa bàn giao", status: "Trong kho", date: "N/A" }
];

const ROOMS_DATA = [
  { name: "Phòng họp lớn (Hội trường)", capacity: "30 người", status: "Đang sử dụng", event: "Họp Giao ban Tuần", time: "14:00 - 15:30", booker: "Hành chính" },
  { name: "Phòng họp nhỏ 1", capacity: "10 người", status: "Trống", event: "N/A", time: "N/A", booker: "N/A" },
  { name: "Phòng họp nhỏ 2", capacity: "10 người", status: "Đã đặt trước", event: "Phỏng vấn ứng viên", time: "16:00 - 17:00", booker: "Tuyển dụng" }
];

export default function AdministrationPage() {
  const [activeSub, setActiveSub] = useState("assets"); // assets, rooms, supplies

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Hành chính & Quản lý Tài sản" subtitle="Hệ thống quản trị thiết bị văn phòng, đăng ký phòng họp và xe công tác" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigator */}
          <div className="flex border-b border-slate-200">
            {[
              { id: "assets", label: "Thiết bị văn phòng (Assets)", icon: Monitor },
              { id: "rooms", label: "Phòng họp (Meeting Rooms)", icon: Calendar },
              { id: "supplies", label: "Văn phòng phẩm (Supplies)", icon: Package },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSub(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeSub === tab.id
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

          {/* Admin Content Panels */}
          {activeSub === "assets" && (
            <div className="space-y-6">
              {/* Filter Row */}
              <div className="flex justify-between items-center">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Tìm thiết bị, tài sản..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                  />
                </div>
                <button className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md">
                  <Plus size={14} /> Thêm tài sản mới
                </button>
              </div>

              {/* Assets Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {ASSETS_DATA.map((asset) => (
                  <div key={asset.id} className="glass bg-white rounded-2xl p-5 hover-elevate border border-slate-200/40 flex flex-col justify-between h-40">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-mono text-[9px] font-semibold">{asset.id}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          asset.status === "Đang sử dụng" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {asset.status}
                        </span>
                      </div>
                      <h4 className="font-heading font-bold text-slate-800 text-xs leading-snug line-clamp-2">{asset.name}</h4>
                      <p className="text-slate-400 text-[10px] font-semibold">{asset.type}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-semibold space-y-1">
                      <p className="flex items-center gap-1"><User size={11} className="text-slate-400" /> Bàn giao: <strong className="text-slate-700">{asset.assignee}</strong></p>
                      {asset.date !== "N/A" && <p className="flex items-center gap-1"><Clock size={11} className="text-slate-400" /> Ngày nhận: {asset.date}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSub === "rooms" && (
            <div className="space-y-6">
              {/* Meeting Rooms Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {ROOMS_DATA.map((room) => (
                  <div key={room.name} className="glass bg-white rounded-2xl p-6 border border-slate-200/40 shadow-sm flex flex-col justify-between h-48 hover-elevate">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-heading font-extrabold text-slate-800 text-sm">{room.name}</h4>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          room.status === "Đang sử dụng" ? "bg-rose-100 text-rose-700" :
                          room.status === "Đã đặt trước" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {room.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs font-semibold">Sức chứa: {room.capacity}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-semibold space-y-1.5">
                      {room.status !== "Trống" ? (
                        <>
                          <p className="text-slate-700 font-bold">Sự kiện: {room.event}</p>
                          <p className="flex items-center gap-1 text-slate-500"><Clock size={11} /> Thời gian: {room.time}</p>
                          <p className="text-slate-400">Người đặt: {room.booker}</p>
                        </>
                      ) : (
                        <p className="text-slate-400 italic">Hiện tại không có lịch họp</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSub === "supplies" && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Quản lý và cấp phát Văn phòng phẩm (Q2)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="pb-3">Vật tư văn phòng</th>
                      <th className="pb-3">Danh mục</th>
                      <th className="pb-3">Đơn vị</th>
                      <th className="pb-3">Số lượng tồn kho</th>
                      <th className="pb-3">Đã cấp phát</th>
                      <th className="pb-3">Trạng thái tồn kho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                    {[
                      { name: "Giấy A4 Double A 70gsm", cat: "Giấy in", unit: "Ram", stock: 150, allocated: 320, alert: "Bình thường" },
                      { name: "Bút bi Thiên Long xanh", cat: "Bút viết", unit: "Hộp", stock: 12, allocated: 45, alert: "Cảnh báo" },
                      { name: "Kẹp bướm 25mm", cat: "Dụng cụ lưu trữ", unit: "Hộp", stock: 45, allocated: 15, alert: "Bình thường" }
                    ].map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 font-bold text-slate-800">{item.name}</td>
                        <td className="py-3">{item.cat}</td>
                        <td className="py-3">{item.unit}</td>
                        <td className="py-3 text-slate-800">{item.stock}</td>
                        <td className="py-3 text-slate-400">{item.allocated}</td>
                        <td className="py-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                            item.alert === "Bình thường" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {item.alert}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
