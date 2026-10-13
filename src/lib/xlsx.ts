/* 최소 .xlsx 작성기 — 외부 라이브러리 없이 OOXML(SpreadsheetML) + 무압축 zip을 직접 만든다.
 *
 * 왜 직접: 필요한 건 "시트 여러 장, 머리글 굵게, 숫자·날짜·퍼센트 서식, 첫 줄 고정, 필터, 합계 수식"뿐이라
 * SheetJS(~900KB)·ExcelJS를 번들에 넣을 이유가 없다. 파일 구조는 ECMA-376 최소 구성:
 *
 *   [Content_Types].xml            각 파트의 MIME
 *   _rels/.rels                    패키지 → workbook
 *   xl/workbook.xml                시트 목록, 필터 정의 이름
 *   xl/_rels/workbook.xml.rels     workbook → 시트들, styles
 *   xl/styles.xml                  글꼴·채우기·숫자 서식(cellXfs)
 *   xl/worksheets/sheetN.xml       셀. 문자열은 inlineStr(공유 문자열 표 없이)
 *
 * zip은 "저장(압축 안 함)" 방식 + CRC32. 거래 수천 건이어도 수 MB 이하라 압축 없이 충분하다.
 * ponytail: 압축이 필요해지면 CompressionStream("deflate-raw")로 바꾸면 된다 (브라우저 내장) */

export type ColType = "text" | "int" | "num" | "pct" | "date"; // num = 소수 둘째 자리까지 (외화 원래 금액·주유량)
export type SheetColumn = { header: string; type?: ColType; width?: number };
export type CellValue = string | number | null | undefined;
/** 합계 행 셀: 값 그대로, 또는 { sum: true }면 그 열 데이터 범위의 SUM 수식(+미리 계산한 값) */
export type FooterCell = CellValue | { sum: true };
export type SheetSpec = { name: string; columns: SheetColumn[]; rows: CellValue[][]; footer?: FooterCell[] };

/* ── 셀 서식 (styles.xml cellXfs의 순서와 1:1) ── */
const XF = { text: 0, header: 1, int: 2, pct: 3, date: 4, footText: 5, footInt: 6, footPct: 7, num: 8 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="#,##0.##"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Malgun Gothic"/><family val="2"/></font><font><b/><sz val="11"/><name val="Malgun Gothic"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* ── XML 도우미 ── */
// XML 1.0에서 허용 안 되는 제어 문자는 지운다 (OCR 결과에 섞여 들어오면 엑셀이 파일을 못 연다)
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const xmlEscape = (s: string) => s.replace(BAD_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 0 → A, 25 → Z, 26 → AA */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "2026-09-20" → 엑셀 날짜 일련번호 (1900 날짜 체계, 1899-12-30 기준). 형식이 아니면 null */
export function excelDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

/** 시트 이름 규칙: 31자 이하, []:*?/\ 금지, 중복 금지 */
function sheetNames(names: string[]) {
  const used = new Set<string>();
  return names.map((n, i) => {
    let s = (n.replace(/[[\]:*?/\\]/g, " ").trim() || `Sheet${i + 1}`).slice(0, 31);
    for (let k = 2; used.has(s.toLowerCase()); k++) s = `${s.slice(0, 28)} ${k}`;
    used.add(s.toLowerCase());
    return s;
  });
}

function cellXml(ref: string, v: CellValue, type: ColType, foot = false): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = type === "pct" ? (foot ? XF.footPct : XF.pct) : type === "date" ? XF.date : type === "int" ? (foot ? XF.footInt : XF.int) : type === "num" ? XF.num : foot ? XF.footText : XF.text;
    return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  }
  const str = String(v);
  if (type === "date") { const n = excelDate(str); if (n !== null) return `<c r="${ref}" s="${XF.date}"><v>${n}</v></c>`; }
  // 문자열 셀은 수식으로 해석되지 않는다 (=, + 로 시작하는 가맹점명도 안전)
  return `<c r="${ref}" t="inlineStr" s="${foot ? XF.footText : XF.text}"><is><t xml:space="preserve">${xmlEscape(str)}</t></is></c>`;
}

