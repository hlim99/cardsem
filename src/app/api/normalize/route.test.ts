import { beforeEach, describe, expect, it, vi } from "vitest";

// AI는 가짜로 — 라우트가 원문 · 출처 페이지를 무엇으로 넘기는지만 본다
const readCardPage = vi.fn();
const normalizeRules = vi.fn(async () => []);
vi.mock("@/lib/ai/server", () => ({ readCardPage, normalizeRules, aiErrorMessage: (e: Error) => e.message }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_READY: false, supabase: () => null }));
const { POST } = await import("./route");

const call = (body: object) => POST(new Request("http://x/api/normalize", { method: "POST", body: JSON.stringify(body) })).then((r) => r.json());
const page = { name: "Mr.Life", issuer: "신한", text: "페이지 본문: 편의점 10% 할인" };

describe("/api/normalize — 원문 · 출처 URL", () => {
  beforeEach(() => { readCardPage.mockReset(); normalizeRules.mockClear(); });

  it("원문 + URL을 둘 다 넣으면 출처 페이지도 읽어 원문과 함께 규칙 근거로 쓴다", async () => {
    readCardPage.mockResolvedValue(page);
    const r = await call({ rawText: "원문: 통신 5천원 할인", cardId: "custom_1", cardName: "Mr.Life", sourceUrl: "https://www.shinhancard.com/mrlife" });
    expect(readCardPage).toHaveBeenCalledWith("https://www.shinhancard.com/mrlife");
    expect(normalizeRules).toHaveBeenCalledWith("원문: 통신 5천원 할인", "custom_1", "Mr.Life", page.text);
    expect(r).toEqual({ rules: [], sourceRead: true });
  });

  it("원문 + URL인데 페이지를 못 읽으면 원문만으로 만들고 sourceRead=false", async () => {
    readCardPage.mockRejectedValue(new Error("못 읽음"));
    const r = await call({ rawText: "원문", cardId: "custom_1", cardName: "카드", sourceUrl: "https://www.shinhancard.com/x" });
    expect(normalizeRules).toHaveBeenCalledWith("원문", "custom_1", "카드", undefined);
    expect(r.sourceRead).toBe(false);
  });

  it("원문 + 내부망 주소는 열지 않는다", async () => {
    await call({ rawText: "원문", cardId: "c", sourceUrl: "http://192.168.0.1/" });
    expect(readCardPage).not.toHaveBeenCalled();
  });

  it("URL만 넣으면 예전처럼 페이지로 카드명 · 원문까지 채운다", async () => {
    readCardPage.mockResolvedValue(page);
    const r = await call({ rawText: "", cardId: "custom_1", cardName: "", sourceUrl: "https://www.shinhancard.com/mrlife" });
    expect(normalizeRules).toHaveBeenCalledWith(page.text, "custom_1", "Mr.Life");
    expect(r.page).toEqual(page);
  });
});
