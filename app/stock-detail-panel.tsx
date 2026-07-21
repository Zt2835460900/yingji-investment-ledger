"use client";

import { BarChart3, RefreshCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface StockBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePercent: number;
  change: number;
  turnover: number;
}

interface StockHistory {
  code: string;
  canonicalCode: string;
  name: string;
  bars: StockBar[];
  source: string;
  fetchedAt: string;
}

const money = (value: number, digits = 2) =>
  Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const compactNumber = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

function KLineChart({ bars }: { bars: StockBar[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const visibleBars = bars.slice(-120);
  const range = useMemo(() => {
    const min = Math.min(...visibleBars.map((bar) => bar.low));
    const max = Math.max(...visibleBars.map((bar) => bar.high));
    const padding = Math.max((max - min) * 0.08, max * 0.003, 0.01);
    return { min: min - padding, max: max + padding };
  }, [visibleBars]);
  const activeIndex = hoverIndex ?? visibleBars.length - 1;
  const active = visibleBars[activeIndex];
  const width = 1000;
  const height = 360;
  const left = 68;
  const right = 22;
  const top = 20;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const y = (value: number) =>
    top + ((range.max - value) / Math.max(range.max - range.min, 0.000001)) * chartHeight;
  const x = (index: number) => left + ((index + 0.5) / visibleBars.length) * chartWidth;
  const candleWidth = Math.max(2, Math.min(9, (chartWidth / visibleBars.length) * 0.62));
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(0.99999, Math.max(0, (event.clientX - rect.left - (left / width) * rect.width) / ((chartWidth / width) * rect.width)));
    setHoverIndex(Math.min(visibleBars.length - 1, Math.max(0, Math.floor(ratio * visibleBars.length))));
  };

  if (!active) return null;
  return (
    <div className="stock-kline-wrap">
      <svg
        className="stock-kline-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="股票日 K 线，移动鼠标或触摸可查看每日开高低收"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {[0, 1, 2, 3, 4].map((index) => {
          const value = range.max - ((range.max - range.min) * index) / 4;
          const lineY = y(value);
          return (
            <g key={index}>
              <line x1={left} x2={width - right} y1={lineY} y2={lineY} className="stock-kline-grid" />
              <text x={left - 9} y={lineY + 4} textAnchor="end" className="stock-kline-axis">
                {money(value, 2)}
              </text>
            </g>
          );
        })}
        {visibleBars.map((bar, index) => {
          const up = bar.close >= bar.open;
          const bodyTop = y(Math.max(bar.open, bar.close));
          const bodyBottom = y(Math.min(bar.open, bar.close));
          const center = x(index);
          return (
            <g key={bar.date} className={index === activeIndex ? "active" : ""}>
              <line
                x1={center}
                x2={center}
                y1={y(bar.high)}
                y2={y(bar.low)}
                className={up ? "stock-kline-up" : "stock-kline-down"}
              />
              <rect
                x={center - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={Math.max(2, bodyBottom - bodyTop)}
                className={up ? "stock-kline-up" : "stock-kline-down"}
              />
            </g>
          );
        })}
        {activeIndex >= 0 && (
          <line
            x1={x(activeIndex)}
            x2={x(activeIndex)}
            y1={top}
            y2={height - bottom}
            className="stock-kline-cursor"
          />
        )}
        {[0, Math.floor((visibleBars.length - 1) / 2), visibleBars.length - 1].map((index) => (
          <text key={index} x={x(index)} y={height - 14} textAnchor="middle" className="stock-kline-axis">
            {visibleBars[index]?.date.slice(5)}
          </text>
        ))}
      </svg>
      <div className="stock-kline-tooltip" aria-live="polite">
        <strong>{active.date}</strong>
        <span>开 {money(active.open)}　高 {money(active.high)}　低 {money(active.low)}　收 {money(active.close)}</span>
        <span>涨跌 {active.change >= 0 ? "+" : ""}{money(active.change)}（{active.changePercent >= 0 ? "+" : ""}{active.changePercent.toFixed(2)}%）</span>
      </div>
    </div>
  );
}

