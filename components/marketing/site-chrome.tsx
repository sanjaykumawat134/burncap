import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span aria-hidden className="grid size-6 place-items-center rounded-md bg-brand text-xs text-white">
        $
      </span>
      BurnCap
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Logo />
        <nav className="hidden gap-4 text-sm text-muted-foreground sm:flex">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted-foreground">
        <Logo />
        <Link href="/docs" className="hover:text-foreground">
          Docs
        </Link>
        <Link href="/pricing" className="hover:text-foreground">
          Pricing
        </Link>
        <span className="ml-auto">Hard budgets for AI agents.</span>
      </div>
    </footer>
  );
}
