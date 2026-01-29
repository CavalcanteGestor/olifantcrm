"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return null;
      const { data: profile, error: profileErr } = await supabaseBrowser()
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_id", session.session.user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile) throw new Error("Profile not found");

      // Buscar email do auth.users através da sessão
      const email = session.session.user.email || "";

      const { data: userRoles, error: rolesErr } = await supabaseBrowser()
        .from("user_roles")
        .select("roles(key)")
        .eq("user_id", session.session.user.id);
      if (rolesErr) throw rolesErr;

      const roles = (userRoles ?? []).map((ur: any) => ({ role: ur.roles?.key })).filter((r) => r.role);
      const profileData = profile as { user_id: string; full_name: string | null };
      return {
        user_id: profileData.user_id,
        full_name: profileData.full_name,
        email: email,
        user_roles: roles
      };
    },
    enabled: sessionReady
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (profileQ.data) {
      setName(profileQ.data.full_name || "");
    }
  }, [profileQ.data]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return;
      const supabase = supabaseBrowser();
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ full_name: name.trim() })
        .eq("user_id", session.session.user.id);
      if (error) throw error;
      
      // Invalidar e refazer o fetch imediatamente
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.refetchQueries({ queryKey: ["profile"] });
      
      // Atualizar o estado local para garantir que o valor seja atualizado
      setName(name.trim());
      
      alert("Nome atualizado com sucesso!");
    } catch (err: any) {
      alert("Erro ao atualizar: " + (err.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  if (!sessionReady) {
    return (
      <div className="h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
        <div className="text-sm text-gray-600 dark:text-gray-400">Carregando...</div>
      </div>
    );
  }

  const roles = (profileQ.data?.user_roles as any[]) ?? [];
  const email = profileQ.data?.email || "";

  return (
    <div className="h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center px-4">
        <Link href="/" className="text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-[#d97757]">
          ← Voltar
        </Link>
      </div>
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Perfil</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Suas informações pessoais</p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:border-[#d97757] text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="mt-1 w-full rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none opacity-50 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400">Roles</label>
            <div className="mt-1 flex gap-2">
              {roles.map((r: any) => (
                <span key={r.role} className="text-xs px-2 py-1 rounded bg-[#d97757]/20 text-[#d97757]">
                  {r.role}
                </span>
              ))}
              {roles.length === 0 && <span className="text-xs text-gray-500 dark:text-gray-400">Nenhum role atribuído</span>}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="w-full px-4 py-2 rounded-md bg-[#d97757] text-white text-sm font-semibold hover:bg-[#b85a3f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

