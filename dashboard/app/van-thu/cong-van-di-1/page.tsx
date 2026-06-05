"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CongVanDi1Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/document-control?tab=outgoing_1");
  }, [router]);

  return null;
}
