import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">TeamMCP</h1>
      <p className="mt-2 text-gray-600">Team MCP Access Gateway</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-gray-900 px-6 py-2 text-white hover:bg-gray-800"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-gray-300 px-6 py-2 hover:bg-gray-100"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
