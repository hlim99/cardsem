"use client";
/* 앱 상태. 로그인했으면 Supabase(본인 행만, RLS), 아니면 데모 장부.
 * 데모 장부는 공용 데모 계정(NEXT_PUBLIC_DEMO_EMAIL)이 설정돼 있으면 그 계정으로 Supabase에, 아니면 localStorage에 둔다.
 * 데모 계정도 DB 쓰기는 로그인과 똑같고, 화면에는 데모로 보인다(me = null). 데모도 빈 장부(기본 카테고리·총예산)에서 시작한다.
 * 화면은 두 모드를 구분하지 않는다 — 액션이 로컬 상태를 먼저 바꾸고(낙관적), 로그인 상태면 같은 변경을 DB에 보낸다.
 * DB 쓰기는 한 줄로 세워 순서대로 보내고, 하나라도 실패하면 syncError를 남긴 뒤 쓰기가 다 끝났을 때 DB 상태로 다시 읽는다 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Budget, CardProduct, Category, Industry, RecurringRule, Transaction, UserCard } from "./types";
import { CARDS, registerCustomCards } from "./data/cards";
import { DEFAULT_CATEGORIES, deleteCategory, FALLBACK_CATEGORY, merchantKeys, type IndustryHints } from "./data/merchants";
import { computeMonth, type MonthCalc } from "./engine";
import { DEMO_EMAIL, SUPABASE_READY, supabase } from "./supabase";
import { db, loadAll, newId, validCategory } from "./db";
import { readKey } from "./notify"; // 탈퇴·초기화 때 알림 읽음 기록도 지운다
import { materialize, ymd } from "./recurring";

/* 알림은 상태에 두지 않는다 — lib/notify.ts가 이 데이터에서 매번 계산한다.
 * customCards: 직접 추가한 카드(CARD-02). 데모는 장부와 함께 localStorage에, 로그인은 card_products(owner_id = 본인)에 */
type State = { txns: Transaction[]; userCards: UserCard[]; budgets: Budget[]; categories: Category[]; recurring: RecurringRule[]; customCards: CardProduct[] };
/** 빈 장부: 기본 카테고리 + 총예산 150만 원 (로그인 첫 장부와 같다. db.ts loadAll) */
const seed = (): State => ({ txns: [], userCards: [], budgets: [{ amount: 1500000 }], categories: DEFAULT_CATEGORIES, recurring: [], customCards: [] });
/** 로그인하지 않았을 때 화면에 보이는 이름 */
export const DEMO_USER = { name: "데모 사용자" };
const empty = (): State => ({ txns: [], userCards: [], budgets: [], categories: [], recurring: [], customCards: [] });
const KEY = "cardsem-demo-v5"; // v5: 더미 데이터 제거. 시작 장부를 바꾸면 버전을 올려 저장된 데모 상태를 무효화
// ponytail: 업종 기억은 이 기기에만, 계정별 키로 둔다 (계정을 바꿔도 섞이지 않게). 기기 간 동기화가 필요해지면 사용자별 테이블 추가
const hintKey = (uid?: string) => `cardsem-industry-hints:${uid ?? "demo"}`;
/** 실제 오늘(로컬 날짜). 데모도 같다 */
const realToday = () => ymd(new Date());
/* 데모 모드 진입 표시. 로그인 화면의 '데모 보기'로만 켜지고, 꺼져 있으면 로그인하지 않은 사용자는 앱에 못 들어간다(AppShell → /login).
 * 이 브라우저에만 기억한다 — 한 번 데모를 고른 방문자는 다시 와도 데모로 들어간다. 내 계정으로 로그인하면 꺼진다 */
const DEMO_FLAG = "cardsem-demo-on";
const readDemoFlag = () => { try { return localStorage.getItem(DEMO_FLAG) === "1"; } catch { return false; } };
const writeDemoFlag = (on: boolean) => { try { if (on) localStorage.setItem(DEMO_FLAG, "1"); else localStorage.removeItem(DEMO_FLAG); } catch { /* 무시 */ } };

