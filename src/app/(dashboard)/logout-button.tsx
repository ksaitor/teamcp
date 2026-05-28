"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    // NextAuth signOut via API
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
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Log out
    </button>
  );
}
