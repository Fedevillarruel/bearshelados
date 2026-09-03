"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("bears-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = savedTheme ? savedTheme === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", dark);
    setIsDark(dark);
  }, []);

  function toggleTheme() {
    const nextDark = !isDark;
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("bears-theme", nextDark ? "dark" : "light");
    setIsDark(nextDark);
  }

  return <button className="grid size-10 place-items-center text-white/75 transition-colors hover:text-paper" type="button" onClick={toggleTheme} aria-label={isDark ? "Usar tema claro" : "Usar tema oscuro"} title={isDark ? "Usar tema claro" : "Usar tema oscuro"}>{isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}</button>;
}