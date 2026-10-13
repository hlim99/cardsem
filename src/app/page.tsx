import { redirect } from "next/navigation";

// 첫 화면은 로그인. 데모는 로그인 화면의 '데모 보기'로 들어간다 (로그인한 사용자는 로그인 화면이 홈으로 보낸다)
export default function Root() {
  redirect("/login");
}
