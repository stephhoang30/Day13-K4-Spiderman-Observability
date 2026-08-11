/** Helper format dùng ở client. Locale cố định để số luôn hiển thị giống nhau. */

const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function fmtInt(value: number): string {
  return INT.format(value);
}

export function fmtNum(value: number, digits: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtUsd(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.01) return `$${fmtNum(value, 4)}`;
  return `$${fmtNum(value, 3)}`;
}

/** Giờ địa phương HH:MM. */
export function fmtClock(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Giờ địa phương HH:MM:SS. */
export function fmtClockSeconds(iso: string | Date | null): string {
  if (!iso) return "--:--:--";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Ngày + giờ địa phương, dùng cho nhãn from → to của cửa sổ thời gian. */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString([], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${date} ${fmtClockSeconds(d)}`;
}

/** Nhãn đơn vị hiển thị gọn trên panel. */
export function unitLabel(unit: string): string {
  switch (unit) {
    case "ms":
      return "ms";
    case "requests_per_minute":
      return "requests / minute";
    case "percent":
      return "percent (%)";
    case "usd":
      return "USD";
    case "tokens":
      return "tokens";
    case "score_0_to_1":
      return "score 0 → 1";
    default:
      return unit;
  }
}

export function operatorSymbol(operator: "lte" | "gte"): string {
  return operator === "lte" ? "≤" : "≥";
}
