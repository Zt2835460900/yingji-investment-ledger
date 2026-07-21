import {
  MONEY_SCALE,
  PRICE_SCALE,
  QUANTITY_SCALE,
  tradeGrossUnits,
  unitsToNumber,
} from "./money";

export interface PaperTradeRow {
  id: number;
  account_id: number;
  instrument_id: number;
  side: "BUY" | "SELL";
  trade_date: string;
  quantity_units: number;
  price_units: number;
  fee_units: number;
}

export interface PaperInstrumentRow {
  id: number;
  name: string;
  code: string;
  market: string;
  asset_class: string;
  product_type: string;
}

export interface PaperPriceRow {
  instrument_id: number;
  price_date: string;
  price_units: number;
}

interface PositionState {
  instrumentId: number;
  quantityUnits: number;
  costUnits: number;
  realizedUnits: number;
  lastTradePriceUnits: number;
}

/**
 * Moving-average paper portfolio. It intentionally shares no ledger rows with
 * the real portfolio: initial virtual cash and paper trades are the only cash
 * flows used here.
 */
export function calculatePaperPortfolio(
  initialCashUnits: number,
  trades: PaperTradeRow[],
  instruments: PaperInstrumentRow[],
  prices: PaperPriceRow[],
) {
  if (!Number.isSafeInteger(initialCashUnits) || initialCashUnits <= 0)
    throw new Error("模拟账户初始资金必须大于 0");

  const instrumentById = new Map(instruments.map((row) => [row.id, row]));
  const latestPriceByInstrument = new Map<number, PaperPriceRow>();
  for (const price of [...prices].sort((a, b) =>
    a.price_date.localeCompare(b.price_date),
  )) {
    if (price.price_units > 0)
      latestPriceByInstrument.set(price.instrument_id, price);
  }

  let cashUnits = initialCashUnits;
  let feesUnits = 0;
  const positions = new Map<number, PositionState>();
  const orderedTrades = [...trades].sort(
    (a, b) => a.trade_date.localeCompare(b.trade_date) || a.id - b.id,
  );
  for (const trade of orderedTrades) {
    if (!instrumentById.has(trade.instrument_id))
      throw new Error("模拟交易关联的产品不存在");
    if (
      !Number.isSafeInteger(trade.quantity_units) ||
      trade.quantity_units <= 0 ||
      !Number.isSafeInteger(trade.price_units) ||
      trade.price_units <= 0 ||
      !Number.isSafeInteger(trade.fee_units) ||
      trade.fee_units < 0
    )
      throw new Error("模拟交易数据无效");
    const position = positions.get(trade.instrument_id) ?? {
      instrumentId: trade.instrument_id,
      quantityUnits: 0,
      costUnits: 0,
      realizedUnits: 0,
      lastTradePriceUnits: trade.price_units,
    };
    const grossUnits = tradeGrossUnits(trade.quantity_units, trade.price_units);
    feesUnits += trade.fee_units;
    if (trade.side === "BUY") {
      const debit = grossUnits + trade.fee_units;
      if (debit > cashUnits)
        throw new Error("模拟账户可用资金不足，无法完成买入");
      cashUnits -= debit;
      position.quantityUnits += trade.quantity_units;
      position.costUnits += debit;
    } else if (trade.side === "SELL") {
      if (trade.quantity_units > position.quantityUnits)
        throw new Error("模拟卖出份额超过可用持仓");
      const costRemoved = Math.round(
        (position.costUnits * trade.quantity_units) / position.quantityUnits,
      );
      const proceeds = grossUnits - trade.fee_units;
      if (proceeds < 0) throw new Error("模拟卖出手续费不能超过成交金额");
      cashUnits += proceeds;
      position.quantityUnits -= trade.quantity_units;
      position.costUnits -= costRemoved;
      position.realizedUnits += proceeds - costRemoved;
      if (position.quantityUnits === 0) position.costUnits = 0;
    } else {
      throw new Error("模拟交易方向无效");
    }
    position.lastTradePriceUnits = trade.price_units;
    positions.set(trade.instrument_id, position);
  }

  let securitiesUnits = 0;
  let realizedUnits = 0;
  let unrealizedUnits = 0;
  const holdings = [...positions.values()]
    .filter((position) => position.quantityUnits > 0)
    .map((position) => {
      const instrument = instrumentById.get(position.instrumentId)!;
      const priceRow = latestPriceByInstrument.get(position.instrumentId);
      const priceUnits = priceRow?.price_units ?? position.lastTradePriceUnits;
      const marketValueUnits = tradeGrossUnits(
        position.quantityUnits,
        priceUnits,
      );
      const holdingUnrealizedUnits = marketValueUnits - position.costUnits;
      securitiesUnits += marketValueUnits;
      realizedUnits += position.realizedUnits;
      unrealizedUnits += holdingUnrealizedUnits;
      return {
        instrumentId: position.instrumentId,
        name: instrument.name,
        code: instrument.code,
        market: instrument.market,
        assetClass: instrument.asset_class,
        productType: instrument.product_type,
        quantity: unitsToNumber(position.quantityUnits, QUANTITY_SCALE),
        cost: unitsToNumber(position.costUnits, MONEY_SCALE),
        averageCost:
          position.costUnits /
          MONEY_SCALE /
          (position.quantityUnits / QUANTITY_SCALE),
        price: unitsToNumber(priceUnits, PRICE_SCALE),
        priceDate: priceRow?.price_date ?? null,
        marketValue: unitsToNumber(marketValueUnits, MONEY_SCALE),
        realized: unitsToNumber(position.realizedUnits, MONEY_SCALE),
        unrealized: unitsToNumber(holdingUnrealizedUnits, MONEY_SCALE),
        returnRate:
          position.costUnits > 0
            ? holdingUnrealizedUnits / position.costUnits
            : 0,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);

  for (const position of positions.values()) {
    if (position.quantityUnits === 0) realizedUnits += position.realizedUnits;
  }
  const totalAssetsUnits = cashUnits + securitiesUnits;
  const totalProfitUnits = totalAssetsUnits - initialCashUnits;
  return {
    metrics: {
      initialCash: unitsToNumber(initialCashUnits, MONEY_SCALE),
      cash: unitsToNumber(cashUnits, MONEY_SCALE),
      securitiesValue: unitsToNumber(securitiesUnits, MONEY_SCALE),
      totalAssets: unitsToNumber(totalAssetsUnits, MONEY_SCALE),
      totalProfit: unitsToNumber(totalProfitUnits, MONEY_SCALE),
      returnRate: totalProfitUnits / initialCashUnits,
      realized: unitsToNumber(realizedUnits, MONEY_SCALE),
      unrealized: unitsToNumber(unrealizedUnits, MONEY_SCALE),
      fees: unitsToNumber(feesUnits, MONEY_SCALE),
    },
    holdings,
  };
}
