/* 인식 작업 목록: 늦게 온 응답이 새 목록의 엉뚱한 행에 들어가지 않는지, 다음 확인 순서 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextOpen, receiptJobs, type Job } from "./receipt-jobs";
import type { ReceiptResult } from "./server";

const tx = (merchant: string, isCancel = false) => ({ merchant, isCancel }) as ReceiptResult;
afterEach(() => { receiptJobs.clear(); vi.unstubAllGlobals(); });

describe("receiptJobs", () => {
  it("처리 중에 새 파일로 바꾸면 이전 요청의 응답은 버린다 (C23)", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const waiters: ((v: unknown) => void)[] = [];
    vi.stubGlobal("fetch", () => new Promise((r) => waiters.push(r)));
    const respond = (i: number, merchant: string) => waiters[i](new Response(JSON.stringify({ kind: "receipt", transactions: [tx(merchant)], ms: 1 })));

    receiptJobs.start([new File(["a"], "A.jpg")]);
    receiptJobs.start([new File(["b"], "B.jpg")]);
    respond(1, "B 가게");
    respond(0, "A 가게"); // A가 나중에 끝남
    await vi.waitFor(() => expect(receiptJobs.get()[0].status).toBe("done"));
    await new Promise((r) => setTimeout(r, 0));
    expect(receiptJobs.get()).toHaveLength(1);
    expect(receiptJobs.get()[0]).toMatchObject({ file: { name: "B.jpg" }, txs: [{ merchant: "B 가게" }], done: [false] });
  });
  it("음수 금액은 양수 + 취소로 한 번에 바꾼다", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ kind: "statement", transactions: [{ merchant: "가", total: -12000, isCancel: false }, { merchant: "나", total: 5000, isCancel: false }], ms: 1 })));
    receiptJobs.start([new File(["a"], "A.pdf")]);
    await vi.waitFor(() => expect(receiptJobs.get()[0].status).toBe("done"));
    expect(receiptJobs.get()[0].txs).toMatchObject([{ total: 12000, isCancel: true }, { total: 5000, isCancel: false }]);
  });
  it("다른 사용자로 바뀌면 이전 작업을 지운다", () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    receiptJobs.own("a");
    receiptJobs.start([new File(["a"], "A.jpg")]);
    receiptJobs.own("a");
    expect(receiptJobs.get()).toHaveLength(1);
    receiptJobs.own("demo");
    expect(receiptJobs.get()).toHaveLength(0);
  });
});

it("다음 확인 순서: 저장·건너뛴 건은 빼고, 취소 건은 맨 뒤 (C25)", () => {
  const job = (id: string, txs: ReceiptResult[], done: Job["done"]) => ({ id, txs, done }) as Job;
  const js = [job("a", [tx("취소", true), tx("가")], [false, "saved"]), job("b", [tx("나"), tx("다")], ["skipped", false])];
  expect(nextOpen(js)).toEqual(["b", 1]);
  expect(nextOpen([js[0]])).toEqual(["a", 0]);
  expect(nextOpen([job("c", [tx("라")], ["saved"])])).toBeNull();
});
