"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Search,
  Plus,
  Filter,
  MoreHorizontal,
  Mail,
  Phone,
  Building,
  UserCheck,
  Calendar,
  Briefcase,
  Download,
  Trash2,
  Edit
} from "lucide-react";

// --- MOCK DATA ---
const INITIAL_EMPLOYEES = [
  { id: "EMP-001", name: "Nguyễn Xuân Bình", department: "Phòng Kỹ Thuật", position: "Trưởng phòng Kỹ thuật", status: "Chính thức", start: "2021-03-01", phone: "0912 111 222", email: "binh.nx@trungnamec.com.vn", avatar: "XB" },
  { id: "EMP-002", name: "Phạm Minh Tâm", department: "Phòng Hành Chính Nhân Sự", position: "Chuyên viên C&B", status: "Chính thức", start: "2023-05-15", phone: "0917 222 333", email: "tam.pm@trungnamec.com.vn", avatar: "MT" },
  { id: "EMP-003", name: "Lê Thành Đạt", department: "Phòng Hành Chính Nhân Sự", position: "Chuyên viên Tuyển dụng Cao cấp", status: "Chính thức", start: "2022-10-01", phone: "0918 333 444", email: "dat.lt@trungnamec.com.vn", avatar: "TD" },
  { id: "EMP-004", name: "Trần Thị Mai", department: "Phòng Hành Chính Nhân Sự", position: "Chuyên viên Hành chính", status: "Chính thức", start: "2020-01-10", phone: "0905 444 555", email: "mai.tt@trungnamec.com.vn", avatar: "TM" },
  { id: "EMP-005", name: "Nguyễn Hoàng Huy", department: "Phòng Trợ Lý", position: "Chuyên viên Kiểm soát tài liệu", status: "Chính thức", start: "2024-02-01", phone: "0909 555 666", email: "huy.nh@trungnamec.com.vn", avatar: "HH" },
  { id: "EMP-006", name: "Bùi Quốc Vương", department: "Phòng Kế Hoạch", position: "Chuyên viên Đấu thầu", status: "Thử việc", start: "2025-05-01", phone: "0906 666 777", email: "vuong.bq@trungnamec.com.vn", avatar: "QV" },
  { id: "EMP-007", name: "Nguyễn Văn Đấu", department: "Phòng Dự Án", position: "Kỹ sư Kế hoạch", status: "Thử việc", start: "2025-05-15", phone: "0907 777 888", email: "dau.nv@trungnamec.com.vn", avatar: "VD" }
];

