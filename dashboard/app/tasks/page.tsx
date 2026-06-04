"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  Calendar,
  Paperclip,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  User,
  ArrowUpDown,
  X,
  Loader2
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  priority: string;
  assignee: string;
  due_date: string;
  progress: number;
  attachments: number;
  comments: number;
  status: string;
}

const COLUMNS = [
  { id: "planning", title: "Lập kế hoạch", color: "border-t-slate-400" },
  { id: "in_progress", title: "Đang thực hiện", color: "border-t-blue-500" },
  { id: "pending_approval", title: "Chờ phê duyệt", color: "border-t-purple-500" },
  { id: "need_revision", title: "Cần chỉnh sửa", color: "border-t-rose-500" },
  { id: "completed", title: "Đã hoàn thành", color: "border-t-emerald-500" },
];

export default function TaskManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newPriority, setNewPriority] = useState("Trung bình");
  const [newDueDate, setNewDueDate] = useState("");
  const [newProgress, setNewProgress] = useState(0);

  // Drag State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Fetch Tasks from Supabase
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (data) {
        // Map database fields to interface
        const mappedTasks = data.map((t: any) => ({
          id: t.id,
          title: t.title,
          priority: t.priority || "Trung bình",
          assignee: t.assignee || "Chưa phân công",
          due_date: t.due_date || "",
          progress: t.progress || 0,
          attachments: t.attachments || 0,
          comments: t.comments || 0,
          status: t.status || "planning"
        }));
        setTasks(mappedTasks);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Handle Drag Start
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  // Handle Drop
  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = draggedTaskId || e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    // Optimistic UI Update
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status: columnId } : t);
    setTasks(updatedTasks);

    // Update in Supabase
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: columnId })
        .eq("id", taskId);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating task status:", err);
      // Rollback on error
      fetchTasks();
    } finally {
      setDraggedTaskId(null);
    }
  };

  // Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert([{
          title: newTitle,
          assignee: newAssignee || "Chưa phân công",
          priority: newPriority,
          due_date: newDueDate || null,
          progress: Number(newProgress),
          status: "planning"
        }])
        .select();

      if (error) throw error;

      // Reset Form & Close Modal
      setNewTitle("");
      setNewAssignee("");
      setNewPriority("Trung bình");
      setNewDueDate("");
      setNewProgress(0);
      setIsModalOpen(false);

      // Refresh tasks
      fetchTasks();
    } catch (err) {
      console.error("Error creating task:", err);
      alert("Lỗi khi tạo công việc!");
    }
  };

  // Delete Task
  const handleDeleteTask = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa công việc này?")) return;
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      fetchTasks();
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

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
              <button 
                onClick={fetchTasks}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              >
                Tải lại
              </button>
            </div>

            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10"
            >
              <Plus size={14} /> Thêm công việc
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-slate-400 gap-2">
              <Loader2 className="animate-spin text-blue-600" size={28} />
              <p className="text-xs font-semibold">Đang tải công việc từ Supabase...</p>
            </div>
          ) : (
            /* Kanban Board Container */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-start overflow-x-auto pb-4">
              {COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter(t => t.status === col.id);
                return (
                  <div 
                    key={col.id} 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, col.id)}
                    className="flex flex-col gap-4 min-w-[220px] bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50 min-h-[500px]"
                  >
                    {/* Column Header */}
                    <div className={`flex items-center justify-between border-t-2 ${col.color} pt-2`}>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-xs text-slate-700">{col.title}</span>
                        <span className="text-[10px] font-extrabold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                      </div>
                      <button 
                        onClick={() => {
                          setIsModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Task Cards */}
                    <div className="space-y-3 flex-1">
                      {colTasks.map((task) => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          className="glass rounded-xl p-4 bg-white hover-elevate border border-slate-200/40 flex flex-col justify-between h-36 cursor-grab active:cursor-grabbing relative group"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                                task.priority === "Cao" ? "bg-rose-100 text-rose-700" :
                                task.priority === "Trung bình" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                              }`}>
                                {task.priority}
                              </span>
                              <button 
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={12} />
                              </button>
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
                              <span className="flex items-center gap-0.5">
                                <Calendar size={10} /> {task.due_date ? new Date(task.due_date).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit' }) : "Không hạn"}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {task.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip size={10} /> {task.attachments}</span>}
                                {task.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {task.comments}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <div className="h-32 border-2 border-dashed border-slate-200/50 rounded-xl flex items-center justify-center text-slate-300 text-xs italic">
                          Kéo thả vào đây
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Add Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-bold text-sm text-slate-800">Thêm công việc mới</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600">Tên công việc</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Soạn thảo văn bản, Ký hợp đồng..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Người thực hiện</label>
                  <input
                    type="text"
                    placeholder="Tên nhân viên..."
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Mức độ ưu tiên</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Thấp">Thấp</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Cao">Cao</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Hạn chót</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Tiến độ (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newProgress}
                    onChange={(e) => setNewProgress(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl"
                >
                  Tạo mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
