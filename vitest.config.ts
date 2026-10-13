import { defineConfig } from "vitest/config";

// 테스트는 src 아래만. .claude/worktrees 같은 다른 작업 사본의 테스트까지 모으지 않게 한다
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
