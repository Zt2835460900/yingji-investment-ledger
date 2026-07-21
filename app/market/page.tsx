"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { StockDetailPanel } from "../stock-detail-panel";

interface MarketIndex {
  symbol: string;
  name: string;
  market: string;
  price: number;
  change: number;
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
  isToday: boolean;
  message: string;
}

interface MarketPageData {
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

function parseMarketPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.indices))
    throw new Error("行情数据格式异常");
  const indices = value.indices.flatMap((item): MarketIndex[] => {
    if (!isRecord(item)) return [];
    const price = Number(item.price);
    const change = Number(item.change);
    const changePercent = Number(item.changePercent);
    if (
      typeof item.symbol !== "string" ||
      typeof item.name !== "string" ||
      typeof item.market !== "string" ||
      !Number.isFinite(price) ||
      !Number.isFinite(change) ||
      !Number.isFinite(changePercent)
    )
      return [];
    return [
      {
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        price,
        change,
        changePercent,
        currency: typeof item.currency === "string" ? item.currency : "USD",
        updatedAt:
          typeof item.updatedAt === "string" ? item.updatedAt : "",
      },
    ];
  });
  if (!indices.length) throw new Error("暂时没有可用行情");
  return {
    indices,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    generatedAt:
      typeof value.generatedAt === "string" ? value.generatedAt : "",
  };
}

