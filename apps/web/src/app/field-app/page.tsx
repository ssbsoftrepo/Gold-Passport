"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** Miners and Transporters work in the mobile app; the web portal is for plants and PMD. */
export default function FieldAppPage() {
  const { t } = useI18n();
  const { user, signOut } = useSession();
  const router = useRouter();
  return (
    <main className="main">
      <div className="page" style={{ maxWidth: 560 }}>
        <h1>{user?.role ? t(`role.${user.role}`) : t("app.name")}</h1>
        <p>{t("role.pick.field")}</p>
        <div>
          <button
            className="btn btn-quiet"
            onClick={() => {
              signOut();
              router.replace("/login");
            }}
          >
            {t("common.signOut")}
          </button>
        </div>
      </div>
    </main>
  );
}
