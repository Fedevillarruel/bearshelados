import { ChangePasswordForm } from "@/components/auth/change-password-form";

export default function ChangePasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-surface px-5 py-10"><section className="w-full max-w-md border border-line bg-paper p-6 sm:p-8"><p className="font-tabular text-xs text-jade-deep">CUENTA BEARS</p><h1 className="mt-4 text-[31px] font-medium leading-tight">Actualizá tu contraseña</h1><p className="mt-3 text-sm leading-6 text-muted">Por seguridad, establecé una contraseña personal antes de continuar.</p><ChangePasswordForm /></section></main>;
}