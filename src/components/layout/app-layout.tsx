'use client'; // SidebarProvider and usePathname require client context

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BarChartBig, LayoutDashboard, DatabaseZap, Lightbulb, History as HistoryIcon, ShieldCheck, Settings, UserCircle, Menu } from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/ingestion', label: 'Data Ingestion', icon: DatabaseZap },
  { href: '/suggestions', label: 'Area Suggestions', icon: Lightbulb },
  { href: '/history', label: 'Demand History', icon: HistoryIcon },
  { href: '/admin', label: 'Admin Panel', icon: ShieldCheck },
];

function MainSidebar() {
  const pathname = usePathname();
  const { open } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader className={cn(open ? "p-4" : "p-2", "flex items-center gap-2")}>
        <BarChartBig className={cn("transition-all duration-300 ease-in-out", open ? "size-8 text-primary" : "size-6 text-primary")} />
        <h1 className={cn("font-bold text-xl text-foreground transition-opacity duration-300 ease-in-out", open ? "opacity-100" : "opacity-0 pointer-events-none")}>
          Demand Hub
        </h1>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                  tooltip={item.label}
                  asChild
                >
                  <a>
                    <item.icon />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className={cn(open ? "p-4" : "p-2")}>
        <Link href="/admin/settings" legacyBehavior passHref>
            <SidebarMenuButton tooltip="Settings" asChild>
                 <a>
                    <Settings />
                    <span>Settings</span>
                </a>
            </SidebarMenuButton>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileSidebar() {
  const pathname = usePathname();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col bg-sidebar text-sidebar-foreground p-0">
        <SidebarHeader className="p-4 flex items-center gap-2 border-b border-sidebar-border">
          <BarChartBig className="size-8 text-primary" />
          <h1 className="font-bold text-xl">Demand Hub</h1>
        </SidebarHeader>
        <nav className="grid gap-2 text-lg font-medium p-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary hover:bg-sidebar-accent",
                (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4 border-t border-sidebar-border">
           <Link
              href="/admin/settings"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary hover:bg-sidebar-accent text-sidebar-foreground"
              )}
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UserNav() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <UserCircle className="h-6 w-6" />
          <span className="sr-only">Toggle user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem>Support</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <MainSidebar />
        <div className="flex flex-col flex-1">
           <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-2 md:py-4">
            {/* Mobile sidebar trigger can be part of header or SidebarInset */}
            <div className="md:hidden">
              <MobileSidebar/>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <UserNav />
            </div>
          </header>
          <SidebarInset className="p-4 sm:p-6">
            {children}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
