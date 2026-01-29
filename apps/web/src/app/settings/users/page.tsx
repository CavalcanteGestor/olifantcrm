"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiDeleteUser, apiInviteUser, apiListUsers, apiUpdateUserRole, apiUpdateUserPassword, apiUpdateUserName } from "@/lib/api";
import { notify } from "@/lib/toastBus";
import { Edit2, Trash2, UserPlus, X } from "lucide-react";

type UserRow = { user_id: string; full_name: string; role: "admin" | "secretaria" };

export default function SettingsUsersPage() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Estado para criar usuário
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "secretaria">("secretaria");
  const [sendInvite, setSendInvite] = useState(true);
  const [busy, setBusy] = useState(false);

  // Estado para modal de edição
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "secretaria">("secretaria");

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  const usersQ = useQuery({
    queryKey: ["settings-users"],
    queryFn: () => {
      console.log("🔍 Chamando apiListUsers com token:", accessToken?.substring(0, 20) + "...");
      return apiListUsers({ accessToken: accessToken! });
    },
    enabled: !!accessToken,
    retry: 1
  });

  // Debug: Log do estado da query
  useEffect(() => {
    console.log("📊 Estado da query:", {
      isLoading: usersQ.isLoading,
      isFetching: usersQ.isFetching,
      isError: usersQ.isError,
      error: usersQ.error,
      data: usersQ.data,
      accessToken: accessToken ? "presente" : "ausente"
    });
  }, [usersQ.isLoading, usersQ.isFetching, usersQ.isError, usersQ.error, usersQ.data, accessToken]);

  const users = useMemo(() => (usersQ.data?.items ?? []) as unknown as UserRow[], [usersQ.data?.items]);

  async function onInvite() {
    if (!accessToken) return;
    if (!email.trim() || !fullName.trim()) {
      notify("Preencha nome e email.", "warning");
      return;
    }

    setBusy(true);
    try {
      await apiInviteUser({
        accessToken,
        email: email.trim(),
        full_name: fullName.trim(),
        password: password.trim() ? password.trim() : undefined,
        role,
        send_invite: sendInvite
      });
      notify("Usuário criado com sucesso.", "success");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("secretaria");
      setSendInvite(true);
      await qc.invalidateQueries({ queryKey: ["settings-users"] });
    } catch (e: any) {
      notify(`Erro ao criar usuário: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(userId: string, userName: string) {
    if (!accessToken) return;
    const ok = confirm(`Remover "${userName}"? Isso é irreversível.`);
    if (!ok) return;

    setBusy(true);
    try {
      await apiDeleteUser({ accessToken, userId });
      notify("Usuário removido.", "success");
      await qc.invalidateQueries({ queryKey: ["settings-users"] });
    } catch (e: any) {
      notify(`Erro ao remover: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  function openEditModal(user: UserRow) {
    setEditingUser(user);
    setEditName(user.full_name);
    setEditPassword("");
    setEditRole(user.role || "secretaria");
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditingUser(null);
    setEditName("");
    setEditPassword("");
    setEditRole("secretaria");
  }

  async function onSaveEdit() {
    if (!accessToken || !editingUser) return;

    setBusy(true);
    try {
      // Atualizar nome se mudou
      if (editName.trim() !== editingUser.full_name && editName.trim().length >= 2) {
        await apiUpdateUserName({ 
          accessToken, 
          userId: editingUser.user_id, 
          full_name: editName.trim() 
        });
      }

      // Atualizar role se mudou
      if (editRole !== editingUser.role) {
        await apiUpdateUserRole({ 
          accessToken, 
          userId: editingUser.user_id, 
          role: editRole 
        });
      }

      // Atualizar senha se foi informada
      if (editPassword.trim() && editPassword.length >= 8) {
        await apiUpdateUserPassword({ 
          accessToken, 
          userId: editingUser.user_id, 
          password: editPassword 
        });
      }

      notify("Usuário atualizado com sucesso.", "success");
      closeEditModal();
      await qc.invalidateQueries({ queryKey: ["settings-users"] });
    } catch (e: any) {
      notify(`Erro ao atualizar: ${e?.message || "falha"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Usuários</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">Gerencie usuários do seu tenant.</div>
        </div>
      </div>

      {/* Formulário de Criar Usuário */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5 text-indigo-600" />
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Criar novo usuário</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome completo</div>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nome completo"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="email@dominio.com"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Senha (opcional)</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="mínimo 8 caracteres"
              type="password"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Papel</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "secretaria")}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="secretaria">Secretária</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="w-4 h-4"
              />
              Enviar convite (magic link)
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end">
          <button
            disabled={busy || !accessToken}
            onClick={onInvite}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Criar Usuário
          </button>
        </div>
      </div>

      {/* Lista de Usuários */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Lista de usuários</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {usersQ.isLoading ? "Carregando..." : usersQ.isError ? "Erro ao carregar" : `${users.length} usuário(s)`}
          </div>
        </div>
        {usersQ.isError && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="text-sm text-red-800 dark:text-red-200 font-medium">Erro ao carregar usuários</div>
            <div className="text-xs text-red-600 dark:text-red-300 mt-1">{(usersQ.error as Error)?.message || "Erro desconhecido"}</div>
            <button
              onClick={() => usersQ.refetch()}
              className="mt-2 text-xs text-red-700 dark:text-red-300 underline hover:no-underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {users.map((u) => (
            <div key={u.user_id} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.full_name || "Sem nome"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.user_id}</div>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === "admin" 
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}>
                    {u.role === "admin" ? "Administrador" : "Secretária"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => openEditModal(u)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 flex items-center gap-1.5"
                  title="Editar usuário"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </button>
                <button
                  disabled={busy}
                  onClick={() => onDelete(u.user_id, u.full_name)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 flex items-center gap-1.5"
                  title="Remover usuário"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover
                </button>
              </div>
            </div>
          ))}

          {!usersQ.isLoading && users.length === 0 && (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400 text-center">Nenhum usuário encontrado.</div>
          )}
        </div>
      </div>

      {/* Modal de Edição */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-lg w-full border border-gray-200 dark:border-gray-800">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit2 className="w-5 h-5" />
                  Editar Usuário
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {editingUser.full_name}
                </p>
              </div>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-200 dark:border-gray-700"
                />
                {editName.trim().length < 2 && editName.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Nome deve ter no mínimo 2 caracteres
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Papel / Permissão
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "admin" | "secretaria")}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-200 dark:border-gray-700"
                >
                  <option value="secretaria">Secretária</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nova Senha (opcional)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Deixe em branco para não alterar"
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-200 dark:border-gray-700"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSaveEdit();
                    }
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {editPassword && editPassword.length < 8 
                    ? "⚠️ Senha deve ter no mínimo 8 caracteres" 
                    : "Mínimo 8 caracteres"}
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-3">
              <button
                onClick={closeEditModal}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={onSaveEdit}
                disabled={busy || (editPassword.length > 0 && editPassword.length < 8) || (editName.trim().length > 0 && editName.trim().length < 2)}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
