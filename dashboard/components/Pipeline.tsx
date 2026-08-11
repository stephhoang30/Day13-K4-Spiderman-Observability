"use client";

import { useEffect, useRef } from "react";

import { fmtInt } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";

import styles from "./Pipeline.module.css";

/**
 * Sơ đồ đường đi của dữ liệu, từ request tới verdict PASS/BREACH.
 *
 * Khi demo, `activeIndex` chạy lần lượt qua từng chặng để người xem theo kịp;
 * khi không demo thì `activeIndex` là chặng đang được hover/bấm.
 */
export default function Pipeline({
  stages,
  activeIndex,
  onSelect,
  demoRunning,
}: {
  stages: PipelineStage[];
  activeIndex: number | null;
  onSelect: (index: number | null) => void;
  demoRunning: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  // Khi demo tự chạy, cuộn chặng đang sáng vào giữa màn hình.
  useEffect(() => {
    if (!demoRunning || activeIndex === null || !listRef.current) return;
    const node = listRef.current.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [demoRunning, activeIndex]);

  const active = activeIndex === null ? null : stages[activeIndex] ?? null;

  return (
    <section className={styles.wrap} aria-label="Pipeline đo lường">
      <div className={styles.head}>
        <h2 className={styles.title}>Dữ liệu đi từ request tới verdict như thế nào</h2>
        <p className={styles.lead}>
          Bấm vào một chặng để xem nó làm gì. Con số trên mỗi chặng là số thật đang
          chảy qua trong cửa sổ thời gian hiện tại.
        </p>
      </div>

      <ol className={styles.rail} ref={listRef}>
        {stages.map((stage, index) => {
          const isActive = index === activeIndex;
          const isDone = activeIndex !== null && index < activeIndex;
          return (
            <li key={stage.id} className={styles.slot}>
              <button
                type="button"
                className={`${styles.stage} ${isActive ? styles.stageActive : ""} ${
                  isDone ? styles.stageDone : ""
                }`}
                onClick={() => onSelect(isActive ? null : index)}
                aria-pressed={isActive}
              >
                <span className={styles.step}>{index + 1}</span>
                <span className={styles.label}>{stage.label}</span>
                <span className={styles.value}>{fmtInt(stage.value)}</span>
                <span className={styles.valueLabel}>{stage.valueLabel}</span>
                <code className={styles.source}>{stage.source}</code>
              </button>
              {index < stages.length - 1 ? (
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {active ? (
        <div className={styles.detail}>
          <div className={styles.detailHead}>
            <span className={styles.detailStep}>Chặng {(activeIndex ?? 0) + 1}</span>
            <strong className={styles.detailTitle}>{active.label}</strong>
            <code className={styles.detailSource}>{active.source}</code>
          </div>
          <p className={styles.detailBody}>{active.detail}</p>
          {active.breakdown && active.breakdown.length > 0 ? (
            <div className={styles.breakdown}>
              {active.breakdown.map((item) => (
                <span key={item.label} className={styles.breakdownItem}>
                  <span className={styles.breakdownValue}>{fmtInt(item.value)}</span>
                  <span className={styles.breakdownLabel}>{item.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
