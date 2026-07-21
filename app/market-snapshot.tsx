"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Newspaper,
  RefreshCcw,
  Target,
} from "lucide-react";
import Link from "next/link";
import { StockDetailPanel } from "./stock-detail-panel";

type DashboardView = "plans" | "allocation" | "data";

interface MarketIndex {
  symbol: string;
  name: string;
  market: string;
  price: number;
  changePercent: number;
  currency: string;
  updatedAt: string;
}

interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  source: string;
  url: string;
  category: string;
}

interface MarketNewsFeed {
  items: MarketNewsItem[];
  updatedAt: string;
  source: string;
  isLive: boolean;
  message: string;
}

interface MarketSnapshotData {
  indices: MarketIndex[];
  updatedAt: string;
  generatedAt: string;
  news: MarketNewsFeed | null;
}

const MARKET_COLORS: Record<string, string> = {
  美国: "#5b7cfa",
  中国A股: "#de4f5f",
  港股: "#18a676",
  日本: "#e99a31",
  台湾: "#a36cf4",
  韩国: "#ef6a72",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function parseQuotes(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.indices))
    throw new Error("行情数据格式异常");
  const indices = value.indices.flatMap((item): MarketIndex[] => {
    if (!isRecord(item)) return [];
    const price = Number(item.price);
    const changePercent = Number(item.changePercent);
    if (
      typeof item.symbol !== "string" ||
      typeof item.name !== "string" ||
      typeof item.market !== "string" ||
      !Number.isFinite(price) ||
      !Number.isFinite(changePercent)
    )
      return [];
    return [
      {
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        price,
        changePercent,
        currency: typeof item.currency === "string" ? item.currency : "USD",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
      },
    ];
  });
  if (!indices.length) throw new Error("暂时没有可用行情");
  return {
    indices,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
  };
}

function parseNews(value: unknown): MarketNewsFeed {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new Error("市场资讯格式异常");
  return {
    items: value.items.flatMap((item): MarketNewsItem[] => {
      if (!isRecord(item) || typeof item.title !== "string") return [];
      const url = typeof item.url === "string" ? item.url : "";
      if (!/^https?:\/\//i.test(url)) return [];
      return [
        {
          id: typeof item.id === "string" ? item.id : item.title,
          title: item.title,
          summary: typeof item.summary === "string" ? item.summary : "",
          publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : "",
          source: typeof item.source === "string" ? item.source : "市场资讯",
          url,
          category: typeof item.category === "string" ? item.category : "宏观",
        },
      ];
    }),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    source: typeof value.source === "string" ? value.source : "市场资讯",
    isLive: value.isLive === true,
    message: typeof value.message === "string" ? value.message : "",
  };
}

function formatPrice(value: number, currency: string) {
  const rendered = value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === "CNY") return `¥${rendered}`;
  if (currency === "JPY") return `¥${rendered}`;
  if (currency === "TWD") return `NT$${rendered}`;
  if (currency === "KRW") return `₩${rendered}`;
  return `$${rendered}`;
}

function formatTime(value: string) {
  if (!value) return "等待更新";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(time);
}

