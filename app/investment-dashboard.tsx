"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  FileSpreadsheet,
  Gauge,
  Home,
  Landmark,
  Layers3,
  Menu,
  MoreHorizontal,
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

type View =
  | "overview"
  | "accounts"
  | "ledger"
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
  valuationDate: string | null;
  methodology: string;
}

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "overview", label: "总览", icon: Home },
  { id: "accounts", label: "账户", icon: WalletCards },
  { id: "ledger", label: "交易", icon: CircleDollarSign },
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
const dateText = (value: string | null) =>
  value ? value.replaceAll("-", ".") : "暂无估值";
const navTitle: Record<View, [string, string]> = {
  overview: ["投资总览", "把现金流与投资表现分开看"],
  accounts: ["投资账户", "每个策略独立核算"],
  ledger: ["交易流水", "完整记录资金与交易事件"],
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
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const navigateView = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", `#${next}`);
    setMobileMenu(false);
  };

  const load = async () => {
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      const result = (await response.json()) as PortfolioData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "读取失败");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取失败");
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      const requested = window.location.hash.slice(1) as View;
      if (navItems.some((item) => item.id === requested)) setView(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (
    payload: Record<string, unknown>,
    success = "已保存",
  ) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as PortfolioData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "保存失败");
      setData(result);
      setModal(null);
      setToast(success);
      window.setTimeout(() => setToast(""), 2600);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
      return false;
    } finally {
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
      <Overview data={data} onEntry={() => setModal("entry")} />
    ) : view === "accounts" ? (
      <Accounts
        data={data}
        onAccount={() => setModal("account")}
        onDelete={(id) =>
          void submit({ action: "deleteAccount", id }, "账户已删除")
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
    ) : view === "plans" ? (
      <Plans
        data={data}
        onPlan={() => setModal("plan")}
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
      <Analytics data={data} />
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
              估值截至 {dateText(data.valuationDate)}
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
          busy={busy}
          error={error}
          onClose={() => {
            setModal(null);
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
}: {
  data: PortfolioData;
  onEntry: () => void;
}) {
  const m = data.metrics;
  const recentSeries = data.series.slice(-120);
  return (
    <div className="page-grid overview-page">
      <section className="hero-balance">
        <div className="hero-head">
          <div>
            <span className="eyebrow">总资产</span>
            <strong>¥ {money(m.totalAssets)}</strong>
            <p>累计净投入 ¥{money(m.netContributions)} · 当前现金已计入资产</p>
          </div>
          <button className="ghost-button" onClick={onEntry}>
            <Plus size={17} />
            新增记录
          </button>
        </div>
        <div className="hero-stats">
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
            <span>今日盈亏</span>
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
          subtitle="按产品市值"
          action={`${data.allocation.filter((x) => x.alert).length} 项偏离`}
        />
        <div className="allocation-chart-wrap">
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.allocation}
                  dataKey="value"
                  innerRadius={57}
                  outerRadius={78}
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
                <strong>{(item.actual * 100).toFixed(1)}%</strong>
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
                <span>净投入 ¥{money(account.contributions, 0)}</span>
              </div>
              <div>
                <strong>¥{money(account.assets)}</strong>
                <span className={account.profit >= 0 ? "up" : "down"}>
                  {account.profit >= 0 ? "+" : ""}¥{money(account.profit)} ·{" "}
                  {percent(account.returnRate)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel monthly-panel">
        <PanelTitle
          title="月度盈亏"
          subtitle="绝对盈亏金额"
          action="近 12 月"
        />
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
                tickFormatter={compactMoney}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="#C9CED9" />
              <Bar name="月度盈亏" dataKey="profit" radius={[5, 5, 2, 2]}>
                {data.monthly.map((item, i) => (
                  <Cell
                    key={i}
                    fill={item.profit >= 0 ? "#55B99A" : "#EF7C83"}
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
}: {
  data: PortfolioData;
  onAccount: () => void;
  onDelete: (id: number) => void;
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
          return (
            <article className="account-card" key={account.id}>
              <div className="account-card-head">
                <span style={{ background: account.color }}>
                  <Landmark size={19} />
                </span>
                <div className="account-card-actions">
                  <span
                    className={`account-profit-status ${
                      account.profit > 0
                        ? "profit"
                        : account.profit < 0
                          ? "loss"
                          : "flat"
                    }`}
                  >
                    {account.profit > 0
                      ? "盈利"
                      : account.profit < 0
                        ? "亏损"
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
              <h2>{account.name}</h2>
              <p>基准币种 {account.currency} · 移动加权成本</p>
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
                  <span>年化 XIRR</span>
                  <b className={(account.returnRate ?? 0) >= 0 ? "up" : "down"}>
                    {percent(account.returnRate)}
                  </b>
                </div>
              </div>
              <div className="mini-holdings">
                {positions.length ? (
                  positions.map((position) => (
                    <div key={position.instrumentId}>
                      <span>{position.instrumentName}</span>
                      <b>{position.quantity.toFixed(2)} 份</b>
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
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>类型</th>
                <th>账户 / 产品</th>
                <th>份额</th>
                <th>价格</th>
                <th>金额</th>
                <th>费用</th>
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
                    <td>
                      {entry.trade_date}
                      {entry.confirmation_date && (
                        <small>确认 {entry.confirmation_date}</small>
                      )}
                    </td>
                    <td>
                      <span
                        className={`kind-badge ${entry.kind.toLowerCase()}`}
                      >
                        {kindLabels[entry.kind] ?? entry.kind}
                      </span>
                    </td>
                    <td>
                      <strong>{instrument?.name ?? account?.name}</strong>
                      <small>
                        {instrument
                          ? `${account?.name} · ${instrument.code} · ${channelLabels[entry.purchase_channel] ?? entry.purchase_channel}`
                          : entry.notes || "外部资金流"}
                      </small>
                    </td>
                    <td>
                      {entry.quantity_units
                        ? money(entry.quantity_units / 1_000_000, 2)
                        : "—"}
                    </td>
                    <td>
                      {entry.price_units
                        ? `¥${money(entry.price_units / 1_000_000, 4)}`
                        : "—"}
                    </td>
                    <td className="number-cell">
                      ¥{money(entry.gross_amount_units / 10_000)}
                    </td>
                    <td>
                      ¥{money((entry.fee_units + entry.tax_units) / 10_000)}
                    </td>
                    <td>
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
  onDelete,
  onToggle,
}: {
  data: PortfolioData;
  onPlan: () => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const activePlans = data.plans.filter((plan) => plan.status === "ACTIVE");
  const monthlyAmount = activePlans.reduce((sum, plan) => sum + plan.amount, 0);
  return (
    <div className="stack-page">
      <section className="plan-summary">
        <div>
          <span>每月计划投入</span>
          <strong>¥ {money(monthlyAmount, 0)}</strong>
          <p>{activePlans.length} 个计划正在运行</p>
        </div>
        <div>
          <span>今年预计投入</span>
          <strong>¥ {money(monthlyAmount * 12, 0)}</strong>
          <p>按当前计划估算</p>
        </div>
        <button className="primary-button light" onClick={onPlan}>
          <Plus size={17} />
          新建定投
        </button>
      </section>
      <div className="plan-grid">
        {data.plans.map((plan, index) => (
          <article className="plan-card" key={plan.id}>
            <div className="plan-card-head">
              <span style={{ background: COLORS[index % COLORS.length] }}>
                <CalendarDays size={19} />
              </span>
              <span
                className={`status-badge ${plan.status === "ACTIVE" ? "" : "paused"}`}
              >
                {plan.status === "ACTIVE" ? "运行中" : "已暂停"}
              </span>
            </div>
            <h2>{plan.instrumentName}</h2>
            <p>{plan.accountName}</p>
            <div className="plan-amount">
              <strong>¥{money(plan.amount, 0)}</strong>
              <span>/ 每月</span>
            </div>
            <div className="plan-date">
              <div>
                <span>下一期</span>
                <strong>{plan.next_date}</strong>
              </div>
              <div>
                <span>执行日</span>
                <strong>每月 {plan.day_of_month} 日</strong>
              </div>
            </div>
            <div className="plan-progress">
              <div>
                <span
                  style={{
                    width: `${Math.min(100, (plan.day_of_month / 28) * 100)}%`,
                  }}
                />
              </div>
              <small>到期后生成待确认任务，不会伪造成交</small>
            </div>
            <div className="plan-actions">
              <button
                className="secondary-button"
                onClick={() => onToggle(plan.id)}
              >
                {plan.status === "ACTIVE" ? "暂停计划" : "恢复计划"}
              </button>
              <button
                className="text-danger"
                onClick={() =>
                  confirm("删除这个定投计划？历史交易不会受影响。") &&
                  onDelete(plan.id)
                }
              >
                <Trash2 size={15} />
                删除计划
              </button>
            </div>
          </article>
        ))}
        <button className="add-plan-card" onClick={onPlan}>
          <Plus size={24} />
          <strong>添加定投计划</strong>
          <span>设置金额、产品与执行日</span>
        </button>
      </div>
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
  const totalTarget = data.instruments.reduce(
    (sum, item) =>
      sum +
      Number(
        drafts[item.id] ??
          (data.targets.find((target) => target.instrument_id === item.id)
            ?.target_bps ?? 0) / 100,
      ),
    0,
  );
  return (
    <div className="allocation-page">
      <section className="panel allocation-hero">
        <div className="big-donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.allocation}
                dataKey="value"
                innerRadius={83}
                outerRadius={108}
                paddingAngle={3}
                stroke="none"
              >
                {data.allocation.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div>
            <span>总资产</span>
            <strong>¥{compactMoney(data.metrics.totalAssets)}</strong>
          </div>
        </div>
        <div>
          <span className="eyebrow">当前资产配置</span>
          <h2>
            {data.allocation.filter((item) => item.alert).length
              ? "配置需要关注"
              : "配置处于目标区间"}
          </h2>
          <p>
            当实际比例偏离目标超过 5
            个百分点，系统会发出提示。现金作为独立资产计入总资产。
          </p>
          <div className="allocation-summary-list">
            {data.allocation.map((item, index) => (
              <div key={item.name}>
                <i style={{ background: COLORS[index % COLORS.length] }} />
                <span>{item.name}</span>
                <strong>{(item.actual * 100).toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title-row">
          <PanelTitle
            title="目标与偏离"
            subtitle="目标合计应为 100%"
            action={`当前合计 ${totalTarget.toFixed(0)}%`}
          />
          <button
            className="secondary-button"
            disabled={Math.abs(totalTarget - 100) > 0.01}
            onClick={() =>
              void submit(
                {
                  action: "updateTargets",
                  targets: data.instruments.map((instrument) => ({
                    instrumentId: instrument.id,
                    targetPercent: Number(
                      drafts[instrument.id] ??
                        (data.targets.find(
                          (target) => target.instrument_id === instrument.id,
                        )?.target_bps ?? 0) / 100,
                    ),
                  })),
                },
                "全部配置目标已保存",
              )
            }
          >
            <Check size={16} />
            保存全部
          </button>
        </div>
        <div className="target-list">
          {data.instruments.map((instrument, index) => {
            const current = data.allocation.find(
              (item) => item.instrumentId === instrument.id,
            );
            const saved = data.targets.find(
              (item) => item.instrument_id === instrument.id,
            );
            const target = Number(
              drafts[instrument.id] ?? (saved?.target_bps ?? 0) / 100,
            );
            const drift = (current?.actual ?? 0) * 100 - target;
            return (
              <div className="target-row" key={instrument.id}>
                <div className="target-name">
                  <i style={{ background: COLORS[index % COLORS.length] }} />
                  <div>
                    <strong>{instrument.name}</strong>
                    <span>
                      {instrument.code} · 当前{" "}
                      {((current?.actual ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="target-bar">
                  <div>
                    <span
                      style={{
                        width: `${Math.min(100, (current?.actual ?? 0) * 100)}%`,
                        background: COLORS[index % COLORS.length],
                      }}
                    />
                    <i style={{ left: `${Math.min(100, target)}%` }} />
                  </div>
                  <small className={Math.abs(drift) > 5 ? "warning-text" : ""}>
                    {drift >= 0 ? "+" : ""}
                    {drift.toFixed(1)} 个百分点
                  </small>
                </div>
                <label>
                  目标
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={target}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [instrument.id]: e.target.value })
                    }
                  />
                  %
                </label>
                <button
                  className="icon-button"
                  aria-label="保存目标"
                  onClick={() =>
                    void submit(
                      {
                        action: "updateTarget",
                        instrumentId: instrument.id,
                        targetPercent: target,
                        alertPercent: 5,
                      },
                      "配置目标已更新",
                    )
                  }
                >
                  <Check size={17} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Analytics({ data }: { data: PortfolioData }) {
  return (
    <div className="analytics-page">
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
                stroke="#EF7C83"
                strokeWidth={1.8}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="analytics-lower">
        <section className="panel">
          <PanelTitle title="产品收益排名" subtitle="实现 + 未实现 + 分红" />
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
                <strong className={item.returnRate >= 0 ? "up" : "down"}>
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
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `盈迹数据备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
          <p>导出当前计算结果、账户、流水、计划和配置为 JSON 文件。</p>
          <button className="secondary-button" onClick={exportData}>
            <Download size={17} />
            导出备份
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
  busy,
  error,
  onClose,
  submit,
}: {
  type: Exclude<Modal, null>;
  data: PortfolioData;
  busy: boolean;
  error: string;
  onClose: () => void;
  submit: (p: Record<string, unknown>, s?: string) => Promise<boolean>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Record<string, string>>({
    kind: "BUY",
    accountId: String(data.accounts[0]?.id ?? ""),
    instrumentId: String(data.instruments[0]?.id ?? ""),
    instrumentCode: data.instruments[0]?.code ?? "",
    tradeDate: today,
    confirmationDate: "",
    priceDate: today,
    nextDate: today,
    dayOfMonth: "5",
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
  const [resolvedInstrument, setResolvedInstrument] = useState<
    PortfolioData["instruments"][number] | null
  >(null);
  const selectedInstrument =
    data.instruments.find((item) => item.id === Number(form.instrumentId)) ??
    (resolvedInstrument?.id === Number(form.instrumentId)
      ? resolvedInstrument
      : undefined);
  useEffect(() => {
    if (type !== "entry" || !["BUY", "SELL", "DIVIDEND"].includes(form.kind))
      return;
    const code = (form.instrumentCode ?? "").trim().toUpperCase();
    const existing = data.instruments.find(
      (item) => item.code.toUpperCase() === code,
    );
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        if (existing) {
          setResolvedInstrument(null);
          setLookupNote(`已匹配：${existing.name}`);
          return;
        }
        setResolvedInstrument(null);
        if (!/^\d{6}$/.test(code)) {
          setLookupNote(code ? "请输入完整的 6 位基金或 ETF 代码" : "");
          return;
        }
        setLookupBusy(true);
        setLookupNote("正在自动匹配真实基金数据…");
        try {
          const response = await fetch("/api/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resolveInstrument", code }),
            signal: controller.signal,
          });
          const result = (await response.json()) as {
            error?: string;
            instrument?: PortfolioData["instruments"][number];
          };
          if (!response.ok || !result.instrument)
            throw new Error(result.error || "未查询到该基金代码");
          setResolvedInstrument(result.instrument);
          setForm((current) =>
            current.instrumentCode === code
              ? {
                  ...current,
                  instrumentId: String(result.instrument?.id ?? ""),
                  fee: "",
                }
              : current,
          );
          setLookupNote(
            `已自动匹配：${result.instrument.name} · ${result.instrument.product_type}`,
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
      existing || !/^\d{6}$/.test(code) ? 0 : 450,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [data.instruments, form.instrumentCode, form.kind, type]);
  const grossPreview =
    Number(form.amount || 0) ||
    Number(form.quantity || 0) * Number(form.price || 0);
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
  const lookupFund = async () => {
    if (!/^\d{6}$/.test(form.code ?? "")) {
      setLookupNote("请输入 6 位场外基金代码");
      return;
    }
    setLookupBusy(true);
    setLookupNote("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookupFund", code: form.code }),
      });
      const result = (await response.json()) as {
        error?: string;
        name: string;
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
        productType: "FUND",
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
        `已同步：净值 ${result.latestNav || "—"}（${result.latestNavDate || "暂无日期"}），标准申购费 ${(result.standardBuyFeeBps / 100).toFixed(2)}%，天天基金 ${(result.eastmoneyBuyFeeBps / 100).toFixed(2)}%`,
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
            ? "新建定投计划"
            : "更新价格 / 净值";
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const action =
      type === "entry"
        ? "createEntry"
        : type === "account"
          ? "createAccount"
          : type === "instrument"
            ? "createInstrument"
            : type === "plan"
              ? "createPlan"
              : "upsertPrice";
    await submit(
      { action, ...form },
      type === "entry" ? "流水已记入，收益已重算" : "已保存",
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
                    onClick={() => set("kind", kind)}
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
                </Field>
                {["BUY", "SELL", "DIVIDEND"].includes(form.kind) && (
                  <Field label="基金 / 证券代码">
                    <input
                      required
                      list="instrument-codes"
                      autoComplete="off"
                      placeholder="输入代码，例如 000001"
                      value={form.instrumentCode}
                      onChange={(event) => {
                        const code = event.target.value.trim().toUpperCase();
                        const matched = data.instruments.find(
                          (item) => item.code.toUpperCase() === code,
                        );
                        setForm((current) => ({
                          ...current,
                          instrumentCode: code,
                          instrumentId: matched ? String(matched.id) : "",
                          fee: "",
                        }));
                        setResolvedInstrument(null);
                        setLookupNote(
                          matched
                            ? `已匹配：${matched.name}`
                            : /^\d{6}$/.test(code)
                              ? "正在自动匹配真实基金数据…"
                              : code
                                ? "请输入完整的 6 位基金或 ETF 代码"
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
                        ? "正在查询基金名称、净值和真实费率…"
                        : lookupNote ||
                          (selectedInstrument
                            ? `${selectedInstrument.name} · ${selectedInstrument.product_type}`
                            : "输入 6 位代码后自动匹配，无需预先新增产品")}
                    </small>
                  </Field>
                )}
                {["BUY", "SELL"].includes(form.kind) && (
                  <Field label="购买 / 交易渠道">
                    <select
                      value={form.purchaseChannel}
                      onChange={(e) => {
                        setForm((current) => ({
                          ...current,
                          purchaseChannel: e.target.value,
                          fee: "",
                        }));
                      }}
                    >
                      <option value="DIRECT">基金公司直销</option>
                      <option value="EASTMONEY">天天基金（第三方）</option>
                      <option value="OTHER">其他第三方 / 银行 / 券商</option>
                    </select>
                    <small>
                      {form.purchaseChannel === "DIRECT"
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
                    onChange={(e) => set("tradeDate", e.target.value)}
                  />
                </Field>
                {["BUY", "SELL"].includes(form.kind) &&
                  (!selectedInstrument ||
                    ["FUND", "ETF"].includes(
                      selectedInstrument.product_type,
                    )) && (
                    <Field label="份额确认日期">
                      <input
                        type="date"
                        min={form.tradeDate}
                        value={form.confirmationDate}
                        onChange={(e) =>
                          set("confirmationDate", e.target.value)
                        }
                      />
                      <small>
                        填写基金公司实际确认日期（常见
                        T+1/T+2）；收益计算仍按交易日期
                      </small>
                    </Field>
                  )}
                {["BUY", "SELL"].includes(form.kind) && (
                  <>
                    <Field label="成交份额">
                      <input
                        required
                        inputMode="decimal"
                        placeholder="0.000000"
                        value={form.quantity ?? ""}
                        onChange={(e) => set("quantity", e.target.value)}
                      />
                    </Field>
                    <Field label="成交价格 / 净值">
                      <input
                        required
                        inputMode="decimal"
                        placeholder="0.000000"
                        value={form.price ?? ""}
                        onChange={(e) => set("price", e.target.value)}
                      />
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
                    value={form.amount ?? ""}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                  <small>买卖可留空，由份额 × 价格计算</small>
                </Field>
                {["BUY", "SELL", "DIVIDEND"].includes(form.kind) && (
                  <>
                    <Field label="手续费">
                      <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={form.fee ?? ""}
                        onChange={(e) => set("fee", e.target.value)}
                      />
                      {!["DIVIDEND"].includes(form.kind) && (
                        <small>
                          {form.kind === "SELL" &&
                          selectedInstrument?.redemption_fee_json !== "[]"
                            ? "留空后按真实赎回费率和 FIFO 持有期自动计算"
                            : `留空自动计算：预计 ¥${money(estimatedFee)}；填写后以实际费用为准`}
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
                  已实现收益和总收益。只有入金和出金作为外部现金流影响 XIRR。
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
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
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
                  <option>现金类</option>
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
              </Field>
              <Field label="投资产品">
                <select
                  value={form.instrumentId}
                  onChange={(e) => set("instrumentId", e.target.value)}
                >
                  {data.instruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
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
          <button className="primary-button" disabled={busy}>
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
