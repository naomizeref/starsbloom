/** Preserve meaningful digits for small-value coins without rounding them to zero. */
export function formatMarketPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  return price.toLocaleString("en-US", price < 1
    ? { style: "currency", currency: "USD", maximumSignificantDigits: 4 }
    : { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMarketChange(change: number): string {
  if (!Number.isFinite(change)) return "—";
  const rounded = Math.round(change * 100) / 100;
  return `${rounded < 0 ? "" : "+"}${rounded.toFixed(2)}%`;
}
