"use client";
/* 엑셀 내보내기 (RPT-04). 기간·파일 형식·포함할 열을 고르면 미리보기에 시트별 건수와 합계가 바로 보이고,
 * 버튼을 누르면 브라우저에서 파일을 만들어 내려받는다 (서버로 거래를 보내지 않음).
 * 다른 화면에서 ?from=YYYY-MM-DD&to=YYYY-MM-DD 로 기간을 넘겨 열 수 있다 (월간 요약의 "열 골라 내보내기") */
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Screen } from "@/components/shell";
import { Button, Card, CardTitle, Cap, Check, Chip, cx, Icon, Input, Note, Seg, won } from "@/components/ui";
import { useStore } from "@/lib/store";
import { daysInMonth, prevYm } from "@/lib/engine";
import { buildExport, DEFAULT_EXPORT, EXPORT_GROUPS, exportFileName, type ExportOptions } from "@/lib/export";
import { buildXlsx, downloadBlob, toCsv, XLSX_MIME } from "@/lib/xlsx";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const monthRange = (ym: string) => [`${ym}-01`, `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`] as const;

export default function ExportPage() {
  return (
    <Screen title="엑셀 내보내기" desc="거래내역·월별 요약·카테고리별·카드별 혜택 4개 시트로 내려받아요 (RPT-04)" back>
      <Suspense fallback={<Cap>불러오는 중…</Cap>}><ExportForm /></Suspense>
    </Screen>
  );
}

