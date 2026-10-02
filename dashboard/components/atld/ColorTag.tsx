// Nhãn màu sắc sản phẩm: chấm màu + chữ. Màu ngoài COLOR_OPTIONS (dữ liệu cũ)
// hiện chấm xám để vẫn đọc được chữ.
const DOT: Record<string, string> = {
  "Trắng": "bg-white border border-slate-300",
  "Vàng": "bg-yellow-400",
  "Xanh": "bg-blue-500",
  "Đỏ": "bg-rose-500",
};

export default function ColorTag({ color }: { color: string | null | undefined }) {
  if (!color) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[color] || "bg-slate-400"}`} />
      {color}
    </span>
  );
}