/** 반복 규칙에서 아직 안 만든 회차를 거래로 만든다 (recurring.ts). 새 거래(id 포함)와 lastGeneratedAt이 바뀐 규칙도 돌려줘서 DB에 보낼 수 있게 */
function generate(s: State, today: string) {
  const g = materialize(s.recurring, s.txns, today);
  const add = g.txns.map((t) => ({ ...t, id: newId(), categoryId: validCategory(s.categories, t) }) as Transaction);
  const changed = new Map(g.rules.map((r) => [r.id, r]));
  return { next: { ...s, txns: [...s.txns, ...add], recurring: s.recurring.map((r) => changed.get(r.id) ?? r) }, add, rules: g.rules };
}
/** 데모 장부: 이 브라우저에 저장된 것(없으면 시드) + 지난 반복 회차 */
function demoState(): State {
  let s = seed();
  try { const raw = localStorage.getItem(KEY); if (raw) s = { ...s, ...JSON.parse(raw) }; } catch { /* 무시 */ }
  return generate(s, realToday()).next;
}

/** 공용 데모 계정으로 로그인. 비밀번호는 서버에만 있어 /api/demo가 로그인하고 토큰만 준다. 실패하면 false */
async function signInDemo() {
  try {
    const r = await fetch("/api/demo", { method: "POST" });
    if (!r.ok) return false;
    const tokens = await r.json();
    // 그 사이 로그인 화면에서 내 계정으로 들어왔으면 데모 세션으로 덮지 않는다
    if ((await supabase().auth.getSession()).data.session) return true;
    const { error } = await supabase().auth.setSession(tokens);
    return !error;
  } catch { return false; }
}

/** admin: Supabase app_metadata.role === "admin" (사용자가 스스로 못 바꾸는 값. 대시보드에서 지정). RLS·/api/normalize도 같은 값을 본다.
 *  needsProfile: 소셜(카카오) 로그인으로 들어왔는데 아직 가입 절차(닉네임)를 마치지 않음 → AppShell이 /welcome으로 보낸다 */
export type Me = { id: string; email: string; name: string; admin: boolean; needsProfile: boolean };
type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> };
/** DB에 붙은 계정. demo = 공용 데모 계정 (화면에는 데모로 보인다) */
type Acct = Me & { demo: boolean };
const meOf = (u: AuthUser): Acct => ({
  id: u.id, email: u.email ?? "", name: (u.user_metadata?.nickname as string) || (u.user_metadata?.name as string) || u.email?.split("@")[0] || "사용자", admin: u.app_metadata?.role === "admin",
  needsProfile: (u.app_metadata?.provider ?? "email") !== "email" && !u.user_metadata?.nickname,
  demo: !!DEMO_EMAIL && u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase(),
});

