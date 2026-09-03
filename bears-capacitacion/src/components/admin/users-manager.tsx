"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, FileUp, KeyRound, Pencil, Plus, Search, ShieldCheck, ShieldOff, Trash2, UserRoundX, X } from "lucide-react";
import { createUser, createUsersFromCsv, deleteUser, resetUserPassword, setUserActiveStatus, setUserCommercialAccess, updateUser } from "@/app/actions/auth";

type Franchise = { id: string; name: string; code: string | null };
type ManagedUser = { id: string; email: string; fullName: string | null; role: "admin" | "franquiciado" | "empleado"; franchiseId: string | null; position: string | null; phone: string | null; isActive: boolean; mustChangePassword: boolean; isSuperAdmin: boolean };

const formSchema = z.object({
  email: z.string().trim().email("Ingresá un correo válido."),
  password: z.string(),
  fullName: z.string().trim().min(2, "Ingresá el nombre completo."),
  role: z.enum(["admin", "franquiciado", "empleado"]),
  franchiseId: z.string(),
  position: z.string().trim(),
  phone: z.string().trim(),
  mustChangePassword: z.boolean(),
}).superRefine((values, context) => {
  if (values.role === "franquiciado" && !values.franchiseId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["franchiseId"], message: "Elegí una franquicia para el franquiciado." });
});

type FormValues = z.infer<typeof formSchema>;

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function normalizeOptional(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if ((character === "," || character === ";") && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += character;
  }
  values.push(value.trim());
  return values;
}

function PasswordInput({ id, value, onChange, label = "Contraseña" }: { id: string; value: string; onChange: (value: string) => void; label?: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="grid gap-2 text-sm font-medium" htmlFor={id}>{label}<span className="relative"><input id={id} className="h-11 w-full rounded-sm border bg-paper px-3 pr-12 text-sm outline-none focus:border-jade" type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} required /><button className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted hover:text-ink" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}>{visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button></span></label>;
}

