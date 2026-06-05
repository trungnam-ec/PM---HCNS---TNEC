"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VanThuPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/document-control");
  }, [router]);

  return null;
}
