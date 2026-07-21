"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  Home,
  Landmark,
  Layers3,
  Menu,
  MoreHorizontal,
  Newspaper,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DcaSimulator,
  FundLookthrough,
  JournalPanel,
  ProfitCalendar,
  SmartTopUpAdvisor,
} from "./investment-features";
import { MarketSnapshot } from "./market-snapshot";
import { PaperTrading } from "./paper-trading";
import {
  accountInstrumentDeletionConfirmation,
  accountInstrumentDeletionSuccess,
  type AccountInstrumentDeletionCounts,
} from "@/lib/account-instrument-deletion";
import { estimateFundConfirmationDate } from "@/lib/confirmation-date";

type View =
  | "overview"
  | "accounts"
  | "ledger"
  | "paper"
  | "plans"
  | "allocation"
  | "analytics"
  | "data";
type Modal = "entry" | "account" | "instrument" | "plan" | "price" | null;

interface PortfolioData {
  metrics: {
    totalAssets: number;
    deposits: number;
    withdrawals: number;
    netContributions: number;
    totalProfit: number;
    realized: number;
    unrealized: number;
    income: number;
    fees: number;
    twr: number;
    xirr: number | null;
    todayProfit: number;
    securitiesValue: number;
    cash: number;
    holdingCost: number;
  };
  risk: {
    volatility: number;
    sharpe: number;
    maxDrawdown: number;
    positiveDays: number;
    negativeDays: number;
    winRate: number;
  };
  accounts: Array<{
    id: number;
    name: string;
    color: string;
    currency: string;
    assets: number;
    contributions: number;
    profit: number;
    returnRate: number | null;
    securitiesValue: number;
    cash: number;
  }>;
  instruments: Array<{
    id: number;
    name: string;
    code: string;
    market: string;
    asset_class: string;
    currency: string;
    product_type: string;
    buy_fee_bps: number;
    buy_discount_bps: number;
    sell_fee_bps: number;
    min_fee_units: number;
    eastmoney_fee_bps: number;
    min_purchase_units: number;
    redemption_fee_json: string;
    data_source: string;
    source_updated_at: string;
  }>;
  ledger: Array<{
    id: number;
    account_id: number;
    instrument_id: number | null;
    kind: string;
    trade_date: string;
    confirmation_date: string;
    quantity_units: number;
    price_units: number;
    gross_amount_units: number;
    fee_units: number;
    tax_units: number;
    notes: string;
    purchase_channel: string;
    fee_source: string;
  }>;
  holdings: Array<{
    accountId: number;
    instrumentId: number;
    accountName: string;
    instrumentName: string;
    code: string;
    quantity: number;
    cost: number;
    marketValue: number;
    price: number;
    priceDate: string | null;
    realized: number;
    unrealized: number;
    income: number;
    returnRate: number;
    breakEvenPrice: number;
    toBreakEvenRate: number | null;
    breakEvenProgress: number;
  }>;
  plans: Array<{
    id: number;
    account_id: number;
    instrument_id: number;
    accountName: string;
    instrumentName: string;
    amount: number;
    day_of_month: number;
    next_date: string;
    status: string;
  }>;
  targets: Array<{
    instrument_id: number;
    target_bps: number;
    alert_bps: number;
  }>;
  series: Array<{
    date: string;
    assets: number;
    contributions: number;
    profit: number;
    twr: number;
    drawdown: number;
  }>;
  monthly: Array<{ month: string; profit: number }>;
  allocation: Array<{
    instrumentId: number;
    name: string;
    value: number;
    actual: number;
    target: number;
    drift: number;
    alert: boolean;
  }>;
  rankings: Array<{ name: string; profit: number; returnRate: number }>;
  journal: Array<{
    id: number;
    account_id: number | null;
    instrument_id: number | null;
    entry_date: string;
    title: string;
    decision: string;
    mood: string;
    thesis: string;
    review_date: string;
    review_note: string;
    account_name: string | null;
    instrument_name: string | null;
    instrument_code: string | null;
  }>;
  valuationDate: string | null;
  latestValuationDate?: string | null;
  missingPriceCount?: number;
  navSync?: {
    lastAttemptAt?: string | null;
    lastSuccessAt?: string | null;
    synced?: number;
    total?: number;
    official?: number;
    status?: "idle" | "running" | "success" | "partial" | "error";
  };
  methodology: string;
}

interface MarketNewsFeed {
  items: Array<{
    id: string;
    title: string;
    summary: string;
    publishedAt: string;
    source: string;
    url: string;
    category: "A股" | "海外市场" | "基金ETF" | "宏观";
  }>;
  updatedAt: string;
  source: string;
  isLive: boolean;
  isToday: boolean;
  message: string;
}

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "overview", label: "总览", icon: Home },
  { id: "accounts", label: "账户", icon: WalletCards },
  { id: "ledger", label: "交易", icon: CircleDollarSign },
  { id: "paper", label: "模拟", icon: FlaskConical },
  { id: "plans", label: "定投", icon: CalendarDays },
  { id: "allocation", label: "配置", icon: Target },
  { id: "analytics", label: "分析", icon: BarChart3 },
  { id: "data", label: "数据", icon: Database },
];

const COLORS = [
  "#5B7CFA",
  "#18A676",
  "#F2A33A",
  "#A36CF4",
  "#EF6A72",
  "#6BC5D2",
];
const PROFIT_COLOR = "#DE4F5F";
const LOSS_COLOR = "#159B72";
const kindLabels: Record<string, string> = {
  DEPOSIT: "入金",
  WITHDRAWAL: "出金",
  BUY: "买入",
  SELL: "卖出",
  DIVIDEND: "分红",
  FEE: "费用",
};
const channelLabels: Record<string, string> = {
  DIRECT: "基金公司直销",
  EASTMONEY: "天天基金",
  OTHER: "其他渠道",
  MANUAL: "手工录入",
};

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);
const compactMoney = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
const percent = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
const holdingProfitRate = (positions: PortfolioData["holdings"]) => {
  const cost = positions.reduce((sum, position) => sum + position.cost, 0);
  return cost > 0
    ? positions.reduce((sum, position) => sum + position.unrealized, 0) / cost
    : null;
};
const gainLossPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "暂无收益率";
  if (value > 0) return `盈利 ${percent(value)}`;
  if (value < 0) return `亏损 ${percent(value)}`;
  return "持平 0.00%";
};
const dateText = (value: string | null) =>
  value ? value.replaceAll("-", ".") : "暂无估值";
const syncTimeText = (value: string | null | undefined) => {
  if (!value) return "等待首次同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
};

const shanghaiTimeForInput = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

const matchingAccount = (
  accounts: PortfolioData["accounts"],
  instrument: PortfolioData["instruments"][number],
  holdings: PortfolioData["holdings"] = [],
) => {
  const existingAccountIds = [
    ...new Set(
      holdings
        .filter((holding) => holding.instrumentId === instrument.id)
        .map((holding) => holding.accountId),
    ),
  ];
  if (existingAccountIds.length === 1)
    return (
      accounts.find((account) => account.id === existingAccountIds[0]) ?? null
    );
  const product = `${instrument.name} ${instrument.asset_class}`;
  if (instrument.product_type === "STOCK") {
    const stockAccounts = accounts.filter((account) =>
      /个股|股票|证券|A股/i.test(account.name),
    );
    return stockAccounts.length === 1 ? stockAccounts[0] : null;
  }
  const exactKeywords = ["纳斯达克", "标普", "恒生", "黄金", "债券"];
  for (const keyword of exactKeywords) {
    if (product.includes(keyword)) {
      const exact = accounts.filter((account) =>
        account.name.includes(keyword),
      );
      if (exact.length === 1) return exact[0];
    }
  }
  const patterns: Array<[RegExp, RegExp]> = [
    [/美国股票|美股|纳斯达克|标普/, /美国|美股|纳斯达克|标普/],
    [/中国股票|A股/, /中国|A股|沪深|中证|科技/],
    [/港股|香港|恒生/, /港股|香港|恒生/],
    [/债券|固收/, /债券|固收/],
    [/现金|货币/, /现金|货币/],
  ];
  for (const [productPattern, accountPattern] of patterns) {
    if (productPattern.test(product)) {
      const candidates = accounts.filter((item) =>
        accountPattern.test(item.name),
      );
      if (candidates.length === 1) return candidates[0];
    }
  }
  return null;
};
const productTypeLabel = (
  instrument: PortfolioData["instruments"][number] | null | undefined,
) => {
  if (instrument?.product_type === "STOCK") return "股票";
  if (
    instrument?.product_type === "ETF" ||
    /^(?:5\d{5}|159\d{3})$/.test(instrument?.code ?? "")
  )
    return "场内 ETF";
  if (instrument?.product_type === "FUND") return "场外基金";
  return instrument?.product_type || "待匹配";
};

const instrumentCodeMatches = (
  instrument: PortfolioData["instruments"][number],
  codeInput: string,
  preference: "FUND" | "STOCK",
) => {
  if (
    preference === "STOCK"
      ? instrument.product_type !== "STOCK"
      : !["FUND", "ETF"].includes(instrument.product_type)
  )
    return false;
  const code = codeInput.trim().toUpperCase();
  const storedCode = instrument.code.toUpperCase();
  if (storedCode === code) return true;
  if (instrument.product_type !== "STOCK") return false;
  const prefixed = code.match(/^(SH|SZ)(\d{6})$/);
  const suffixed = code.match(/^(\d{6})\.(SH|SZ)$/);
  if (prefixed) return storedCode === `${prefixed[1]}${prefixed[2]}`;
  if (suffixed) return storedCode === `${suffixed[2]}${suffixed[1]}`;
  return /^\d{6}$/.test(code) && storedCode.replace(/^(SH|SZ)/, "") === code;
};
const navTitle: Record<View, [string, string]> = {
  overview: ["投资总览", "把现金流与投资表现分开看"],
  accounts: ["投资账户", "每个策略独立核算"],
  ledger: ["交易流水", "完整记录资金与交易事件"],
  paper: ["模拟交易", "用独立虚拟资金练习，不影响真实资产"],
  plans: ["定投计划", "按计划投入，不让节奏走样"],
  allocation: ["资产配置", "观察实际比例与目标偏离"],
  analytics: ["收益与风险", "用统一口径理解回报质量"],
  data: ["数据中心", "导入、导出与估值管理"],
};

