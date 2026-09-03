import Link from "next/link";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default function PasswordRecoveryPage() {
  return <main className="grid min-h-screen place-items-center bg-surface px-5 py-10"><section className="w-full max-w-md border border-line bg-paper p-6 sm:p-8"><Link href="/login" className="text-sm text-muted hover:text-ink">Volver al ingreso</Link><h1 className="mt-8 text-[31px] font-medium leading-tight">Recuperar contraseña</h1><p className="mt-3 text-sm leading-6 text-muted">Te enviaremos un enlace seguro para establecer una nueva contraseña.</p><PasswordRecoveryForm /></section></main>;
}