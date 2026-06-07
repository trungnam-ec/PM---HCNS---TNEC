"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  ClipboardList,
  Clock,
  CheckCircle,
  Users,
  Briefcase,
  AlertTriangle,
  Award,
  ChevronRight,
  Calendar,
  Paperclip,
  MessageSquare,
  MoreHorizontal,
  Loader2
} from "lucide-react";

// --- FALLBACK MOCK DATA ---
const KPI_DEFAULT = [
  { label: "Tổng số công việc", value: 142, icon: ClipboardList, color: "bg-blue-500", text: "text-blue-500" },
  { label: "Đang thực hiện", value: 34, icon: Clock, color: "bg-amber-500", text: "text-amber-500" },
  { label: "Chờ phê duyệt", value: 12, icon: AlertTriangle, color: "bg-rose-500", text: "text-rose-500" },
  { label: "Đã hoàn thành", value: 96, icon: CheckCircle, color: "bg-emerald-500", text: "text-emerald-500" },
  { label: "Tổng số nhân viên", value: 645, icon: Users, color: "bg-indigo-500", text: "text-indigo-500" },
  { label: "Vị trí đang tuyển", value: 18, icon: Briefcase, color: "bg-cyan-500", text: "text-cyan-500" },
  { label: "Hợp đồng sắp hết hạn", value: 5, icon: AlertTriangle, color: "bg-amber-600", text: "text-amber-600" },
  { label: "Chứng chỉ sắp hết hạn", value: 8, icon: Award, color: "bg-purple-500", text: "text-purple-500" },
];

const TEAM_DEFAULT = [
  { name: "Phạm Minh Tâm", position: "Chuyên viên C&B", kpi: 94, completed: 28, pending: 2, leave: "Đang làm việc", avatar: "PT" },
  { name: "Lê Thành Đạt", position: "Chuyên viên Tuyển dụng", kpi: 88, completed: 24, pending: 4, leave: "Đang làm việc", avatar: "LD" },
  { name: "Trần Thị Mai", position: "Chuyên viên Hành chính", kpi: 91, completed: 32, pending: 3, leave: "Nghỉ phép", avatar: "TM" },
  { name: "Nguyễn Hoàng Huy", position: "Chuyên viên Văn thư", kpi: 85, completed: 19, pending: 5, leave: "Đang làm việc", avatar: "HH" },
];

