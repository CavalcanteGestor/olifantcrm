"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ThemeToggle from "@/components/ThemeToggle";
import { Mail, Lock, LogIn, Sparkles } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificar se já está logado e redirecionar baseado na role
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (data.session) {
        const redirectParam = searchParams.get("redirect");
        if (redirectParam) {
          router.replace(redirectParam);
          return;
        }

        // Redirecionar baseado na role do usuário
        const { data: profile } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", data.session.user.id)
          .single();

        if (profile && typeof profile === 'object' && 'tenant_id' in profile) {
          const profileData = profile as { tenant_id: string };
          const { data: userRoles } = await supabaseBrowser()
            .from("user_roles")
            .select("role_id")
            .eq("tenant_id", profileData.tenant_id)
            .eq("user_id", data.session.user.id);

          if (userRoles && userRoles.length > 0) {
            const roleIds = userRoles.map((ur: any) => ur.role_id);
            const { data: roles } = await supabaseBrowser()
              .from("roles")
              .select("key")
              .in("id", roleIds);

            const roleKeys = new Set((roles ?? []).map((r: any) => r.key).filter(Boolean));

            // Se tem role admin, vai para /admin, senão vai para HUD
            if (roleKeys.has("admin")) {
              router.replace("/admin");
            } else {
              router.replace("/hud");
            }
          } else {
            router.replace("/hud");
          }
        } else {
          router.replace("/hud");
        }
      }
    })();
  }, [router, searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err, data } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      // Aguardar um momento para garantir que a sessão foi salva
      await new Promise((resolve) => setTimeout(resolve, 100));

      const redirectParam = searchParams.get("redirect");
      if (redirectParam) {
        router.replace(redirectParam);
        return;
      }

      // Redirecionar baseado na role do usuário
      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", data.user.id)
        .single();

      if (profile && typeof profile === 'object' && 'tenant_id' in profile) {
        const profileData = profile as { tenant_id: string };
        const { data: userRoles } = await supabaseBrowser()
          .from("user_roles")
          .select("role_id")
          .eq("tenant_id", profileData.tenant_id)
          .eq("user_id", data.user.id);

        if (userRoles && userRoles.length > 0) {
          const roleIds = userRoles.map((ur: any) => ur.role_id);
          const { data: roles } = await supabaseBrowser()
            .from("roles")
            .select("key")
            .in("id", roleIds);

          const roleKeys = new Set((roles ?? []).map((r: any) => r.key).filter(Boolean));

          // Se tem role admin, vai para /admin, senão vai para HUD
          if (roleKeys.has("admin")) {
            router.replace("/admin");
          } else {
            router.replace("/hud");
          }
        } else {
          router.replace("/hud");
        }
      } else {
        router.replace("/hud");
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6b8e5a] via-[#c9897f] to-[#d97757] dark:from-[#556b47] dark:via-[#a86f65] dark:to-[#b85a3f] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background decorative elements animados */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#6b8e5a]/20 dark:bg-[#6b8e5a]/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#c9897f]/20 dark:bg-[#c9897f]/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#d97757]/15 dark:bg-[#d97757]/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-[#6b8e5a]/15 dark:bg-[#6b8e5a]/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute bottom-1/4 left-1/4 w-[450px] h-[450px] bg-[#c9897f]/15 dark:bg-[#c9897f]/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
      </div>

      {/* Grid pattern sutil */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{
        backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '50px 50px'
      }}></div>

      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <div className="bg-white/20 dark:bg-gray-900/20 backdrop-blur-md rounded-full p-2 border border-white/30 dark:border-gray-800/30 shadow-lg">
          <ThemeToggle />
        </div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo Olifant com efeito glassmorphism */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-block mb-4 transform hover:scale-105 transition-transform duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-white/40 dark:bg-gray-900/40 backdrop-blur-xl rounded-3xl blur-xl -z-10"></div>
              <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/40 dark:border-gray-800/40">
                <Image
                  src="/logo.png"
                  alt="Clínica Olifant"
                  width={220}
                  height={132}
                  priority
                  className="object-contain w-full h-auto"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-white/90 animate-pulse" />
            <div className="text-sm text-white/95 font-semibold">CRM Clínico WhatsApp</div>
            <Sparkles className="w-3.5 h-3.5 text-white/90 animate-pulse" style={{ animationDelay: '0.5s' }} />
          </div>
          <div className="text-[10px] sm:text-xs text-white/80">Gerencie seus atendimentos com inteligência</div>
        </div>

        {/* Card de Login melhorado */}
        <form onSubmit={onSubmit} className="w-full rounded-3xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl border border-white/40 dark:border-gray-800/40 relative overflow-hidden">
          {/* Efeito de brilho sutil */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>

          <div className="relative z-10">
            <div className="mb-6">
              <h1 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-[#6b8e5a] via-[#c9897f] to-[#d97757] bg-clip-text text-transparent">
                Bem-vindo de volta
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">Entre com suas credenciais para acessar o sistema</p>
            </div>

            <div className="space-y-5">
              <label className="block group">
                <span className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#6b8e5a]" />
                  Email
                </span>
                <div className="relative">
                  <input
                    className="w-full rounded-xl bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-200 dark:border-gray-700 px-4 pl-11 py-3.5 outline-none focus:border-[#6b8e5a] focus:ring-4 focus:ring-[#6b8e5a]/20 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200 group-hover:border-gray-300 dark:group-hover:border-gray-600"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="seu@email.com"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </label>

              <label className="block group">
                <span className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#6b8e5a]" />
                  Senha
                </span>
                <div className="relative">
                  <input
                    className="w-full rounded-xl bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-200 dark:border-gray-700 px-4 pl-11 py-3.5 outline-none focus:border-[#6b8e5a] focus:ring-4 focus:ring-[#6b8e5a]/20 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200 group-hover:border-gray-300 dark:group-hover:border-gray-600"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </label>

              {error ? (
                <div className="mt-4 text-sm text-[#d97757] dark:text-[#e6957a] bg-[#d97757]/10 dark:bg-[#d97757]/20 border-2 border-[#d97757]/30 dark:border-[#d97757]/40 rounded-xl p-4 flex items-start gap-3 animate-shake">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="font-medium flex-1">{error}</div>
                </div>
              ) : null}

              <button
                disabled={loading}
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#6b8e5a] via-[#c9897f] to-[#d97757] hover:from-[#7ba06a] hover:via-[#d9a396] hover:to-[#e6957a] dark:from-[#556b47] dark:via-[#a86f65] dark:to-[#b85a3f] dark:hover:from-[#6b8e5a] dark:hover:via-[#c9897f] dark:hover:to-[#d97757] text-white font-bold py-4 px-6 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-[#6b8e5a]/30 dark:shadow-[#556b47]/30 hover:shadow-2xl hover:shadow-[#6b8e5a]/40 text-base sm:text-lg relative overflow-hidden group"
                type="submit"
              >
                {/* Efeito de brilho no hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                {loading ? (
                  <span className="flex items-center justify-center gap-3 relative z-10">
                    <svg className="animate-spin h-5 w-5 sm:h-6 sm:w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Entrando...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2 relative z-10">
                    <LogIn className="w-5 h-5" />
                    <span>Entrar</span>
                  </span>
                )}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Precisa de ajuda?{" "}
                <a href="mailto:suporte@olifant.com" className="font-semibold text-[#6b8e5a] dark:text-[#7ba06a] hover:text-[#7ba06a] dark:hover:text-[#84a770] transition-colors underline-offset-2 hover:underline">
                  Entre em contato
                </a>
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-white/80 dark:text-white/70 font-medium">
          © {new Date().getFullYear()} Clínica Olifant. Todos os direitos reservados.
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#6b8e5a] via-[#c9897f] to-[#d97757] dark:from-[#556b47] dark:via-[#a86f65] dark:to-[#b85a3f] flex items-center justify-center">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-white/40 dark:bg-gray-900/40 backdrop-blur-xl rounded-3xl blur-xl -z-10"></div>
              <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/40 dark:border-gray-800/40">
                <Image
                  src="/logo.png"
                  alt="Clínica Olifant"
                  width={240}
                  height={144}
                  className="object-contain w-full h-auto"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}


