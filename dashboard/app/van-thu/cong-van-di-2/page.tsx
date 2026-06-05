"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CongVanDi2Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/document-control?tab=outgoing_2");
  }, [router]);

  return null;
}
