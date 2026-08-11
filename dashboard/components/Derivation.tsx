"use client";

import type { DerivationStep, PanelData, PanelDerivation } from "@/lib/types";

import styles from "./Derivation.module.css";

const KIND_LABEL: Record<DerivationStep["kind"], string> = {
  source: "NGUỒN",
  window: "CỬA SỔ",
  filter: "LỌC",
  field: "FIELD",
  formula: "CÔNG THỨC",
  threshold: "NGƯỠNG",
};

/**
 * Tô đậm đúng những field mà panel này đang dùng, ngay trên dòng log nguyên văn.
 * Chỉ khớp field top-level dạng vô hướng — đủ cho mọi field trong contract.
 */
function highlightRaw(raw: string, fields: string[]) {
  if (fields.length === 0) return [<span key="0">{raw}</span>];
  const escaped = fields.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `("(?:${escaped.join("|")})"\\s*:\\s*(?:"[^"]*"|-?[\\d.]+(?:[eE][-+]?\\d+)?|true|false|null))`,
    "g",
  );
  // split() với đúng một capturing group → phần khớp luôn nằm ở index lẻ.
  return raw.split(pattern).map((chunk, index) =>
    index % 2 === 1 ? (
      <mark key={index} className={styles.mark}>
        {chunk}
      </mark>
    ) : (
      <span key={index}>{chunk}</span>
    ),
  );
}

export default function Derivation({
  panel,
  derivation,
  onClose,
}: {
  panel: PanelData;
  derivation: PanelDerivation;
  onClose: () => void;
}) {
  return (
    <section className={styles.wrap} aria-label={`Cách đo panel ${panel.title}`}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>Cách đo</span>
          <h2 className={styles.title}>{panel.title}</h2>
        </div>
        <div className={styles.headRight}>
          <span
            className={`${styles.verdictChip} ${
              panel.pass ? styles.chipPass : styles.chipBreach
            }`}
          >
            {panel.pass ? "PASS" : "BREACH"}
          </span>
          <button type="button" className={styles.close} onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>

      <p className={styles.verdict}>{derivation.verdict}</p>

      <ol className={styles.steps}>
        {derivation.steps.map((step, index) => (
          <li
            key={`${step.kind}-${index}`}
            className={`${styles.step} ${
              step.kind === "threshold" ? styles.stepThreshold : ""
            }`}
          >
            <span className={styles.stepNum}>{index + 1}</span>
            <span className={styles.stepKind}>{KIND_LABEL[step.kind]}</span>
            <span className={styles.stepLabel}>{step.label}</span>
            <code className={styles.stepExpr}>{step.expr}</code>
            <span
              className={`${styles.stepResult} ${
                step.kind === "threshold"
                  ? panel.pass
                    ? styles.resultPass
                    : styles.resultBreach
                  : ""
              }`}
            >
              {step.result}
            </span>
          </li>
        ))}
      </ol>

      {derivation.samples.length > 0 ? (
        <div className={styles.samples}>
          <h3 className={styles.samplesTitle}>
            Log thật đã được lọc ra
            <span className={styles.samplesHint}>
              field được tô là field panel này đang dùng
            </span>
          </h3>
          {derivation.samples.map((sample, index) => (
            <pre key={index} className={styles.sample}>
              {highlightRaw(sample.raw, sample.highlight)}
            </pre>
          ))}
        </div>
      ) : null}

      {derivation.note ? (
        <p className={styles.note}>
          <strong>Khi bị hỏi:</strong> {derivation.note}
        </p>
      ) : null}
    </section>
  );
}
