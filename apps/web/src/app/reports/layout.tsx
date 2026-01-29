"use client";

import Image from "next/image";
import BackofficeShell from "@/app/ui/backoffice/BackofficeShell";
import { useRequireRole } from "@/hooks/useRequireRole";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { sessionReady, hasAccess } = useRequireRole({ allowedRoleKeys: ["admin"] });

  if (!sessionReady) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <Image
              src="/logo.png"
              alt="Clínica Olifant"
              fill
              sizes="64px"
              className="object-contain opacity-50"
              priority
            />
          </div>
          <div className="text-sm text-gray-400">Carregando...</div>
        </div>
      </div>
    );
  }

  if (!hasAccess) return null;

  return <BackofficeShell headerTitle="Relatórios">{children}</BackofficeShell>;
}
