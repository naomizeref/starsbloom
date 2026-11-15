import type { MarketAsset, PortfolioAsset } from '../types';
import { isFreshQuote } from './marketQuotes';

// Missing live quotes retain stored valuations; they never remove a holding
// from the portfolio total. This is display-only and does not write to the DB.
export function markPortfolio(holdings: PortfolioAsset[], quotes: MarketAsset[], now = Date.now()) {
  const portfolio = holdings.map(holding => {
    const quote = quotes.find(asset =>
      (asset.symbol === holding.symbol || asset.symbol === `${holding.symbol}/USD`) && isFreshQuote(asset, now));
    return quote ? { ...holding, currentPrice: quote.price } : holding;
  });
  const portfolioValue = +portfolio.reduce((sum, holding) => sum + holding.amount * holding.currentPrice, 0).toFixed(2);
  return { portfolio, portfolioValue };
}