function ExportForm() {
  const { txns, month, today, categories, calcFor } = useStore();
  const qs = useSearchParams();
  const [initFrom, initTo] = monthRange(month);
  const [from, setFrom] = useState(ISO.test(qs.get("from") ?? "") ? qs.get("from")! : initFrom);
  const [to, setTo] = useState(ISO.test(qs.get("to") ?? "") ? qs.get("to")! : initTo);
  const [format, setFormat] = useState<"엑셀(.xlsx)" | "CSV">("엑셀(.xlsx)");
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [done, setDone] = useState<string | null>(null);

  const dates = useMemo(() => txns.map((t) => t.date).sort(), [txns]);
  const presets: [string, () => readonly [string, string]][] = [
    ["이번 달", () => monthRange(month)],
    ["지난 달", () => monthRange(prevYm(month))],
    ["최근 3개월", () => [monthRange(prevYm(prevYm(month)))[0], monthRange(month)[1]] as const],
    ["올해", () => [`${month.slice(0, 4)}-01-01`, `${month.slice(0, 4)}-12-31`] as const],
    ["전체 기간", () => [dates[0] ?? initFrom, dates[dates.length - 1] ?? today] as const],
  ];
  const active = presets.find(([, f]) => { const [a, b] = f(); return a === from && b === to; })?.[0];
  const invalid = !ISO.test(from) || !ISO.test(to) ? "날짜를 끝까지 입력해주세요" : from > to ? "시작일이 종료일보다 늦어요" : null;

  // 미리보기: 실제 파일과 같은 함수로 계산하므로 숫자가 그대로 파일에 들어간다
  const result = useMemo(() => (invalid ? null : buildExport({ txns, from, to, categories, calcFor, opts })), [invalid, txns, from, to, categories, calcFor, opts]);
  const sumOf = (sheet: number, header: string) => {
    const s = result?.sheets[sheet]; if (!s) return 0;
    const i = s.columns.findIndex((c) => c.header === header);
    return i < 0 ? 0 : s.rows.reduce((a, r) => a + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);
  };
  const isXlsx = format === "엑셀(.xlsx)";
  const file = exportFileName(from, to, isXlsx ? "xlsx" : "csv");

  const download = () => {
    if (!result || result.count === 0) return;
    if (isXlsx) downloadBlob(buildXlsx(result.sheets) as BlobPart, file, XLSX_MIME);
    else downloadBlob(toCsv(result.sheets[0]), file, "text/csv;charset=utf-8");
    setDone(file);
  };

  return (
    <div className="max-w-170 w-full mx-auto flex flex-col gap-5">
      <section className="flex flex-col gap-2" aria-labelledby="ex-period">
        <span id="ex-period" className="text-label font-semibold text-strong">기간</span>
        <div className="flex gap-2 flex-wrap">{presets.map(([k, f]) => <Chip key={k} on={active === k} onClick={() => { const [a, b] = f(); setFrom(a); setTo(b); setDone(null); }}>{k}</Chip>)}</div>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="시작일" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setDone(null); }} error={!!invalid} />
          <span className="text-muted" aria-hidden>~</span>
          <Input type="date" aria-label="종료일" value={to} min={from} onChange={(e) => { setTo(e.target.value); setDone(null); }} error={!!invalid} />
        </div>
        {invalid && <Cap className="text-red-700">{invalid}</Cap>}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="ex-format">
        <span id="ex-format" className="text-label font-semibold text-strong">파일 형식</span>
        <Seg items={["엑셀(.xlsx)", "CSV"] as const} value={format} onChange={(v) => { setFormat(v); setDone(null); }} className="md:w-80" />
        <Cap>{isXlsx ? "시트 4장 · 날짜·금액이 숫자로 들어가 바로 합계·정렬·필터가 돼요" : "거래내역 시트만 · 다른 가계부 앱으로 옮길 때 써요 (UTF-8)"}</Cap>
      </section>

      <Card className="gap-2">
        <CardTitle right={<Cap>날짜·구분·가맹점·카테고리·금액은 항상 포함</Cap>}>거래내역에 넣을 열</CardTitle>
        <div className="flex flex-col">
          {EXPORT_GROUPS.map((g, i) => (
            <label key={g.key} className={cx("flex items-center gap-2.5 min-h-12 cursor-pointer", i < EXPORT_GROUPS.length - 1 && "border-b border-line")}>
              <Check on={opts[g.key]} onChange={(v) => { setOpts((o) => ({ ...o, [g.key]: v })); setDone(null); }} label={g.label} />
              <span className="flex-1 flex flex-col"><span className="text-label text-strong">{g.label}</span><Cap>{g.desc}</Cap></span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="gap-3" aria-live="polite">
        <CardTitle right={<Icon name="table_view" className="text-muted" />}>미리보기</CardTitle>
        {result && result.count > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[["지출", sumOf(0, "지출(원)")], ["수입", sumOf(0, "수입(원)")], ["받은 혜택", sumOf(0, "받은 혜택(원)")]].map(([l, v]) => (
                <div key={l as string} className="rounded-md bg-gray-50 px-3 py-2.5 flex flex-col gap-0.5"><Cap>{l}</Cap><span className="text-num-sm text-strong tabular-nums">{won(v as number)}</span></div>
              ))}
            </div>
            <ul className="m-0 p-0 list-none flex flex-col">
              {(isXlsx ? result.sheets : result.sheets.slice(0, 1)).map((s) => (
                <li key={s.name} className="flex items-center justify-between py-2 border-b border-line last:border-0 text-label">
                  <span className="text-strong">{s.name}</span><Cap>{s.rows.length}행 · {s.columns.length}열{s.footer && isXlsx ? " · 합계 행" : ""}</Cap>
                </li>
              ))}
            </ul>
            {!opts.benefit && <Cap>받은 혜택 열을 빼도 월별 요약·카드별 혜택 시트에는 혜택이 들어가요.</Cap>}
          </>
        ) : (
          <Cap>{invalid ? "기간을 바르게 고르면 미리보기가 나와요." : "이 기간에는 거래가 없어요. 다른 기간을 골라주세요."}</Cap>
        )}
      </Card>

      <div className="flex flex-col gap-2">
        <Button icon="download" onClick={download} disabled={!result || result.count === 0}>{result && result.count > 0 ? `${file} 내려받기 (거래 ${result.count}건)` : "내려받을 거래가 없어요"}</Button>
        {done && <Note tone="violet" icon="check_circle">{done} 파일을 만들었어요. 브라우저의 다운로드 폴더를 확인해주세요.</Note>}
        <Cap>파일은 이 기기에서 바로 만들어지고 서버로 보내지 않아요. 카드번호는 들어가지 않아요. 혜택 금액은 참고용 계산값이에요.</Cap>
      </div>
    </div>
  );
}
