"use client";

import type { ReactNode } from "react";

import { unitLabel } from "@/lib/format";

import styles from "./PanelCard.module.css";

export interface StatItem {
  label: string;
  value: string;
}

/**
 * Khung chung cho cả 6 panel. Mỗi card luôn hiện đủ 5 thứ bắt buộc:
 * tên panel, đơn vị, giá trị hiện tại, threshold/SLO, trạng thái PASS/BREACH.
 */
export default function PanelCard({
  id,
  title,
  unit,
  pass,
  value,
  valueUnit,
  valueLabel,
  thresholdText,
  stats,
  footer,
  children,
}: {
  id: string;
  title: string;
  unit: string;
  pass: boolean;
  value: string;
  valueUnit?: string;
  valueLabel: string;
  thresholdText: string;
  stats?: StatItem[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.topRow}>
        <div className={styles.titleBlock}>
          <span className={styles.panelId}>{id}</span>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <span className={styles.unitBadge}>
          Unit: <strong>{unitLabel(unit)}</strong>
        </span>
      </div>

      <div className={styles.valueRow}>
        <div className={styles.valueBlock}>
          <span className={styles.value}>
            {value}
            {valueUnit ? <span className={styles.valueUnit}>{valueUnit}</span> : null}
          </span>
          <span className={styles.valueLabel}>{valueLabel}</span>
        </div>
        <div className={styles.statusBlock}>
          <span className={`${styles.pill} ${pass ? styles.pass : styles.breach}`}>
            <span className={styles.dot} />
            {pass ? "PASS" : "BREACH"}
          </span>
          <span className={styles.thresholdText}>{thresholdText}</span>
        </div>
      </div>

      <div className={styles.chartWrap}>{children}</div>

      {stats && stats.length > 0 ? (
        <div className={styles.stats}>
          {stats.map((s) => (
            <div className={styles.stat} key={s.label}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}
