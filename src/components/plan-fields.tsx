"use client";
import { skills, labels, type Allocation } from "@/lib/model";
import { scaleAllocation } from "@/lib/engine";
export function PlanFields({
  total,
  base,
  onTotal,
  onBase,
}: {
  total: number;
  base: Allocation;
  onTotal: (n: number) => void;
  onBase: (a: Allocation) => void;
}) {
  const sum = Object.values(base).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="form-row">
        <label>
          每日学习时长（分钟）
          <input
            type="number"
            min="30"
            max="360"
            step="1"
            value={Number.isNaN(total) ? "" : total}
            onChange={(e) => onTotal(e.target.valueAsNumber)}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            try {
              onBase(scaleAllocation(total));
            } catch {
              onTotal(120);
              onBase(scaleAllocation(120));
            }
          }}
        >
          按默认比例分配
        </button>
      </div>
      <div className="allocation-inputs">
        {skills.map((k) => (
          <label key={k}>
            <span className={`dot ${k}`} />
            {labels[k]}
            <div className="number-unit">
              <input
                aria-label={`${labels[k]}分钟`}
                type="number"
                min="5"
                max="360"
                step="1"
                value={Number.isNaN(base[k]) ? "" : base[k]}
                onChange={(e) =>
                  onBase({ ...base, [k]: e.target.valueAsNumber })
                }
              />
              <span>分钟</span>
            </div>
          </label>
        ))}
      </div>
      <p className={sum === total ? "muted small" : "validation"}>
        配额合计 {Number.isFinite(sum) ? sum : "—"} /{" "}
        {Number.isFinite(total) ? total : "—"} 分钟 · 每项至少 5 分钟
      </p>
    </>
  );
}
