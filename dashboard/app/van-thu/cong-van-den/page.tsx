"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CongVanDenPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/document-control?tab=incoming");
  }, [router]);

  return null;
}
