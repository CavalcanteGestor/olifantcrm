"use client";

import { useState, ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type AccordionProps = {
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
};

export default function Accordion({ title, icon, defaultOpen = true, headerAction, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors bg-white dark:bg-gray-900"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-gray-900 dark:text-white">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
        </div>
      </button>
      {isOpen && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
}
