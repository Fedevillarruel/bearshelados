"use client";

import { useEffect, useRef, useState } from "react";
import { durationInSeconds, maxDurationSeconds, splitDuration, type DurationParts } from "@/lib/duration";
import { getYouTubeVideoId } from "@/lib/youtube";
import { loadYouTubeIframeApi, type YouTubePlayer } from "@/lib/youtube-iframe-api";

export function VideoDurationInput({ id, value, onChange, youtubeUrl = "" }: {
  id: string;
  value: string;
  onChange: (seconds: string) => void;
  youtubeUrl?: string;
}) {
  const videoId = getYouTubeVideoId(youtubeUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const manualEditRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const parts = splitDuration(Number(value || 0));

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    manualEditRef.current = false;
    setMessage(null);
    const container = containerRef.current;
    if (!videoId || !container) return;
    let disposed = false;
    let ready = false;
    let finished = false;
    let player: YouTubePlayer | null = null;
    const target = document.createElement("div");
    container.appendChild(target);
    setMessage("Consultando la duración en YouTube...");
    const fail = (message: string) => {
      if (disposed || finished) return;
      finished = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      setMessage(message);
    };
    const readDuration = () => {
      if (disposed || finished || !ready || !player) return;
      const duration = player.getDuration();
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (duration > maxDurationSeconds) {
        fail("La duración de este video supera el máximo admitido.");
        return;
      }
      finished = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      if (manualEditRef.current) {
        setMessage("Se conservó la duración que ingresaste manualmente.");
      } else {
        onChangeRef.current(String(Math.ceil(duration)));
        setMessage("Duración obtenida de YouTube. Podés ajustarla manualmente.");
      }
    };
    const poll = window.setInterval(readDuration, 500);
    const timeout = window.setTimeout(() => {
      fail("No pudimos obtener la duración. Ingresala manualmente; los directos en vivo no tienen una duración final.");
    }, 20_000);
    void loadYouTubeIframeApi().then((api) => {
      if (disposed) return;
      player = new api.Player(target, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { origin: window.location.origin, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            if (disposed) return;
            ready = true;
            player?.getIframe().setAttribute("title", "Vista previa del video de YouTube");
            player?.getIframe().setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            readDuration();
          },
          onError: () => fail("YouTube no permite acceder a este video. Revisá No listado y Permitir inserción, o ingresá la duración manualmente."),
        },
      });
    }).catch((error: unknown) => {
      fail(`${error instanceof Error ? error.message : "No pudimos consultar YouTube."} Ingresá la duración manualmente.`);
    });
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      player?.destroy();
      container.replaceChildren();
    };
  }, [videoId, retry]);

  function updatePart(part: keyof DurationParts, input: string) {
    manualEditRef.current = true;
    try {
      const total = durationInSeconds({ ...parts, [part]: Number(input || 0) });
      setInputError(null);
      onChange(String(total));
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Ingresá una duración válida.");
    }
  }

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 text-sm font-medium">Duración del video</legend>
      <div className="grid grid-cols-3 gap-3">
        {(["hours", "minutes", "seconds"] as const).map((part) => (
          <label className="grid gap-2 text-sm font-medium" key={part} htmlFor={`${id}-${part}`}>
            {{ hours: "Horas", minutes: "Minutos", seconds: "Segundos" }[part]}
            <input
              id={`${id}-${part}`}
              type="number"
              min="0"
              max={part === "hours" ? Math.floor(maxDurationSeconds / 3600) : 59}
              step="1"
              inputMode="numeric"
              className="h-11 min-w-0 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
              value={parts[part]}
              onChange={(event) => {
                if (event.target.validity.valid) updatePart(part, event.target.value);
                else setInputError("Ingresá horas enteras y minutos y segundos entre 0 y 59.");
              }}
            />
          </label>
        ))}
      </div>
      {inputError ? <p className="text-xs text-alert" role="alert">{inputError}</p> : null}
      <p className="text-xs text-muted">El sistema convierte la duración a segundos automáticamente. La duración debe ser mayor a cero.</p>
      {videoId ? (
        <div className="grid gap-2">
          <div ref={containerRef} className="aspect-video min-h-[200px] w-full max-w-xl overflow-hidden bg-ink [&_iframe]:h-full [&_iframe]:w-full" />
          <p className="text-xs text-muted" role="status">{message}</p>
          <button className="justify-self-start text-xs font-medium text-jade-deep hover:underline" type="button" onClick={() => setRetry((current) => current + 1)}>Volver a consultar YouTube</button>
          <p className="text-xs text-muted">Esta vista previa no registra avance de empleados.</p>
        </div>
      ) : null}
    </fieldset>
  );
}