export function StockDetailPanel() {
  const [code, setCode] = useState("600519");
  const [limit, setLimit] = useState(120);
  const [data, setData] = useState<StockHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const didLoadDefault = useRef(false);

  const load = useCallback(async (requestedCode = code, requestedLimit = limit) => {
    const normalized = requestedCode.trim().toUpperCase();
    if (!normalized) {
      setError("请输入沪深 A 股代码，例如 600519 或 SZ300750");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/stock-history?code=${encodeURIComponent(normalized)}&limit=${requestedLimit}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as StockHistory & { error?: string };
      if (!response.ok || !Array.isArray(payload.bars))
        throw new Error(payload.error || "股票历史行情读取失败");
      setData(payload);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "股票历史行情读取失败");
    } finally {
      setLoading(false);
    }
  }, [code, limit]);

  useEffect(() => {
    if (didLoadDefault.current) return;
    didLoadDefault.current = true;
    const timer = window.setTimeout(() => void load("600519", 120), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const latest = data?.bars.at(-1);
  return (
    <section className="stock-detail-panel" aria-label="个股行情与日 K 线">
      <header className="stock-detail-head">
        <div>
          <span className="overview-market-kicker">个股观察</span>
          <h2>查看个股日涨跌与 K 线</h2>
          <p>支持沪深 A 股；红涨绿跌。输入代码后即可查看当天数据、开高低收和历史日 K。</p>
        </div>
        <form
          className="stock-detail-search"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <input
            aria-label="股票代码"
            value={code}
            placeholder="如 600519 / SZ300750"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <button type="submit" disabled={loading}>
            <Search size={17} />
            {loading ? "读取中" : "查看"}
          </button>
        </form>
      </header>

      <div className="stock-detail-periods" aria-label="K线区间">
        {[60, 120, 240].map((value) => (
          <button
            key={value}
            type="button"
            className={limit === value ? "active" : ""}
            onClick={() => {
              setLimit(value);
              void load(code, value);
            }}
          >
            近 {value} 日
          </button>
        ))}
        <span>日 K · 前复权 · 鼠标悬停查看单日数据</span>
      </div>

      {error ? <div className="stock-detail-error">{error}</div> : null}
      {data && latest ? (
        <>
          <div className="stock-detail-summary">
            <div className="stock-identity">
              <span>{data.canonicalCode}</span>
              <strong>{data.name}</strong>
              <small>最新交易日 {latest.date}</small>
            </div>
            <div className="stock-last-price">
              <span>收盘价</span>
              <strong>¥{money(latest.close)}</strong>
              <b className={latest.changePercent >= 0 ? "up" : "down"}>
                {latest.change >= 0 ? "+" : ""}{money(latest.change)} · {latest.changePercent >= 0 ? "+" : ""}{latest.changePercent.toFixed(2)}%
              </b>
            </div>
            <div className="stock-ohlc-grid">
              <span>开 <b>{money(latest.open)}</b></span>
              <span>高 <b>{money(latest.high)}</b></span>
              <span>低 <b>{money(latest.low)}</b></span>
              <span>量 <b>{compactNumber(latest.volume)}</b></span>
              <span>额 <b>¥{compactNumber(latest.amount)}</b></span>
              <span>换手 <b>{latest.turnover.toFixed(2)}%</b></span>
            </div>
          </div>
          <KLineChart bars={data.bars} />
          <div className="stock-detail-footnote">
            <BarChart3 size={16} />
            数据源：公开日 K 行情，更新时间 {new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date(data.fetchedAt))}。仅供观察，不构成投资建议。
            <button type="button" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={14} className={loading ? "spinning" : ""} /> 刷新个股
            </button>
          </div>
        </>
      ) : !loading && !error ? (
        <div className="overview-market-loading">正在准备个股行情…</div>
      ) : null}
    </section>
  );
}
