import { AppShell } from "../../../components/layout/AppShell";
import { AuthGuard } from "../../../components/auth/AuthGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>;
}