type Store = State & {
  today: string;        // 데모는 시드 날짜, 로그인은 실제 오늘 (YYYY-MM-DD)
  catalog: CardProduct[]; // 기본 카드 + 직접 추가한 카드. 계산은 항상 이걸로
  addCustomCard: (c: CardProduct) => void;
  /** 직접 추가한 카드 삭제. 보유 해제하고, 그 카드로 기록한 거래·반복 거래는 남기되 카드만 비운다 */
  removeCustomCard: (id: string) => void;
  me: Me | null;        // null이면 데모 모드 (공용 데모 계정이든 localStorage든)
  demoShared: boolean;
  /** 데모 모드를 골랐는지 (로그인 화면 '데모 보기'). me도 없고 이것도 false면 로그인 화면으로 보낸다 */
  demoOn: boolean;
  /** 데모 모드로 들어가기 (공용 데모 계정이 있으면 그 계정으로 로그인). 끝나면 loading이 false가 된다 */
  enterDemo: () => void;
  /** 데모 모드 끄기 (설정의 '로그인'). 데모 장부는 그대로 남는다 */
  exitDemo: () => void;  // 데모 장부가 서버(공용 데모 계정)에 있어 모든 방문자가 같이 씀. false면 이 브라우저에만
  loading: boolean;     // 로그인 상태 확인·DB 읽기 중. 이 동안 state는 비어 있다 (데모 시드가 보이지 않게)
  syncError: string | null; // DB 읽기·쓰기 실패 메시지. clearSyncError로 닫을 때까지 남는다
  clearSyncError: () => void;
  month: string; setMonth: (m: string) => void;
  calc: MonthCalc; // 선택한 달 계산 결과
  calcFor: (ym: string) => MonthCalc;
  addTxn: (t: Omit<Transaction, "id">) => Transaction;
  updateTxn: (id: string, patch: Partial<Transaction>) => void;
  deleteTxns: (ids: string[]) => void;
  addUserCard: (c: UserCard) => void;
  removeUserCard: (cardId: string) => void;
  updateUserCard: (cardId: string, patch: Partial<UserCard>) => void;
  setBudgets: (b: Budget[]) => void;
  setCategories: (c: Category[]) => void;
  deleteCategory: (id: string) => void;
  /** 반복 규칙 추가·수정. 저장하면서 시작일~오늘 사이에 지난 회차가 있으면 그 거래도 바로 만든다 */
  addRecurring: (r: Omit<RecurringRule, "id">) => RecurringRule;
  updateRecurring: (id: string, patch: Partial<RecurringRule>) => void;
  /** 규칙만 지운다. 이미 만든 거래는 남고 반복 표시만 빠진다 */
  deleteRecurring: (id: string) => void;
  /** 사용자가 고친 가맹점 업종 (업종 분류 1순위). lib/data/merchants.ts의 resolveIndustry에 넘긴다 */
  industryHints: IndustryHints;
  rememberIndustry: (merchant: string, industry: Industry) => void;
  reset: () => void;
  signOut: () => Promise<void>;
  /** 회원 탈퇴. 로그인 모드: 본인 장부(거래·카드·직접 추가 카드·카테고리·예산·반복·영수증 기록)를 DB에서 지우고 로그아웃.
   *  로그인 계정(auth.users) 자체는 서비스 키가 있어야 지울 수 있어 남는다. 데모 모드: 데모 장부를 시드로 되돌림 (공용 데모 계정이면 서버의 장부도) */
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seed);
  const [month, setMonth] = useState(() => realToday().slice(0, 7));
  const [acct, setAcct] = useState<Acct | null>(null); // DB에 붙은 계정 (공용 데모 계정 포함). null = localStorage 데모
  const me = acct && !acct.demo ? acct : null;
  const [loading, setLoading] = useState(SUPABASE_READY);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [industryHints, setHints] = useState<IndustryHints>({});
  const catalog = useMemo(() => [...CARDS, ...state.customCards], [state.customCards]);
  registerCustomCards(state.customCards); // cardById·cardLabel이 직접 추가한 카드도 찾게 (렌더마다 같은 배열이면 비용 없음)
  const today = realToday(); // ponytail: 렌더 때마다 계산 — 자정을 넘기면 다음 렌더부터 새 날짜. 그 사이 반복 회차는 다음 로드 때 생성

  // 지금 state가 담고 있는 사용자 id (null = 데모). 같은 사용자의 SIGNED_IN(탭 복귀마다 옴)에는 다시 읽지 않는다
  const loadedFor = useRef<string | null>(null);
  // 장부 읽기가 실패해 state가 비어 있음. 이때 쓰면 '목록 통째로 저장'(카테고리·예산)이 서버 데이터를 지우므로 다시 읽기 전까지 보내지 않는다
  const loadFailed = useRef(false);
  // 데모 계정 로그인에 실패함 → 이번 접속 동안은 localStorage 데모로 (실패할 때마다 다시 시도하며 깜빡이지 않게)
  const demoFailed = useRef(false);
  const [demoOn, setDemoOn] = useState(false);
  // DB 쓰기 줄: 순서대로 보내고(추가 직후 삭제가 뒤집히지 않게), 실패가 있었으면 줄이 빌 때 DB 상태로 다시 읽는다
  const q = useRef({ chain: Promise.resolve() as Promise<unknown>, pending: 0, failed: false });
  const enqueue = (uid: string, f: () => PromiseLike<unknown>) => {
    const s = q.current;
    s.pending++;
    const run = s.chain.then(f).catch((e) => { if (loadedFor.current === uid) { s.failed = true; setSyncError((e as Error).message); } });
    s.chain = run.then(async () => {
      if (--s.pending > 0 || !s.failed || loadedFor.current !== uid) return;
      s.failed = false;
      // 실패한 변경이 화면에만 남아 '저장된 것처럼' 보이지 않게 DB 상태로 되돌린다. 그 사이 새 쓰기가 들어왔으면 그게 끝난 뒤 다시
      try { const d = await loadAll(uid); if (s.pending === 0 && loadedFor.current === uid) setState(d); else s.failed = true; }
      catch { s.failed = true; if (loadedFor.current === uid) setSyncError("저장에 실패했고 서버 내용도 다시 불러오지 못했어요. 일부 내용이 저장되지 않았을 수 있으니 새로고침해 주세요"); }
    });
    return run;
  };
  // 반복 회차 거래 저장. 다른 탭·기기가 같은 회차를 먼저 만들어 무시된 행이 있으면 줄이 빌 때 DB 상태로 다시 읽어 그쪽 id로 맞춘다
  // (안 그러면 화면에 DB에 없는 id가 남아 수정·삭제가 0행에 적용되고 새로고침하면 되살아난다)
  const insertRuns = async (uid: string, add: Transaction[]) => { if ((await db.insertTxns(uid, add)) < add.length) q.current.failed = true; };

  // localStorage는 클라이언트에서만 읽을 수 있어 마운트 후 한 번 동기화 (SSR 불일치 방지)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(demoState());
    setDemoOn(readDemoFlag());
    setHydrated(true);
  }, []);
  // 업종 기억은 계정마다 따로: 계정(또는 데모)이 바뀌면 그 계정의 기억을 읽는다
  useEffect(() => {
    if (!hydrated || loading) return;
    let h: IndustryHints = {};
    try { h = JSON.parse(localStorage.getItem(hintKey(me?.id)) ?? "{}"); } catch { /* 무시 */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHints(h);
  }, [hydrated, loading, me?.id]);
  // localStorage 데모일 때만 localStorage에 저장. DB에 붙은 계정(데모 계정 포함)의 데이터는 DB에만 (계정을 읽는 동안의 빈 state도 저장하지 않음)
  useEffect(() => { if (hydrated && !acct && !loading) try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 무시 */ } }, [state, hydrated, acct, loading]);

  // 로그인 세션 감시. 사용자가 바뀌면(로그인·계정 전환) DB를 읽어 상태를 통째로 바꾸고, 사라지면 데모로 돌아간다
  // (데모 계정이 있으면 그 계정으로 로그인 → 이어서 오는 SIGNED_IN에서 읽는다).
  // 첫 이벤트는 INITIAL_SESSION (세션 확인 전까지 loading=true라 데모 시드가 보이지 않는다)
  useEffect(() => {
    if (!SUPABASE_READY) return;
    let alive = true;
    const apply = async (user: AuthUser | null) => {
      if (!alive) return;
      if (!user && DEMO_EMAIL && !demoFailed.current && readDemoFlag()) { // 데모를 고른 방문자만 데모 계정에 붙인다
        setLoading(true);
        if (await signInDemo()) return;
        if (!alive) return;
        demoFailed.current = true;
        setSyncError("데모 서버에 연결하지 못해 이 브라우저에만 저장해요");
      }
      const uid = user?.id ?? null;
      if (uid === loadedFor.current && !(uid && loadFailed.current)) { // 읽기에 실패한 사용자는 다음 이벤트(탭 복귀 등)에서 다시 읽는다
        // 같은 사용자: 탭 복귀 SIGNED_IN·TOKEN_REFRESHED·USER_UPDATED → 이름만 갱신. 데모 상태면 확인 끝
        if (user) { const m = meOf(user); setAcct((p) => (p && (p.name !== m.name || p.email !== m.email || p.admin !== m.admin || p.needsProfile !== m.needsProfile) ? m : p)); } else setLoading(false);
        return;
      }
      loadedFor.current = uid; loadFailed.current = false;
      if (user && !meOf(user).demo) { writeDemoFlag(false); setDemoOn(false); } // 내 계정으로 들어오면 데모 모드는 끝
      if (!user) { setAcct(null); setState(demoState()); setMonth(realToday().slice(0, 7)); setLoading(false); return; }
      setLoading(true); setAcct(null); setState(empty());
      const m = meOf(user);
      const day = realToday();
      try {
        const data = await loadAll(user.id); // 처음 붙은 계정(데모 계정 포함)이면 기본 카테고리·총예산을 넣어 준다
        if (!alive || loadedFor.current !== uid) return;
        const g = generate(data, day);
        setState(g.next); setSyncError(null); // 앞서 읽기에 실패했다가 다시 읽은 경우 그 알림을 닫는다
        if (g.add.length || g.rules.length) enqueue(user.id, async () => { await insertRuns(user.id, g.add); for (const r of g.rules) await db.upsertRecurring(user.id, r); });
      } catch (e) { if (alive && loadedFor.current === uid) { loadFailed.current = true; setSyncError(`장부를 불러오지 못했어요: ${(e as Error).message}`); } }
      if (alive && loadedFor.current === uid) { setAcct(m); setMonth(day.slice(0, 7)); setLoading(false); }
    };
    const { data: sub } = supabase().auth.onAuthStateChange((_ev, session) => { apply(session?.user ?? null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []); // 구독은 한 번만. apply가 쓰는 enqueue는 ref만 읽는다

  // 월별 계산 캐시. 거래·카드가 바뀌면 비운다
  const cache = useRef<{ key: unknown[]; map: Map<string, MonthCalc> }>({ key: [], map: new Map() });
  const calcFor = (ym: string) => {
    const c = cache.current;
    if (c.key[0] !== state.txns || c.key[1] !== state.userCards || c.key[2] !== catalog) cache.current = { key: [state.txns, state.userCards, catalog], map: new Map() };
    const m = cache.current.map;
    if (!m.has(ym)) m.set(ym, computeMonth(ym, state.txns, state.userCards, catalog));
    return m.get(ym)!;
  };
  const calc = useMemo(() => computeMonth(month, state.txns, state.userCards, catalog), [month, state.txns, state.userCards, catalog]);

  const up = (f: (s: State) => Partial<State>) => setState((s) => ({ ...s, ...f(s) }));
  // 로그인 상태면 DB에도 보낸다 (쓰기 줄로). 보낼 값은 반드시 업데이터 밖에서 만들 것 — 업데이터는 렌더 때 늦게 돌 수 있다
  const sync = (f: (uid: string) => PromiseLike<unknown>) => {
    if (!acct) return;
    if (loadFailed.current) { setSyncError("장부를 아직 불러오지 못해 저장하지 않았어요"); return; }
    const uid = acct.id; enqueue(uid, () => f(uid));
  };
  // 데모 장부를 빈 장부로 되돌린다. 공용 데모 계정이면 서버의 장부도 비우고 기본 카테고리·총예산을 다시 넣는다 (모든 방문자에게 반영)
  const resetDemo = () => {
    if (me) return; // 로그인 계정 장부는 건드리지 않는다
    const s = seed();
    setState(s);
    if (acct?.demo) sync(async (uid) => { await db.deleteAllMine(uid); await db.setCategories(uid, s.categories); await db.setBudgets(uid, s.budgets); });
  };
  const cats = state.categories;

  // 반복 규칙 저장 + 지난 회차 생성. DB는 규칙 → 거래(recurring_id FK) → 마지막 생성일 순서
  const saveRule = (n: RecurringRule) => {
    const g = generate({ ...state, recurring: [n] }, today);
    const saved = g.next.recurring[0];
    up((s) => ({ recurring: s.recurring.some((r) => r.id === n.id) ? s.recurring.map((r) => (r.id === n.id ? saved : r)) : [...s.recurring, saved], txns: [...s.txns, ...g.add] }));
    sync(async (uid) => { await db.upsertRecurring(uid, n); if (g.add.length) { await insertRuns(uid, g.add); await db.upsertRecurring(uid, saved); } });
    return saved;
  };

  const store: Store = {
    ...state, today, catalog, me, demoShared: !!acct?.demo, loading, syncError, month, setMonth, calc, calcFor,
    clearSyncError: () => setSyncError(null),
    demoOn,
    enterDemo: () => {
      writeDemoFlag(true); setDemoOn(true);
      if (!DEMO_EMAIL || acct || demoFailed.current) return; // 공용 데모 계정이 없으면 이미 들고 있는 localStorage 데모로
      setLoading(true);
      signInDemo().then((ok) => { // 성공하면 SIGNED_IN(데모 계정)이 와서 장부를 읽고 loading을 끈다
        if (ok) return;
        demoFailed.current = true; setSyncError("데모 서버에 연결하지 못해 이 브라우저에만 저장해요"); setLoading(false);
      });
    },
    exitDemo: () => { writeDemoFlag(false); setDemoOn(false); },
    // 카드 행이 먼저 들어가야 뒤따르는 addUserCard(user_cards.card_id FK)가 통과한다 — 쓰기 줄이 순서를 지킨다
    addCustomCard: (c) => { up((s) => ({ customCards: [...s.customCards.filter((x) => x.id !== c.id), c] })); sync((uid) => db.upsertCustomCard(uid, c)); },
    removeCustomCard: (id) => {
      const off = <T extends { cardId?: string }>(l: T[]) => l.map((x) => (x.cardId === id ? { ...x, cardId: undefined } : x));
      up((s) => ({ customCards: s.customCards.filter((x) => x.id !== id), userCards: s.userCards.filter((x) => x.cardId !== id), txns: off(s.txns), recurring: off(s.recurring) }));
      sync((uid) => db.removeCustomCard(uid, id));
    },
    addRecurring: (r) => saveRule({ ...r, id: newId(), categoryId: validCategory(cats, r) }),
    updateRecurring: (id, patch) => { const cur = state.recurring.find((r) => r.id === id); if (cur) { const n = { ...cur, ...patch }; saveRule({ ...n, categoryId: validCategory(cats, n) }); } },
    deleteRecurring: (id) => {
      up((s) => ({ recurring: s.recurring.filter((r) => r.id !== id), txns: s.txns.map((t) => (t.recurringId === id ? { ...t, recurringId: undefined } : t)) }));
      sync(() => db.deleteRecurring(id));
    },
    addTxn: (t) => { const n = { ...t, id: newId(), categoryId: validCategory(cats, t) } as Transaction; up((s) => ({ txns: [...s.txns, n] })); sync((uid) => db.insertTxn(uid, n)); return n; },
    updateTxn: (id, patch) => {
      const cur = state.txns.find((t) => t.id === id);
      const p = cur && ("categoryId" in patch || "type" in patch) ? { ...patch, categoryId: validCategory(cats, { ...cur, ...patch }) } : patch;
      // 원거래의 카테고리·카드·결제수단을 바꾸면 그 환불 거래도 같은 값으로 (환불은 원거래 줄에서 빠지는 금액이라 갈라지면 집계가 어긋남)
      const rp: Partial<Transaction> = Object.fromEntries((["categoryId", "cardId", "payType"] as const).filter((k) => k in p).map((k) => [k, p[k]]));
      const refunds = Object.keys(rp).length ? state.txns.filter((t) => t.originalTxnId === id).map((t) => t.id) : [];
      up((s) => ({ txns: s.txns.map((t) => (t.id === id ? { ...t, ...p } : refunds.includes(t.id) ? { ...t, ...rp } : t)) }));
      sync(async (uid) => { await db.updateTxn(uid, id, p); for (const r of refunds) await db.updateTxn(uid, r, rp); });
    },
    deleteTxns: (ids) => { up((s) => ({ txns: s.txns.filter((t) => !ids.includes(t.id) && !ids.includes(t.originalTxnId ?? "")) })); sync(() => db.deleteTxns(ids)); },
    addUserCard: (c) => { up((s) => ({ userCards: s.userCards.some((x) => x.cardId === c.cardId) ? s.userCards : [...s.userCards, c] })); sync((uid) => db.upsertCard(uid, c)); },
    removeUserCard: (cardId) => { up((s) => ({ userCards: s.userCards.filter((x) => x.cardId !== cardId) })); sync(() => db.deleteCard(cardId)); },
    updateUserCard: (cardId, patch) => {
      const cur = state.userCards.find((x) => x.cardId === cardId);
      if (!cur) return;
      up((s) => ({ userCards: s.userCards.map((x) => (x.cardId === cardId ? { ...x, ...patch } : x)) }));
      sync((uid) => db.upsertCard(uid, { ...cur, ...patch })); // 행 전체 upsert라 patch의 undefined(해제)도 null로 저장된다
    },
    setBudgets: (b) => {
      const budgets = [...new Map(b.map((x) => [x.categoryId ?? "", x])).values()]; // 같은 카테고리가 두 번이면 마지막 값 (DB 유일 키)
      const key = (x: Budget) => x.categoryId ?? "";
      const removed = state.budgets.filter((x) => !budgets.some((y) => key(y) === key(x))).map((x) => x.categoryId); // 이번에 지운 예산만 DB에서 삭제
      up(() => ({ budgets })); sync((uid) => db.setBudgets(uid, budgets, removed));
    },
    setCategories: (categories) => {
      const removed = state.categories.filter((c) => !categories.some((x) => x.id === c.id)).map((c) => c.id); // 이번에 지운 것만 DB에서 삭제
      up(() => ({ categories })); sync((uid) => db.setCategories(uid, categories, removed));
    },
    deleteCategory: (id) => {
      const next = deleteCategory(state, id);
      if (next === state) return;
      const gone = state.categories.filter((c) => !next.categories.includes(c)).map((c) => c.id);
      const to = FALLBACK_CATEGORY[state.categories.find((c) => c.id === id)!.type];
      up(() => next);
      // 거래·반복 거래를 먼저 옮기고 카테고리를 지운다 (예산은 DB FK cascade로 함께 삭제)
      sync(async (uid) => { await db.moveCategory(uid, gone, to); await db.setCategories(uid, next.categories, gone); });
    },
    industryHints,
    rememberIndustry: (merchant, industry) => setHints((h) => {
      const next = { ...h, ...Object.fromEntries(merchantKeys(merchant).map((k) => [k, industry])) };
      try { localStorage.setItem(hintKey(me?.id), JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    }),
    reset: () => {
      for (const k of [KEY, readKey()]) try { localStorage.removeItem(k); } catch { /* 무시 */ }
      resetDemo();
    },
    signOut: async () => {
      await q.current.chain; // 보내는 중인 쓰기가 끝난 뒤 (세션이 먼저 사라지면 남은 요청이 RLS에 거부되고 알림도 없이 사라진다)
      // 공용 데모 계정은 로그아웃하지 않는다: signOut은 그 계정의 모든 세션을 끊어 다른 방문자까지 튕긴다. 로그인 화면에서 내 계정으로 들어가면 세션이 바뀐다
      if (me) await supabase().auth.signOut();
    },
    deleteAccount: async () => {
      if (me) {
        await q.current.chain; // 보내는 중인 쓰기가 끝난 뒤 지운다
        await db.deleteAllMine(me.id);
      }
      // 이 계정(또는 데모)의 기억·읽음 기록만 지운다. 데모면 예전 버전 데모 장부 키(cardsem-demo-v2 등)와 예전 직접 추가 카드 키도 함께
      const keys = [hintKey(me?.id), readKey(me?.id), ...(me ? [] : [KEY, "cardsem-custom-cards", "cardsem-industry-hints"])];
      try { if (!me) for (const k of Object.keys(localStorage)) if (k.startsWith("cardsem-demo-")) keys.push(k); } catch { /* 무시 */ }
      for (const k of keys) try { localStorage.removeItem(k); } catch { /* 무시 */ }
      setHints({});
      if (me) await supabase().auth.signOut(); // SIGNED_OUT → 데모 장부로 돌아감
      else { resetDemo(); await q.current.chain; } // 서버 데모 장부를 되돌리는 쓰기가 끝날 때까지 기다린다
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("DemoProvider 밖에서 useStore를 호출했어요");
  return s;
}
