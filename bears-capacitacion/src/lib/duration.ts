export const maxDurationSeconds = 2_147_483_647;

export type DurationParts = { hours: number; minutes: number; seconds: number };

export function splitDuration(totalSeconds: number): DurationParts {
  if (!Number.isSafeInteger(totalSeconds) || totalSeconds < 0 || totalSeconds > maxDurationSeconds)
    throw new Error("La duración debe ser un número válido de segundos.");
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function durationInSeconds({ hours, minutes, seconds }: DurationParts) {
  if (![hours, minutes, seconds].every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new Error("Ingresá horas, minutos y segundos enteros y positivos.");
  const total = hours * 3600 + minutes * 60 + seconds;
  splitDuration(total);
  return total;
}
