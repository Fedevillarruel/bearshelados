"use client";

import { useActionState } from "react";
import { changePassword, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState);
  return <form action={formAction} className="mt-8 space-y-5"><label className="grid gap-2 text-sm font-medium" htmlFor="new-password">Nueva contraseña<input className="h-12 rounded-sm border bg-paper px-3 text-base outline-none focus:border-jade" id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required /></label>{state.error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{state.error}</p> : null}<button className="h-12 w-full rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep disabled:opacity-60" type="submit" disabled={isPending}>{isPending ? "Actualizando" : "Actualizar contraseña"}</button></form>;
}