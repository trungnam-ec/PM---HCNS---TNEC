// Kiểu dùng chung cho module "Vị trí dự án".

// Phần định vị/chi tiết của một dự án (khớp bảng public.project_locations).
export type Located = {
  id: string;
  bdh_name: string;
  name: string | null;
  package: string | null;
  investor: string | null;
  progress: string | null;
  status: string | null;
  project_type: string | null;
  province: string | null;
  lat: number;
  lng: number;
  kml_url: string | null;
  google_earth_url: string | null;
  panorama_url: string | null;
  sheet_url: string | null; // link Google Sheet (migration 095)
  attachment_path: string | null; // tệp ảnh/PDF trong kho project-files (095)
  attachment_name: string | null;
};

// Một dự án = một BĐH (lấy từ departments); loc = null nghĩa là chưa có toạ độ.
export type ProjectItem = {
  bdhName: string;
  loc: Located | null;
};
