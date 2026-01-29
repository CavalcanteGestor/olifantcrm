"use client";

import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle({ simple = false }: { simple?: boolean }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`relative rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all duration-200 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white flex items-center justify-center ${simple ? "p-3" : "px-3 py-1.5 gap-2"}`}
      aria-label={`Alternar para tema ${theme === "dark" ? "claro" : "escuro"}`}
      title={`Alternar para tema ${theme === "dark" ? "claro" : "escuro"}`}
    >
      {theme === "dark" ? (
        <svg className={simple ? "w-6 h-6" : "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className={simple ? "w-6 h-6" : "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {!simple && <span className="text-xs font-medium">Tema</span>}
    </button>
  );
}

