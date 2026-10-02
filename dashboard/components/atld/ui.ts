// Kiểu nút dùng chung của Kho BHLĐ — mọi nút thanh công cụ cùng cao 36px (h-9),
// cùng viền 1px (nút đặc dùng viền trong suốt) để thẳng hàng tuyệt đối.
const BASE =
  "h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl border text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default";

export const BTN_PRIMARY = `${BASE} border-transparent bg-[#005BAC] hover:bg-blue-700 text-white shadow-sm`;
export const BTN_SUCCESS = `${BASE} border-transparent bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm`;
export const BTN_OUTLINE = `${BASE} bg-white border-slate-200 hover:border-slate-300 text-slate-600`;
export const BTN_OUTLINE_SUCCESS = `${BASE} bg-white border-emerald-200 hover:border-emerald-300 text-emerald-700`;

// Ô nhập / khung điều khiển cùng chiều cao với nút.
export const CONTROL_BOX = "h-9 flex items-center rounded-xl bg-white border border-slate-200";
