"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export function useRequireRole(opts: { allowedRoleKeys: string[]; redirectTo?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [roleKeys, setRoleKeys] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const redirectTarget = opts.redirectTo ?? `/login?redirect=${encodeURIComponent(pathname)}`;

    (async () => {
      try {
        const { data, error: sessionError } = await supabaseBrowser().auth.getSession();
        if (sessionError || !data.session) {
          if (!cancelled) router.replace(redirectTarget);
          return;
        }

        const { data: profile, error: profileError } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", data.session.user.id)
          .single();

        if (profileError || !profile || typeof profile !== "object" || !("tenant_id" in profile)) {
          if (!cancelled) router.replace("/login");
          return;
        }

        const tid = (profile as { tenant_id: string }).tenant_id;
        const { data: userRoles, error: userRolesError } = await supabaseBrowser()
          .from("user_roles")
          .select("role_id")
          .eq("tenant_id", tid)
          .eq("user_id", data.session.user.id);

        if (userRolesError || !userRoles || userRoles.length === 0) {
          if (!cancelled) router.replace("/login");
          return;
        }

        const roleIds = userRoles.map((ur: any) => ur.role_id);
        const { data: roles, error: rolesError } = await supabaseBrowser().from("roles").select("key").in("id", roleIds);

        if (rolesError) {
          if (!cancelled) router.replace("/login");
          return;
        }

        const keys = (roles ?? []).map((r: any) => r.key).filter(Boolean) as string[];
        const allowed = new Set(opts.allowedRoleKeys);
        const ok = keys.some((k) => allowed.has(k));

        if (!cancelled) {
          setTenantId(tid);
          setRoleKeys(keys);
          setHasAccess(ok);
          setSessionReady(true);
        }

        if (!ok) {
          if (!cancelled) router.replace("/login");
        }
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname, opts.allowedRoleKeys, opts.redirectTo]);

  return { sessionReady, hasAccess, tenantId, roleKeys };
}

