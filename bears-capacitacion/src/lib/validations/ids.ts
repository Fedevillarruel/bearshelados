import { z } from "zod";

export const databaseUuid = z.string().guid("Seleccioná un identificador válido.");