export function MarketSnapshot({
  allocationAlerts,
  missingPriceCount,
  activePlanCount,
  nextPlanDate,
  onNavigate,
}: {
  allocationAlerts: number;
  missingPriceCount: number;
  activePlanCount: number;
  nextPlanDate: string | null;
  onNavigate: (view: DashboardView) => void;
}) {
  const [data, setData] = useState<MarketSnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    setRefreshing(true);
    if (force) setError("");
    try {
      const [quoteResponse, newsResponse] = await Promise.all([
        fetch(`/api/market-quotes${force ? "?refresh=1" : ""}`, {
          cache: "no-store",
        }),
        fetch(`/api/market-news${force ? "?refresh=1" : ""}`, {
          cache: "no-store",
        }),
      ]);
      const quotePayload = (await quoteResponse.json()) as unknown;
      if (!quoteResponse.ok)
        throw new Error(readError(quotePayload, "行情读取失败"));
      const quotes = parseQuotes(quotePayload);
      let news: MarketNewsFeed | null = null;
      if (newsResponse.ok) {
        try {
          news = parseNews((await newsResponse.json()) as unknown);
        } catch {
          // Quotes stay usable even when the optional news feed is unavailable.
        }
      }
      setData({ ...quotes, news });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "行情读取失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  const summary = useMemo(() => {
    const indices = data?.indices ?? [];
    const up = indices.filter((item) => item.changePercent > 0).length;
    const down = indices.filter((item) => item.changePercent < 0).length;
    const average = indices.length
      ? indices.reduce((total, item) => total + item.changePercent, 0) /
        indices.length
      : 0;
    const strongest = [...indices].sort(
      (left, right) => right.changePercent - left.changePercent,
    )[0];
    const weakest = [...indices].sort(
      (left, right) => left.changePercent - right.changePercent,
    )[0];
    return { up, down, flat: indices.length - up - down, average, strongest, weakest };
  }, [data]);

  const attentionItems = [
    {
      label: "估值数据",
      value: missingPriceCount ? `${missingPriceCount} 项待补` : "已就绪",
      text: missingPriceCount
        ? "有持仓缺少估值，建议到数据中心补录或同步。"
        : "当前持仓均有可用估值。",
      action: "查看数据",
      icon: AlertTriangle,
      tone: missingPriceCount ? "warning" : "safe",
      view: "data" as const,
    },
    {
      label: "配置偏离",
      value: allocationAlerts ? `${allocationAlerts} 项偏离` : "在目标内",
      text: allocationAlerts
        ? "实际持仓与目标配置存在偏离。"
        : "当前配置没有触发提醒阈值。",
      action: "查看配置",
      icon: Target,
      tone: allocationAlerts ? "warning" : "safe",
      view: "allocation" as const,
    },
    {
      label: "定投计划",
      value: activePlanCount ? `${activePlanCount} 个运行中` : "暂无计划",
      text: nextPlanDate ? `下一期：${nextPlanDate}` : "可创建计划，将定投节奏固定下来。",
      action: "查看定投",
      icon: CalendarDays,
      tone: "neutral",
      view: "plans" as const,
    },
  ];

  return (
    <section className="panel overview-market-panel" aria-label="市场概览">
      <header className="overview-market-head">
        <div>
          <span className="overview-market-kicker market-title-kicker">
            <BarChart3 size={16} aria-hidden="true" />
            市场与持仓联动
          </span>
          <h2>今日市场概览</h2>
          <p>
            主要指数、组合待办和当日资讯集中展示；行情每 60 秒自动刷新。
          </p>
        </div>
        <div className="overview-market-actions">
          <span>{data?.updatedAt ? `更新于 ${formatTime(data.updatedAt)}` : "正在读取行情"}</span>
          <button type="button" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCcw size={15} className={refreshing ? "spinning" : ""} />
            {refreshing ? "更新中" : "刷新"}
          </button>
          <Link href="/market" className="overview-market-full-link">
            全屏行情 <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>

      {error ? <div className="overview-market-error">{error}</div> : null}

      <div className="overview-market-summary">
        <div className="overview-market-temperature">
          <span>市场温度</span>
          <strong className={summary.average >= 0 ? "up" : "down"}>
            {summary.average >= 0 ? "+" : ""}{summary.average.toFixed(2)}%
          </strong>
          <small>12 项主要指数平均涨跌</small>
        </div>
        <div className="overview-market-breadth">
          <div><b className="up">{summary.up}</b><span>上涨</span></div>
          <div><b className="down">{summary.down}</b><span>下跌</span></div>
          <div><b>{summary.flat}</b><span>平盘</span></div>
        </div>
        <div className="overview-market-movers">
          <div>
            <span>最强</span>
            <strong>{summary.strongest?.name ?? "—"}</strong>
            <b className="up">
              {summary.strongest ? `${summary.strongest.changePercent >= 0 ? "+" : ""}${summary.strongest.changePercent.toFixed(2)}%` : "—"}
            </b>
          </div>
          <div>
            <span>最弱</span>
            <strong>{summary.weakest?.name ?? "—"}</strong>
            <b className="down">
              {summary.weakest ? `${summary.weakest.changePercent >= 0 ? "+" : ""}${summary.weakest.changePercent.toFixed(2)}%` : "—"}
            </b>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="overview-market-loading">正在加载全球行情与市场资讯…</div>
      ) : (
        <>
          <div className="overview-market-quote-grid">
            {(data?.indices ?? []).map((item) => (
              <article className="overview-market-quote" key={item.symbol}>
                <div>
                  <span
                    className="overview-market-dot"
                    style={{ background: MARKET_COLORS[item.market] ?? "#5b7cfa" }}
                  />
                  <small>{item.market}</small>
                </div>
                <strong>{item.name}</strong>
                <b>{formatPrice(item.price, item.currency)}</b>
                <em className={item.changePercent >= 0 ? "up" : "down"}>
                  {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                </em>
              </article>
            ))}
          </div>

          <div className="overview-market-bottom">
            <section className="overview-attention" aria-label="今日关注">
              <div className="overview-market-section-title">
                <div>
                  <span>今日关注</span>
                  <h3>下一步该看什么</h3>
                </div>
              </div>
              <div className="overview-attention-grid">
                {attentionItems.map(({ label, value, text, action, icon: Icon, tone, view }) => (
                  <button
                    key={label}
                    type="button"
                    className={`overview-attention-card ${tone}`}
                    onClick={() => onNavigate(view)}
                  >
                    <span><Icon size={17} /></span>
                    <div>
                      <small>{label}</small>
                      <strong>{value}</strong>
                      <p>{text}</p>
                    </div>
                    <ArrowUpRight size={16} />
                    <em>{action}</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="overview-market-news" aria-label="市场资讯">
              <div className="overview-market-section-title">
                <div>
                  <span>市场资讯</span>
                  <h3>今日值得关注</h3>
                </div>
                <div className="overview-news-source">
                  <Newspaper size={15} />
                  {data?.news?.isLive ? "实时资讯" : "资讯缓存"}
                </div>
              </div>
              {data?.news?.message ? <p className="overview-news-message">{data.news.message}</p> : null}
              <div className="overview-news-list">
                {(data?.news?.items ?? []).slice(0, 4).map((item) => (
                  <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                    <span>{item.category}</span>
                    <strong>{item.title}</strong>
                    <small>{item.source} · {item.publishedAt || formatTime(data?.news?.updatedAt ?? "")}</small>
                  </a>
                ))}
                {!data?.news?.items.length ? (
                  <div className="overview-news-empty">资讯正在更新，稍后会自动显示。</div>
                ) : null}
              </div>
            </section>
          </div>
          <StockDetailPanel />
        </>
      )}
      <p className="overview-market-disclaimer">
        行情和资讯仅用于记录与观察，不构成投资建议。{data?.generatedAt ? ` 数据日期：${data.generatedAt}。` : ""}
      </p>
    </section>
  );
}
