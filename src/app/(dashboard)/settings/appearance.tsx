"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { FiSun, FiMoon, FiMonitor } from "react-icons/fi";

const OPTIONS = [
  { value: "light", label: "Light", icon: FiSun },
  { value: "dark", label: "Dark", icon: FiMoon },
  { value: "system", label: "System", icon: FiMonitor },
] as const;

export function Appearance() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = mounted ? (theme ?? "system") : "system";

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h2 className="font-semibold">Appearance</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose how TeamRouter looks on this device.
      </p>
      <div className="mt-3 inline-flex rounded-md border border-border p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = active === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition ${
                selected
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
