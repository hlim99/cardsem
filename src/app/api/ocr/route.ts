import { NextResponse } from "next/server";
import convert from "heic-convert";
import { aiErrorMessage, ocrDocument, type DocMedia } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 90;
const TYPES: DocMedia[] = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

/* 아이폰 HEIC/HEIF: 브라우저가 MIME을 비우거나 image/heic로 주고, 파일 앞 4~12바이트에 ftyp+heic/heix/hevc/mif1/msf1 이 있다 */
const isHeic = (buf: Buffer, file: File) => /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name) || (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)/.test(buf.toString("ascii", 8, 12)));

/* RCP-01~05: 영수증·결제 문자 캡처·명세서(이미지/PDF) 1개 → 거래 목록 JSON. 원본은 저장하지 않음 (Supabase Storage 연결 시 비공개 버킷) */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file 필드가 필요해요" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "빈 파일이에요" }, { status: 400 });
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "12MB 이하 파일만 받아요" }, { status: 413 });
    let buf = Buffer.from(await file.arrayBuffer());
    let type = TYPES.find((t) => t === file.type);
    if (!type && isHeic(buf, file)) { // HEIC → JPEG (순수 JS 디코더, 네이티브 의존성 없음)
      buf = Buffer.from(await convert({ buffer: new Uint8Array(buf), format: "JPEG", quality: 0.88 }));
      type = "image/jpeg";
    }
    if (!type) return NextResponse.json({ error: "JPEG·PNG·WebP·GIF·HEIC 이미지 또는 PDF만 받아요" }, { status: 415 });
    const started = Date.now();
    const result = await ocrDocument(buf.toString("base64"), type, file.name.replace(/\.[^.]+$/, ""));
    return NextResponse.json({ ...result, ms: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ error: aiErrorMessage(e) }, { status: 502 });
  }
}
