import { it, expect } from "vitest";
import { DEFAULT_CATEGORIES, deleteCategory } from "./merchants";
import type { RecurringRule, Transaction } from "../types";

const s = {
  categories: DEFAULT_CATEGORIES,
  txns: [{ id: "a", categoryId: "food.cafe" }, { id: "b", categoryId: "food" }, { id: "c", categoryId: "transport.taxi" }] as Transaction[],
  recurring: [{ id: "r", categoryId: "food.out" }] as RecurringRule[],
  budgets: [{ amount: 1 }, { categoryId: "food", amount: 2 }, { categoryId: "food.cafe", amount: 3 }, { categoryId: "transport", amount: 4 }],
};

it("상위 삭제 시 하위까지 지우고 거래·반복 거래는 '기타'로, 예산은 삭제", () => {
  const r = deleteCategory(s, "food");
  expect(r.categories.some((c) => c.id === "food" || c.parentId === "food")).toBe(false);
  expect(r.txns.map((t) => t.categoryId)).toEqual(["etc", "etc", "transport.taxi"]);
  expect(r.recurring[0].categoryId).toBe("etc");
  expect(r.budgets).toEqual([{ amount: 1 }, { categoryId: "transport", amount: 4 }]);
});
it("수입 카테고리는 '기타 수입'으로", () => {
  const r = deleteCategory({ ...s, txns: [{ id: "i", categoryId: "salary" }] as Transaction[] }, "salary");
  expect(r.txns[0].categoryId).toBe("income.etc");
});
it("'기타'는 지울 수 없음", () => expect(deleteCategory(s, "etc")).toBe(s));
