import Link from "next/link";
import { AppShell } from "../../components/layout/AppShell";
import { AuthGuard } from "../../components/auth/AuthGuard";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>;
}