function LoadingView() {
  return (
    <div className="loading-screen">
      <div className="loading-mark">
        <TrendingUp size={28} />
      </div>
      <p>正在重建你的投资账本…</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  footnote,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  footnote: string;
  tone?: "positive" | "negative" | "neutral";
  icon: typeof TrendingUp;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{footnote}</small>
    </article>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Layers3 size={28} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      {payload.map((item) => (
        <div key={item.name}>
          <i style={{ background: item.color }} />
          {item.name}
          <strong>
            {item.name.includes("率") || item.name.includes("回撤")
              ? percent(item.value)
              : `¥${money(item.value)}`}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function InvestmentDashboard() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [editingPlan, setEditingPlan] = useState<
    PortfolioData["plans"][number] | null
  >(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [navSyncing, setNavSyncing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navSyncInFlight = useRef(false);
  const mutationInFlight = useRef(false);
  const navigateView = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", `#${next}`);
    setMobileMenu(false);
  };

  const syncFunds = useCallback(async (force = false, announce = false) => {
    if (navSyncInFlight.current) return;
    navSyncInFlight.current = true;
    setNavSyncing(true);
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncAllFunds", force }),
      });
      const result = (await response.json()) as PortfolioData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "净值同步失败");
      setData(result);
      if (announce) {
        const synced = result.navSync?.synced ?? 0;
        const total = result.navSync?.total ?? 0;
        setToast(
          total > 0 ? `净值已更新 ${synced}/${total}` : "暂无需要同步的基金",
        );
        window.setTimeout(() => setToast(""), 2600);
      }
    } catch (caught) {
      if (announce) {
        setToast(caught instanceof Error ? caught.message : "净值同步失败");
        window.setTimeout(() => setToast(""), 3200);
      }
    } finally {
      navSyncInFlight.current = false;
      setNavSyncing(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      const result = (await response.json()) as PortfolioData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "读取失败");
      setData(result);
      void syncFunds(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取失败");
    }
  }, [syncFunds]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      const requested = window.location.hash.slice(1) as View;
      if (navItems.some((item) => item.id === requested)) setView(requested);
    }, 0);
    const interval = window.setInterval(
      () => void syncFunds(false),
      3 * 60_000,
    );
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncFunds(false);
    };
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [load, syncFunds]);

  const submit = async (
    payload: Record<string, unknown>,
    success:
      | string
      | ((
          result: PortfolioData & Partial<AccountInstrumentDeletionCounts>,
        ) => string) = "已保存",
  ) => {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as PortfolioData &
        Partial<AccountInstrumentDeletionCounts> & { error?: string };
      if (!response.ok) throw new Error(result.error || "保存失败");
      setData(result);
      setModal(null);
      setEditingPlan(null);
      setToast(typeof success === "function" ? success(result) : success);
      window.setTimeout(() => setToast(""), 2600);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
      return false;
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  };

  if (!data)
    return error ? (
      <div className="fatal-error">
        <AlertTriangle />
        <h1>暂时无法打开账本</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </div>
    ) : (
      <LoadingView />
    );

  const content =
    view === "overview" ? (
      <Overview
        data={data}
        onEntry={() => setModal("entry")}
        onSync={() => void syncFunds(true, true)}
        syncing={navSyncing}
        onNavigate={navigateView}
      />
    ) : view === "accounts" ? (
      <Accounts
        data={data}
        onAccount={() => setModal("account")}
        busy={busy}
        onDelete={(id) =>
          void submit({ action: "deleteAccount", id }, "账户已删除")
        }
        onDeleteInstrument={(accountId, instrumentId) =>
          void submit(
            { action: "deleteAccountInstrument", accountId, instrumentId },
            (result) =>
              accountInstrumentDeletionSuccess({
                deletedEntries: result.deletedEntries ?? 0,
                deletedPlans: result.deletedPlans ?? 0,
              }),
          )
        }
      />
    ) : view === "ledger" ? (
      <Ledger
        data={data}
        search={search}
        setSearch={setSearch}
        onEntry={() => setModal("entry")}
        onDelete={(id) =>
          void submit({ action: "deleteEntry", id }, "流水已删除")
        }
      />
    ) : view === "paper" ? (
      <PaperTrading
        instruments={data.instruments}
        onBack={() => setView("overview")}
      />
    ) : view === "plans" ? (
      <Plans
        data={data}
        onPlan={() => {
          setEditingPlan(null);
          setModal("plan");
        }}
        onEdit={(plan) => {
          setEditingPlan(plan);
          setModal("plan");
        }}
        onDelete={(id) =>
          void submit({ action: "deletePlan", id }, "计划已删除")
        }
        onToggle={(id) =>
          void submit({ action: "togglePlan", id }, "计划状态已更新")
        }
      />
    ) : view === "allocation" ? (
      <Allocation data={data} submit={submit} />
    ) : view === "analytics" ? (
      <Analytics data={data} submit={submit} busy={busy} error={error} />
    ) : (
      <DataCenter
        data={data}
        onImport={() => fileInput.current?.click()}
        onPrice={() => setModal("price")}
        onInstrument={() => setModal("instrument")}
        submit={submit}
      />
    );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <TrendingUp size={22} />
          </span>
          <div>
            <strong>盈迹</strong>
            <small>Portfolio Ledger</small>
          </div>
        </div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                navigateView(id);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {view === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <div>
            <ShieldCheck size={18} />
            <span>专业收益口径</span>
          </div>
          <p>
            TWR 排除资金进出影响
            <br />
            XIRR 衡量个人资金回报
          </p>
        </div>
        <button className="settings-link" onClick={() => navigateView("data")}>
          <Settings2 size={18} />
          数据与设置
        </button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="打开菜单"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu size={21} />
          </button>
          <div>
            <h1>{navTitle[view][0]}</h1>
            <p>{navTitle[view][1]}</p>
          </div>
          <div className="top-actions">
            <span className="valuation-pill">
              <i />
              净值截至 {dateText(data.valuationDate)}
            </span>
            <button
              className="primary-button"
              onClick={() => setModal("entry")}
            >
              <Plus size={18} />
              记一笔
            </button>
          </div>
        </header>
        <div className="page-content">{content}</div>
      </main>

      <nav className="mobile-nav">
        {navItems.slice(0, 4).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => navigateView(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
        <button onClick={() => setMobileMenu(true)}>
          <Menu size={19} />
          <span>更多</span>
        </button>
      </nav>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xlsx,.xls"
        hidden
        onChange={(event) => void importFile(event, submit)}
      />
      {modal && (
        <ModalForm
          type={modal}
          data={data}
          editingPlan={editingPlan}
          busy={busy}
          error={error}
          onClose={() => {
            setModal(null);
            setEditingPlan(null);
            setError("");
          }}
          submit={submit}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {mobileMenu && (
        <button
          className="menu-backdrop"
          aria-label="关闭菜单"
          onClick={() => setMobileMenu(false)}
        />
      )}
    </div>
  );
}

function Overview({
  data,
  onEntry,
  onSync,
  syncing,
  onNavigate,
}: {
  data: PortfolioData;
  onEntry: () => void;
  onSync: () => void;
  syncing: boolean;
  onNavigate: (view: View) => void;
}) {
  const m = data.metrics;
  const valuationRange =
    data.latestValuationDate && data.latestValuationDate !== data.valuationDate
      ? `${dateText(data.valuationDate)}—${dateText(data.latestValuationDate)}`
      : dateText(data.valuationDate);
  const officialCount = data.navSync?.official ?? 0;
  const syncedCount = data.navSync?.synced ?? 0;
  const sourceLabel =
    syncedCount === 0
      ? "等待净值"
      : officialCount >= syncedCount
        ? "官方来源"
        : officialCount > 0
          ? "官方＋备用来源"
          : "备用来源";
  const syncStatus =
    data.navSync?.status === "running"
      ? "后台同步中"
      : data.navSync?.status === "partial"
        ? "部分产品待更新"
        : data.navSync?.status === "error"
          ? "本次同步未完成"
          : sourceLabel;
  const recentSeries = data.series.slice(-120);
  const monthlyTotal = data.monthly.reduce((sum, item) => sum + item.profit, 0);
  const currentMonthProfit = data.monthly.at(-1)?.profit ?? 0;
  const profitableMonths = data.monthly.filter(
    (item) => item.profit > 0,
  ).length;
  const lossMonths = data.monthly.filter((item) => item.profit < 0).length;
  const monthlyAbsMax = Math.max(
    1,
    ...data.monthly.map((item) => Math.abs(item.profit)),
  );
  const monthlyDomain: [number, number] = [
    -monthlyAbsMax * 1.18,
    monthlyAbsMax * 1.18,
  ];
  const activePlans = data.plans.filter((plan) => plan.status === "ACTIVE");
  const nextPlanDate = activePlans
    .map((plan) => plan.next_date)
    .filter(Boolean)
    .sort()[0] ?? null;
  const allocationAlerts = data.allocation.filter(
    (item) => item.alert && item.instrumentId > 0,
  ).length;
  return (
    <div className="page-grid overview-page">
      <section className="hero-balance">
        <div className="hero-head">
          <div>
            <span className="eyebrow">总资产（元）</span>
            <strong>¥ {money(m.totalAssets)}</strong>
            <p className="asset-inclusion">
              <Check size={15} />{" "}
              已包含持仓的全部浮动盈亏；卖出款和分红留在可用现金
            </p>
            <div className="hero-cashflow" aria-label="资金概览">
              <span>持仓市值 ¥{money(m.securitiesValue ?? m.totalAssets)}</span>
              <span>可用现金 ¥{money(m.cash ?? 0)}</span>
              <span>净投入＋累计收益＝总资产</span>
            </div>
            <div className="asset-sync-line" aria-live="polite">
              <span>
                净值日期 {valuationRange} · {syncStatus} · 同步于{" "}
                {syncTimeText(data.navSync?.lastSuccessAt)}
                {(data.missingPriceCount ?? 0) > 0
                  ? ` · ${data.missingPriceCount} 项待估值`
                  : ""}
              </span>
              <button type="button" onClick={onSync} disabled={syncing}>
                <RefreshCcw size={14} className={syncing ? "spinning" : ""} />
                {syncing ? "同步中" : "更新净值"}
              </button>
            </div>
          </div>
          <button className="ghost-button" onClick={onEntry}>
            <Plus size={17} />
            新增记录
          </button>
        </div>
        <div className="hero-stats">
          <div>
            <span>累计净投入</span>
            <strong>¥{money(m.netContributions)}</strong>
          </div>
          <div>
            <span>累计收益</span>
            <strong className={m.totalProfit >= 0 ? "up" : "down"}>
              {m.totalProfit >= 0 ? "+" : ""}¥{money(m.totalProfit)}
            </strong>
          </div>
          <div>
            <span>累计 TWR</span>
            <strong className={m.twr >= 0 ? "up" : "down"}>
              {percent(m.twr)}
            </strong>
          </div>
          <div>
            <span>年化 XIRR</span>
            <strong>{percent(m.xirr)}</strong>
          </div>
          <div>
            <span>最新日盈亏</span>
            <strong className={m.todayProfit >= 0 ? "up" : "down"}>
              {m.todayProfit >= 0 ? "+" : ""}¥{money(m.todayProfit)}
            </strong>
          </div>
        </div>
        <div className="hero-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={recentSeries}>
              <defs>
                <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#87A1FF" stopOpacity={0.5} />
                  <stop offset="1" stopColor="#87A1FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip content={<ChartTooltip />} />
              <Area
                name="总资产"
                dataKey="assets"
                type="monotone"
                stroke="#C9D4FF"
                strokeWidth={2.3}
                fill="url(#heroArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="已实现收益"
          value={`¥ ${money(m.realized)}`}
          footnote="已卖出批次，净手续费"
          tone={m.realized >= 0 ? "positive" : "negative"}
          icon={CircleDollarSign}
        />
        <MetricCard
          label="未实现收益"
          value={`¥ ${money(m.unrealized)}`}
          footnote="按最新价格估值"
          tone={m.unrealized >= 0 ? "positive" : "negative"}
          icon={Activity}
        />
        <MetricCard
          label="最大回撤"
          value={percent(data.risk.maxDrawdown)}
          footnote="基于日频 TWR 财富指数"
          tone="negative"
          icon={TrendingDown}
        />
        <MetricCard
          label="夏普比率"
          value={data.risk.sharpe.toFixed(2)}
          footnote="无风险利率暂按 0%"
          icon={Gauge}
        />
      </section>
      <MarketSnapshot
        allocationAlerts={allocationAlerts}
        missingPriceCount={data.missingPriceCount ?? 0}
        activePlanCount={activePlans.length}
        nextPlanDate={nextPlanDate}
        onNavigate={onNavigate}
      />
      <section className="panel feature-toolbox-panel">
        <div className="feature-toolbox-head">
          <div>
            <span>NEW · 投资工具箱</span>
            <h2>新功能都在这里</h2>
            <p>直接进入对应工具，不用再到各个页面里寻找。</p>
          </div>
          <FlaskConical size={24} />
        </div>
        <div className="feature-toolbox-grid">
          {[
            {
              title: "模拟交易",
              text: "虚拟资金练习买卖，与真实资产隔离",
              view: "paper" as View,
              icon: FlaskConical,
              tone: "purple",
            },
            {
              title: "回本进度",
              text: "查看回本净值和还需上涨多少",
              view: "accounts" as View,
              icon: Gauge,
              tone: "green",
            },
            {
              title: "定投模拟",
              text: "历史回测与 1–30 年长期测算",
              view: "plans" as View,
              icon: CalendarDays,
              tone: "blue",
            },
            {
              title: "智能补仓",
              text: "按目标配置分配下一笔投入",
              view: "allocation" as View,
              icon: Target,
              tone: "amber",
            },
            {
              title: "盈亏与持仓穿透",
              text: "盈亏日历、重复持仓和底层公司",
              view: "analytics" as View,
              icon: Layers3,
              tone: "indigo",
            },
            {
              title: "投资复盘",
              text: "按产品代码记录判断和后续结果",
              view: "analytics" as View,
              icon: BookOpen,
              tone: "rose",
            },
          ].map(({ title, text, view: nextView, icon: Icon, tone }) => (
            <button
              className={`feature-tool-card ${tone}`}
              key={title}
              onClick={() => onNavigate(nextView)}
            >
              <span>
                <Icon size={19} />
              </span>
              <div>
                <strong>{title}</strong>
                <small>{text}</small>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </section>
      <section className="panel asset-chart-panel">
        <PanelTitle
          title="资产变化"
          subtitle="资金投入与市场表现同时呈现"
          action="近 12 个月"
        />
        <div className="chart-lg">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={recentSeries}>
              <defs>
                <linearGradient id="assetArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#5B7CFA" stopOpacity={0.22} />
                  <stop offset="1" stopColor="#5B7CFA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#E8EBF2"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis
                tickFormatter={compactMoney}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                name="总资产"
                dataKey="assets"
                type="monotone"
                stroke="#5B7CFA"
                strokeWidth={2.4}
                fill="url(#assetArea)"
              />
              <Line
                name="累计投入"
                dataKey="contributions"
                type="stepAfter"
                stroke="#A8AFBF"
                strokeWidth={1.8}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel allocation-panel">
        <PanelTitle
          title="当前配置"
          subtitle="按正的持仓市值计算，不受追加资金影响"
          action={`${data.allocation.filter((x) => x.alert).length} 项偏离`}
        />
        <div className="allocation-chart-wrap">
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.allocation}
                  dataKey="value"
                  innerRadius="64%"
                  outerRadius="90%"
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.allocation.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div>
              <strong>{data.allocation.length}</strong>
              <span>类资产</span>
            </div>
          </div>
          <div className="allocation-legend">
            {data.allocation.map((item, index) => (
              <div key={item.name}>
                <i style={{ background: COLORS[index % COLORS.length] }} />
                <span>{item.name}</span>
                <div className="allocation-legend-value">
                  <strong>{(item.actual * 100).toFixed(1)}%</strong>
                  <small>¥{money(item.value, 0)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel account-panel">
        <PanelTitle
          title="账户表现"
          subtitle="各策略独立核算"
          action={`${data.accounts.length} 个账户`}
        />
        <div className="account-list">
          {data.accounts.map((account) => (
            <div className="account-row" key={account.id}>
              <i style={{ background: account.color }} />
              <div>
                <strong>{account.name}</strong>
                <span>累计净投入 ¥{money(account.contributions, 0)}</span>
              </div>
              <div className="account-current-assets">
                <small>当前资产（含盈亏）</small>
                <strong>¥{money(account.assets)}</strong>
                <span className={account.profit >= 0 ? "up" : "down"}>
                  累计收益 {account.profit >= 0 ? "+" : ""}¥
                  {money(account.profit)}
                </span>
                <span className="account-rate-detail">
                  持仓盈亏率{" "}
                  {percent(
                    holdingProfitRate(
                      data.holdings.filter(
                        (position) => position.accountId === account.id,
                      ),
                    ),
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel monthly-panel">
        <PanelTitle
          title="月度盈亏"
          subtitle="以零轴为中心，红色盈利、绿色亏损"
          action="近 12 月"
        />
        <div className="monthly-summary" aria-label="月度盈亏摘要">
          <div>
            <span>本月盈亏</span>
            <strong className={currentMonthProfit >= 0 ? "up" : "down"}>
              {currentMonthProfit >= 0 ? "+" : ""}¥{money(currentMonthProfit)}
            </strong>
          </div>
          <div>
            <span>近 12 月合计</span>
            <strong className={monthlyTotal >= 0 ? "up" : "down"}>
              {monthlyTotal >= 0 ? "+" : ""}¥{money(monthlyTotal)}
            </strong>
          </div>
          <div>
            <span>盈利月份</span>
            <strong className="up">{profitableMonths} 个月</strong>
          </div>
          <div>
            <span>亏损月份</span>
            <strong className="down">{lossMonths} 个月</strong>
          </div>
        </div>
        <div className="chart-sm">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly}>
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#E8EBF2"
              />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                domain={monthlyDomain}
                tickFormatter={compactMoney}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="#AAB2C1" strokeWidth={1.3} />
              <Bar name="月度盈亏" dataKey="profit" radius={[5, 5, 2, 2]}>
                {data.monthly.map((item, i) => (
                  <Cell
                    key={i}
                    fill={item.profit >= 0 ? PROFIT_COLOR : LOSS_COLOR}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: string;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action && <span>{action}</span>}
    </div>
  );
}

function Accounts({
  data,
  onAccount,
  onDelete,
  onDeleteInstrument,
  busy,
}: {
  data: PortfolioData;
  onAccount: () => void;
  onDelete: (id: number) => void;
  onDeleteInstrument: (accountId: number, instrumentId: number) => void;
  busy: boolean;
}) {
  const [filter, setFilter] = useState<"ALL" | "PROFIT" | "LOSS">("ALL");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const profitCount = data.accounts.filter(
    (account) => account.profit > 0,
  ).length;
  const lossCount = data.accounts.filter(
    (account) => account.profit < 0,
  ).length;
  const accounts = data.accounts.filter((account) =>
    filter === "ALL"
      ? true
      : filter === "PROFIT"
        ? account.profit > 0
        : account.profit < 0,
  );
  return (
    <div className="stack-page">
      <div className="section-actions">
        <div className="filter-pills">
          <button
            className={filter === "ALL" ? "active" : ""}
            onClick={() => setFilter("ALL")}
          >
            全部 {data.accounts.length}
          </button>
          <button
            className={filter === "PROFIT" ? "active" : ""}
            onClick={() => setFilter("PROFIT")}
          >
            盈利 {profitCount}
          </button>
          <button
            className={filter === "LOSS" ? "active" : ""}
            onClick={() => setFilter("LOSS")}
          >
            亏损 {lossCount}
          </button>
        </div>
        <button className="secondary-button" onClick={onAccount}>
          <Plus size={17} />
          新建账户
        </button>
      </div>
      <div className="account-card-grid">
        {!accounts.length && (
          <div className="account-filter-empty">
            <Check size={22} />
            <strong>
              {filter === "LOSS" ? "当前没有亏损账户" : "暂无盈利账户"}
            </strong>
            <span>盈亏分类会根据账户总收益自动更新</span>
          </div>
        )}
        {accounts.map((account) => {
          const positions = data.holdings.filter(
            (item) => item.accountId === account.id,
          );
          const accountHoldingRate = holdingProfitRate(positions);
          const statusValue = positions.length
            ? (accountHoldingRate ?? 0)
            : account.profit;
          const primaryPosition = positions.length === 1 ? positions[0] : null;
          const primaryInstrument = primaryPosition
            ? data.instruments.find(
                (item) => item.id === primaryPosition.instrumentId,
              )
            : null;
          return (
            <article className="account-card" key={account.id}>
              <div className="account-card-head">
                <span style={{ background: account.color }}>
                  <Landmark size={19} />
                </span>
                <div className="account-card-actions">
                  <span
                    className={`account-profit-status ${
                      statusValue > 0
                        ? "profit"
                        : statusValue < 0
                          ? "loss"
                          : "flat"
                    }`}
                  >
                    {positions.length
                      ? gainLossPercent(accountHoldingRate)
                      : account.profit > 0
                        ? "累计盈利"
                        : account.profit < 0
                          ? "累计亏损"
                          : "持平"}
                  </span>
                  <button
                    aria-label={
                      expandedId === account.id
                        ? "收起账户详情"
                        : "展开账户详情"
                    }
                    title={expandedId === account.id ? "收起详情" : "查看详情"}
                    onClick={() =>
                      setExpandedId(
                        expandedId === account.id ? null : account.id,
                      )
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </div>
              <h2>{primaryPosition?.instrumentName ?? account.name}</h2>
              {primaryPosition ? (
                <>
                  <p className="account-source-line">
                    归属账户：{account.name} · 代码 {primaryPosition.code}
                  </p>
                  <div className="account-auto-type">
                    <span>代码自动识别</span>
                    <strong>{productTypeLabel(primaryInstrument)}</strong>
                    <strong>{primaryInstrument?.asset_class ?? "其他"}</strong>
                  </div>
                </>
              ) : (
                <p>基准币种 {account.currency} · 暂无持仓类型</p>
              )}
              <strong>¥ {money(account.assets)}</strong>
              <div className="account-card-stats">
                <div>
                  <span>累计收益</span>
                  <b
                    className={
                      account.profit > 0
                        ? "up"
                        : account.profit < 0
                          ? "down"
                          : ""
                    }
                  >
                    {account.profit > 0 ? "+" : ""}¥{money(account.profit)}
                  </b>
                </div>
                <div>
                  <span>持仓盈亏率</span>
                  <b className={(accountHoldingRate ?? 0) >= 0 ? "up" : "down"}>
                    {percent(accountHoldingRate)}
                  </b>
                </div>
                <div>
                  <span>年化 XIRR</span>
                  <b className={(account.returnRate ?? 0) >= 0 ? "up" : "down"}>
                    {percent(account.returnRate)}
                  </b>
                </div>
              </div>
              <div className="mini-holdings">
                {positions.length ? (
                  positions.map((position) => (
                    <div
                      className="mini-holding-block"
                      key={position.instrumentId}
                    >
                      <div className="mini-holding-main">
                        <span>
                          {primaryPosition
                            ? `${position.code} · ${position.quantity.toFixed(2)} 份`
                            : `${position.instrumentName} · ${position.quantity.toFixed(2)} 份`}
                        </span>
                        <span className="mini-holding-result">
                          <b
                            className={position.unrealized >= 0 ? "up" : "down"}
                          >
                            {position.unrealized >= 0 ? "+" : ""}¥
                            {money(position.unrealized)}
                          </b>
                          <em
                            className={position.returnRate >= 0 ? "up" : "down"}
                          >
                            {gainLossPercent(position.returnRate)}
                          </em>
                        </span>
                      </div>
                      <div className="break-even-status">
                        <div>
                          <span>
                            {position.toBreakEvenRate !== null &&
                            position.toBreakEvenRate > 0
                              ? `回本进度 ${(position.breakEvenProgress * 100).toFixed(1)}%`
                              : "已越过回本线"}
                          </span>
                          <strong>
                            回本净值 {position.breakEvenPrice.toFixed(4)}
                          </strong>
                        </div>
                        <div className="break-even-track">
                          <span
                            className={
                              position.toBreakEvenRate !== null &&
                              position.toBreakEvenRate > 0
                                ? "recovering"
                                : "recovered"
                            }
                            style={{
                              width: `${Math.max(2, position.breakEvenProgress * 100)}%`,
                            }}
                          />
                        </div>
                        <small
                          className={
                            position.toBreakEvenRate !== null &&
                            position.toBreakEvenRate > 0
                              ? "down"
                              : "up"
                          }
                        >
                          {position.toBreakEvenRate === null
                            ? "当前缺少有效净值"
                            : position.toBreakEvenRate > 0
                              ? `当前净值还需上涨 ${(position.toBreakEvenRate * 100).toFixed(2)}% 回本`
                              : `当前价格高于回本线 ${Math.abs(position.toBreakEvenRate * 100).toFixed(2)}%`}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="delete-holding-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              accountInstrumentDeletionConfirmation(
                                account.name,
                                position.instrumentName,
                              ),
                            )
                          )
                            onDeleteInstrument(
                              account.id,
                              position.instrumentId,
                            );
                        }}
                      >
                        <Trash2 size={15} />
                        删除该产品
                      </button>
                    </div>
                  ))
                ) : (
                  <span>暂无证券持仓</span>
                )}
              </div>
              {expandedId === account.id && (
                <div className="account-detail">
                  <div>
                    <span>累计净投入</span>
                    <strong>¥{money(account.contributions)}</strong>
                  </div>
                  <div>
                    <span>持仓产品</span>
                    <strong>{positions.length} 项</strong>
                  </div>
                  <p>该账户的买卖、费用和收益按移动加权成本独立核算。</p>
                  <div className="account-detail-actions">
                    <button
                      className="text-danger"
                      onClick={() =>
                        confirm(
                          `确认删除账户“${account.name}”？为保护历史数据，有流水或定投计划时系统会阻止删除。`,
                        ) && onDelete(account.id)
                      }
                    >
                      <Trash2 size={15} />
                      删除账户
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        <button className="add-account-card" onClick={onAccount}>
          <Plus size={26} />
          <strong>创建投资账户</strong>
          <span>为新的投资策略单独核算</span>
        </button>
      </div>
    </div>
  );
}

function Ledger({
  data,
  search,
  setSearch,
  onEntry,
  onDelete,
}: {
  data: PortfolioData;
  search: string;
  setSearch: (v: string) => void;
  onEntry: () => void;
  onDelete: (id: number) => void;
}) {
  const exportLedger = () => {
    const header =
      "交易日期,确认日期,类型,账户,产品代码,产品名称,份额,价格,金额,手续费,税费,渠道,备注";
    const lines = rows.map((entry) => {
      const instrument = data.instruments.find(
        (item) => item.id === entry.instrument_id,
      );
      const account = data.accounts.find(
        (item) => item.id === entry.account_id,
      );
      const cells = [
        entry.trade_date,
        entry.confirmation_date,
        kindLabels[entry.kind] ?? entry.kind,
        account?.name ?? "",
        instrument?.code ?? "",
        instrument?.name ?? "",
        entry.quantity_units / 1_000_000,
        entry.price_units / 1_000_000,
        entry.gross_amount_units / 10_000,
        entry.fee_units / 10_000,
        entry.tax_units / 10_000,
        channelLabels[entry.purchase_channel] ?? entry.purchase_channel,
        entry.notes,
      ];
      return cells
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",");
    });
    const blob = new Blob(["\ufeff" + [header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `盈迹交易流水-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const rows = data.ledger.filter((entry) => {
    const instrument = data.instruments.find(
      (item) => item.id === entry.instrument_id,
    );
    const account = data.accounts.find((item) => item.id === entry.account_id);
    return `${instrument?.name ?? ""}${account?.name ?? ""}${entry.notes}${kindLabels[entry.kind] ?? entry.kind}`.includes(
      search,
    );
  });
  const buyTotal = rows
    .filter((entry) => entry.kind === "BUY")
    .reduce((sum, entry) => sum + entry.gross_amount_units / 10_000, 0);
  const sellTotal = rows
    .filter((entry) => entry.kind === "SELL")
    .reduce((sum, entry) => sum + entry.gross_amount_units / 10_000, 0);
  const expenseTotal = rows.reduce(
    (sum, entry) =>
      sum +
      (entry.fee_units + entry.tax_units) / 10_000 +
      (entry.kind === "FEE" ? entry.gross_amount_units / 10_000 : 0),
    0,
  );
  return (
    <div className="stack-page">
      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索账户、产品或备注"
          />
        </label>
        <div>
          <button className="secondary-button" onClick={exportLedger}>
            <Download size={17} />
            导出
          </button>
          <button className="primary-button" onClick={onEntry}>
            <Plus size={17} />
            新增流水
          </button>
        </div>
      </div>
      <section className="ledger-summary" aria-label="流水摘要">
        <div>
          <span className="ledger-summary-icon neutral">
            <Database size={18} />
          </span>
          <span>当前记录</span>
          <strong>{rows.length} 笔</strong>
        </div>
        <div>
          <span className="ledger-summary-icon buy">
            <TrendingDown size={18} />
          </span>
          <span>累计买入</span>
          <strong>¥{money(buyTotal)}</strong>
        </div>
        <div>
          <span className="ledger-summary-icon sell">
            <TrendingUp size={18} />
          </span>
          <span>累计卖出</span>
          <strong>¥{money(sellTotal)}</strong>
        </div>
        <div>
          <span className="ledger-summary-icon fee">
            <CircleDollarSign size={18} />
          </span>
          <span>累计费用</span>
          <strong>¥{money(expenseTotal)}</strong>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>交易 / 确认日期</th>
                <th>交易类型</th>
                <th>账户与产品</th>
                <th className="numeric-heading">成交份额</th>
                <th className="numeric-heading">成交价格</th>
                <th className="numeric-heading">交易金额</th>
                <th className="numeric-heading">手续费 / 税费</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const instrument = data.instruments.find(
                  (item) => item.id === entry.instrument_id,
                );
                const account = data.accounts.find(
                  (item) => item.id === entry.account_id,
                );
                return (
                  <tr key={entry.id}>
                    <td data-label="交易日期">
                      <div className="ledger-cell-stack">
                        <strong>{entry.trade_date}</strong>
                        {entry.confirmation_date && (
                          <small>确认 {entry.confirmation_date}</small>
                        )}
                      </div>
                    </td>
                    <td data-label="交易类型">
                      <span
                        className={`kind-badge ${entry.kind.toLowerCase()}`}
                      >
                        {kindLabels[entry.kind] ?? entry.kind}
                      </span>
                    </td>
                    <td data-label="账户与产品" className="ledger-product-cell">
                      <div className="ledger-cell-stack">
                        <strong>{instrument?.name ?? account?.name}</strong>
                        <small>
                          {instrument
                            ? `${account?.name} · ${instrument.code} · ${channelLabels[entry.purchase_channel] ?? entry.purchase_channel}`
                            : entry.notes || "外部资金流"}
                        </small>
                      </div>
                    </td>
                    <td data-label="成交份额" className="numeric-cell">
                      {entry.quantity_units
                        ? money(entry.quantity_units / 1_000_000, 2)
                        : "—"}
                    </td>
                    <td data-label="成交价格" className="numeric-cell">
                      {entry.price_units
                        ? `¥${money(entry.price_units / 1_000_000, 4)}`
                        : "—"}
                    </td>
                    <td
                      data-label="交易金额"
                      className="number-cell numeric-cell"
                    >
                      ¥{money(entry.gross_amount_units / 10_000)}
                    </td>
                    <td
                      data-label="手续费 / 税费"
                      className="numeric-cell fee-cell"
                    >
                      ¥{money((entry.fee_units + entry.tax_units) / 10_000)}
                    </td>
                    <td className="ledger-row-action">
                      <button
                        className="icon-button danger"
                        aria-label="删除流水"
                        onClick={() =>
                          confirm("确定删除这条流水？相关收益将重新计算。") &&
                          onDelete(entry.id)
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title="没有匹配的流水"
            text="换一个关键词，或新增一笔交易。"
          />
        )}
      </section>
    </div>
  );
}

function Plans({
  data,
  onPlan,
  onEdit,
  onDelete,
  onToggle,
}: {
  data: PortfolioData;
  onPlan: () => void;
  onEdit: (plan: PortfolioData["plans"][number]) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const activePlans = data.plans.filter((plan) => plan.status === "ACTIVE");
  const monthlyAmount = activePlans.reduce((sum, plan) => sum + plan.amount, 0);
  return (
    <div className="stack-page">
      <section className="plan-summary">
        <div>
          <span>
            <WalletCards size={16} /> 每月计划投入
          </span>
          <strong>¥ {money(monthlyAmount, 0)}</strong>
          <p>{activePlans.length} 个计划正在运行</p>
        </div>
        <div>
          <span>
            <CalendarDays size={16} /> 今年预计投入
          </span>
          <strong>¥ {money(monthlyAmount * 12, 0)}</strong>
          <p>按当前计划估算</p>
        </div>
        <button className="primary-button light" onClick={onPlan}>
          <Plus size={17} />
          新建定投
        </button>
      </section>
      <div className="plan-grid">
        {data.plans.map((plan, index) => {
          const instrument = data.instruments.find(
            (item) => item.id === plan.instrument_id,
          );
          const accent = COLORS[index % COLORS.length];
          return (
            <article
              className="plan-card"
              key={plan.id}
              style={{ borderTopColor: accent }}
            >
              <div className="plan-card-head">
                <span style={{ background: accent }}>
                  <CalendarDays size={20} />
                </span>
                <span
                  className={`status-badge ${plan.status === "ACTIVE" ? "" : "paused"}`}
                >
                  {plan.status === "ACTIVE" ? "运行中" : "已暂停"}
                </span>
              </div>
              <div className="plan-card-title">
                <h2>{plan.instrumentName}</h2>
                <div className="plan-tags">
                  {instrument?.code && <span>{instrument.code}</span>}
                  {instrument?.asset_class && (
                    <span>{instrument.asset_class}</span>
                  )}
                </div>
              </div>
              <div className="plan-account">
                <Landmark size={15} />
                <span>{plan.accountName}</span>
              </div>
              <div className="plan-amount">
                <span>每月计划投入</span>
                <div>
                  <strong>¥{money(plan.amount, 0)}</strong>
                  <small>/ 月</small>
                </div>
              </div>
              <div className="plan-date">
                <div>
                  <span>下一期</span>
                  <strong>{plan.next_date}</strong>
                </div>
                <div>
                  <span>固定执行日</span>
                  <strong>每月 {plan.day_of_month} 日</strong>
                </div>
              </div>
              <div className="plan-progress">
                <div>
                  <span
                    style={{
                      width: `${Math.min(100, (plan.day_of_month / 28) * 100)}%`,
                      background: accent,
                    }}
                  />
                </div>
                <small>到期后生成待确认任务，不会伪造成交</small>
              </div>
              <div className="plan-actions">
                <button
                  className="secondary-button plan-edit-button"
                  onClick={() => onEdit(plan)}
                >
                  <Settings2 size={16} />
                  编辑
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onToggle(plan.id)}
                >
                  {plan.status === "ACTIVE" ? "暂停" : "恢复"}
                </button>
                <button
                  className="text-danger"
                  onClick={() =>
                    confirm("删除这个定投计划？历史交易不会受影响。") &&
                    onDelete(plan.id)
                  }
                >
                  <Trash2 size={16} />
                  删除
                </button>
              </div>
            </article>
          );
        })}
        <button className="add-plan-card" onClick={onPlan}>
          <Plus size={24} />
          <strong>添加定投计划</strong>
          <span>设置金额、产品与执行日</span>
        </button>
      </div>
      <DcaSimulator instruments={data.instruments} />
    </div>
  );
}

function Allocation({
  data,
  submit,
}: {
  data: PortfolioData;
  submit: (p: Record<string, unknown>, s?: string) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [showLegacyTargets, setShowLegacyTargets] = useState(false);
  const [showOtherProducts, setShowOtherProducts] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const allocationSummary = data.allocation.reduce<PortfolioData["allocation"]>(
    (items, item) => {
      const existing = items.find(
        (current) => current.instrumentId === item.instrumentId,
      );
      if (existing) {
        existing.value += item.value;
        existing.actual += item.actual;
        existing.drift = existing.actual - existing.target;
        existing.alert = existing.alert || item.alert;
      } else {
        items.push({ ...item });
      }
      return items;
    },
    [],
  );
  const rawTargetPercent = (instrumentId: number) => {
    const saved = data.targets.find(
      (target) => target.instrument_id === instrumentId,
    );
    return Number(drafts[instrumentId] ?? (saved?.target_bps ?? 0) / 100);
  };
  const targetBps = (instrumentId: number) => {
    const value = rawTargetPercent(instrumentId);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  };
  const targetRows = data.instruments.map((instrument, index) => {
    const current = allocationSummary.find(
      (item) => item.instrumentId === instrument.id,
    );
    const savedTarget =
      (data.targets.find((target) => target.instrument_id === instrument.id)
        ?.target_bps ?? 0) / 100;
    return {
      instrument,
      index,
      current,
      currentValue: current?.value ?? 0,
      currentPercent: (current?.actual ?? 0) * 100,
      savedTarget,
      rawTarget: rawTargetPercent(instrument.id),
      targetBps: targetBps(instrument.id),
      target: targetBps(instrument.id) / 100,
    };
  });
  const heldRows = targetRows.filter((row) => row.currentValue > 0);
  const legacyRows = targetRows.filter(
    (row) => row.currentValue <= 0 && row.savedTarget > 0,
  );
  const otherRows = targetRows.filter(
    (row) => row.currentValue <= 0 && row.savedTarget <= 0,
  );
  const productTargetBps = targetRows.reduce(
    (sum, row) => sum + row.targetBps,
    0,
  );
  const productTarget = productTargetBps / 100;
  const cashTargetBps = Math.max(0, 10_000 - productTargetBps);
  const cashTarget = cashTargetBps / 100;
  const currentCashValue = Math.max(0, data.metrics.cash);
  const currentCashPercent =
    data.metrics.totalAssets > 0
      ? (currentCashValue / data.metrics.totalAssets) * 100
      : 0;
  const cashGap = cashTarget - currentCashPercent;
  const cashGapAmount =
    Math.abs(cashGap / 100) * Math.max(0, data.metrics.totalAssets);
  const targetValuesValid = targetRows.every(
    (row) =>
      Number.isFinite(row.rawTarget) &&
      row.rawTarget >= 0 &&
      row.rawTarget <= 100,
  );
  const targetTotalIsValid = targetValuesValid && productTargetBps <= 10_000;
  const unheldTargetRows = targetRows.filter(
    (row) => row.currentValue <= 0 && row.targetBps > 0,
  );
  const targetStatusIsReady =
    targetTotalIsValid && unheldTargetRows.length === 0;
  const heldMarketValue = heldRows.reduce(
    (sum, row) => sum + row.currentValue,
    0,
  );
  const legacyTargetTotal = legacyRows.reduce(
    (sum, row) => sum + row.savedTarget,
    0,
  );
  const heldWithoutSavedTarget = heldRows.filter((row) => row.savedTarget <= 0);

  const useCurrentHoldingsAsDraft = () => {
    if (heldRows.length === 0 || heldMarketValue <= 0) return;
    if (
      !confirm(
        "按当前持仓生成目标比例草稿？\n\n目前没有持有的旧目标会被设为 0。这里只生成草稿，不会自动保存，也不会发生任何买卖。",
      )
    )
      return;

    const nextDrafts: Record<number, string> = {};
    const desiredCashBps = Math.min(
      10_000,
      Math.max(
        0,
        Math.round((currentCashValue / data.metrics.totalAssets) * 10_000),
      ),
    );
    const productBudgetBps = 10_000 - desiredCashBps;
    let assignedBps = 0;
    heldRows.forEach((row, index) => {
      const isLast = index === heldRows.length - 1;
      const valueBps = isLast
        ? Math.max(0, productBudgetBps - assignedBps)
        : Math.min(
            Math.max(0, productBudgetBps - assignedBps),
            Math.round((row.currentValue / heldMarketValue) * 10_000),
          );
      assignedBps += valueBps;
      nextDrafts[row.instrument.id] = (valueBps / 100).toFixed(2);
    });
    targetRows.forEach((row) => {
      if (row.currentValue <= 0) nextDrafts[row.instrument.id] = "0";
    });
    setDrafts(nextDrafts);
    setShowLegacyTargets(true);
    setDraftNotice(
      `已按当前资产生成草稿，并保留 ${(desiredCashBps / 100).toFixed(
        2,
      )}% 现金目标。未持有的旧目标已设为 0，请检查后保存。`,
    );
  };

  const saveAllTargets = async () => {
    if (!targetTotalIsValid) {
      setDraftNotice(
        "每个产品目标必须在 0% 到 100% 之间，产品目标合计不能超过 100%。",
      );
      return;
    }
    const saved = await submit(
      {
        action: "updateTargets",
        targets: [
          { instrumentId: 0, targetPercent: cashTargetBps / 100 },
          ...targetRows.map((row) => ({
            instrumentId: row.instrument.id,
            targetPercent: row.targetBps / 100,
          })),
        ],
      },
      "全部目标比例已保存",
    );
    if (saved) {
      setDrafts({});
      setDraftNotice("");
    }
  };

  const renderTargetRow = (row: (typeof targetRows)[number]) => {
    const { instrument, index, currentValue, currentPercent, target } = row;
    const gap = target - currentPercent;
    const approximateAmount =
      Math.abs(gap / 100) * Math.max(0, data.metrics.totalAssets);
    const color = COLORS[index % COLORS.length];
    return (
      <div className="target-row target-row-plain" key={instrument.id}>
        <div className="target-name">
          <i style={{ background: color }} />
          <div>
            <strong>{instrument.name}</strong>
            <span>{instrument.code}</span>
          </div>
        </div>
        <div className="target-current-value">
          <span>现在持有</span>
          <strong>¥{money(currentValue)}</strong>
          <small>占总资产 {currentPercent.toFixed(1)}%</small>
        </div>
        <label className="target-input-label">
          <span>我希望占</span>
          <div>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              aria-label={`${instrument.name}目标占比`}
              value={drafts[instrument.id] ?? target}
              onChange={(event) => {
                const value = event.target.value;
                if (!/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) return;
                setDrafts((currentDrafts) => ({
                  ...currentDrafts,
                  [instrument.id]: value,
                }));
                setDraftNotice("目标比例尚未保存，请检查合计后保存。");
              }}
              onBlur={(event) => {
                if (event.target.value === "") return;
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setDrafts((currentDrafts) => ({
                  ...currentDrafts,
                  [instrument.id]: String(Math.round(value * 100) / 100),
                }));
              }}
            />
            <b>%</b>
          </div>
        </label>
        <div
          className={`target-gap ${
            Math.abs(gap) <= 0.05
              ? "is-balanced"
              : gap > 0
                ? "is-under"
                : "is-over"
          }`}
        >
          <strong>
            {Math.abs(gap) <= 0.05
              ? "已达到目标"
              : gap > 0
                ? `还差 ${gap.toFixed(1)}%`
                : `超出 ${Math.abs(gap).toFixed(1)}%`}
          </strong>
          <span>
            {Math.abs(gap) <= 0.05
              ? "当前比例与目标一致"
              : gap > 0
                ? `按当前总资产折算，约需买入 ¥${money(approximateAmount)}`
                : `按当前总资产折算，若调仓约需减少 ¥${money(approximateAmount)}`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="allocation-page">
      <section className="panel allocation-hero">
        <div className="big-donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocationSummary}
                dataKey="value"
                innerRadius="67%"
                outerRadius="88%"
                paddingAngle={3}
                stroke="none"
              >
                {allocationSummary.map((item, i) => (
                  <Cell
                    key={item.instrumentId}
                    fill={COLORS[i % COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div>
            <span>总资产</span>
            <strong>¥{compactMoney(data.metrics.totalAssets)}</strong>
          </div>
        </div>
        <div className="allocation-hero-copy">
          <span className="eyebrow">当前持仓分布（按市值）</span>
          <h2>你的资产现在分别放在哪里</h2>
          <p>
            这里显示的是你现在实际持有的资产，不是目标。占比等于该产品当前市值除以总资产，现金也会单独计算。
          </p>
          <div className="allocation-summary-list">
            {allocationSummary.map((item, index) => (
              <div key={item.instrumentId}>
                <i style={{ background: COLORS[index % COLORS.length] }} />
                <span>
                  <strong>{item.name}</strong>
                  <small>¥{money(item.value)}</small>
                </span>
                <b>{(item.actual * 100).toFixed(1)}%</b>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel allocation-target-panel">
        <div className="allocation-target-head">
          <div>
            <span className="eyebrow">我的配置目标</span>
            <h2>设置你希望每个产品占多大比例</h2>
            <p>
              例如填写 20%，表示你希望这个产品约占总资产的
              20%。修改目标只用于计算和提醒，不会自动买卖。
            </p>
          </div>
          <button
            type="button"
            className="secondary-button current-as-target-button"
            disabled={heldRows.length === 0}
            onClick={useCurrentHoldingsAsDraft}
          >
            按当前持仓生成目标草稿
          </button>
        </div>
        {legacyRows.length > 0 && heldWithoutSavedTarget.length > 0 && (
          <div className="target-diagnosis" role="note">
            <AlertTriangle size={20} />
            <div>
              <strong>已找到“全部偏离”的原因</strong>
              <span>
                有 {legacyRows.length} 个目标设在目前没持有的产品上，同时有{" "}
                {heldWithoutSavedTarget.length}
                个真实持仓还没有目标，所以系统会全部提示偏离。请把旧目标改为
                0，再给真实持仓填写目标；也可以使用右上角按钮先生成草稿。
              </span>
            </div>
          </div>
        )}
        <div className="cash-target-card" role="note">
          <div className="cash-target-name">
            <span style={{ background: "#8995ad" }} />
            <div>
              <strong>现金 / 待配置资金</strong>
              <span>不会被当作基金买入</span>
            </div>
          </div>
          <div className="cash-target-readonly">
            <span>当前现金</span>
            <strong>¥{money(currentCashValue)}</strong>
            <small>{currentCashPercent.toFixed(1)}%</small>
          </div>
          <div className="cash-target-readonly">
            <span>自动目标</span>
            <strong>{cashTarget.toFixed(1)}%</strong>
            <small>
              {Math.abs(cashGap) <= 0.05
                ? "已达到"
                : cashGap > 0
                  ? `还需保留约 ¥${money(cashGapAmount)}`
                  : `超出约 ¥${money(cashGapAmount)}`}
            </small>
          </div>
        </div>
        <div
          className={`target-total-status ${targetStatusIsReady ? "is-ready" : "is-incomplete"}`}
          role="status"
        >
          <div>
            <strong>
              产品 {productTarget.toFixed(1)}% + 现金 {cashTarget.toFixed(1)}% = 100%
            </strong>
            <span>
              {!targetValuesValid
                ? "每项比例必须在 0% 到 100% 之间"
                : targetTotalIsValid
                  ? unheldTargetRows.length > 0
                    ? `剩余比例已自动作为现金目标，可以保存；其中 ${unheldTargetRows.length} 项产品目前未持有，请确认是否仍计划购买`
                    : "剩余比例已自动作为现金/待配置资金，现在可以保存"
                  : `产品目标已超出 ${(productTarget - 100).toFixed(1)}%，请调低部分目标`}
            </span>
          </div>
          <button
            className="primary-button save-all-targets"
            disabled={!targetTotalIsValid}
            onClick={() => void saveAllTargets()}
          >
            <Check size={16} />
            保存全部目标比例
          </button>
        </div>
        {draftNotice && <p className="target-draft-notice">{draftNotice}</p>}
        <div className="target-section-label">
          <div>
            <strong>你现在持有的产品</strong>
            <span>先看实际金额，再填写希望达到的比例</span>
          </div>
          <b>{heldRows.length} 项持仓</b>
        </div>
        <div className="target-list">
          {heldRows.length ? (
            heldRows.map(renderTargetRow)
          ) : (
            <div className="target-empty-state">当前还没有持仓。</div>
          )}
        </div>
        {legacyRows.length > 0 && (
          <div className="target-fold-group legacy-target-group">
            <button
              type="button"
              className="target-fold-toggle"
              aria-expanded={showLegacyTargets}
              aria-controls="legacy-target-list"
              onClick={() => setShowLegacyTargets(!showLegacyTargets)}
            >
              <span>
                <strong>旧目标（目前没有持有）</strong>
                <small>
                  {legacyRows.length} 项，占用目标合计{" "}
                  {legacyTargetTotal.toFixed(1)}% ；如不再计划购买，请改为 0
                </small>
              </span>
              <b>{showLegacyTargets ? "收起" : "查看并处理"}</b>
            </button>
            {showLegacyTargets && (
              <div
                className="target-list target-fold-content"
                id="legacy-target-list"
              >
                {legacyRows.map(renderTargetRow)}
              </div>
            )}
          </div>
        )}
        {otherRows.length > 0 && (
          <div className="target-fold-group other-target-group">
            <button
              type="button"
              className="target-fold-toggle"
              aria-expanded={showOtherProducts}
              aria-controls="other-target-list"
              onClick={() => setShowOtherProducts(!showOtherProducts)}
            >
              <span>
                <strong>其他产品</strong>
                <small>当前没持有，也没有设置目标，默认隐藏</small>
              </span>
              <b>
                {showOtherProducts
                  ? "收起"
                  : `显示其他产品（${otherRows.length}）`}
              </b>
            </button>
            {showOtherProducts && (
              <div
                className="target-list target-fold-content"
                id="other-target-list"
              >
                {otherRows.map(renderTargetRow)}
              </div>
            )}
          </div>
        )}
      </section>
      <SmartTopUpAdvisor
        instruments={data.instruments}
        holdings={data.holdings}
        targets={data.targets}
        cashValue={data.metrics.cash ?? 0}
      />
    </div>
  );
}

function Analytics({
  data,
  submit,
  busy,
  error,
}: {
  data: PortfolioData;
  submit: (p: Record<string, unknown>, s?: string) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const [news, setNews] = useState<MarketNewsFeed | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const loadNews = async (force = false) => {
    setNewsLoading(true);
    try {
      const response = await fetch(
        `/api/market-news${force ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as MarketNewsFeed;
      if (!response.ok) throw new Error("市场资讯读取失败");
      setNews(result);
    } catch (caught) {
      setNews({
        items: [],
        updatedAt: new Date().toISOString(),
        source: "东方财富网财经导读",
        isLive: false,
        isToday: false,
        message: caught instanceof Error ? caught.message : "市场资讯读取失败",
      });
    } finally {
      setNewsLoading(false);
    }
  };
  useEffect(() => {
    const initial = window.setTimeout(() => void loadNews(), 0);
    const refresh = window.setInterval(() => void loadNews(), 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, []);

  return (
    <div className="analytics-page">
      <section className="panel market-news-panel">
        <div className="market-news-head">
          <div className="market-news-heading">
            <span className="market-news-mark">
              <Newspaper size={22} />
            </span>
            <div>
              <div className="market-news-title-line">
                <h2>今日市场资讯</h2>
                <span
                  className={`news-live-badge ${news?.isLive ? "" : "offline"}`}
                >
                  <i /> {news?.isLive ? "自动更新" : "数据源异常"}
                </span>
              </div>
              <p>
                {news?.message ?? "正在获取国内、海外及基金 ETF 最新资讯"}
                {news?.updatedAt
                  ? ` · 更新于 ${new Date(news.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            </div>
          </div>
          <button
            className="secondary-button"
            disabled={newsLoading}
            onClick={() => void loadNews(true)}
          >
            <RefreshCcw size={17} className={newsLoading ? "spin" : ""} />
            {newsLoading ? "更新中" : "立即更新"}
          </button>
        </div>
        {newsLoading && !news ? (
          <div className="news-loading-grid" aria-label="市场资讯加载中">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : news?.items.length ? (
          <div className="market-news-grid">
            {news.items.map((item) => (
              <a
                className={`market-news-card category-${item.category}`}
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                <div className="news-card-meta">
                  <span>{item.category}</span>
                  <time>{item.publishedAt.slice(5, 16)}</time>
                </div>
                <h3>{item.title}</h3>
                {item.summary && <p>{item.summary}</p>}
                <div className="news-card-source">
                  <span>{item.source}</span>
                  <span>
                    查看原文 <ExternalLink size={14} />
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="news-empty">
            <AlertTriangle size={22} />
            <strong>市场资讯暂时无法加载</strong>
            <span>{news?.message}</span>
            <button onClick={() => void loadNews(true)}>重新获取</button>
          </div>
        )}
        <p className="news-disclaimer">
          新闻标题与摘要来自 {news?.source ?? "财经公开资讯源"}
          ，仅用于信息记录，不构成投资建议。
        </p>
      </section>
      <section className="metric-grid risk-grid">
        <MetricCard
          label="累计 TWR"
          value={percent(data.metrics.twr)}
          footnote="排除外部现金流影响"
          tone={data.metrics.twr >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <MetricCard
          label="年化 XIRR"
          value={percent(data.metrics.xirr)}
          footnote="反映资金金额与时点"
          tone={(data.metrics.xirr ?? 0) >= 0 ? "positive" : "negative"}
          icon={Activity}
        />
        <MetricCard
          label="年化波动率"
          value={percent(data.risk.volatility)}
          footnote="日收益标准差 × √252"
          icon={Gauge}
        />
        <MetricCard
          label="最大回撤"
          value={percent(data.risk.maxDrawdown)}
          footnote="历史峰值至谷底"
          tone="negative"
          icon={TrendingDown}
        />
      </section>
      <section className="panel return-chart">
        <PanelTitle
          title="累计收益与回撤"
          subtitle="基于日频 TWR 财富指数"
          action={data.methodology}
        />
        <div className="chart-xl">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#E8EBF2"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(2, 7)}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
              />
              <YAxis
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="#C9CED9" />
              <Line
                name="累计收益率"
                dataKey="twr"
                type="monotone"
                stroke="#5B7CFA"
                strokeWidth={2.4}
                dot={false}
              />
              <Line
                name="回撤"
                dataKey="drawdown"
                type="monotone"
                stroke={LOSS_COLOR}
                strokeWidth={1.8}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <ProfitCalendar series={data.series} />
      <FundLookthrough
        instruments={data.instruments}
        holdings={data.holdings}
        totalAssets={data.metrics.totalAssets}
      />
      <div className="analytics-lower">
        <section className="panel">
          <PanelTitle
            title="各基金盈亏百分点"
            subtitle="左侧为累计盈亏金额，右侧为当前持仓收益率"
          />
          <div className="ranking-list">
            {data.rankings.map((item, index) => (
              <div key={item.name}>
                <span className="rank">{index + 1}</span>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.profit >= 0 ? "+" : ""}¥{money(item.profit)}
                  </span>
                </div>
                <strong
                  className={`ranking-return ${item.returnRate >= 0 ? "up" : "down"}`}
                >
                  <small>
                    {item.returnRate >= 0 ? "持仓盈利" : "持仓亏损"}
                  </small>
                  {percent(item.returnRate)}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="胜率与风险质量" subtitle="按有涨跌的估值日计算" />
          <div className="risk-detail">
            <div
              className="win-ring"
              style={
                {
                  "--win": `${data.risk.winRate * 360}deg`,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>{(data.risk.winRate * 100).toFixed(1)}%</strong>
                <span>日胜率</span>
              </div>
            </div>
            <div className="risk-numbers">
              <div>
                <span>盈利日</span>
                <strong className="up">{data.risk.positiveDays}</strong>
              </div>
              <div>
                <span>亏损日</span>
                <strong className="down">{data.risk.negativeDays}</strong>
              </div>
              <div>
                <span>夏普比率</span>
                <strong>{data.risk.sharpe.toFixed(2)}</strong>
              </div>
              <div>
                <span>手续费</span>
                <strong>¥{money(data.metrics.fees)}</strong>
              </div>
            </div>
          </div>
        </section>
      </div>
      <JournalPanel
        entries={data.journal}
        accounts={data.accounts}
        instruments={data.instruments}
        busy={busy}
        error={error}
        submit={submit}
      />
    </div>
  );
}

function DataCenter({
  data,
  onImport,
  onPrice,
  onInstrument,
  submit,
}: {
  data: PortfolioData;
  onImport: () => void;
  onPrice: () => void;
  onInstrument: () => void;
  submit: (p: Record<string, unknown>, s?: string) => Promise<boolean>;
}) {
  const [exporting, setExporting] = useState(false);
  const downloadTemplate = () => {
    const content =
      "账户名称,交易类型,交易日期,确认日期,产品代码,成交份额,成交价格,成交金额,手续费,税费,备注,外部流水号\n纳斯达克100ETF,BUY,2026-07-18,2026-07-21,513100,100,2.846,284.6,0.1,0,示例交易,REF-001";
    const blob = new Blob(["\ufeff" + content], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "盈迹交易导入模板.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportData = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/paper-trading", {
        cache: "no-store",
      });
      const paperTrading = (await response.json()) as Record<string, unknown>;
      if (!response.ok)
        throw new Error(String(paperTrading.error || "模拟账本读取失败"));
      const backup = {
        format: "YINGJI_COMPLETE_BACKUP",
        version: 2,
        exportedAt: new Date().toISOString(),
        portfolio: data,
        paperTrading,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `盈迹完整备份-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : "完整备份导出失败");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="data-page">
      <section className="data-card import-card">
        <div className="data-icon blue">
          <Upload size={22} />
        </div>
        <div>
          <h2>导入交易数据</h2>
          <p>支持 CSV、XLSX、XLS 文件，导入前会检查账户与产品代码。</p>
          <div className="button-row">
            <button className="primary-button" onClick={onImport}>
              <FileSpreadsheet size={17} />
              选择文件
            </button>
            <button className="secondary-button" onClick={downloadTemplate}>
              <Download size={17} />
              下载模板
            </button>
          </div>
        </div>
      </section>
      <section className="data-card">
        <div className="data-icon green">
          <Activity size={22} />
        </div>
        <div>
          <h2>更新价格 / 净值</h2>
          <p>录入最新价格后，市值、未实现收益和配置比例会立即重算。</p>
          <button className="secondary-button" onClick={onPrice}>
            <RefreshCcw size={17} />
            更新估值
          </button>
        </div>
      </section>
      <section className="data-card">
        <div className="data-icon amber">
          <Layers3 size={22} />
        </div>
        <div>
          <h2>产品资料</h2>
          <p>新增基金、股票或 ETF，设置代码、市场、币种和资产类别。</p>
          <button className="secondary-button" onClick={onInstrument}>
            <Plus size={17} />
            新增产品
          </button>
        </div>
      </section>
      <section className="data-card">
        <div className="data-icon purple">
          <Database size={22} />
        </div>
        <div>
          <h2>完整数据备份</h2>
          <p>导出真实账户、流水、计划、复盘和独立模拟账本为 JSON 文件。</p>
          <button
            className="secondary-button"
            disabled={exporting}
            onClick={() => void exportData()}
          >
            <Download size={17} />
            {exporting ? "正在整理…" : "导出完整备份"}
          </button>
        </div>
      </section>
      <LoginSecurityCard />
      <section className="panel audit-panel">
        <PanelTitle title="数据完整性" subtitle="专业收益计算所需条件" />
        <div className="audit-list">
          <div>
            <span className="audit-ok">
              <Check size={16} />
            </span>
            <div>
              <strong>账户与交易账本</strong>
              <p>
                {data.accounts.length} 个账户，{data.ledger.length} 条流水
              </p>
            </div>
          </div>
          <div>
            <span className="audit-ok">
              <Check size={16} />
            </span>
            <div>
              <strong>成本批次</strong>
              <p>移动加权成本，卖出时按剩余成本比例匹配</p>
            </div>
          </div>
          <div>
            <span className={data.valuationDate ? "audit-ok" : "audit-warn"}>
              {data.valuationDate ? (
                <Check size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
            </span>
            <div>
              <strong>最新估值</strong>
              <p>
                {data.valuationDate
                  ? `当前价格截至 ${data.valuationDate}`
                  : "缺少价格，无法计算未实现收益"}
              </p>
            </div>
          </div>
          <div>
            <span className="audit-warn">
              <AlertTriangle size={16} />
            </span>
            <div>
              <strong>TWR 估值粒度</strong>
              <p>{data.methodology}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="panel instrument-panel">
        <PanelTitle
          title="产品与数据源"
          subtitle="查看同步状态并更新真实基金数据"
        />
        <div className="instrument-list">
          {data.instruments.map((instrument) => (
            <div key={instrument.id}>
              <div>
                <strong>{instrument.name}</strong>
                <span>
                  {instrument.code} · {instrument.product_type} ·{" "}
                  {instrument.data_source}
                </span>
              </div>
              <div>
                <span>
                  标准费率 {(instrument.buy_fee_bps / 100).toFixed(2)}%
                </span>
                <span>
                  第三方 {(instrument.eastmoney_fee_bps / 100).toFixed(2)}%
                </span>
              </div>
              <button
                className="secondary-button"
                disabled={
                  !/^\d{6}$/.test(instrument.code) ||
                  !["FUND", "ETF"].includes(instrument.product_type)
                }
                onClick={() =>
                  void submit(
                    { action: "syncInstrument", instrumentId: instrument.id },
                    `${instrument.name} 已同步`,
                  )
                }
              >
                <RefreshCcw size={15} />
                同步数据
              </button>
              <button
                className="text-danger"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  if (confirm("确认删除产品 " + instrument.name + "？有买卖交易的不可删除。"))
                    void submit(
                      { action: "deleteInstrument", instrumentId: instrument.id },
                      instrument.name + " 已删除",
                    );
                }}
              >
                <Trash2 size={15} />
                删除
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LoginSecurityCard() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    currentPassword: "",
    newUsername: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/auth/credentials", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          setAvailable(false);
          return;
        }
        const result = (await response.json()) as {
          username?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "无法读取登录设置");
        setForm((current) => ({
          ...current,
          newUsername: result.username ?? "",
        }));
        setAvailable(true);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setAvailable(false);
          setError(
            caught instanceof Error ? caught.message : "无法读取登录设置",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.newPassword !== form.confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/auth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newUsername: form.newUsername,
          newPassword: form.newPassword,
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "登录信息修改失败");
      setMessage(result.message || "登录信息已修改，请使用新账号重新登录");
      setForm((current) => ({
        ...current,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      window.setTimeout(() => window.location.assign("/"), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录信息修改失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="data-card security-card">
      <div className="data-icon blue">
        <ShieldCheck size={22} />
      </div>
      <div className="security-content">
        <h2>安全与登录</h2>
        <p>
          修改本网站的登录账号和密码。新凭据使用加盐哈希保存，不会写入投资数据库。
        </p>
        {available === false ? (
          <div className="security-unavailable">
            {error ||
              "请在独立服务器域名中使用此功能。私有备用站由平台账号保护。"}
          </div>
        ) : (
          <form className="form-grid security-form" onSubmit={save}>
            <Field label="当前密码">
              <input
                required
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) => set("currentPassword", event.target.value)}
              />
            </Field>
            <Field label="新登录账号">
              <input
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
                value={form.newUsername}
                onChange={(event) => set("newUsername", event.target.value)}
              />
              <small>3–32 位字母、数字、点、下划线或短横线</small>
            </Field>
            <Field label="新密码">
              <input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(event) => set("newPassword", event.target.value)}
              />
              <small>至少 12 位，并包含字母、数字、符号等至少三类字符</small>
            </Field>
            <Field label="再次输入新密码">
              <input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => set("confirmPassword", event.target.value)}
              />
            </Field>
            {(error || message) && (
              <div
                className={`security-status ${message ? "success" : "error"}`}
                role="status"
              >
                {message || error}
              </div>
            )}
            <div className="security-actions">
              <button
                className="primary-button"
                disabled={busy || available !== true}
                type="submit"
              >
                <ShieldCheck size={17} />
                {busy ? "正在更新…" : "更新登录信息"}
              </button>
              <span>更新后旧账号立即失效，浏览器会要求重新登录。</span>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function ModalForm({
  type,
  data,
  editingPlan,
  busy,
  error,
  onClose,
  submit,
}: {
  type: Exclude<Modal, null>;
  data: PortfolioData;
  editingPlan: PortfolioData["plans"][number] | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  submit: (p: Record<string, unknown>, s?: string) => Promise<boolean>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const initialPlanInstrument = editingPlan
    ? data.instruments.find((item) => item.id === editingPlan.instrument_id)
    : data.instruments[0];
  const initialPlanAccount = initialPlanInstrument
    ? matchingAccount(data.accounts, initialPlanInstrument, data.holdings)
    : null;
  const [form, setForm] = useState<Record<string, string>>({
    kind: "BUY",
    accountId: String(
      type === "plan"
        ? (editingPlan?.account_id ??
            initialPlanAccount?.id ??
            data.accounts[0]?.id ??
            "")
        : (data.accounts[0]?.id ?? ""),
    ),
    instrumentId: String(
      type === "plan"
        ? (editingPlan?.instrument_id ?? initialPlanInstrument?.id ?? "")
        : (data.instruments[0]?.id ?? ""),
    ),
    instrumentCode:
      type === "plan"
        ? (initialPlanInstrument?.code ?? "")
        : (data.instruments[0]?.code ?? ""),
    preferredProductType:
      initialPlanInstrument?.product_type === "STOCK" ? "STOCK" : "FUND",
    tradeDate: today,
    tradeTime: shanghaiTimeForInput(),
    confirmationDate: "",
    priceDate: today,
    nextDate: editingPlan?.next_date ?? today,
    dayOfMonth: String(editingPlan?.day_of_month ?? 5),
    amount: editingPlan ? String(editingPlan.amount) : "",
    market: "CN",
    assetClass: "美国股票",
    currency: "CNY",
    productType: "FUND",
    buyFeePercent: "0.15",
    buyDiscountPercent: "100",
    sellFeePercent: "0.50",
    minFee: "0",
    purchaseChannel: "EASTMONEY",
    eastmoneyFeePercent: "0",
    minPurchase: "0",
    redemptionFeeJson: "[]",
    dataSource: "MANUAL",
    sourceUpdatedAt: "",
    latestNav: "",
    latestNavDate: "",
    color: "#5B7CFA",
  });
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState("");
  const [fundCategory, setFundCategory] = useState("");
  const [quoteMeta, setQuoteMeta] = useState<{
    price: number;
    date: string;
    requestedDate: string;
    isExact: boolean;
    isLive: boolean;
  } | null>(null);
  const [confirmationBusinessDays, setConfirmationBusinessDays] = useState<
    number | null
  >(null);
  const [confirmationIsAuto, setConfirmationIsAuto] = useState(true);
  const [priceIsAuto, setPriceIsAuto] = useState(true);
  const [amountIsAuto, setAmountIsAuto] = useState(true);
  const [quantityIsAuto, setQuantityIsAuto] = useState(true);
  const [feeIsAuto, setFeeIsAuto] = useState(true);
  const [resolvedInstrument, setResolvedInstrument] = useState<
    PortfolioData["instruments"][number] | null
  >(null);
  const selectedInstrument =
    (resolvedInstrument?.id === Number(form.instrumentId)
      ? resolvedInstrument
      : undefined) ??
    data.instruments.find((item) => item.id === Number(form.instrumentId));
  useEffect(() => {
    if (type !== "entry" || !["BUY", "SELL", "DIVIDEND"].includes(form.kind))
      return;
    const code = (form.instrumentCode ?? "").trim().toUpperCase();
    const preferredProductType =
      form.preferredProductType === "STOCK" ? "STOCK" : "FUND";
    const existing = data.instruments.find((item) =>
      instrumentCodeMatches(item, code, preferredProductType),
    );
    const isCompleteCode =
      preferredProductType === "FUND"
        ? /^\d{6}$/.test(code)
        : /^(?:(?:SH|SZ)?\d{6}|\d{6}\.(?:SH|SZ))$/.test(code);
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setResolvedInstrument(null);
        if (!isCompleteCode) {
          setQuoteMeta(null);
          setFundCategory("");
          setConfirmationBusinessDays(null);
          setLookupNote(
            code
              ? preferredProductType === "STOCK"
                ? "自动行情目前支持沪深 A 股，例如 600519 或 SZ000001"
                : "请输入完整的 6 位基金或 ETF 代码"
              : "",
          );
          return;
        }
        setPriceIsAuto(true);
        setLookupBusy(true);
        setLookupNote(
          `正在匹配${preferredProductType === "STOCK" ? "股票资料和价格" : `基金资料及 ${form.tradeDate} 对应净值`}…`,
        );
        try {
          const response = await fetch("/api/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "lookupInstrument",
              code,
              tradeDate: form.tradeDate,
              preferredProductType,
            }),
            signal: controller.signal,
          });
          const result = (await response.json()) as {
            error?: string;
            instrument?: PortfolioData["instruments"][number];
            quoteNav?: number;
            quoteNavDate?: string;
            quoteDateRequested?: string;
            quoteIsExact?: boolean;
            latestNav?: number;
            latestNavDate?: string;
            fundCategory?: string;
            confirmationBusinessDays?: number;
            quoteSource?: string;
            isLive?: boolean;
          };
          if (!response.ok || !result.instrument)
            throw new Error(result.error || "未查询到该基金代码");
          setResolvedInstrument(result.instrument);
          setFundCategory(result.fundCategory ?? "");
          setConfirmationBusinessDays(
            result.confirmationBusinessDays ??
              (result.instrument.product_type === "ETF" ? 0 : 1),
          );
          setQuoteMeta(
            result.quoteNav && result.quoteNavDate
              ? {
                  price: result.quoteNav,
                  date: result.quoteNavDate,
                  requestedDate: result.quoteDateRequested ?? form.tradeDate,
                  isExact: result.quoteIsExact === true,
                  isLive: result.isLive !== false,
                }
              : null,
          );
          const account = matchingAccount(
            data.accounts,
            result.instrument,
            data.holdings,
          );
          setForm((current) =>
            current.instrumentCode === code
              ? {
                  ...current,
                  instrumentId:
                    Number(result.instrument?.id ?? 0) > 0
                      ? String(result.instrument?.id)
                      : "",
                  accountId:
                    current.kind === "BUY" && account
                      ? String(account.id)
                      : current.accountId,
                  price: result.quoteNav ? String(result.quoteNav) : "",
                  fee: "",
                  tax:
                    ["FUND", "ETF"].includes(
                      result.instrument?.product_type ?? "",
                    ) && !current.tax
                      ? "0.00"
                      : current.tax,
                }
              : current,
          );
          setLookupNote(
            `已自动匹配：${result.instrument.name} · ${result.fundCategory || result.instrument.product_type} · ${result.instrument.asset_class}${result.quoteNavDate ? `；净值日期 ${result.quoteNavDate}` : `；${form.tradeDate} 之前暂无公开净值`}${account ? (form.kind === "BUY" ? `；保存买入后将把账户“${account.name}”改为正式产品名称` : `；账户已匹配为 ${account.name}`) : ""}`,
          );
        } catch (caught) {
          if (!controller.signal.aborted)
            setLookupNote(
              caught instanceof Error ? caught.message : "查询失败",
            );
        } finally {
          if (!controller.signal.aborted) setLookupBusy(false);
        }
      },
      !isCompleteCode ? 0 : existing ? 120 : 450,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    data.accounts,
    data.holdings,
    data.instruments,
    form.instrumentCode,
    form.kind,
    form.preferredProductType,
    form.tradeDate,
    type,
  ]);
  useEffect(() => {
    if (type !== "plan") return;
    const code = (form.instrumentCode ?? "").trim().toUpperCase();
    const preferredProductType =
      form.preferredProductType === "STOCK" ? "STOCK" : "FUND";
    const isCompleteCode =
      preferredProductType === "FUND"
        ? /^\d{6}$/.test(code)
        : /^(?:(?:SH|SZ)?\d{6}|\d{6}\.(?:SH|SZ))$/.test(code);
    const existing = data.instruments.find((item) =>
      instrumentCodeMatches(item, code, preferredProductType),
    );
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        if (!code) {
          setLookupBusy(false);
          setLookupNote("");
          setResolvedInstrument(null);
          return;
        }
        if (existing) {
          const account = matchingAccount(
            data.accounts,
            existing,
            data.holdings,
          );
          setLookupBusy(false);
          setResolvedInstrument(existing);
          setFundCategory("");
          setForm((current) =>
            current.instrumentCode === code &&
            current.preferredProductType === preferredProductType
              ? {
                  ...current,
                  instrumentId: String(existing.id),
                  accountId:
                    editingPlan?.instrument_id === existing.id
                      ? String(editingPlan.account_id)
                      : account
                        ? String(account.id)
                        : current.accountId,
                }
              : current,
          );
          setLookupNote(
            `已匹配已有产品：${existing.name}${account ? `；推荐账户 ${account.name}` : ""}`,
          );
          return;
        }
        setResolvedInstrument(null);
        if (!isCompleteCode) {
          setLookupBusy(false);
          setLookupNote(
            preferredProductType === "STOCK"
              ? "自动匹配目前支持沪深 A 股，例如 600519、SZ000001 或 600519.SH"
              : "请输入完整的 6 位基金或 ETF 代码",
          );
          return;
        }
        setLookupBusy(true);
        setLookupNote(
          `正在查询${preferredProductType === "STOCK" ? "股票" : "基金 / ETF"}名称和分类…`,
        );
        try {
          const response = await fetch("/api/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "lookupInstrument",
              code,
              preferredProductType,
            }),
            signal: controller.signal,
          });
          const result = (await response.json()) as {
            error?: string;
            instrument?: PortfolioData["instruments"][number];
            fundCategory?: string;
            quoteSource?: string;
          };
          if (!response.ok || !result.instrument)
            throw new Error(result.error || "没有查询到该产品代码");
          const productTypeMatches =
            preferredProductType === "STOCK"
              ? result.instrument.product_type === "STOCK"
              : ["FUND", "ETF"].includes(result.instrument.product_type);
          if (!productTypeMatches)
            throw new Error(
              `该代码返回的是${productTypeLabel(result.instrument)}，请检查“代码类别”后重试`,
            );
          const account = matchingAccount(
            data.accounts,
            result.instrument,
            data.holdings,
          );
          setResolvedInstrument(result.instrument);
          setFundCategory(result.fundCategory ?? "");
          setForm((current) =>
            current.instrumentCode === code &&
            current.preferredProductType === preferredProductType
              ? {
                  ...current,
                  instrumentId:
                    Number(result.instrument?.id ?? 0) > 0
                      ? String(result.instrument?.id)
                      : "",
                  accountId: account ? String(account.id) : current.accountId,
                }
              : current,
          );
          setLookupNote(
            `已自动匹配：${result.instrument.name} · ${productTypeLabel(result.instrument)} · ${result.instrument.asset_class}${account ? `；推荐账户 ${account.name}` : ""}`,
          );
        } catch (caught) {
          if (!controller.signal.aborted) {
            setResolvedInstrument(null);
            setForm((current) =>
              current.instrumentCode === code
                ? { ...current, instrumentId: "" }
                : current,
            );
            setLookupNote(
              caught instanceof Error ? caught.message : "产品查询失败",
            );
          }
        } finally {
          if (!controller.signal.aborted) setLookupBusy(false);
        }
      },
      existing ? 0 : 500,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    data.accounts,
    data.holdings,
    data.instruments,
    editingPlan?.account_id,
    editingPlan?.instrument_id,
    form.instrumentCode,
    form.preferredProductType,
    type,
  ]);
  const calculatedAmount = Number(form.quantity || 0) * Number(form.price || 0);
  const grossPreview = amountIsAuto
    ? calculatedAmount
    : Number(form.amount || 0);
  const baseFeeBps =
    form.kind === "BUY"
      ? form.purchaseChannel === "EASTMONEY"
        ? (selectedInstrument?.eastmoney_fee_bps ?? 0)
        : (selectedInstrument?.buy_fee_bps ?? 0)
      : (selectedInstrument?.sell_fee_bps ?? 0);
  const discountBps =
    form.kind === "BUY"
      ? (selectedInstrument?.buy_discount_bps ?? 10_000)
      : 10_000;
  const estimatedFee = Math.max(
    (grossPreview * ((baseFeeBps * discountBps) / 10_000)) / 10_000,
    baseFeeBps > 0 ? (selectedInstrument?.min_fee_units ?? 0) / 10_000 : 0,
  );
  const displayedAmount =
    amountIsAuto && ["BUY", "SELL"].includes(form.kind)
      ? calculatedAmount > 0
        ? calculatedAmount.toFixed(2)
        : ""
      : (form.amount ?? "");
  const confirmationEstimate =
    confirmationBusinessDays !== null && form.tradeDate
      ? estimateFundConfirmationDate(form.tradeDate, {
          businessDays: confirmationBusinessDays,
          tradeTime: form.tradeTime,
          isExchangeTraded: selectedInstrument?.product_type === "ETF",
        })
      : null;
  const displayedConfirmationDate =
    confirmationIsAuto && confirmationEstimate
      ? confirmationEstimate.confirmationDate
      : (form.confirmationDate ?? "");
  const displayedFee =
    feeIsAuto && form.kind === "BUY"
      ? grossPreview > 0 && selectedInstrument
        ? estimatedFee.toFixed(2)
        : ""
      : (form.fee ?? "");
  const lookupFund = async (codeOverride?: string) => {
    const code = (codeOverride ?? form.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      setLookupNote("请输入 6 位基金或 ETF 代码");
      return;
    }
    setLookupBusy(true);
    setLookupNote("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookupFund", code }),
      });
      const result = (await response.json()) as {
        error?: string;
        name: string;
        fundCategory: string;
        productType: "FUND" | "ETF";
        assetClass: string;
        standardBuyFeeBps: number;
        eastmoneyBuyFeeBps: number;
        minPurchase: number;
        latestNav: number;
        latestNavDate: string;
        redemptionTiers: unknown[];
        source: string;
        updatedAt: string;
      };
      if (!response.ok) throw new Error(result.error || "查询失败");
      setForm((current) => ({
        ...current,
        name: result.name,
        productType: result.productType,
        assetClass: result.assetClass,
        buyFeePercent: String(result.standardBuyFeeBps / 100),
        buyDiscountPercent: "100",
        eastmoneyFeePercent: String(result.eastmoneyBuyFeeBps / 100),
        minPurchase: String(result.minPurchase),
        latestNav: String(result.latestNav),
        latestNavDate: result.latestNavDate,
        redemptionFeeJson: JSON.stringify(result.redemptionTiers),
        dataSource: result.source,
        sourceUpdatedAt: result.updatedAt,
      }));
      setLookupNote(
        `已同步：${result.fundCategory || result.productType} · ${result.assetClass}；净值 ${result.latestNav || "—"}（${result.latestNavDate || "暂无日期"}），标准申购费 ${(result.standardBuyFeeBps / 100).toFixed(2)}%，天天基金 ${(result.eastmoneyBuyFeeBps / 100).toFixed(2)}%`,
      );
    } catch (caught) {
      setLookupNote(caught instanceof Error ? caught.message : "查询失败");
    } finally {
      setLookupBusy(false);
    }
  };
  const title =
    type === "entry"
      ? "新增流水"
      : type === "account"
        ? "创建投资账户"
        : type === "instrument"
          ? "新增基金 / 证券"
          : type === "plan"
            ? editingPlan
              ? "编辑定投计划"
              : "新建定投计划"
            : "更新价格 / 净值";
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (type === "plan" && (lookupBusy || !selectedInstrument)) {
      setLookupNote(
        lookupBusy ? "请等待产品代码查询完成" : "请先输入并匹配有效的产品代码",
      );
      return;
    }
    const action =
      type === "entry"
        ? "createEntry"
        : type === "account"
          ? "createAccount"
          : type === "instrument"
            ? "createInstrument"
            : type === "plan"
              ? editingPlan
                ? "updatePlan"
                : "createPlan"
              : "upsertPrice";
    const payload: Record<string, unknown> = {
      action,
      ...form,
      ...(editingPlan ? { id: editingPlan.id } : {}),
    };
    if (type === "entry") payload.autoRenameAccount = form.kind === "BUY";
    if (type === "entry" && ["BUY", "SELL", "DIVIDEND"].includes(form.kind)) {
      if (lookupBusy || !selectedInstrument) {
        setLookupNote(
          lookupBusy
            ? "请等待产品代码查询完成"
            : "请先输入并匹配有效的产品代码",
        );
        return;
      }
      setLookupBusy(true);
      setLookupNote("正在确认并保存产品资料…");
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resolveInstrument",
            code: form.instrumentCode,
            tradeDate: form.tradeDate,
            preferredProductType:
              form.preferredProductType === "STOCK" ? "STOCK" : "FUND",
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          instrument?: PortfolioData["instruments"][number];
        };
        if (!response.ok || !result.instrument?.id)
          throw new Error(result.error || "产品资料保存失败");
        payload.instrumentId = String(result.instrument.id);
        setResolvedInstrument(result.instrument);
        setForm((current) => ({
          ...current,
          instrumentId: String(result.instrument?.id ?? ""),
        }));
      } catch (caught) {
        setLookupNote(
          caught instanceof Error ? caught.message : "产品资料保存失败",
        );
        return;
      } finally {
        setLookupBusy(false);
      }
    }
    if (type === "plan") {
      setLookupBusy(true);
      setLookupNote("正在确认并保存产品资料…");
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resolveInstrument",
            code: form.instrumentCode,
            preferredProductType:
              form.preferredProductType === "STOCK" ? "STOCK" : "FUND",
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          instrument?: PortfolioData["instruments"][number];
        };
        if (!response.ok || !result.instrument?.id)
          throw new Error(result.error || "产品资料保存失败");
        payload.instrumentId = String(result.instrument.id);
        setResolvedInstrument(result.instrument);
        setForm((current) => ({
          ...current,
          instrumentId: String(result.instrument?.id ?? ""),
        }));
      } catch (caught) {
        setLookupNote(
          caught instanceof Error ? caught.message : "产品资料保存失败",
        );
        return;
      } finally {
        setLookupBusy(false);
      }
    }
    if (type === "entry" && ["BUY", "SELL"].includes(form.kind)) {
      if (feeIsAuto) payload.fee = "";
      payload.confirmationDate = displayedConfirmationDate;
    }
    await submit(
      payload,
      type === "entry"
        ? form.kind === "BUY"
          ? "买入流水已保存，账户名称已同步为正式产品名称，收益已重算"
          : "流水已记入，收益已重算"
        : editingPlan
          ? "定投计划已更新"
          : "已保存",
    );
  };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">盈迹账本</span>
            <h2>{title}</h2>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {type === "entry" && (
            <>
              <div className="segmented">
                {[
                  "BUY",
                  "SELL",
                  "DEPOSIT",
                  "WITHDRAWAL",
                  "DIVIDEND",
                  "FEE",
                ].map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    className={form.kind === kind ? "active" : ""}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        kind,
                        fee: "",
                        confirmationDate: "",
                      }));
                      setFeeIsAuto(true);
                      setConfirmationIsAuto(true);
                    }}
                  >
                    {kindLabels[kind]}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <Field label="账户">
                  <select
                    value={form.accountId}
                    onChange={(e) => set("accountId", e.target.value)}
                  >
                    {data.accounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {form.kind === "BUY" && selectedInstrument && (
                    <small>
                      保存买入后，此账户名称会自动改为“
                      {selectedInstrument.name}”
                    </small>
                  )}
                </Field>
                {["BUY", "SELL", "DIVIDEND"].includes(form.kind) && (
                  <Field label="代码类别">
                    <select
                      value={form.preferredProductType}
                      onChange={(event) => {
                        const preferredProductType =
                          event.target.value === "STOCK" ? "STOCK" : "FUND";
                        setForm((current) => ({
                          ...current,
                          preferredProductType,
                          instrumentId: "",
                          price: "",
                          amount: "",
                          fee: "",
                        }));
                        setResolvedInstrument(null);
                        setLookupNote(
                          form.instrumentCode
                            ? `将按${preferredProductType === "STOCK" ? "沪深 A 股" : "基金 / ETF"}重新匹配代码`
                            : "",
                        );
                      }}
                    >
                      <option value="FUND">基金 / ETF</option>
                      <option value="STOCK">沪深 A 股</option>
                    </select>
                    <small>
                      同一组六位代码可能对应不同产品，请明确选择类别
                    </small>
                  </Field>
                )}
                {["BUY", "SELL", "DIVIDEND"].includes(form.kind) && (
                  <Field label="基金 / 证券代码">
                    <input
                      required
                      list="instrument-codes"
                      autoComplete="off"
                      placeholder={
                        form.preferredProductType === "STOCK"
                          ? "例如 600519、SZ000001"
                          : "例如 001513、510300"
                      }
                      value={form.instrumentCode}
                      onChange={(event) => {
                        const code = event.target.value.trim().toUpperCase();
                        const preferredProductType =
                          form.preferredProductType === "STOCK"
                            ? "STOCK"
                            : "FUND";
                        const matched = data.instruments.find((item) =>
                          instrumentCodeMatches(
                            item,
                            code,
                            preferredProductType,
                          ),
                        );
                        setForm((current) => ({
                          ...current,
                          instrumentCode: code,
                          instrumentId: matched ? String(matched.id) : "",
                          confirmationDate: "",
                          quantity: "",
                          price: "",
                          amount: "",
                          fee: "",
                          tax: "",
                        }));
                        setConfirmationIsAuto(true);
                        setPriceIsAuto(true);
                        setAmountIsAuto(true);
                        setFeeIsAuto(true);
                        setResolvedInstrument(null);
                        setFundCategory("");
                        setQuoteMeta(null);
                        setConfirmationBusinessDays(null);
                        setLookupNote(
                          matched
                            ? `已匹配：${matched.name}`
                            : /^(?:(?:SH|SZ)?\d{6}|\d{6}\.(?:SH|SZ))$/.test(
                                  code,
                                )
                              ? "正在自动匹配产品名称、类型和所选日期价格…"
                              : code
                                ? preferredProductType === "STOCK"
                                  ? "请输入沪深 A 股代码"
                                  : "请输入完整的 6 位基金或 ETF 代码"
                                : "",
                        );
                      }}
                    />
                    <datalist id="instrument-codes">
                      {data.instruments.map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                    </datalist>
                    <small>
                      {lookupBusy
                        ? "正在查询产品名称、分类和所选日期价格…"
                        : lookupNote ||
                          (selectedInstrument
                            ? `${selectedInstrument.name} · ${selectedInstrument.product_type}`
                            : "输入代码后自动匹配，无需预先新增产品")}
                    </small>
                    {selectedInstrument && (
                      <div className="classification-line">
                        <span>
                          {selectedInstrument.product_type === "ETF"
                            ? "场内 ETF"
                            : selectedInstrument.product_type === "FUND"
                              ? "场外基金"
                              : selectedInstrument.product_type}
                        </span>
                        <span>{selectedInstrument.asset_class}</span>
                        {fundCategory && <span>{fundCategory}</span>}
                      </div>
                    )}
                  </Field>
                )}
                {["BUY", "SELL"].includes(form.kind) && (
                  <Field label="购买 / 交易渠道">
                    <select
                      value={form.purchaseChannel}
                      onChange={(e) => {
                        setFeeIsAuto(true);
                        setForm((current) => ({
                          ...current,
                          purchaseChannel: e.target.value,
                          fee: "",
                        }));
                      }}
                    >
                      {form.preferredProductType === "STOCK" ? (
                        <>
                          <option value="OTHER">证券公司 / 券商</option>
                          <option value="DIRECT">其他直连渠道</option>
                        </>
                      ) : (
                        <>
                          <option value="DIRECT">基金公司直销</option>
                          <option value="EASTMONEY">天天基金（第三方）</option>
                          <option value="OTHER">
                            其他第三方 / 银行 / 券商
                          </option>
                        </>
                      )}
                    </select>
                    <small>
                      {form.preferredProductType === "STOCK"
                        ? "券商佣金和税费因账户、市场与成交单而异，请按实际账单填写"
                        : form.purchaseChannel === "DIRECT"
                          ? "采用基金公开标准申购费率"
                          : form.purchaseChannel === "EASTMONEY"
                            ? "采用同步的天天基金当前优惠费率"
                            : "请在手续费中填写该渠道成交账单的实际费用"}
                    </small>
                  </Field>
                )}
                <Field label="交易日期">
                  <input
                    required
                    type="date"
                    value={form.tradeDate}
                    onChange={(e) => {
                      setConfirmationIsAuto(true);
                      set("tradeDate", e.target.value);
                    }}
                  />
                </Field>
                {["BUY", "SELL"].includes(form.kind) &&
                  (!selectedInstrument ||
                    ["FUND", "ETF"].includes(
                      selectedInstrument.product_type,
                    )) && (
                    <>
                      {selectedInstrument?.product_type !== "ETF" && (
                        <Field label="下单时间（中国时间）">
                          <input
                            type="time"
                            value={form.tradeTime ?? ""}
                            onChange={(e) => {
                              setConfirmationIsAuto(true);
                              set("tradeTime", e.target.value);
                            }}
                          />
                          <small>15:00 前通常按当日申请；15:00 起预计顺延至下一工作日。</small>
                        </Field>
                      )}
                      <Field label="份额确认日期">
                        <input
                          type="date"
                          min={form.tradeDate}
                          value={displayedConfirmationDate}
                          onChange={(e) => {
                            setConfirmationIsAuto(false);
                            set("confirmationDate", e.target.value);
                          }}
                        />
                        <small>
                          {confirmationBusinessDays === null
                            ? "匹配代码后自动估算，实际确认单可覆盖"
                            : selectedInstrument?.product_type === "ETF"
                              ? "场内 ETF 按成交日记账；以券商成交回报为准。"
                              : `预计：受理日 ${confirmationEstimate?.acceptedDate ?? "—"}，按 T+${confirmationBusinessDays} 工作日确认${confirmationEstimate?.cutoffPassed ? "（已过 15:00 截止）" : ""}。法定节假日及基金合同规则以确认单为准。`}
                        </small>
                      </Field>
                    </>
                  )}
                {["BUY", "SELL"].includes(form.kind) && (
                  <>
                    <Field label="成交份额">
                      <input
                        required
                        inputMode="decimal"
                        placeholder="0.000000"
                        value={form.quantity ?? ""}
                        onChange={(e) => {
                          const q = e.target.value;
                          setQuantityIsAuto(!q.trim());
                          set("quantity", q);
                          if (form.price && Number(q) > 0) {
                            set("amount", (Number(q) * Number(form.price)).toFixed(2));
                          }
                        }}
                      />
                      <small>
                        {quantityIsAuto && form.price && Number(form.amount) > 0
                          ? `已按 ¥${Number(form.amount).toFixed(2)} ÷ 净值 ${Number(form.price).toFixed(4)} 自动计算`
                          : "可直接输入份额覆盖，或输入购买金额自动计算份额"}
                      </small>
                    </Field>
                    <Field label="成交价格 / 净值">
                      <input
                        required
                        inputMode="decimal"
                        placeholder="0.000000"
                        value={form.price ?? ""}
                        onChange={(e) => {
                          setPriceIsAuto(false);
                          set("price", e.target.value);
                        }}
                      />
                      <small>
                        {quoteMeta && priceIsAuto
                          ? `已按所选交易日期带入净值 ${quoteMeta.price.toFixed(6)}（${quoteMeta.date}${quoteMeta.isExact ? "，当日公布" : `，${quoteMeta.requestedDate} 前最近公布`}${quoteMeta.isLive ? "" : "，缓存"}）；成交确认单可覆盖`
                          : quoteMeta
                            ? "已使用手工净值；重新选择交易日期或输入代码可恢复自动带入"
                            : selectedInstrument && !lookupBusy
                              ? `所选日期 ${form.tradeDate} 之前暂无公开净值，请按成交确认单填写`
                              : "输入代码后按所选交易日期自动匹配历史净值"}
                      </small>
                    </Field>
                  </>
                )}
                <Field
                  label={form.kind === "FEE" ? "费用金额" : "成交 / 资金金额"}
                >
                  <input
                    required={!["BUY", "SELL"].includes(form.kind)}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={displayedAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmountIsAuto(!val.trim());
                      const price = Number(form.price);
                      if (price > 0 && Number(val) > 0) {
                        const qty = (Number(val) / price).toFixed(6);
                        setForm((current) => ({ ...current, amount: val, quantity: qty }));
                        setQuantityIsAuto(true);
                      } else {
                        set("amount", val);
                      }
                    }}
                  />
                  <small>
                    {form.price && Number(form.amount) > 0
                      ? `已按金额自动计算份额 ${(Number(form.amount) / Number(form.price)).toFixed(4)} 份`
                      : "输入购买金额后自动按当日净值计算份额"}
                  </small>
                </Field>
                {["BUY", "SELL", "DIVIDEND"].includes(form.kind) && (
                  <>
                    <Field label="手续费">
                      <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={displayedFee}
                        onChange={(e) => {
                          setFeeIsAuto(!e.target.value.trim());
                          set("fee", e.target.value);
                        }}
                      />
                      {!["DIVIDEND"].includes(form.kind) && (
                        <small>
                          {form.kind === "SELL" &&
                          selectedInstrument?.redemption_fee_json !== "[]"
                            ? "留空后按真实赎回费率和 FIFO 持有期自动计算"
                            : feeIsAuto
                              ? `已自动填入预计 ¥${money(estimatedFee)}；保存时服务器按渠道实时费率重算`
                              : "已使用手工手续费；清空可恢复自动计算"}
                        </small>
                      )}
                    </Field>
                    <Field label="税费">
                      <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={form.tax ?? ""}
                        onChange={(e) => set("tax", e.target.value)}
                      />
                    </Field>
                  </>
                )}
                <Field label="备注" wide>
                  <input
                    placeholder="可选"
                    value={form.notes ?? ""}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
              </div>
              <div className="form-note">
                <ShieldCheck size={17} />
                <span>
                  系统按产品费率自动估算手续费，真实成交后可用账单金额覆盖；费用会计入成本、
                  已实现收益和总收益。有入金记录时按账户现金核算；只有交易记录时，买卖资金会自动换算为投入与回款。
                </span>
              </div>
            </>
          )}
          {type === "account" && (
            <div className="form-grid single">
              <Field label="账户名称" wide>
                <input
                  required
                  autoFocus
                  placeholder="例如：港股账户"
                  value={form.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="账户标识色" wide>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                />
              </Field>
              <div className="form-note wide">
                <Landmark size={17} />
                <span>
                  新账户使用人民币作为基准币种，并采用移动加权平均成本法。
                </span>
              </div>
            </div>
          )}
          {type === "instrument" && (
            <div className="form-grid">
              <Field label="基金 / 证券代码">
                <input
                  required
                  autoFocus
                  placeholder="例如：000001 或 510300"
                  value={form.code ?? ""}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase().trim();
                    set("code", code);
                    if (/^\d{6}$/.test(code)) void lookupFund(code);
                  }}
                />
                <button
                  type="button"
                  className="lookup-button"
                  disabled={lookupBusy}
                  onClick={() => void lookupFund()}
                >
                  <Search size={15} />
                  {lookupBusy ? "同步中…" : "查询真实基金数据"}
                </button>
                {lookupNote && <small>{lookupNote}</small>}
              </Field>
              <Field label="产品名称">
                <input
                  required
                  placeholder="例如：华夏成长混合"
                  value={form.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="产品类型">
                <select
                  value={form.productType}
                  onChange={(e) => set("productType", e.target.value)}
                >
                  <option value="FUND">场外基金</option>
                  <option value="ETF">ETF</option>
                  <option value="STOCK">股票</option>
                  <option value="OTHER">其他</option>
                </select>
              </Field>
              <Field label="市场">
                <select
                  value={form.market}
                  onChange={(e) => set("market", e.target.value)}
                >
                  <option value="CN">中国</option>
                  <option value="US">美国</option>
                  <option value="HK">香港</option>
                  <option value="OTHER">其他</option>
                </select>
              </Field>
              <Field label="资产类别">
                <select
                  value={form.assetClass}
                  onChange={(e) => set("assetClass", e.target.value)}
                >
                  <option>美国股票</option>
                  <option>中国股票</option>
                  <option>港股</option>
                  <option>债券</option>
                  <option>现金</option>
                  <option>现金类</option>
                  <option>商品</option>
                  <option>海外股票</option>
                  <option>其他</option>
                </select>
              </Field>
              <Field label="交易币种">
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  <option>CNY</option>
                  <option>USD</option>
                  <option>HKD</option>
                </select>
              </Field>
              <Field label="买入标准费率（%）">
                <input
                  required
                  inputMode="decimal"
                  placeholder="例如：1.5"
                  value={form.buyFeePercent}
                  onChange={(e) => set("buyFeePercent", e.target.value)}
                />
              </Field>
              <Field label="买入费率折扣（%）">
                <input
                  required
                  inputMode="decimal"
                  placeholder="一折填写 10"
                  value={form.buyDiscountPercent}
                  onChange={(e) => set("buyDiscountPercent", e.target.value)}
                />
                <small>例如标准费率 1.5%，一折后有效费率为 0.15%</small>
              </Field>
              <Field label="天天基金当前费率（%）">
                <input
                  required
                  inputMode="decimal"
                  value={form.eastmoneyFeePercent}
                  onChange={(e) => set("eastmoneyFeePercent", e.target.value)}
                />
                <small>使用“查询真实基金数据”后自动填充</small>
              </Field>
              <Field label="最低申购金额（元）">
                <input
                  required
                  inputMode="decimal"
                  value={form.minPurchase}
                  onChange={(e) => set("minPurchase", e.target.value)}
                />
              </Field>
              <Field label="卖出 / 赎回费率（%）">
                <input
                  required
                  inputMode="decimal"
                  placeholder="例如：0.5"
                  value={form.sellFeePercent}
                  onChange={(e) => set("sellFeePercent", e.target.value)}
                />
              </Field>
              <Field label="最低手续费（元）">
                <input
                  required
                  inputMode="decimal"
                  placeholder="场外基金通常为 0"
                  value={form.minFee}
                  onChange={(e) => set("minFee", e.target.value)}
                />
              </Field>
              <div className="form-note wide">
                <ShieldCheck size={17} />
                <span>
                  自动费用用于录入预估；最终以基金公司、券商或平台成交账单为准，可在每笔交易中覆盖。
                </span>
              </div>
            </div>
          )}
          {type === "plan" && (
            <div className="form-grid">
              <Field label="投资账户">
                <select
                  value={form.accountId}
                  onChange={(e) => set("accountId", e.target.value)}
                >
                  {data.accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <small>系统会按产品自动推荐，您仍可手动选择其他账户</small>
              </Field>
              <Field label="产品代码">
                <input
                  required
                  autoFocus
                  list="instrument-codes"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    form.preferredProductType === "STOCK"
                      ? "例如 600519、SZ000001"
                      : "例如 001513、510300"
                  }
                  value={form.instrumentCode}
                  onChange={(event) => {
                    const code = event.target.value.trim().toUpperCase();
                    const preferredProductType =
                      form.preferredProductType === "STOCK" ? "STOCK" : "FUND";
                    const matched = data.instruments.find(
                      (item) =>
                        item.code.toUpperCase() === code &&
                        (preferredProductType === "STOCK"
                          ? item.product_type === "STOCK"
                          : ["FUND", "ETF"].includes(item.product_type)),
                    );
                    const account = matched
                      ? matchingAccount(data.accounts, matched, data.holdings)
                      : null;
                    setForm((current) => ({
                      ...current,
                      instrumentCode: code,
                      instrumentId: matched ? String(matched.id) : "",
                      accountId: account
                        ? String(account.id)
                        : current.accountId,
                    }));
                    setResolvedInstrument(matched ?? null);
                    setFundCategory("");
                    setLookupNote(
                      matched
                        ? `已匹配已有产品：${matched.name}${account ? `；推荐账户 ${account.name}` : ""}`
                        : code
                          ? "输入完成后将自动查询产品名称与分类"
                          : "",
                    );
                  }}
                />
                <datalist id="instrument-codes">
                  {data.instruments.map((item) => (
                    <option key={item.id} value={item.code}>
                      {item.name} · {productTypeLabel(item)}
                    </option>
                  ))}
                </datalist>
                <small>
                  {lookupNote || "输入代码即可匹配，无需先去产品页面新增"}
                </small>
              </Field>
              <Field label="代码类别">
                <select
                  value={form.preferredProductType}
                  onChange={(e) => {
                    const preferredProductType = e.target.value;
                    const code = (form.instrumentCode ?? "")
                      .trim()
                      .toUpperCase();
                    const instrument = data.instruments.find(
                      (item) =>
                        item.code.toUpperCase() === code &&
                        (preferredProductType === "STOCK"
                          ? item.product_type === "STOCK"
                          : ["FUND", "ETF"].includes(item.product_type)),
                    );
                    const account = instrument
                      ? matchingAccount(
                          data.accounts,
                          instrument,
                          data.holdings,
                        )
                      : null;
                    setForm((current) => ({
                      ...current,
                      preferredProductType,
                      instrumentId: instrument ? String(instrument.id) : "",
                      accountId: account
                        ? String(account.id)
                        : current.accountId,
                    }));
                    setResolvedInstrument(instrument ?? null);
                    setFundCategory("");
                    setLookupNote(
                      instrument
                        ? `已匹配已有产品：${instrument.name}${account ? `；推荐账户 ${account.name}` : ""}`
                        : code
                          ? `将按${preferredProductType === "STOCK" ? "股票" : "基金 / ETF"}查询该代码`
                          : "",
                    );
                  }}
                >
                  <option value="FUND">基金 / ETF</option>
                  <option value="STOCK">股票</option>
                </select>
                <small>
                  六位代码可能重名，请明确选择基金或股票；自动行情目前支持沪深 A
                  股
                </small>
              </Field>
              <div
                className={`plan-match-note wide ${
                  lookupBusy
                    ? "loading"
                    : selectedInstrument
                      ? "matched"
                      : "pending"
                }`}
                aria-live="polite"
              >
                <div className="plan-match-icon">
                  {lookupBusy ? (
                    <RefreshCcw size={18} className="spin" />
                  ) : selectedInstrument ? (
                    <Check size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                </div>
                <div>
                  <strong>
                    {lookupBusy
                      ? "正在查询产品资料…"
                      : selectedInstrument
                        ? selectedInstrument.name
                        : "等待匹配产品"}
                  </strong>
                  <span>
                    {selectedInstrument
                      ? `${selectedInstrument.code} · ${productTypeLabel(selectedInstrument)} · ${selectedInstrument.asset_class}${selectedInstrument.market ? ` · ${selectedInstrument.market}` : ""}`
                      : lookupNote || "输入完整代码后显示名称、类型与资产类别"}
                  </span>
                  {selectedInstrument && fundCategory && (
                    <span>基金分类：{fundCategory}</span>
                  )}
                </div>
              </div>
              <Field label="每月金额">
                <input
                  required
                  inputMode="decimal"
                  placeholder="3000"
                  value={form.amount ?? ""}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </Field>
              <Field label="每月执行日">
                <input
                  required
                  type="number"
                  min="1"
                  max="28"
                  value={form.dayOfMonth}
                  onChange={(e) => set("dayOfMonth", e.target.value)}
                />
              </Field>
              <Field label="下一期日期" wide>
                <input
                  required
                  type="date"
                  value={form.nextDate}
                  onChange={(e) => set("nextDate", e.target.value)}
                />
              </Field>
              <div className="form-note wide">
                <CalendarDays size={17} />
                <span>
                  系统只生成计划提醒；实际成交后仍需确认份额、价格与手续费。
                </span>
              </div>
            </div>
          )}
          {type === "price" && (
            <div className="form-grid single">
              <Field label="投资产品" wide>
                <select
                  value={form.instrumentId}
                  onChange={(e) => set("instrumentId", e.target.value)}
                >
                  {data.instruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.code}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="价格日期">
                <input
                  required
                  type="date"
                  value={form.priceDate}
                  onChange={(e) => set("priceDate", e.target.value)}
                />
              </Field>
              <Field label="收盘价 / 净值">
                <input
                  required
                  inputMode="decimal"
                  placeholder="0.000000"
                  value={form.price ?? ""}
                  onChange={(e) => set("price", e.target.value)}
                />
              </Field>
            </div>
          )}
          {error && (
            <div className="form-error">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button"
            disabled={
              busy || (type === "plan" && (lookupBusy || !selectedInstrument))
            }
          >
            {busy ? (
              <RefreshCcw size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            保存并重算
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      <span>{label}</span>
      {children}
    </label>
  );
}

async function importFile(
  event: React.ChangeEvent<HTMLInputElement>,
  submit: (p: Record<string, unknown>, s?: string) => Promise<boolean>,
) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    const map: Record<string, string> = {
      账户名称: "accountName",
      交易类型: "kind",
      交易日期: "tradeDate",
      确认日期: "confirmationDate",
      产品代码: "code",
      成交份额: "quantity",
      成交价格: "price",
      成交金额: "amount",
      手续费: "fee",
      税费: "tax",
      备注: "notes",
      外部流水号: "externalRef",
    };
    const rows = raw.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          map[key.trim()] ?? key,
          value instanceof Date ? value.toISOString().slice(0, 10) : value,
        ]),
      ),
    );
    await submit(
      { action: "importRows", rows },
      `已导入 ${rows.length} 条流水`,
    );
  } catch (caught) {
    alert(caught instanceof Error ? caught.message : "文件解析失败");
  } finally {
    event.target.value = "";
  }
}
