"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Module "Kế toán" hiện chỉ có một mục con "Hồ sơ thanh toán" -> mở thẳng vào đó.
export default function KeToanPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ke-toan/ho-so-thanh-toan");
  }, [router]);
  return null;
}
