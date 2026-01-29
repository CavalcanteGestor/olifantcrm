"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Building, User, Phone, CheckCircle2, Copy } from "lucide-react";
import { notify } from "@/lib/toastBus";

export default function SettingsAccountPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setUserEmail(data.session?.user.email ?? null);
    });
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notify("Copiado para a área de transferência!", "success");
  };

  const profileQ = useQuery({
    queryKey: ["settings-account-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser()
        .from("profiles")
        .select("user_id, tenant_id, full_name, created_at")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!userId
  });

  const tenantQ = useQuery({
    queryKey: ["settings-account-tenant", profileQ.data?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser().from("tenants").select("id, name, created_at").eq("id", profileQ.data!.tenant_id).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!profileQ.data?.tenant_id
  });

  const waQ = useQuery({
    queryKey: ["settings-account-wa", profileQ.data?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser()
        .from("whatsapp_accounts")
        .select("id, waba_id, phone_number_id, business_id, created_at")
        .eq("tenant_id", profileQ.data!.tenant_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!profileQ.data?.tenant_id
  });

  if (!userId) return <div className="p-8 text-center text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          <Building className="w-7 h-7 text-indigo-600" />
          Minha Conta
        </h1>
        <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
          Gerencie suas informações de perfil e configurações da organização.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Card de Perfil */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-all"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-black shadow-xl mb-4">
                {profileQ.data?.full_name?.[0]?.toUpperCase() || "U"}
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profileQ.data?.full_name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-6">{userEmail || "Usuário do Sistema"}</p>
              
              <div className="w-full space-y-3">
                 <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-left">
                    <div className="text-[10px] uppercase font-black text-gray-400 mb-1">User ID</div>
                    <div className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all flex items-center justify-between gap-2">
                      {userId}
                      <button onClick={() => copyToClipboard(userId)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><Copy className="w-3 h-3" /></button>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* Informações da Organização */}
        <div className="lg:col-span-2 space-y-6">
           {/* Tenant Info */}
           <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl">
                  <Building className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Organização</h3>
                  <p className="text-xs text-gray-500 font-medium">Dados da sua empresa no sistema</p>
                </div>
              </div>

              {tenantQ.isLoading ? (
                <div className="animate-pulse h-20 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <div className="text-xs font-black text-gray-400 uppercase mb-1">Nome da Empresa</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{tenantQ.data?.name}</div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                     <div className="text-xs font-black text-gray-400 uppercase mb-1">Data de Criação</div>
                     <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {new Date(tenantQ.data?.created_at).toLocaleDateString('pt-BR')}
                     </div>
                  </div>
                  <div className="md:col-span-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-4">
                     <div>
                        <div className="text-xs font-black text-gray-400 uppercase mb-1">Tenant ID</div>
                        <div className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all">{profileQ.data?.tenant_id}</div>
                     </div>
                     <button onClick={() => copyToClipboard(profileQ.data?.tenant_id)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"><Copy className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
           </div>

           {/* WhatsApp Integration */}
           <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-green-50 dark:bg-green-900/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-xl">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Conexão WhatsApp</h3>
                    <p className="text-xs text-gray-500 font-medium">Status da integração com Meta Cloud API</p>
                  </div>
                </div>

                {waQ.isLoading ? (
                  <div className="animate-pulse h-20 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                ) : waQ.data && waQ.data.length > 0 ? (
                  <div className="space-y-4">
                    {waQ.data.map((wa) => (
                      <div key={wa.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-green-100 dark:border-green-900/30 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600">
                              <CheckCircle2 className="w-5 h-5" />
                           </div>
                           <div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white">Conectado e Ativo</div>
                              <div className="text-xs text-gray-500">ID: {wa.phone_number_id}</div>
                           </div>
                        </div>
                        <div className="flex flex-col items-end">
                           <div className="text-[10px] font-black text-gray-400 uppercase">WABA ID</div>
                           <div className="text-xs font-mono font-medium">{wa.waba_id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <p className="text-gray-500 font-medium">Nenhuma conta WhatsApp conectada.</p>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

