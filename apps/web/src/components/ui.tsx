"use client";

import { useState } from "react";
import { openFile } from "@/lib/api";
import { statusTone } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function StatusTag({ status, label }: { status: string; label?: string }) {
  const { t } = useI18n();
  const tone = statusTone(status);
  const cls = tone === "neutral" ? "tag" : `tag tag-${tone}`;
  return <span className={cls}>{label ?? t(`status.${status}`)}</span>;
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p className="muted" role="status">
      {t("common.loading")}
    </p>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, tError } = useI18n();
  if (!error) return null;
  return (
    <div className="notice notice-bad row" role="alert">
      <span>{tError(error)}</span>
      {onRetry && (
        <button className="link-button" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Opens an access-controlled file (the API needs the bearer token, so a plain link won't do). */
export function FileButton({ fileId, label }: { fileId: string; label?: string }) {
  const { t, tError } = useI18n();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className="link-button"
        onClick={() => openFile(fileId).catch((e) => setError(tError(e)))}
      >
        {label ?? t("common.openFile")}
      </button>
      {error && <span className="muted"> {error}</span>}
    </span>
  );
}

/** A decision form: optional/required note plus one or more actions. */
export function DecisionForm({
  actions,
  pending,
  noteLabel,
}: {
  actions: { label: string; variant?: "good" | "danger" | "quiet"; requiresNote?: boolean; onClick: (note: string) => void }[];
  pending: boolean;
  noteLabel: string;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="stack">
      <label className="field">
        {noteLabel}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <div className="row">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={a.variant === "good" ? "btn btn-good" : a.variant === "danger" ? "btn btn-danger" : a.variant === "quiet" ? "btn btn-quiet" : "btn"}
            disabled={pending || (a.requiresNote === true && note.trim() === "")}
            onClick={() => a.onClick(note.trim())}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
