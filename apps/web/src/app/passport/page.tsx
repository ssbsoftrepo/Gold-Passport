"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

/** Public lookup: anyone (a buyer, an auditor, a regulator) can verify a lot's passport. */
export default function PassportLookup() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <main className="passport">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name" style={{ color: "var(--ink)" }}>PMD</span>
      </div>
      <h1>{t("passport.title")}</h1>
      <p>{t("passport.lookup")}</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const normalized = code.trim().toUpperCase();
          if (normalized) router.push(`/passport/${encodeURIComponent(normalized)}`);
        }}
      >
        <input
          className="stamp"
          aria-label={t("passport.title")}
          placeholder="GP-XXXXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ fontSize: "var(--step-2)", maxWidth: 360 }}
        />
        <button className="btn">{t("passport.verify")}</button>
      </form>
    </main>
  );
}
