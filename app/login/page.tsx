import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/safe-next";
import { isDemo } from "@/lib/demo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (isDemo()) redirect(safeNext(next));
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoginForm next={safeNext(next)} linkError={error === "link"} />
    </main>
  );
}
