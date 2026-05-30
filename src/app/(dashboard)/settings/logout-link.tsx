"use client";

import { useRouter } from "next/navigation";

export function LogoutLink() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken: "" }),
    });
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      Log out
    </button>
  );
}
