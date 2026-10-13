import { redirect } from "next/navigation";

// 어드민 첫 화면은 카드 상품 목록 (현황 대시보드는 시연에 방해돼 뺐다)
export default function AdminHome() {
  redirect("/admin/cards");
}
