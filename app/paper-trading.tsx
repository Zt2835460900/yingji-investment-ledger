"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CircleDollarSign,
  FlaskConical,
  RefreshCcw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

interface Instrument {
  id: number;
  name: string;
  code: string;
  market: string;
  asset_class: string;
  product_type: string;
}

interface PaperAccount {
  id: number;
  name: string;
  createdAt: string;
  metrics: {
    initialCash: number;
    cash: number;
    securitiesValue: number;
    totalAssets: number;
    totalProfit: number;
    returnRate: number;
    realized: number;
    unrealized: number;
    fees: number;
  };
  holdings: Array<{
    instrumentId: number;
    name: string;
    code: string;
    market: string;
    assetClass: string;
    productType: string;
    quantity: number;
    cost: number;
    averageCost: number;
    price: number;
    priceDate: string | null;
    marketValue: number;
    realized: number;
    unrealized: number;
    returnRate: number;
  }>;
  trades: Array<{
    id: number;
    instrumentId: number;
    instrumentName: string;
    code: string;
    side: "BUY" | "SELL";
    tradeDate: string;
    quantity: number;
    price: number;
    fee: number;
  }>;
}

interface PaperData {
  accounts: PaperAccount[];
  error?: string;
}

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const today = () => new Date().toISOString().slice(0, 10);

const isCompletePaperCode = (codeInput: string) => {
  const code = codeInput.trim().toUpperCase();
  return (
    /^\d{6}$/.test(code) ||
    /^(SH|SZ)\d{6}$/.test(code) ||
    /^\d{6}\.(SH|SZ)$/.test(code)
  );
};

const paperCodeMatches = (instrument: Instrument, codeInput: string) => {
  const storedCode = instrument.code.toUpperCase();
  const code = codeInput.trim().toUpperCase();
  if (storedCode === code) return true;
  if (instrument.product_type !== "STOCK") return false;
  const prefixed = code.match(/^(SH|SZ)(\d{6})$/);
  const suffixed = code.match(/^(\d{6})\.(SH|SZ)$/);
  if (prefixed) return storedCode === `${prefixed[1]}${prefixed[2]}`;
  if (suffixed) return storedCode === `${suffixed[2]}${suffixed[1]}`;
  return /^\d{6}$/.test(code) && storedCode.replace(/^(SH|SZ)/, "") === code;
};

