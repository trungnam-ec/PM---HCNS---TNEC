"use client";

// Đọc bản Chính sách bảo mật hiện hành (dòng mới nhất trong privacy_policy_versions).
// Bảng trống hoặc lỗi đọc -> dùng bản mặc định trong lib/privacyPolicy.ts, để mọi
// tài khoản luôn có chính sách để đọc và xác nhận.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  DEFAULT_BODY,
  DEFAULT_EFFECTIVE_DATE,
  DEFAULT_VERSION,
  type PolicyVersionRow,
} from "./privacyPolicy";

export type CurrentPolicy = {
  loading: boolean;
  version: string;
  effectiveDate: string;
  body: string;
  /** Lịch sử các lần lưu, mới nhất trước. Rỗng nếu chưa ai sửa. */
  history: PolicyVersionRow[];
  reload: () => void;
};

export function usePrivacyPolicy(): CurrentPolicy {
  const [state, setState] = useState<Omit<CurrentPolicy, "reload">>({
    loading: true,
    version: DEFAULT_VERSION,
    effectiveDate: DEFAULT_EFFECTIVE_DATE,
    body: DEFAULT_BODY,
    history: [],
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("privacy_policy_versions")
      .select("id, version, effective_date, body, edited_by, created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data || data.length === 0) {
          if (error) console.error("Error loading privacy policy:", error);
          setState(prev => ({ ...prev, loading: false, history: [] }));
          return;
        }
        const rows = data as PolicyVersionRow[];
        setState({
          loading: false,
          version: rows[0].version,
          effectiveDate: rows[0].effective_date,
          body: rows[0].body,
          history: rows,
        });
      });
    return () => {
      mounted = false;
    };
  }, [tick]);

  return { ...state, reload };
}
