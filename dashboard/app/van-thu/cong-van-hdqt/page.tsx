"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CongVanHdqtPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/document-control?tab=outgoing_hdqt");
  }, [router]);

  return null;
}