export function PaperTrading({
  instruments,
  onBack,
}: {
  instruments: Instrument[];
  onBack: () => void;
}) {
  const [data, setData] = useState<PaperData | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [setup, setSetup] = useState({
    name: "我的模拟账户",
    initialCash: "100000",
  });
  const [trade, setTrade] = useState({
    side: "BUY" as "BUY" | "SELL",
    code: "",
    preferredProductType: "AUTO",
    instrumentId: "",
    tradeDate: today(),
    amount: "",
    quantity: "",
    price: "",
    fee: "",
  });
  const [matched, setMatched] = useState<Instrument | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const orderSubmitLock = useRef(false);
  const lookupRequestRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupPendingSignatureRef = useRef("");
  const lookupCompletedSignatureRef = useRef("");

  const load = async () => {
    try {
      const response = await fetch("/api/paper-trading", { cache: "no-store" });
      const result = (await response.json()) as PaperData;
      if (!response.ok) throw new Error(result.error || "模拟账户读取失败");
      setData(result);
      setError("");
      setActiveId((current) =>
        result.accounts.some((account) => account.id === current)
          ? current
          : (result.accounts[0]?.id ?? null),
      );
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "模拟账户读取失败");
      return false;
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const post = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/paper-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as PaperData;
      if (!response.ok) throw new Error(result.error || "保存失败");
      setData(result);
      setActiveId((current) => current ?? result.accounts[0]?.id ?? null);
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

  const active =
    data?.accounts.find((account) => account.id === activeId) ??
    data?.accounts[0] ??
    null;
  const knownInstrument = instruments.find(
    (instrument) =>
      paperCodeMatches(instrument, trade.code) &&
      (trade.preferredProductType === "AUTO" ||
        trade.preferredProductType === instrument.product_type ||
        (trade.preferredProductType === "FUND" &&
          ["FUND", "ETF"].includes(instrument.product_type))),
  );
  const resolved = matched ?? knownInstrument ?? null;

  const invalidateLookup = useCallback(() => {
    lookupRequestRef.current += 1;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    lookupPendingSignatureRef.current = "";
    lookupCompletedSignatureRef.current = "";
    setLookupBusy(false);
  }, []);

  const lookup = useCallback(
    async (
      codeInput = trade.code,
      tradeDateInput = trade.tradeDate,
      preferredProductTypeInput = trade.preferredProductType,
      force = false,
    ) => {
      const code = codeInput.trim().toUpperCase();
      const signature = `${preferredProductTypeInput}:${code}:${tradeDateInput}`;
      if (!code) {
        invalidateLookup();
        setMatched(null);
        setLookupNote("请输入股票、ETF 或基金代码");
        return null;
      }
      if (!isCompletePaperCode(code)) {
        invalidateLookup();
        setMatched(null);
        setTrade((current) => ({
          ...current,
          instrumentId: "",
          price: "",
        }));
        setLookupNote("请输入完整的 6 位基金或沪深 A 股代码");
        return null;
      }
      if (
        !force &&
        (lookupPendingSignatureRef.current === signature ||
          lookupCompletedSignatureRef.current === signature)
      )
        return null;

      lookupAbortRef.current?.abort();
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const requestId = lookupRequestRef.current + 1;
      lookupRequestRef.current = requestId;
      lookupPendingSignatureRef.current = signature;
      setLookupBusy(true);
      setLookupNote(`正在读取 ${tradeDateInput} 对应的公开价格…`);
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "lookupInstrument",
            code,
            tradeDate: tradeDateInput,
            preferredProductType: preferredProductTypeInput,
          }),
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          error?: string;
          instrument?: Instrument;
          quoteNav?: number;
          quotePrice?: number;
          quoteNavDate?: string;
          quotePriceDate?: string;
          fundCategory?: string;
        };
        if (requestId !== lookupRequestRef.current) return null;
        if (!response.ok || !result.instrument)
          throw new Error(result.error || "未查询到该产品代码");

        const returnedPrice = result.quotePrice ?? result.quoteNav ?? 0;
        const returnedPriceDate =
          result.quotePriceDate ?? result.quoteNavDate ?? "";
        const priceIsUsable =
          returnedPrice > 0 &&
          Boolean(returnedPriceDate) &&
          returnedPriceDate <= tradeDateInput;
        const instrument = result.instrument;
        setMatched(instrument);
        setTrade((current) => ({
          ...current,
          instrumentId:
            Number(instrument.id ?? 0) > 0 ? String(instrument.id) : "",
          price: priceIsUsable ? String(returnedPrice) : "",
        }));
        setLookupNote(
          priceIsUsable
            ? `已自动填入：${instrument.name} · ${returnedPriceDate}${returnedPriceDate === tradeDateInput ? "" : "（最近交易日）"}价格 ${returnedPrice}`
            : `已匹配：${instrument.name}，但 ${tradeDateInput} 之前没有可用公开价格，请手工填写成交价格`,
        );
        lookupCompletedSignatureRef.current = signature;
        return instrument;
      } catch (caught) {
        if (controller.signal.aborted || requestId !== lookupRequestRef.current)
          return null;
        setMatched(null);
        setTrade((current) => ({
          ...current,
          instrumentId: "",
          price: "",
        }));
        setLookupNote(
          caught instanceof Error ? caught.message : "代码查询失败",
        );
        return null;
      } finally {
        if (requestId === lookupRequestRef.current) {
          lookupPendingSignatureRef.current = "";
          setLookupBusy(false);
        }
      }
    },
    [invalidateLookup, trade.code, trade.preferredProductType, trade.tradeDate],
  );

  useEffect(() => {
    const code = trade.code.trim().toUpperCase();
    if (!code) return;
    if (!isCompletePaperCode(code)) return;
    const timer = window.setTimeout(
      () => void lookup(code, trade.tradeDate, trade.preferredProductType),
      450,
    );
    return () => window.clearTimeout(timer);
  }, [lookup, trade.code, trade.preferredProductType, trade.tradeDate]);

  useEffect(
    () => () => {
      lookupAbortRef.current?.abort();
    },
    [],
  );

  const refreshHoldings = async () => {
    if (!active?.holdings.length) return;
    setRefreshing(true);
    setError("");
    try {
      const results = await Promise.allSettled(
        active.holdings.map((holding) =>
          fetch("/api/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "resolveInstrument",
              code: holding.code,
              preferredProductType: holding.productType,
            }),
          }).then(async (response) => {
            const result = (await response.json()) as {
              error?: string;
              isLive?: boolean;
            };
            if (!response.ok) throw new Error(result.error || "行情更新失败");
            return result.isLive === true;
          }),
        ),
      );
      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const liveCount = results.filter(
        (result) => result.status === "fulfilled" && result.value,
      ).length;
      const failedCount = results.length - successCount;
      if (!successCount)
        throw new Error("所有模拟持仓行情均更新失败，请稍后重试");
      if (!(await load())) throw new Error("行情已读取，但模拟账户刷新失败");
      setToast(
        failedCount
          ? `${successCount} 项已读取（${liveCount} 项实时），${failedCount} 项失败`
          : `${successCount} 项行情已读取，其中 ${liveCount} 项为实时数据`,
      );
      window.setTimeout(() => setToast(""), 2600);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "行情更新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const persistMatchedInstrument = async () => {
    const code = trade.code.trim().toUpperCase();
    if (!code) throw new Error("请先输入并匹配产品代码");
    setLookupBusy(true);
    setLookupNote("正在确认并保存产品资料…");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolveInstrument",
          code,
          tradeDate: trade.tradeDate,
          preferredProductType: trade.preferredProductType,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        instrument?: Instrument;
      };
      if (!response.ok || !result.instrument?.id)
        throw new Error(result.error || "产品资料保存失败");
      setMatched(result.instrument);
      setTrade((current) => ({
        ...current,
        instrumentId: String(result.instrument?.id ?? ""),
      }));
      return result.instrument;
    } finally {
      setLookupBusy(false);
    }
  };

  const positiveNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const priceValue = positiveNumber(trade.price);
  const buyAmount = positiveNumber(trade.amount);
  const sellQuantity = positiveNumber(trade.quantity);
  const feeInput = trade.fee.trim();
  const parsedFee = feeInput ? Number(feeInput) : 0;
  const feeIsValid = Number.isFinite(parsedFee) && parsedFee >= 0;
  const feeValue = feeIsValid ? parsedFee : 0;
  const calculatedBuyQuantity =
    buyAmount > 0 && priceValue > 0 ? buyAmount / priceValue : 0;
  const orderQuantity =
    trade.side === "BUY" ? calculatedBuyQuantity : sellQuantity;
  const orderQuantityUnits = Number.isFinite(orderQuantity)
    ? Math.round(orderQuantity * 1_000_000)
    : 0;
  const roundedOrderQuantity = Number.isSafeInteger(orderQuantityUnits)
    ? orderQuantityUnits / 1_000_000
    : 0;
  const orderQuantityText =
    roundedOrderQuantity > 0
      ? roundedOrderQuantity.toFixed(6).replace(/\.?0+$/, "")
      : "";
  const gross =
    trade.side === "BUY"
      ? roundedOrderQuantity * priceValue
      : sellQuantity * priceValue;
  const estimatedTotal =
    trade.side === "BUY" ? gross + feeValue : gross - feeValue;
  const orderIsValid =
    Boolean(resolved) &&
    priceValue > 0 &&
    roundedOrderQuantity > 0 &&
    feeIsValid &&
    Number.isFinite(estimatedTotal) &&
    (trade.side === "BUY" ? buyAmount > 0 : estimatedTotal > 0);
  const sellAvailable = resolved
    ? (active?.holdings.find((holding) => holding.instrumentId === resolved.id)
        ?.quantity ?? 0)
    : 0;
  const positionCount = active?.holdings.length ?? 0;
  const allocation = useMemo(() => {
    if (!active || active.metrics.totalAssets <= 0) return [];
    return active.holdings.map((holding) => ({
      name: holding.name,
      rate: holding.marketValue / active.metrics.totalAssets,
    }));
  }, [active]);

  if (!data)
    return (
      <div className="paper-page">
        <div className="paper-page-toolbar">
          <button className="paper-back-button" onClick={onBack}>
            <ArrowLeft size={18} /> 返回投资总览
          </button>
        </div>
        <div className="paper-loading">
          <RefreshCcw className="spin" />
          <span>{error || "正在打开模拟交易…"}</span>
        </div>
      </div>
    );

  if (!data.accounts.length)
    return (
      <div className="paper-page">
        <div className="paper-page-toolbar">
          <button className="paper-back-button" onClick={onBack}>
            <ArrowLeft size={18} /> 返回投资总览
          </button>
        </div>
        <section className="paper-onboarding">
          <span className="paper-icon">
            <FlaskConical size={28} />
          </span>
          <span className="feature-badge">独立模拟账本</span>
          <h2>先创建一个模拟账户</h2>
          <p>
            虚拟资金与真实投资完全隔离，不计入总资产，也不会自动生成任何测试交易。
          </p>
          <div className="paper-setup-form">
            <label>
              <span>账户名称</span>
              <input
                value={setup.name}
                onChange={(event) =>
                  setSetup({ ...setup, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>初始虚拟资金</span>
              <input
                type="number"
                min="1"
                inputMode="decimal"
                value={setup.initialCash}
                onChange={(event) =>
                  setSetup({ ...setup, initialCash: event.target.value })
                }
              />
            </label>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void post(
                  {
                    action: "createAccount",
                    name: setup.name,
                    initialCash: setup.initialCash,
                  },
                  "模拟账户已创建",
                )
              }
            >
              <Check size={17} /> {busy ? "创建中…" : "创建模拟账户"}
            </button>
          </div>
          {error && (
            <div className="paper-error">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}
        </section>
      </div>
    );

  return (
    <div className="paper-page">
      <div className="paper-page-toolbar">
        <button className="paper-back-button" onClick={onBack}>
          <ArrowLeft size={18} /> 返回投资总览
        </button>
      </div>
      <section className="paper-hero">
        <div className="paper-hero-head">
          <div>
            <span>
              <FlaskConical size={17} /> 模拟资产
            </span>
            <strong>¥{money(active?.metrics.totalAssets ?? 0)}</strong>
            <p>与真实总资产完全隔离 · 不会影响 XIRR、TWR 和资产配置</p>
          </div>
          <button
            className="paper-refresh"
            disabled={refreshing}
            onClick={() => void refreshHoldings()}
          >
            <RefreshCcw size={16} className={refreshing ? "spin" : ""} />
            {refreshing ? "更新中" : "更新行情"}
          </button>
        </div>
        <div className="paper-metrics">
          <div>
            <span>累计盈亏</span>
            <strong
              className={
                (active?.metrics.totalProfit ?? 0) >= 0 ? "up" : "down"
              }
            >
              {(active?.metrics.totalProfit ?? 0) >= 0 ? "+" : ""}¥
              {money(active?.metrics.totalProfit ?? 0)}
            </strong>
          </div>
          <div>
            <span>收益率</span>
            <strong
              className={(active?.metrics.returnRate ?? 0) >= 0 ? "up" : "down"}
            >
              {percent(active?.metrics.returnRate ?? 0)}
            </strong>
          </div>
          <div>
            <span>可用资金</span>
            <strong>¥{money(active?.metrics.cash ?? 0)}</strong>
          </div>
          <div>
            <span>持仓市值</span>
            <strong>¥{money(active?.metrics.securitiesValue ?? 0)}</strong>
          </div>
        </div>
      </section>

      <div className="paper-main-grid">
        <section className="panel paper-order-panel">
          <div className="paper-section-title">
            <div>
              <CircleDollarSign size={20} />
              <div>
                <h2>模拟下单</h2>
                <p>使用公开行情或手工成交价</p>
              </div>
            </div>
            <div className="paper-side-tabs">
              <button
                className={trade.side === "BUY" ? "active buy" : ""}
                onClick={() =>
                  setTrade((current) => ({
                    ...current,
                    side: "BUY",
                    quantity: "",
                  }))
                }
              >
                买入
              </button>
              <button
                className={trade.side === "SELL" ? "active sell" : ""}
                onClick={() =>
                  setTrade((current) => ({
                    ...current,
                    side: "SELL",
                    amount: "",
                  }))
                }
              >
                卖出
              </button>
            </div>
          </div>
          <div className="paper-order-form">
            <label>
              <span>产品类型</span>
              <select
                value={trade.preferredProductType}
                onChange={(event) => {
                  invalidateLookup();
                  setTrade({
                    ...trade,
                    preferredProductType: event.target.value,
                    instrumentId: "",
                    price: "",
                  });
                  setMatched(null);
                  setLookupNote(
                    trade.code ? "产品类型已改变，正在自动重新匹配…" : "",
                  );
                }}
              >
                <option value="STOCK">股票</option>
                <option value="FUND">基金 / ETF</option>
                <option value="AUTO">自动识别</option>
              </select>
            </label>
            <label className="paper-code-field">
              <span>股票 / 基金代码</span>
              <div>
                <input
                  list="paper-instrument-codes"
                  autoComplete="off"
                  placeholder="例如 600519、001513"
                  value={trade.code}
                  onChange={(event) => {
                    invalidateLookup();
                    setTrade({
                      ...trade,
                      code: event.target.value.toUpperCase(),
                      instrumentId: "",
                      price: "",
                    });
                    setMatched(null);
                    setLookupNote(
                      event.target.value.trim()
                        ? "输入完整代码后将自动匹配名称和所选日期价格"
                        : "",
                    );
                  }}
                />
                <button
                  aria-label="立即查询产品和成交价格"
                  disabled={lookupBusy}
                  onClick={() =>
                    void lookup(
                      trade.code,
                      trade.tradeDate,
                      trade.preferredProductType,
                      true,
                    )
                  }
                >
                  {lookupBusy ? (
                    <RefreshCcw size={17} className="spin" />
                  ) : (
                    <Search size={17} />
                  )}
                </button>
              </div>
              <datalist id="paper-instrument-codes">
                {instruments.map((instrument) => (
                  <option key={instrument.id} value={instrument.code}>
                    {instrument.name}
                  </option>
                ))}
              </datalist>
              <small>
                {lookupNote ||
                  "输入代码后读取名称、类型与最新公开价格；股票自动行情目前支持沪深 A 股"}
              </small>
            </label>
            <label>
              <span>成交日期</span>
              <input
                type="date"
                max={today()}
                value={trade.tradeDate}
                onChange={(event) => {
                  invalidateLookup();
                  setTrade({
                    ...trade,
                    tradeDate: event.target.value,
                    price: "",
                  });
                  setLookupNote(
                    trade.code ? "成交日期已改变，正在自动查询该日期价格…" : "",
                  );
                }}
              />
            </label>
            <label>
              {trade.side === "BUY" ? (
                <>
                  <span>买入金额（不含手续费）</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="例如 10000"
                    value={trade.amount}
                    onChange={(event) =>
                      setTrade({ ...trade, amount: event.target.value })
                    }
                  />
                  {trade.amount && buyAmount <= 0 && (
                    <small className="paper-input-error">
                      买入金额必须大于 0
                    </small>
                  )}
                </>
              ) : (
                <>
                  <span>卖出数量 · 可卖 {sellAvailable}</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="0"
                    value={trade.quantity}
                    onChange={(event) =>
                      setTrade({ ...trade, quantity: event.target.value })
                    }
                  />
                  {trade.quantity && sellQuantity <= 0 && (
                    <small className="paper-input-error">
                      卖出数量必须大于 0
                    </small>
                  )}
                </>
              )}
            </label>
            <label>
              <span>成交价格</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0.0000"
                value={trade.price}
                onChange={(event) =>
                  setTrade({ ...trade, price: event.target.value })
                }
              />
              {trade.price && priceValue <= 0 && (
                <small className="paper-input-error">成交价格必须大于 0</small>
              )}
            </label>
            <label>
              <span>模拟手续费</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0.00"
                value={trade.fee}
                onChange={(event) =>
                  setTrade({ ...trade, fee: event.target.value })
                }
              />
              {!feeIsValid && (
                <small className="paper-input-error">
                  手续费不能为负数，且必须是有效数字
                </small>
              )}
            </label>
          </div>
          {resolved && (
            <div className="paper-match-result">
              <div>
                <strong>{resolved.name}</strong>
                <span>
                  {resolved.code} · {resolved.product_type} ·{" "}
                  {resolved.asset_class}
                </span>
              </div>
              <Check size={18} />
            </div>
          )}
          <div className="paper-order-summary">
            <div className="paper-order-estimates">
              {trade.side === "BUY" && (
                <div>
                  <span>
                    预计获得
                    {resolved?.product_type === "STOCK" ? "股数" : "份额"}
                  </span>
                  <strong>
                    {roundedOrderQuantity > 0
                      ? money(roundedOrderQuantity, 4)
                      : "0.0000"}
                    {resolved?.product_type === "STOCK" ? " 股" : " 份"}
                  </strong>
                </div>
              )}
              <div>
                <span>
                  {trade.side === "BUY" ? "预计占用资金" : "预计收回资金"}
                </span>
                <strong>¥{money(estimatedTotal)}</strong>
              </div>
            </div>
            <button
              className={`paper-submit ${trade.side === "BUY" ? "buy" : "sell"}`}
              disabled={busy || lookupBusy || orderSubmitting || !orderIsValid}
              onClick={async () => {
                if (orderSubmitLock.current) return;
                orderSubmitLock.current = true;
                setOrderSubmitting(true);
                setError("");
                try {
                  const instrument = await persistMatchedInstrument();
                  const ok = await post(
                    {
                      action: "createTrade",
                      accountId: active?.id,
                      instrumentId: instrument.id,
                      side: trade.side,
                      tradeDate: trade.tradeDate,
                      quantity: orderQuantityText,
                      price: trade.price,
                      fee: trade.fee,
                    },
                    `模拟${trade.side === "BUY" ? "买入" : "卖出"}已记录`,
                  );
                  if (ok)
                    setTrade((current) => ({
                      ...current,
                      amount: current.side === "BUY" ? "" : current.amount,
                      quantity: current.side === "SELL" ? "" : current.quantity,
                      fee: "",
                    }));
                } catch (caught) {
                  setError(
                    caught instanceof Error ? caught.message : "模拟下单失败",
                  );
                } finally {
                  orderSubmitLock.current = false;
                  setOrderSubmitting(false);
                }
              }}
            >
              {busy || orderSubmitting
                ? "提交中…"
                : `确认模拟${trade.side === "BUY" ? "买入" : "卖出"}`}
            </button>
          </div>
          {error && (
            <div className="paper-error">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}
        </section>

        <section className="panel paper-allocation-panel">
          <div className="paper-section-title">
            <div>
              <BarChart3 size={20} />
              <div>
                <h2>模拟配置</h2>
                <p>{positionCount} 项持仓</p>
              </div>
            </div>
          </div>
          {allocation.length ? (
            <div className="paper-allocation-list">
              {allocation.map((item, index) => (
                <div key={item.name}>
                  <i
                    style={{
                      background: ["#5B7CFA", "#18A676", "#F2A33A", "#A36CF4"][
                        index % 4
                      ],
                    }}
                  />
                  <span>{item.name}</span>
                  <strong>{(item.rate * 100).toFixed(1)}%</strong>
                </div>
              ))}
              <div>
                <i style={{ background: "#B7BFCE" }} />
                <span>虚拟现金</span>
                <strong>
                  {(
                    ((active?.metrics.cash ?? 0) /
                      Math.max(1, active?.metrics.totalAssets ?? 1)) *
                    100
                  ).toFixed(1)}
                  %
                </strong>
              </div>
            </div>
          ) : (
            <div className="paper-empty">
              <WalletCards size={24} />
              <strong>暂无模拟持仓</strong>
              <span>输入代码完成第一笔模拟买入</span>
            </div>
          )}
        </section>
      </div>

      <section className="panel paper-positions-panel">
        <div className="paper-section-title">
          <div>
            <TrendingUp size={20} />
            <div>
              <h2>模拟持仓</h2>
              <p>移动平均成本，盈亏只在模拟账户内计算</p>
            </div>
          </div>
        </div>
        {active?.holdings.length ? (
          <div className="paper-position-grid">
            {active.holdings.map((holding) => (
              <article key={holding.instrumentId}>
                <div className="paper-position-head">
                  <div>
                    <strong>{holding.name}</strong>
                    <span>
                      {holding.code} · {holding.productType}
                    </span>
                  </div>
                  <strong className={holding.unrealized >= 0 ? "up" : "down"}>
                    {percent(holding.returnRate)}
                  </strong>
                </div>
                <div className="paper-position-value">
                  <span>模拟市值</span>
                  <strong>¥{money(holding.marketValue)}</strong>
                </div>
                <div className="paper-position-stats">
                  <div>
                    <span>持有数量</span>
                    <strong>{money(holding.quantity, 2)}</strong>
                  </div>
                  <div>
                    <span>平均成本</span>
                    <strong>{holding.averageCost.toFixed(4)}</strong>
                  </div>
                  <div>
                    <span>最新价格 · {holding.priceDate ?? "模拟成交价"}</span>
                    <strong>{holding.price.toFixed(4)}</strong>
                  </div>
                  <div>
                    <span>浮动盈亏</span>
                    <strong className={holding.unrealized >= 0 ? "up" : "down"}>
                      {holding.unrealized >= 0 ? "+" : ""}¥
                      {money(holding.unrealized)}
                    </strong>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTrade({
                      ...trade,
                      side: "SELL",
                      code: holding.code,
                      preferredProductType: holding.productType,
                      instrumentId: String(holding.instrumentId),
                      amount: "",
                      price: String(holding.price),
                      quantity: "",
                      fee: "",
                    });
                    setMatched(
                      instruments.find(
                        (item) => item.id === holding.instrumentId,
                      ) ?? null,
                    );
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <TrendingDown size={15} /> 模拟卖出
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="paper-empty wide">
            <WalletCards size={25} />
            <strong>还没有模拟持仓</strong>
            <span>模拟交易不会影响真实资产，可以放心练习。</span>
          </div>
        )}
      </section>

      <section className="panel paper-history-panel">
        <div className="paper-section-title">
          <div>
            <CircleDollarSign size={20} />
            <div>
              <h2>模拟交易历史</h2>
              <p>删除记录前会验证后续持仓，避免出现负数</p>
            </div>
          </div>
        </div>
        {active?.trades.length ? (
          <div className="paper-trade-list">
            {active.trades.map((item) => (
              <div key={item.id}>
                <span className={`paper-side ${item.side.toLowerCase()}`}>
                  {item.side === "BUY" ? "买" : "卖"}
                </span>
                <div>
                  <strong>{item.instrumentName}</strong>
                  <span>
                    {item.tradeDate} · {item.code}
                  </span>
                </div>
                <div>
                  <strong>
                    {item.quantity} 份 × {item.price}
                  </strong>
                  <span>手续费 ¥{money(item.fee)}</span>
                </div>
                <button
                  aria-label="删除模拟交易"
                  onClick={() =>
                    confirm("确定删除这条模拟交易？只影响模拟账户。") &&
                    void post(
                      { action: "deleteTrade", id: item.id },
                      "模拟交易已删除",
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="paper-empty compact">
            <span>暂无模拟交易记录</span>
          </div>
        )}
      </section>
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
