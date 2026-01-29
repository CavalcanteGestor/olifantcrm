"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import InternalChat from "@/app/ui/hud/InternalChat";
import { Home, BarChart3, Settings, User, Users, FileText, TrendingUp, Search, UserCog, Target, Clock, BellRing, MessageSquare, DollarSign } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string | null;
};

type NavCategory = {
  category: string;
  items: NavItem[];
};

export default function BackofficeShell(props: { children: React.ReactNode; headerTitle?: string }) {
  const pathname = usePathname();
  const [isChatOpen, setIsChatOpen] = useState(false);

  const duplicatesQ = useQuery({
    queryKey: ["duplicates-count"],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser().rpc("count_duplicate_contacts");
      if (error) {
        console.error("Erro ao contar duplicatas:", error);
        return 0;
      }
      return data as number;
    },
    refetchInterval: 60000
  });

  const navItems: NavCategory[] = [
    {
      category: "Principal",
      items: [{ href: "/admin", label: "Dashboard", icon: BarChart3, description: "Visão geral" }]
    },
    {
      category: "Equipe",
      items: [
        { href: "/admin/agents", label: "Atendentes", icon: Users, description: "Gerenciar equipe" },
        { href: "/admin/compare", label: "Comparar", icon: TrendingUp, description: "Análise comparativa" }
      ]
    },
    {
      category: "Análises",
      items: [
        { href: "/reports", label: "Relatórios", icon: FileText, description: "Relatórios e métricas" },
        { href: "/reports/costs", label: "Custos API", icon: DollarSign, description: "Estimativa de gastos" },
        {
          href: "/admin/duplicates",
          label: "Duplicatas",
          icon: Search,
          description: "Detectar duplicatas",
          badge: duplicatesQ.data && duplicatesQ.data > 0 ? duplicatesQ.data.toString() : null
        }
      ]
    },
    {
      category: "Configurações",
      items: [
        { href: "/settings/users", label: "Usuários", icon: UserCog, description: "Gerenciar usuários" },
        { href: "/settings/funnel", label: "Funil", icon: Target, description: "Estágios do funil" },
        { href: "/settings/sla", label: "SLA", icon: Clock, description: "Tempo de resposta" },
        { href: "/settings/queues", label: "Filas & Alertas", icon: BellRing, description: "Gerenciar filas e alertas" },
        { href: "/settings/templates", label: "Templates", icon: FileText, description: "Respostas rápidas" },
        { href: "/settings/automation", label: "Automação", icon: MessageSquare, description: "Mensagens automáticas" },
        { href: "/settings/account", label: "Conta", icon: Settings, description: "Configurações" }
      ]
    }
  ];

  const headerTitle = props.headerTitle ?? "Admin";

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      <div className="h-11 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/admin" className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity">
            <div className="relative w-8 h-8 flex-shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 p-1.5">
              <div className="relative w-full h-full">
                <Image src="/logo.png" alt="Clínica Olifant" fill sizes="32px" className="object-contain" priority />
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{headerTitle}</div>
            </div>
          </Link>
          <div className="h-5 w-px bg-gray-200 dark:bg-gray-800"></div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/hud"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            title="HUD"
          >
            <Home className="w-4 h-4" />
          </Link>
          <Link
            href="/admin"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            title="Dashboard"
          >
            <BarChart3 className="w-4 h-4" />
          </Link>
          <ThemeToggle />
          <button
            onClick={() => setIsChatOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title="Chat Interno"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <Link
            href="/profile"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            title="Perfil"
          >
            <User className="w-4 h-4" />
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Chat Drawer */}
        {isChatOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 animate-in slide-in-from-right">
            <InternalChat onClose={() => setIsChatOpen(false)} />
          </div>
        )}
        
        <div className="w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
          <nav className="flex-1 overflow-y-auto p-3 space-y-4">
            {navItems.map((category) => (
              <div key={category.category}>
                <div className="px-2 mb-1.5">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {category.category}
                  </div>
                </div>
                <div className="space-y-0.5">
                  {category.items.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all duration-200 ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-md"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white"
                        }`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-gray-500 dark:text-gray-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold flex items-center gap-1.5">
                            {item.label}
                            {item.badge && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                                  isActive ? "bg-white/20 text-white" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {!isActive && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 group-hover:text-gray-400 dark:group-hover:text-gray-300 mt-0.5 truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="p-6 max-w-7xl mx-auto">
            {pathname !== "/admin" && (
              <nav className="mb-5 flex items-center gap-2 text-xs">
                <Link
                  href="/admin"
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
                >
                  <BarChart3 className="w-3 h-3" />
                  <span>Dashboard</span>
                </Link>
                <span className="text-gray-300 dark:text-gray-600">/</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {navItems
                    .flatMap((cat) => cat.items)
                    .find((item) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href)))?.label ||
                    pathname.split("/").pop()?.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              </nav>
            )}
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}
