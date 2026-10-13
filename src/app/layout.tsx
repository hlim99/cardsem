import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DemoProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "카드셈 · AI 카드 혜택 가계부",
  description: "가진 카드의 혜택을 결제마다 셈해서 받은 혜택과 놓친 혜택을 보여줘요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6B43F2", // = --color-primary (메타 태그라 CSS 변수를 못 씀)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <head>
        {/* ponytail: 디자인 시스템과 동일하게 CDN 폰트를 그대로 씀. 셀프호스팅은 배포 시 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 아이콘은 .msr이 opsz 24·wght 400·GRAD 0으로 고정하고 FILL만 바꾸므로 그 축만 받는다 (가변 폰트 크기 축소).
            icon_names로 더 줄일 수 있지만 아이콘을 쓸 때마다 목록을 고쳐야 해서 두지 않음 */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
        />
      </head>
      <body className="min-h-full">
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
