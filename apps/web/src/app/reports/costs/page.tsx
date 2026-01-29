"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGetWhatsAppCosts } from "@/lib/api";
import { DollarSign, TrendingUp, Info, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Preços estimados em BRL (Baseado na tabela Meta Brasil 2024/2025)
const PRICES = {
  marketing: 0.35, // ~ $0.0625 USD
  utility: 0.02,   // ~ $0.0035 USD
  authentication: 0.18, // ~ $0.0315 USD
  service: 0.15,   // ~ $0.0300 USD (Lembrando que as primeiras 1000 são free, mas aqui calculamos bruto)
  unknown: 0.0
};

const COLORS = {
  marketing: "#8b5cf6", // Violet
  utility: "#10b981",   // Emerald
  authentication: "#f59e0b", // Amber
  service: "#3b82f6",   // Blue
  unknown: "#94a3b8"    // Slate
};

const LABELS: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
  service: "Serviço (Atendimento)",
  unknown: "Outros"
};

export default function CostsReportPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(1); // Início do mês atual
    return { from, to };
  });

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const costsQ = useQuery({
    queryKey: ["whatsapp-costs", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => apiGetWhatsAppCosts({
      accessToken: accessToken!,
      from: range.from.toISOString(),
      to: range.to.toISOString()
    }),
    enabled: !!accessToken
  });

  const data = costsQ.data || [];
  
  // Calcular totais
  const totalQuantity = data.reduce((acc, item) => acc + item.quantity, 0);
  const totalCost = data.reduce((acc, item) => {
    const price = PRICES[item.category as keyof typeof PRICES] || 0;
    return acc + (item.quantity * price);
  }, 0);

  const chartData = data.map(item => ({
    name: LABELS[item.category] || item.category,
    quantity: item.quantity,
    cost: item.quantity * (PRICES[item.category as keyof typeof PRICES] || 0),
    color: COLORS[item.category as keyof typeof COLORS] || COLORS.unknown
  }));

  if (!accessToken) return <div className="p-8 text-center text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-10 p-6">
      <div className="flex flex-col md:flex-row justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-green-600" />
            Custos API WhatsApp
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
            Estimativa de gastos com conversas da Meta Cloud API.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <Calendar className="w-4 h-4 text-gray-500" />
          </div>
          <input
            type="date"
            value={range.from.toISOString().split('T')[0]}
            onChange={(e) => setRange(r => ({ ...r, from: new Date(e.target.value) }))}
            className="bg-transparent text-sm font-medium outline-none text-gray-700 dark:text-gray-300 px-2"
          />
          <span className="text-gray-400">até</span>
          <input
            type="date"
            value={range.to.toISOString().split('T')[0]}
            onChange={(e) => setRange(r => ({ ...r, to: new Date(e.target.value) }))}
            className="bg-transparent text-sm font-medium outline-none text-gray-700 dark:text-gray-300 px-2"
          />
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 dark:bg-green-900/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Custo Estimado</div>
            <div className="text-4xl font-black text-gray-900 dark:text-white">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}
            </div>
            <div className="text-xs font-medium text-green-600 mt-2 flex items-center gap-1">
              <Info className="w-3 h-3" /> Baseado na tabela Brasil
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-900/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Total de Conversas</div>
            <div className="text-4xl font-black text-gray-900 dark:text-white">
              {totalQuantity}
            </div>
            <div className="text-xs font-medium text-blue-600 mt-2">
              Janelas de 24h iniciadas
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2">
            <div className="flex justify-between">
              <span>Marketing:</span>
              <span className="font-bold">R$ 0,35</span>
            </div>
            <div className="flex justify-between">
              <span>Utilidade:</span>
              <span className="font-bold">R$ 0,02</span>
            </div>
            <div className="flex justify-between">
              <span>Autenticação:</span>
              <span className="font-bold">R$ 0,18</span>
            </div>
            <div className="flex justify-between">
              <span>Serviço:</span>
              <span className="font-bold">R$ 0,15</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico e Tabela */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Distribuição por Categoria</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%" minHeight={320}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={32}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Detalhamento</h3>
          <div className="space-y-4">
            {chartData.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.quantity} conversas</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-gray-900 dark:text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.cost)}
                  </div>
                </div>
              </div>
            ))}
            {chartData.length === 0 && (
              <div className="text-center text-gray-400 py-10">Nenhum dado no período.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
