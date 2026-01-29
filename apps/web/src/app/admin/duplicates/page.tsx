"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { exportToCSV } from "@/lib/export";
import { Users, Download, Phone, MessageSquare, Activity, CheckCircle } from "lucide-react";

type DuplicateContact = {
  phone_e164: string;
  count: number;
  contact_ids: string[];
  display_names: string[];
  conversation_ids: string[];
};

export default function DuplicatesPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!data.session) {
        router.replace(`/login?redirect=${encodeURIComponent("/admin/duplicates")}`);
      } else {
        setAccessToken(data.session.access_token);
      }
    })();
  }, [router]);

  const duplicatesQ = useQuery({
    queryKey: ["duplicates"],
    queryFn: async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return [];

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .single();

      if (!profile) return [];

      // Buscar contatos duplicados por telefone
      const { data: contacts } = await supabaseBrowser()
        .from("contacts")
        .select("id, display_name, phone_e164, tenant_id")
        .eq("tenant_id", (profile as any).tenant_id)
        .not("phone_e164", "is", null);

      if (!contacts) return [];

      // Agrupar por telefone
      const phoneMap = new Map<string, any[]>();
      for (const contact of contacts) {
        const phone = (contact as any).phone_e164;
        if (!phone) continue;
        if (!phoneMap.has(phone)) {
          phoneMap.set(phone, []);
        }
        phoneMap.get(phone)!.push(contact);
      }

      // Filtrar apenas duplicatas (2+ contatos com mesmo telefone)
      const duplicates: DuplicateContact[] = [];
      for (const [phone, contactList] of phoneMap.entries()) {
        if (contactList.length > 1) {
          // Buscar conversas para cada contato
          const conversationIds: string[] = [];
          for (const contact of contactList) {
            const { data: convs } = await supabaseBrowser()
              .from("conversations")
              .select("id")
              .eq("contact_id", (contact as any).id)
              .limit(10);
            if (convs) {
              conversationIds.push(...convs.map((c: any) => c.id));
            }
          }

          duplicates.push({
            phone_e164: phone,
            count: contactList.length,
            contact_ids: contactList.map((c: any) => c.id),
            display_names: contactList.map((c: any) => c.display_name || "Sem nome"),
            conversation_ids: conversationIds
          });
        }
      }

      return duplicates.sort((a, b) => b.count - a.count);
    },
    enabled: !!accessToken,
    refetchInterval: 30000 // Atualizar a cada 30 segundos
  });

  async function handleMerge(duplicate: DuplicateContact) {
    if (!confirm(`Deseja mesclar ${duplicate.count} contatos duplicados com telefone ${duplicate.phone_e164}?`)) {
      return;
    }

    setMerging(duplicate.phone_e164);
    try {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return;

      // Usar RPC para mesclar contatos
      const { error } = await (supabaseBrowser() as any).rpc("merge_duplicate_contacts", {
        p_contact_ids: duplicate.contact_ids,
        p_keep_contact_id: duplicate.contact_ids[0] // Manter o primeiro
      });

      if (error) throw error;

      alert("Contatos mesclados com sucesso!");
      duplicatesQ.refetch();
    } catch (error: any) {
      alert("Erro ao mesclar contatos: " + (error.message || "Erro desconhecido"));
    } finally {
      setMerging(null);
    }
  }

  async function handleExport() {
    if (!duplicatesQ.data || duplicatesQ.data.length === 0) {
      alert("Nenhum dado para exportar");
      return;
    }

    const exportData = duplicatesQ.data.map((d) => ({
      telefone: d.phone_e164,
      quantidade: d.count,
      nomes: d.display_names.join(", "),
      ids_contatos: d.contact_ids.join(", ")
    }));

    await exportToCSV(exportData, "duplicatas");
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-indigo-600 dark:bg-indigo-900 shadow-2xl shadow-indigo-200 dark:shadow-none p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
                <Users className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">Duplicatas de Contatos</h1>
            </div>
            <p className="text-indigo-100 font-medium">Otimize sua base removendo contatos repetidos com o mesmo telefone.</p>
          </div>
          {duplicatesQ.data && duplicatesQ.data.length > 0 && (
            <button
              onClick={handleExport}
              className="px-6 py-3 rounded-2xl bg-white text-indigo-600 hover:bg-indigo-50 font-bold transition-all shadow-lg hover:shadow-indigo-500/20 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Base</span>
            </button>
          )}
        </div>
      </div>

      {duplicatesQ.isLoading ? (
        <div className="col-span-full py-20 text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-gray-500">Buscando duplicatas na base de dados...</p>
        </div>
      ) : duplicatesQ.data && duplicatesQ.data.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Grupos de Duplicatas</h2>
            <div className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-black uppercase rounded-full tracking-wider">
              {duplicatesQ.data.length} Conflitos
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {duplicatesQ.data.map((duplicate) => (
              <div
                key={duplicate.phone_e164}
                className="group relative overflow-hidden rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-700 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-400">
                      <Phone className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xl font-black text-gray-900 dark:text-white tracking-tight">{duplicate.phone_e164}</span>
                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black uppercase rounded-lg">
                          {duplicate.count} registros
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 font-medium max-w-xl line-clamp-1">
                        {duplicate.display_names.join(" • ")}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <MessageSquare className="w-3 h-3 text-gray-300" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {duplicate.conversation_ids.length} conversas afetadas
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleMerge(duplicate)}
                    disabled={merging === duplicate.phone_e164}
                    className="px-8 py-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-black hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {merging === duplicate.phone_e164 ? (
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                    MESCLAR AGORA
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white dark:bg-gray-800 p-20 text-center border-2 border-dashed border-gray-100 dark:border-gray-700">
          <div className="w-20 h-20 bg-green-50 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Base de Dados Limpa!</h2>
          <p className="text-gray-500 font-medium">Nenhum contato duplicado foi detectado no momento.</p>
        </div>
      )}
    </div>
  );

}
