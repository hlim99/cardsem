import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* 공용 데모 계정 세션 발급. 로그인하지 않은 방문자의 데모 장부를 서버(Supabase)에 저장하려고, 서버가 데모 계정으로 로그인해 토큰만 넘긴다.
 * 비밀번호(DEMO_PASSWORD)는 서버 환경변수에만 두어 브라우저 번들에 들어가지 않는다.
 * 데모 계정은 모든 방문자가 같이 쓰는 장부다 — RLS 덕분에 다른 사용자의 행은 여전히 못 본다 */
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL, password = process.env.DEMO_PASSWORD;
  if (!url || !key || !email || !password) return NextResponse.json({ error: "데모 계정이 설정되지 않았어요" }, { status: 503 });
  // 요청마다 새 클라이언트: 서버에서 세션을 저장·갱신하지 않는다 (요청끼리 섞이지 않게)
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return NextResponse.json({ error: error?.message ?? "데모 계정으로 로그인하지 못했어요" }, { status: 502 });
  return NextResponse.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}
