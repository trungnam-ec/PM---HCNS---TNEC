"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Calendar,
  Paperclip,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  User,
  ArrowUpDown
} from "lucide-react";

// --- MOCK DATA ---
const INITIAL_TASKS = [
  // Lập kế hoạch
  { id: "t1", title: "Lập lịch Đào tạo Nghiệp vụ Quý 3", priority: "Trung bình", assignee: "Hồng Nhung", due: "20 Tháng 6", progress: 0, attachments: 2, comments: 1, column: "planning" },
  { id: "t2", title: "Soạn thảo Cập nhật Chính sách C&B mới", priority: "Cao", assignee: "Minh Tâm", due: "15 Tháng 6", progress: 10, attachments: 4, comments: 3, column: "planning" },
  
  // Đang thực hiện
  { id: "t3", title: "Sàng lọc CV Kỹ sư Cầu đường Cấp cao", priority: "Cao", assignee: "Thành Đạt", due: "10 Tháng 6", progress: 65, attachments: 5, comments: 8, column: "in_progress" },
  { id: "t4", title: "Kiểm kê Tài sản & Thiết bị văn phòng", priority: "Thấp", assignee: "Thị Mai", due: "30 Tháng 6", progress: 40, attachments: 0, comments: 0, column: "in_progress" },
  
  // Chờ phê duyệt
  { id: "t5", title: "Trình ký phê duyệt Công văn đi số 146", priority: "Cao", assignee: "Hoàng Huy", due: "08 Tháng 6", progress: 95, attachments: 1, comments: 4, column: "pending_approval" },
  
  // Cần chỉnh sửa
  { id: "t6", title: "Xử lý trùng lịch đặt Phòng họp số 3", priority: "Trung bình", assignee: "Thị Mai", due: "09 Tháng 6", progress: 50, attachments: 0, comments: 2, column: "need_revision" },
  
  // Đã hoàn thành
  { id: "t7", title: "Tiếp nhận 5 Kỹ sư Công trường mới", priority: "Cao", assignee: "Thành Đạt", due: "31 Tháng 5", progress: 100, attachments: 3, comments: 6, column: "completed" },
  { id: "t8", title: "Cấp phát Văn phòng phẩm Quý 2", priority: "Thấp", assignee: "Hoàng Huy", due: "28 Tháng 5", progress: 100, attachments: 1, comments: 0, column: "completed" },
];

const COLUMNS = [
  { id: "planning", title: "Lập kế hoạch", color: "border-t-slate-400" },
  { id: "in_progress", title: "Đang thực hiện", color: "border-t-blue-500" },
  { id: "pending_approval", title: "Chờ phê duyệt", color: "border-t-purple-500" },
  { id: "need_revision", title: "Cần chỉnh sửa", color: "border-t-rose-500" },
  { id: "completed", title: "Đã hoàn thành", color: "border-t-emerald-500" },
];

export default function TaskManagementPage() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.assignee.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quản lý Công việc" subtitle="Bảng theo dõi và quản lý công việc phòng Hành chính Nhân sự" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Subheader Filters */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm nhiệm vụ, người làm..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                />
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                <ArrowUpDown size={13} /> Sắp xếp
              </button>
            </div>

            <button className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10">
              <Plus size={14} /> Thêm công việc
            </button>
          </div>

          {/* Kanban Board Container */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-start overflow-x-auto pb-4">
            {COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter(t => t.column === col.id);
              return (
                <div key={col.id} className="flex flex-col gap-4 min-w-[220px] bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50">
                  {/* Column Header */}
                  <div className={`flex items-center justify-between border-t-2 ${col.color} pt-2`}>
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-xs text-slate-700">{col.title}</span>
                      <span className="text-[10px] font-extrabold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                    </div>
                    <button className="text-slate-400 hover:text-slate-600"><Plus size={13} /></button>
                  </div>

                  {/* Task Cards */}
                  <div className="space-y-3 min-h-[400px]">
                    {colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="glass rounded-xl p-4 bg-white hover-elevate border border-slate-200/40 flex flex-col justify-between h-36 cursor-grab active:cursor-grabbing"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                              task.priority === "Cao" ? "bg-rose-100 text-rose-700" :
                              task.priority === "Trung bình" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {task.priority}
                            </span>
                            <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={13} /></button>
                          </div>
                          <p className="text-slate-800 font-heading font-semibold text-xs leading-snug line-clamp-2">{task.title}</p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          {/* Assignee & Progress */}
                          <div className="flex items-center justify-between text-[9px] text-slate-400">
                            <span className="flex items-center gap-1 font-semibold text-slate-500"><User size={10} /> {task.assignee}</span>
                            <span className="font-bold text-blue-600">{task.progress}%</span>
                          </div>

                          {/* Footer Info */}
                          <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold">
                            <span className="flex items-center gap-0.5"><Calendar size={10} /> {task.due}</span>
                            <div className="flex items-center gap-1.5">
                              {task.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip size={10} /> {task.attachments}</span>}
                              {task.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {task.comments}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-xs italic">
                        Kéo thả vào đây
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