function sheetXml(sp: SheetSpec): string {
  const nCol = sp.columns.length, nData = sp.rows.length;
  const last = colName(Math.max(0, nCol - 1));
  const cols = sp.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.max(8, Math.min(40, c.header.length * 2 + 4))}" customWidth="1"/>`).join("");
  const rows: string[] = [];
  rows.push(`<row r="1">${sp.columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${XF.header}"><is><t xml:space="preserve">${xmlEscape(c.header)}</t></is></c>`).join("")}</row>`);
  sp.rows.forEach((r, ri) => {
    const rn = ri + 2;
    rows.push(`<row r="${rn}">${sp.columns.map((c, ci) => cellXml(`${colName(ci)}${rn}`, r[ci], c.type ?? "text")).join("")}</row>`);
  });
  if (sp.footer) {
    const rn = nData + 2;
    const cells = sp.columns.map((c, ci) => {
      const f = sp.footer![ci];
      const ref = `${colName(ci)}${rn}`;
      if (f && typeof f === "object") {
        // 합계 수식 + 미리 계산한 값 (수식을 다시 계산하지 않는 뷰어에서도 숫자가 보이도록)
        const sum = sp.rows.reduce((s, r) => s + (typeof r[ci] === "number" ? (r[ci] as number) : 0), 0);
        const range = nData > 0 ? `${colName(ci)}2:${colName(ci)}${nData + 1}` : null;
        const s = c.type === "pct" ? XF.footPct : XF.footInt;
        return range ? `<c r="${ref}" s="${s}"><f>SUM(${range})</f><v>${sum}</v></c>` : `<c r="${ref}" s="${s}"><v>0</v></c>`;
      }
      return cellXml(ref, f, c.type === "pct" || c.type === "int" ? c.type : "text", true) || `<c r="${ref}" s="${XF.footText}"/>`;
    }).join("");
    rows.push(`<row r="${rn}">${cells}</row>`);
  }
  const filter = nCol > 0 ? `<autoFilter ref="A1:${last}${nData + 1}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16.5"/>
${cols ? `<cols>${cols}</cols>` : ""}
<sheetData>${rows.join("")}</sheetData>
${filter}
</worksheet>`;
}

/** 시트 목록 → .xlsx 바이트 */
export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  if (sheets.length === 0) throw new Error("시트가 하나 이상 필요해요");
  const names = sheetNames(sheets.map((s) => s.name));
  const n = sheets.length;
  const files: [string, string][] = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((nm, i) => `<sheet name="${xmlEscape(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${sheets.map((s, i) => s.columns.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEscape(names[i].replace(/'/g, "''"))}'!$A$1:$${colName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>` : "").join("")}</definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ];
  const enc = new TextEncoder();
  return zipStore(files.map(([name, body]) => ({ name, data: enc.encode(body) })));
}

/* ── zip (저장 방식) ── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  // 고정 시각(2026-01-01 00:00)으로 써서 같은 입력이면 같은 바이트가 나오게 한다 (테스트 재현성)
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    local.push(new Uint8Array(lh.buffer), name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, DOS_TIME, true); ch.setUint16(14, DOS_DATE, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

/* ── CSV (엑셀 없는 환경·다른 가계부 앱 가져오기용) ── */
/** 첫 시트만 CSV로. UTF-8 BOM을 붙여 엑셀이 한글을 깨뜨리지 않게 하고,
 *  =,+,-,@ 로 시작하는 문자열 앞에 ' 를 붙여 수식 주입(CSV injection)을 막는다 */
/** footer=true면 마지막에 합계 행. 다른 가계부 앱으로 옮길 때는 합계 행이 거래로 잘못 들어가므로 기본은 넣지 않는다 */
export function toCsv(sheet: SheetSpec, footer = false): string {
  const esc = (v: CellValue) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const foot = !footer ? undefined : sheet.footer?.map((f, i) => (f && typeof f === "object" ? sheet.rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) : f));
  const lines = [sheet.columns.map((c) => esc(c.header)), ...sheet.rows.map((r) => sheet.columns.map((_, i) => esc(r[i]))), ...(foot ? [foot.map(esc)] : [])];
  return "﻿" + lines.map((l) => l.join(",")).join("\r\n") + "\r\n";
}

/** 브라우저에서 파일 내려받기 */
export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