export default function EmployeeManagementPage() {
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  
  // New Employee Form State
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("Phòng Hành Chính Nhân Sự");
  const [newPos, setNewPos] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPos) return;

    const newEmp = {
      id: `EMP-0${employees.length + 1}`,
      name: newName,
      department: newDept,
      position: newPos,
      status: "Thử việc",
      start: new Date().toISOString().slice(0, 10),
      phone: newPhone || "N/A",
      email: newEmail || "N/A",
      avatar: newName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    };

    setEmployees([...employees, newEmp]);
    setShowAddModal(false);
    // Reset Form
    setNewName("");
    setNewPos("");
    setNewPhone("");
    setNewEmail("");
  };

  const handleDelete = (id: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa nhân viên ${id}?`)) {
      setEmployees(employees.filter(emp => emp.id !== id));
    }
  };

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) || 
                        emp.id.toLowerCase().includes(search.toLowerCase()) ||
                        emp.email.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === "all" || emp.department === filterDept;
    return matchSearch && matchDept;
  });

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quản lý Nhân sự" subtitle="Quản lý thông tin hồ sơ nhân sự, phòng ban và chức vụ" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, mã NV, email..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                />
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-sm">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="text-xs text-slate-600 bg-transparent outline-none font-semibold cursor-pointer"
                >
                  <option value="all">Tất cả phòng ban</option>
                  <option value="Phòng Hành Chính Nhân Sự">Hành Chính Nhân Sự</option>
                  <option value="Phòng Kỹ Thuật">Phòng Kỹ Thuật</option>
                  <option value="Phòng Dự Án">Phòng Dự Án</option>
                  <option value="Phòng Kế Hoạch">Phòng Kế Hoạch</option>
                  <option value="Phòng Trợ Lý">Phòng Trợ Lý</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                <Download size={14} /> Xuất file Excel
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10"
              >
                <Plus size={14} /> Thêm nhân viên
              </button>
            </div>
          </div>

          {/* Employee Table */}
          <div className="glass rounded-2xl overflow-hidden border border-slate-200/50 shadow-premium">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200/60">
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Nhân viên</th>
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Mã NV</th>
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Phòng ban / Chức vụ</th>
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Liên hệ</th>
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Ngày bắt đầu</th>
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((emp) => (
                    <tr key={emp.id} className="hover:bg-blue-50/20 bg-white/50 transition-all">
                      {/* Name & Avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0">
                            {emp.avatar}
                          </div>
                          <div>
                            <p className="font-heading font-bold text-slate-800 text-sm">{emp.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* ID */}
                      <td className="px-6 py-4 font-mono text-xs text-slate-500 font-semibold">{emp.id}</td>

                      {/* Dept & Position */}
                      <td className="px-6 py-4 space-y-0.5">
                        <p className="text-slate-700 text-xs font-semibold flex items-center gap-1"><Building size={11} className="text-slate-400" /> {emp.department}</p>
                        <p className="text-slate-400 text-[10px] font-semibold flex items-center gap-1"><Briefcase size={11} className="text-slate-400" /> {emp.position}</p>
                      </td>

                      {/* Contact */}
                      <td className="px-6 py-4 space-y-0.5 text-xs text-slate-500">
                        <p className="flex items-center gap-1.5"><Phone size={11} /> {emp.phone}</p>
                        <p className="flex items-center gap-1.5"><Mail size={11} /> {emp.email}</p>
                      </td>

                      {/* Start Date */}
                      <td className="px-6 py-4 text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-2"><Calendar size={13} /> {emp.start}</td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`badge text-[10px] ${emp.status === "Chính thức" ? "badge-pass" : "badge-wait"}`}>
                          {emp.status === "Chính thức" ? "✓ Chính thức" : "⏳ Thử việc"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-500 transition-colors" title="Chỉnh sửa"><Edit size={13} /></button>
                          <button onClick={() => handleDelete(emp.id)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-500 transition-colors" title="Xóa nhân sự"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-xs italic">Không tìm thấy nhân viên nào phù hợp</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-md overflow-hidden p-6 space-y-4 border border-white">
            <h3 className="font-heading font-extrabold text-slate-800 text-base">Thêm mới nhân sự</h3>
            
            <form onSubmit={handleAddEmployee} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold">Họ và tên nhân viên</label>
                <input
                  type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold">Phòng ban</label>
                <select
                  value={newDept} onChange={(e) => setNewDept(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                >
                  <option value="Phòng Hành Chính Nhân Sự">Hành Chính Nhân Sự</option>
                  <option value="Phòng Kỹ Thuật">Phòng Kỹ Thuật</option>
                  <option value="Phòng Dự Án">Phòng Dự Án</option>
                  <option value="Phòng Kế Hoạch">Phòng Kế Hoạch</option>
                  <option value="Phòng Trợ Lý">Phòng Trợ Lý</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold">Chức vụ / Vị trí</label>
                <input
                  type="text" required value={newPos} onChange={(e) => setNewPos(e.target.value)}
                  placeholder="Ví dụ: Kỹ sư cầu đường"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold">Số điện thoại</label>
                <input
                  type="text" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Ví dụ: 0912 345 678"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold">Email làm việc</label>
                <input
                  type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Ví dụ: nv.a@trungnamec.com.vn"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  Thêm nhân viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