function parseNewsPayload(value: unknown): MarketNewsFeed {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new Error("资讯数据格式异常");
  const items = value.items.flatMap((item): MarketNewsItem[] => {
    if (!isRecord(item) || typeof item.title !== "string") return [];
    const url = typeof item.url === "string" ? item.url : "";
    if (!/^https?:\/\//i.test(url)) return [];
    return [
      {
        id: typeof item.id === "string" ? item.id : item.title,
        title: item.title,
        summary: typeof item.summary === "string" ? item.summary : "",
        publishedAt:
          typeof item.publishedAt === "string" ? item.publishedAt : "",
        source: typeof item.source === "string" ? item.source : "市场资讯",
        url,
        category:
          typeof item.category === "string" ? item.category : "宏观",
      },
    ];
  });
  return {
    items,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    source: typeof value.source === "string" ? value.source : "市场资讯",
    isLive: value.isLive === true,
    isToday: value.isToday === true,
    message: typeof value.message === "string" ? value.message : "",
  };
}

function formatPrice(value: number, currency: string) {
  if (currency === "JPY") return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  if (currency === "TWD") return `NT$${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  if (currency === "KRW") return `₩${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  if (currency === "CNY") return `¥${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

function formatTime(value: string) {
  if (!value) return "—";
  const time = new Date(value);
  return Number.isNaN(time.getTime())
    ? value.replace("T", " ").slice(0, 16)
    : time.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

function directionClass(value: number) {
  return value >= 0 ? "is-up" : "is-down";
}

export default function MarketPage() {
  const [data, setData] = useState<MarketPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [newsError, setNewsError] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading((current) => current && !force);
    setRefreshing(true);
    setError("");
    setNewsError("");
    try {
      const [quoteResponse, newsResponse] = await Promise.all([
        fetch("/api/market-quotes", { cache: "no-store" }),
        fetch(`/api/market-news${force ? "?refresh=1" : ""}`, {
          cache: "no-store",
        }),
      ]);
      const quotePayload = (await quoteResponse.json()) as unknown;
      const newsPayload = (await newsResponse.json()) as unknown;
      if (!quoteResponse.ok)
        throw new Error(readError(quotePayload, "行情读取失败"));
      const quotes = parseMarketPayload(quotePayload);
      let news: MarketNewsFeed | null = null;
      if (newsResponse.ok) {
        try {
          news = parseNewsPayload(newsPayload);
        } catch (caught) {
          setNewsError(caught instanceof Error ? caught.message : "资讯数据异常");
        }
      } else {
        setNewsError(readError(newsPayload, "市场资讯暂时不可用"));
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
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const summary = useMemo(() => {
    const indices = data?.indices ?? [];
    const up = indices.filter((item) => item.changePercent > 0).length;
    const down = indices.filter((item) => item.changePercent < 0).length;
    const strongest = [...indices].sort(
      (a, b) => b.changePercent - a.changePercent,
    )[0];
    const weakest = [...indices].sort(
      (a, b) => a.changePercent - b.changePercent,
    )[0];
    return { total: indices.length, up, down, flat: indices.length - up - down, strongest, weakest };
  }, [data]);

  const groups = useMemo(() => {
    const grouped = new Map<string, MarketIndex[]>();
    for (const item of data?.indices ?? []) {
      const rows = grouped.get(item.market) ?? [];
      rows.push(item);
      grouped.set(item.market, rows);
    }
    return [...grouped.entries()];
  }, [data]);

  return (
    <main className="market-page">
      <div className="market-shell">
        <header className="market-header">
          <div>
            <p className="eyebrow market-title-kicker">
              <BarChart3 size={16} aria-hidden="true" />
              市场雷达 · 实时更新
            </p>
            <h1>全球市场行情</h1>
            <p className="market-subtitle">
              一页查看主要指数涨跌、市场强弱和当天资讯，行情每 60 秒自动刷新。
            </p>
          </div>
          <div className="market-header-actions">
            <span className="market-updated">
              {data?.updatedAt ? `更新于 ${formatTime(data.updatedAt)}` : "正在读取"}
            </span>
            <button
              type="button"
              className="market-refresh-button"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              {refreshing ? "更新中…" : "刷新行情"}
            </button>
            <Link href="/" className="market-back-link">
              返回总览
            </Link>
          </div>
        </header>

        {error && <div className="market-error">{error}</div>}

        {loading && !data ? (
          <section className="market-loading">正在加载行情与市场资讯…</section>
        ) : data ? (
          <>
            <section className="market-hero-card">
              <div>
                <span className="market-card-label">今日市场概览</span>
                <strong>{summary.total} 个主要指数</strong>
                <small>{data.generatedAt || "今日"} · 数据来自公开行情源</small>
              </div>
              <div className="market-breadth">
                <div><b className="is-up-text">{summary.up}</b><span>上涨</span></div>
                <div><b className="is-down-text">{summary.down}</b><span>下跌</span></div>
                <div><b>{summary.flat}</b><span>平盘</span></div>
              </div>
              <div className="market-leaders">
                {summary.strongest && (
                  <div>
                    <span>今日最强</span>
                    <b>{summary.strongest.name}</b>
                    <em className="is-up-text">+{summary.strongest.changePercent.toFixed(2)}%</em>
                  </div>
                )}
                {summary.weakest && (
                  <div>
                    <span>今日最弱</span>
                    <b>{summary.weakest.name}</b>
                    <em className="is-down-text">{summary.weakest.changePercent.toFixed(2)}%</em>
                  </div>
                )}
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-heading">
                <div>
                  <span className="eyebrow">指数看板</span>
                  <h2>主要市场</h2>
                </div>
                <span className="market-section-note">红涨绿跌</span>
              </div>
              <div className="market-region-grid">
                {groups.map(([market, items]) => (
                  <section className="market-region-card" key={market}>
                    <div className="market-region-title">
                      <span style={{ background: MARKET_COLORS[market] || "#5b7cfa" }} />
                      <h3>{market}</h3>
                      <small>{items.length} 个指数</small>
                    </div>
                    <div className="market-quote-list">
                      {items.map((item) => (
                        <div className="market-quote-row" key={item.symbol}>
                          <div className="market-quote-name">
                            <strong>{item.name}</strong>
                            <span>{item.symbol}</span>
                          </div>
                          <div className="market-quote-value">
                            <b>{formatPrice(item.price, item.currency)}</b>
                            <span className={directionClass(item.changePercent)}>
                              {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <StockDetailPanel />

            <section className="market-news-board">
              <div className="market-section-heading">
                <div>
                  <span className="eyebrow">当天资讯</span>
                  <h2>市场新闻</h2>
                </div>
                {data.news && (
                  <span className={data.news.isLive ? "market-live-badge" : "market-section-note"}>
                    {data.news.isLive ? "实时资讯" : "缓存资讯"}
                  </span>
                )}
              </div>
              {newsError && <p className="market-news-error">{newsError}</p>}
              {data.news?.message && <p className="market-news-message">{data.news.message}</p>}
              {data.news?.items.length ? (
                <div className="market-news-list">
                  {data.news.items.map((item) => (
                    <a
                      className="market-news-item"
                      href={item.url}
                      key={item.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="market-news-meta">
                        <span>{item.category}</span>
                        <time>{item.publishedAt || formatTime(data.news?.updatedAt ?? "")}</time>
                      </div>
                      <strong>{item.title}</strong>
                      {item.summary && <p>{item.summary}</p>}
                      <small>{item.source} · 阅读原文 ↗</small>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="market-news-empty">暂时没有可展示的市场资讯。</div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
