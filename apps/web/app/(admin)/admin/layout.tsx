import { AppShell } from "../../../components/layout/AppShell";
import { AuthGuard } from "../../../components/auth/AuthGuard";
import { LayoutDashboard, ListChecks, Users, Boxes, Ticket } from "lucide-react";

const adminNavigation = [
  { href: "/admin", label: "管理概览", icon: <LayoutDashboard size={17} /> },
  { href: "/admin/tasks", label: "任务监控", icon: <ListChecks size={17} /> },
  { href: "/admin/users", label: "用户管理", icon: <Users size={17} /> },
  { href: "/admin/models", label: "模型目录", icon: <Boxes size={17} /> },
  { href: "/admin/licenses", label: "授权码", icon: <Ticket size={17} /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="admin"><AppShell navigation={adminNavigation}>{children}</AppShell></AuthGuard>;
}
