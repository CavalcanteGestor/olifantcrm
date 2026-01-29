"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      // Limpar sessão completamente
      await supabase.auth.signOut();
      // Limpar cache do navegador
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }
      // Forçar navegação
      router.replace("/login");
      // Forçar reload se necessário
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }, 500);
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      // Mesmo com erro, tentar navegar
      router.replace("/login");
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-300
        ${loading
          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
          : "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white shadow-sm hover:shadow-md active:scale-95"
        }`}
      title="Sair do sistema"
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Saindo...</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Sair</span>
        </>
      )}
    </button>
  );
}