const TASKS_DEFAULT = [
  { id: "1", title: "Đánh giá Kế hoạch Tuyển dụng Q3", priority: "Cao", assignee: "Minh Tâm", due: "12 Tháng 6", progress: 75, attachments: 3, comments: 5 },
  { id: "2", title: "Cập nhật Sổ tay Nhân viên", priority: "Trung bình", assignee: "Thành Đạt", due: "18 Tháng 6", progress: 40, attachments: 1, comments: 2 },
  { id: "3", title: "Soạn thảo Công văn số 248", priority: "Cao", assignee: "Thị Mai", due: "10 Tháng 6", progress: 90, attachments: 2, comments: 8 },
  { id: "4", title: "Mua sắm Laptop & Văn phòng phẩm", priority: "Thấp", assignee: "Hoàng Huy", due: "25 Tháng 6", progress: 15, attachments: 0, comments: 0 },
];

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any[]>(KPI_DEFAULT);
  const [team, setTeam] = useState<any[]>(TEAM_DEFAULT);
  const [tasks, setTasks] = useState<any[]>(TASKS_DEFAULT);
  const [completionRate, setCompletionRate] = useState(80);
  const [completedCount, setCompletedCount] = useState(96);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // 1. Fetch employees
      const { data: emps, error: empsError } = await supabase
        .from("employees")
        .select("*");
      if (empsError) throw empsError;

      // 2. Fetch tasks
      const { data: taskList, error: tasksError } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (tasksError) throw tasksError;

      // 3. Fetch candidates (to show recruiting count)
      const { data: candidates } = await supabase
        .from("candidates")
        .select("id");
      const positionsCount = candidates ? candidates.length : 18;

      // 4. Calculate Task stats
      const totalTasks = taskList ? taskList.length : 0;
      const planningTasks = taskList ? taskList.filter((t: any) => t.status === "planning").length : 0;
      const inProgressTasks = taskList ? taskList.filter((t: any) => t.status === "in_progress").length : 0;
      const pendingApprovalTasks = taskList ? taskList.filter((t: any) => t.status === "pending_approval").length : 0;
      const needRevisionTasks = taskList ? taskList.filter((t: any) => t.status === "need_revision").length : 0;
      const completedTasks = taskList ? taskList.filter((t: any) => t.status === "completed").length : 0;

      const activeTasksCount = inProgressTasks + planningTasks + needRevisionTasks;
      const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 80;

      // 5. Update KPI Cards
      const updatedKpis = [
        { label: "Tổng số công việc", value: totalTasks || 142, icon: ClipboardList, color: "bg-blue-500", text: "text-blue-500" },
        { label: "Đang thực hiện", value: activeTasksCount || 34, icon: Clock, color: "bg-amber-500", text: "text-amber-500" },
        { label: "Chờ phê duyệt", value: pendingApprovalTasks || 12, icon: AlertTriangle, color: "bg-rose-500", text: "text-rose-500" },
        { label: "Đã hoàn thành", value: completedTasks || 96, icon: CheckCircle, color: "bg-emerald-500", text: "text-emerald-500" },
        { label: "Tổng số nhân viên", value: emps ? emps.length : 645, icon: Users, color: "bg-indigo-500", text: "text-indigo-500" },
        { label: "Vị trí đang tuyển", value: positionsCount || 18, icon: Briefcase, color: "bg-cyan-500", text: "text-cyan-500" },
        { label: "Hợp đồng sắp hết hạn", value: 5, icon: AlertTriangle, color: "bg-amber-600", text: "text-amber-600" },
        { label: "Chứng chỉ sắp hết hạn", value: 8, icon: Award, color: "bg-purple-500", text: "text-purple-500" },
      ];
      setKpis(updatedKpis);
      setCompletionRate(rate);
      setCompletedCount(completedTasks || 96);

      // 6. Map Team Performance from real employees
      if (emps && emps.length > 0) {
        const mappedTeam = emps.map((emp: any) => {
          // Count completed/pending tasks assigned to this employee name
          const empTasks = taskList ? taskList.filter((t: any) => t.assignee === emp.name) : [];
          const completed = empTasks.filter((t: any) => t.status === "completed").length;
          const pending = empTasks.filter((t: any) => t.status !== "completed").length;
          return {
            name: emp.name,
            position: emp.role || "Chuyên viên",
            kpi: emp.kpi || 100,
            completed: completed || emp.completed_tasks || 0,
            pending: pending || emp.pending_tasks || 0,
            leave: emp.status === "Nghỉ phép" ? "Nghỉ phép" : "Đang làm việc",
            avatar: emp.avatar || (emp.name ? emp.name.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "NV")
          };
        });
        setTeam(mappedTeam);
      }

      // 7. Map Kanban Tasks from real tasks (show top 4)
      if (taskList && taskList.length > 0) {
        const mappedTasks = taskList.slice(0, 4).map((t: any) => {
          let priorityLabel = t.priority || "Trung bình";
          let dueLabel = t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN", { day: '2-digit', month: 'short' }) : "Không hạn";
          
          return {
            id: t.id,
            title: t.title,
            priority: priorityLabel,
            assignee: t.assignee || "Chưa phân công",
            due: dueLabel,
            progress: t.progress || 0,
            attachments: t.attachments || 0,
            comments: t.comments || 0
          };
        });
        setTasks(mappedTasks);
      }

    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Dashboard Hành chính Nhân sự" subtitle="Hệ thống quản trị Hành chính Nhân sự Trung Nam E&C" />
        
        <main className="flex-1 p-8 space-y-8 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[500px] text-slate-400 gap-2">
              <Loader2 className="animate-spin text-[#005BAC]" size={36} />
              <p className="text-xs font-semibold">Đang đồng bộ dữ liệu từ Supabase...</p>
            </div>
          ) : (
            <>
              {/* KPI Dashboard Section */}
              <section className="space-y-4 animate-in fade-in duration-200">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hệ thống chỉ số KPI</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  {kpis.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.label} className="glass rounded-2xl p-5 hover-elevate bg-white/75 flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-slate-500 text-xs font-semibold">{card.label}</p>
                          <p className="font-heading font-extrabold text-2xl text-slate-800">{card.value}</p>
                        </div>
                        <div className={`w-10 h-10 rounded-xl ${card.color} bg-opacity-10 flex items-center justify-center`}>
                          <Icon className={card.text} size={18} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Team Performance & Recent Activity */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in fade-in duration-300">
                {/* Team Performance Card */}
                <section className="xl:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hiệu suất Đội ngũ (Team Performance)</h2>
                    <a href="/employees" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                      Xem chi tiết <ChevronRight size={12} />
                    </a>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[390px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                    {team.map((emp) => (
                      <div key={emp.name} className="glass rounded-2xl p-5 bg-white/75 flex gap-4 hover-elevate">
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow shrink-0">
                          {emp.avatar}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-slate-800 font-heading font-bold text-sm truncate">{emp.name}</p>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${emp.leave === "Đang làm việc" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
                              {emp.leave}
                            </span>
                          </div>
                          <p className="text-slate-400 text-xs font-medium truncate">{emp.position}</p>
                          
                          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-semibold">
                            <div>KPI: <span className="text-blue-600 font-bold">{emp.kpi}%</span></div>
                            <div>Công việc: <span className="text-emerald-600 font-bold">{emp.completed}✓</span> / <span className="text-amber-500 font-bold">{emp.pending}⏳</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Completion Rate Circle Diagram */}
                <section className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tỉ lệ hoàn thành công việc</h2>
                  <div className="glass rounded-2xl p-6 bg-white/75 flex flex-col items-center justify-center text-center h-[230px] border border-white/50">
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="56" cy="56" r="48" stroke="#E2E8F0" strokeWidth="8" fill="transparent" />
                        <circle
                          cx="56"
                          cy="56"
                          r="48"
                          stroke="#005BAC"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray="301.6"
                          strokeDashoffset={301.6 - (301.6 * completionRate) / 100}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="font-heading font-extrabold text-2xl text-slate-800">{completionRate}%</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Đạt chỉ tiêu</span>
                      </div>
                    </div>
                    <p className="text-slate-500 text-xs font-semibold mt-4">{completedCount} công việc đã hoàn thành</p>
                  </div>
                </section>
              </div>

              {/* Task Management Overview (Kanban Preview) */}
              <section className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nhiệm vụ trọng tâm (Task Management)</h2>
                  <a href="/tasks" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                    Xem bảng Kanban <ChevronRight size={12} />
                  </a>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {tasks.map((task) => (
                    <div key={task.id} className="glass rounded-2xl p-5 hover-elevate bg-white/75 flex flex-col justify-between border border-white/60 h-44">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${task.priority === "Cao" ? "bg-rose-100 text-rose-700" : task.priority === "Trung bình" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                            Ưu tiên: {task.priority}
                          </span>
                          <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={14} /></button>
                        </div>
                        <p className="text-slate-800 font-heading font-bold text-sm leading-snug line-clamp-2">{task.title}</p>
                      </div>

                      <div className="space-y-3">
                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                            <span>Tiến độ</span>
                            <span className="text-blue-600 font-bold">{task.progress}%</span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${task.progress}%` }} />
                          </div>
                        </div>

                        {/* Task Footer Info */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-semibold">
                          <span className="flex items-center gap-1 text-slate-500"><Calendar size={12} /> {task.due}</span>
                          <div className="flex items-center gap-2">
                            {task.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip size={11} /> {task.attachments}</span>}
                            {task.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={11} /> {task.comments}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
