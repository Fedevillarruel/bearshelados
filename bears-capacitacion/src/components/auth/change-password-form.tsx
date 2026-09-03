"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { changePassword, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return <form action={formAction} className="mt-8 space-y-5"><label className="grid gap-2 text-sm font-medium" htmlFor="new-password">Nueva contraseña<span className="relative block"><input className="h-12 w-full rounded-sm border bg-paper px-3 pr-12 text-base outline-none focus:border-jade" id="new-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} required /><button className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-jade" type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}</button></span></label>{state.error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{state.error}</p> : null}<button className="h-12 w-full rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep disabled:opacity-60" type="submit" disabled={isPending}>{isPending ? "Actualizando" : "Actualizar contraseña"}</button></form>;
}