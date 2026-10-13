/* Supabase 브라우저 클라이언트. .env.local에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 있을 때만 켜짐.
 * 없으면 SUPABASE_READY=false 이고 스토어는 localStorage 데모 모드로만 돈다. 스키마는 supabase/schema.sql */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_READY = !!url && !!key;
/** 공용 데모 계정 이메일. 있으면 로그인하지 않은 방문자도 이 계정으로 붙어 데모 장부가 서버에 저장된다 (/api/demo, store.tsx).
 *  없으면 예전처럼 이 브라우저(localStorage)에만 저장 */
export const DEMO_EMAIL = SUPABASE_READY ? process.env.NEXT_PUBLIC_DEMO_EMAIL || null : null;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!SUPABASE_READY) throw new Error("Supabase 환경변수가 없어요 (.env.local)");
  client ??= createClient(url!, key!);
  return client;
}

/* Auth 에러를 한국어 한 줄로 */
export function authErrorMessage(e: unknown) {
  const m = (e as { message?: string })?.message ?? "";
  if (/invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 맞지 않아요";
  if (/email not confirmed/i.test(m)) return "이메일 인증이 아직이에요. 받은 메일의 링크를 눌러주세요";
  if (/already registered|already exists/i.test(m)) return "이미 가입된 이메일이에요";
  if (/password should be at least/i.test(m)) return "비밀번호는 8자 이상이어야 해요";
  if (/session missing/i.test(m)) return "재설정 링크로 다시 들어와주세요"; // 재설정 화면에서 세션 없이 updateUser
  if (/rate limit/i.test(m)) return "요청이 너무 잦아요. 잠시 후 다시 시도해주세요";
  return m || "잠시 후 다시 시도해주세요";
}
