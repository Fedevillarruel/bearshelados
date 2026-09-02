import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().email("Ingresá un correo válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export const createUserSchema = z.object({
  email: z.string().trim().email("Ingresá un correo válido."),
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres."),
  fullName: z.string().trim().min(2, "Ingresá el nombre completo."),
  role: z.enum(["admin", "franquiciado", "empleado"]),
  franchiseId: z.string().uuid().nullable(),
  position: z.string().trim().max(100).nullable(),
  phone: z.string().trim().max(30).nullable(),
  mustChangePassword: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.role !== "admin" && !value.franchiseId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["franchiseId"],
      message: "La franquicia es obligatoria para empleados y franquiciados.",
    });
  }
});