function UserFormFields({ franchises, user, onClose, canManageAdmins }: { franchises: Franchise[]; user?: ManagedUser; onClose: () => void; canManageAdmins: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingCommercialAccess, setIsUpdatingCommercialAccess] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: user?.email ?? "",
      password: "",
      fullName: user?.fullName ?? "",
      role: user?.role ?? "empleado",
      franchiseId: user?.franchiseId ?? "",
      position: user?.position ?? "",
      phone: user?.phone ?? "",
      mustChangePassword: user?.mustChangePassword ?? true,
    },
  });
  const role = form.watch("role");
  const protectedAccount = Boolean(user && !canManageAdmins && (user.role === "admin" || user.isSuperAdmin));

  if (protectedAccount) return <p className="rounded-sm bg-sand-soft px-3 py-3 text-sm leading-6 text-ink" role="alert">Solo la superadministración puede editar una cuenta administradora o con acceso comercial.</p>;

  function changeCommercialAccess() {
    if (!user) return;
    const nextValue = !user.isSuperAdmin;
    const message = nextValue
      ? `¿Conceder acceso comercial de Tiendanube a ${user.fullName ?? user.email}?`
      : `¿Revocar el acceso comercial de Tiendanube a ${user.fullName ?? user.email}? Se cerrarán sus sesiones activas.`;
    if (!window.confirm(message)) return;

    setError(null);
    setIsUpdatingCommercialAccess(true);
    startTransition(async () => {
      const response = await setUserCommercialAccess({ userId: user.id, isSuperAdmin: nextValue });
      setIsUpdatingCommercialAccess(false);
      if ("error" in response && response.error) {
        setError(response.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function submit(values: FormValues) {
    setError(null);
    setIsSaving(true);
    startTransition(async () => {
      const input = { ...values, franchiseId: values.role === "admin" ? null : normalizeOptional(values.franchiseId), position: normalizeOptional(values.position), phone: normalizeOptional(values.phone) };
      const response = user ? await updateUser({ id: user.id, ...input, isActive: user.isActive }) : await createUser(input);
      setIsSaving(false);
      if ("error" in response && response.error) {
        setError(response.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return <form className="grid gap-4" onSubmit={form.handleSubmit(submit)}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium" htmlFor="user-full-name">Nombre completo<input id="user-full-name" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("fullName")} /></label><label className="grid gap-2 text-sm font-medium" htmlFor="user-email">Correo electrónico<input id="user-email" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" type="email" autoComplete="email" {...form.register("email")} /></label></div>{!user ? <div><PasswordInput id="user-password" value={form.watch("password")} onChange={(password) => form.setValue("password", password, { shouldValidate: true })} /><button className="mt-2 inline-flex h-8 items-center gap-2 text-xs font-medium text-jade-deep hover:underline" type="button" onClick={() => form.setValue("password", generatePassword(), { shouldValidate: true })}><KeyRound className="size-3.5" aria-hidden="true" />Generar contraseña segura</button></div> : null}<div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium" htmlFor="user-role">Rol<select id="user-role" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("role")}><option value="empleado">Empleado</option><option value="franquiciado">Franquiciado</option>{canManageAdmins ? <option value="admin">Administrador</option> : null}</select></label><label className="grid gap-2 text-sm font-medium" htmlFor="user-franchise">Franquicia<select id="user-franchise" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade disabled:bg-surface" disabled={role === "admin"} {...form.register("franchiseId")}><option value="">Sin asignar</option>{franchises.map((franchise) => <option value={franchise.id} key={franchise.id}>{franchise.name}{franchise.code ? ` (${franchise.code})` : ""}</option>)}</select></label><label className="grid gap-2 text-sm font-medium" htmlFor="user-position">Puesto<input id="user-position" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("position")} /></label><label className="grid gap-2 text-sm font-medium" htmlFor="user-phone">Teléfono<input id="user-phone" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" type="tel" {...form.register("phone")} /></label></div>{canManageAdmins && user?.role === "admin" ? <button className="flex min-h-11 items-center gap-3 border border-line px-3 text-left text-sm font-medium transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={changeCommercialAccess} disabled={isSaving || isUpdatingCommercialAccess}>{user.isSuperAdmin ? <ShieldOff className="size-4 shrink-0 text-alert" aria-hidden="true" /> : <ShieldCheck className="size-4 shrink-0 text-jade-deep" aria-hidden="true" />}{isUpdatingCommercialAccess ? "Actualizando acceso comercial" : user.isSuperAdmin ? "Revocar acceso comercial de Tiendanube" : "Conceder acceso comercial de Tiendanube"}</button> : null}<label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 accent-jade" type="checkbox" {...form.register("mustChangePassword")} />Obligar cambio de contraseña en el primer ingreso</label>{Object.values(form.formState.errors).map((fieldError) => fieldError?.message ? <p className="text-sm text-alert" role="alert" key={fieldError.message}>{fieldError.message}</p> : null)}{error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{error}</p> : null}<div className="mt-2 flex flex-wrap justify-end gap-3"><button className="h-11 rounded-sm border px-4 text-sm" type="button" onClick={onClose} disabled={isSaving || isUpdatingCommercialAccess}>Cancelar</button><button className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep disabled:opacity-60" type="submit" disabled={isSaving || isUpdatingCommercialAccess}>{isSaving ? "Guardando" : user ? "Guardar cambios" : "Crear usuario"}</button></div></form>;
}

export function UsersManager({ users, franchises, canManageAdmins }: { users: ManagedUser[]; franchises: Franchise[]; canManageAdmins: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [franchiseFilter, setFranchiseFilter] = useState("all");
  const [open, setOpen] = useState<"create" | ManagedUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Array<{ row: number; email: string; error?: string }> | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const franchisesById = new Map(franchises.map((franchise) => [franchise.id, franchise]));
  const filteredUsers = users.filter((user) => {
    const matchesQuery = !deferredQuery || [user.fullName, user.email, user.position].filter(Boolean).some((value) => value!.toLowerCase().includes(deferredQuery));
    return matchesQuery && (roleFilter === "all" || user.role === roleFilter) && (franchiseFilter === "all" || user.franchiseId === franchiseFilter);
  });

  function canManageUser(user: ManagedUser) {
    return canManageAdmins || (user.role !== "admin" && !user.isSuperAdmin);
  }

  function protectedAccountNotice() {
    setNotice("Solo la superadministración puede gestionar cuentas administradoras o con acceso comercial.");
  }

  function UserForm({ franchises: formFranchises, user, onClose }: { franchises: Franchise[]; user?: ManagedUser; onClose: () => void }) {
    return <UserFormFields franchises={formFranchises} user={user} onClose={onClose} canManageAdmins={canManageAdmins} />;
  }

  function copyPassword(password: string) {
    void navigator.clipboard.writeText(password);
    setNotice("Contraseña copiada. Se cerraron las sesiones activas y la persona deberá cambiarla al ingresar.");
  }

  function resetPassword(user: ManagedUser) {
    if (!canManageUser(user)) {
      protectedAccountNotice();
      return;
    }
    if (!window.confirm(`¿Restablecer la contraseña de ${user.fullName ?? user.email}? Se cerrarán sus sesiones activas.`)) return;
    const password = generatePassword();
    setNotice(null);
    startTransition(async () => {
      const response = await resetUserPassword({ userId: user.id, password });
      if ("error" in response && response.error) {
        setNotice(response.error);
        return;
      }
      copyPassword(password);
      router.refresh();
    });
  }

  function setActive(user: ManagedUser, isActive: boolean) {
    if (!canManageUser(user)) {
      protectedAccountNotice();
      return;
    }
    if (!window.confirm(isActive ? `¿Habilitar nuevamente el acceso de ${user.fullName ?? user.email}?` : `¿Revocar el acceso de ${user.fullName ?? user.email}? Se cerrarán sus sesiones activas.`)) return;
    setNotice(null);
    startTransition(async () => {
      const response = await setUserActiveStatus({ userId: user.id, isActive });
      if ("error" in response && response.error) setNotice(response.error);
      else {
        setNotice(isActive ? "El acceso quedó habilitado." : "El acceso fue revocado y las sesiones activas se cerraron.");
        router.refresh();
      }
    });
  }

  function permanentlyDeleteUser(user: ManagedUser) {
    if (!canManageUser(user)) {
      protectedAccountNotice();
      return;
    }
    if (!window.confirm(`¿Eliminar permanentemente a ${user.fullName ?? user.email}? Se borrarán su cuenta, accesos y progreso. Esta acción no se puede deshacer.`)) return;
    setNotice(null);
    startTransition(async () => {
      const response = await deleteUser({ userId: user.id });
      if ("error" in response && response.error) setNotice(response.error);
      else {
        setNotice("La cuenta fue eliminada permanentemente.");
        router.refresh();
      }
    });
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      setNotice("El CSV debe incluir una fila de encabezados y al menos un usuario.");
      return;
    }
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, ""));
    const franchiseByLabel = new Map(franchises.flatMap((franchise) => [[franchise.name.toLowerCase(), franchise.id], [franchise.code?.toLowerCase() ?? "", franchise.id]]));
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const franchiseValue = row.franchiseid || row.franquicia || "";
      return {
        email: row.email,
        password: row.password,
        fullName: row.fullname || row.nombre || "",
        role: row.role || row.rol || "empleado",
        franchiseId: franchiseByLabel.get(franchiseValue.toLowerCase()) ?? (franchiseValue || null),
        position: row.position || row.puesto || null,
        phone: row.phone || row.telefono || null,
        mustChangePassword: !["false", "0", "no"].includes((row.mustchangepassword || row.obligarcambio || "true").toLowerCase()),
      };
    });
    const response = await createUsersFromCsv(rows);
    if ("error" in response && response.error) {
      setNotice(response.error);
      return;
    }
    if (!("data" in response) || !response.data) {
      setNotice("La importación no devolvió un resultado válido.");
      return;
    }
    setImportResult(response.data);
    router.refresh();
    event.target.value = "";
  }

  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted">Gestión de accesos</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Usuarios</h1><p className="mt-2 text-sm text-muted">Altas, asignaciones y estado de capacitación.</p></div><div className="flex flex-wrap gap-3"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"><FileUp className="size-4" aria-hidden="true" />Importar CSV<input className="sr-only" type="file" accept=".csv,text/csv" onChange={importCsv} /></label><button className="flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep" type="button" onClick={() => setOpen("create")}><Plus className="size-4" aria-hidden="true" />Nuevo usuario</button></div></header><section className="mt-8 flex flex-wrap gap-3 border-y border-line py-3"><label className="relative min-w-52 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden="true" /><input className="h-10 w-full rounded-sm border bg-paper pl-10 pr-3 text-sm outline-none focus:border-jade" placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select className="h-10 rounded-sm border bg-paper px-3 text-sm" aria-label="Filtrar por rol" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">Todos los roles</option><option value="empleado">Empleados</option><option value="franquiciado">Franquiciados</option><option value="admin">Administradores</option></select><select className="h-10 rounded-sm border bg-paper px-3 text-sm" aria-label="Filtrar por franquicia" value={franchiseFilter} onChange={(event) => setFranchiseFilter(event.target.value)}><option value="all">Todas las franquicias</option>{franchises.map((franchise) => <option value={franchise.id} key={franchise.id}>{franchise.name}</option>)}</select></section>{notice ? <p className="mt-5 rounded-sm bg-sand-soft px-3 py-2 text-sm text-ink" role="status">{notice}</p> : null}{importResult ? <section className="mt-5 border border-line bg-surface p-4"><div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">Importación CSV: {importResult.filter((row) => !row.error).length} correctas, {importResult.filter((row) => row.error).length} con error</p><button className="grid size-8 place-items-center" type="button" onClick={() => setImportResult(null)} aria-label="Cerrar reporte"><X className="size-4" aria-hidden="true" /></button></div>{importResult.filter((row) => row.error).length ? <ul className="mt-3 space-y-1 text-sm text-alert">{importResult.filter((row) => row.error).map((row) => <li key={`${row.row}-${row.email}`}>Fila {row.row}, {row.email}: {row.error}</li>)}</ul> : null}</section> : null}<section className="mt-5 overflow-x-auto border border-line bg-paper"><table className="w-full min-w-200 text-left text-sm"><thead className="bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Usuario</th><th className="px-5 py-3 font-medium">Rol</th><th className="px-5 py-3 font-medium">Franquicia</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{filteredUsers.map((user) => <tr className="border-t border-line" key={user.id}><td className="px-5 py-4"><p className="font-medium">{user.fullName ?? "Sin nombre"}</p><p className="mt-1 text-xs text-muted">{user.email}{user.position ? ` · ${user.position}` : ""}</p></td><td className="px-5 py-4 capitalize">{user.role}</td><td className="px-5 py-4 text-muted">{user.franchiseId ? franchisesById.get(user.franchiseId)?.name ?? "Sin asignar" : "Global"}</td><td className="px-5 py-4"><span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${user.isActive ? "bg-[#E0F1EB] text-jade-deep" : "bg-[#FCEAE6] text-alert"}`}>{user.isActive ? "Activo" : "Desactivado"}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button className="grid size-9 place-items-center rounded-sm hover:bg-surface" type="button" onClick={() => setOpen(user)} aria-label={`Editar ${user.fullName ?? user.email}`} title="Editar"><Pencil className="size-4" aria-hidden="true" /></button><button className="grid size-9 place-items-center rounded-sm hover:bg-surface" type="button" onClick={() => resetPassword(user)} aria-label={`Restablecer contraseña de ${user.fullName ?? user.email}`} title="Restablecer contraseña"><KeyRound className="size-4" aria-hidden="true" /></button><button className="grid size-9 place-items-center rounded-sm hover:bg-surface" type="button" onClick={() => setActive(user, !user.isActive)} aria-label={`${user.isActive ? "Desactivar" : "Activar"} ${user.fullName ?? user.email}`} title={user.isActive ? "Desactivar" : "Activar"}>{user.isActive ? <UserRoundX className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}</button><button className="grid size-9 place-items-center rounded-sm text-alert hover:bg-[#FCEAE6]" type="button" onClick={() => permanentlyDeleteUser(user)} aria-label={`Eliminar permanentemente a ${user.fullName ?? user.email}`} title="Eliminar permanentemente"><Trash2 className="size-4" aria-hidden="true" /></button></div></td></tr>)}{!filteredUsers.length ? <tr><td className="px-5 py-10 text-center text-muted" colSpan={5}>No encontramos usuarios con esos filtros.</td></tr> : null}</tbody></table></section>{open ? <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-5" role="presentation"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-line bg-paper p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title"><div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-xl font-medium" id="user-dialog-title">{open === "create" ? "Nuevo usuario" : "Editar usuario"}</h2><p className="mt-1 text-sm text-muted">{open === "create" ? "La cuenta podrá iniciar sesión apenas se cree." : "Actualizá los datos, el rol o la asignación."}</p></div><button className="grid size-10 place-items-center rounded-sm hover:bg-surface" type="button" onClick={() => setOpen(null)} aria-label="Cerrar"><X className="size-5" aria-hidden="true" /></button></div><UserForm franchises={franchises} user={open === "create" ? undefined : open} onClose={() => setOpen(null)} /></section></div> : null}</>;
}