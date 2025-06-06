
'use client';

import React, { useState, useEffect, type ReactNode, type ElementType } from 'react'; // Ensured React default import
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, DatabaseZap, History as HistoryIcon, ShieldCheck, Settings, UserCircle, Menu, MapPinned } from 'lucide-react';
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

interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  id: string; 
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
  { href: '/ingestion', label: 'Data Ingestion', icon: DatabaseZap, id: 'nav-ingestion' },
  { href: '/history', label: 'Demand History', icon: HistoryIcon, id: 'nav-history' },
  { href: '/city-analysis', label: 'City Analysis', icon: MapPinned, id: 'nav-city-analysis' },
  { href: '/admin', label: 'Admin Panel', icon: ShieldCheck, id: 'nav-admin' },
];

// Removed AppLayoutContext and useAppLayoutContext
// State and handlers for icon spinning will be local to MainSidebar and MobileSidebar

function MainSidebar() {
  const pathname = usePathname();
  const { open } = useSidebar();
  const [spinningIconId, setSpinningIconId] = useState<string | null>(null);

  const handleNavItemClick = (itemId: string) => {
    setSpinningIconId(itemId);
    setTimeout(() => {
      setSpinningIconId(null);
    }, 1000); // Spin for 1 second
  };

  return (
    <Sidebar>
      <SidebarHeader className={cn(open ? "p-4" : "p-2", "flex items-center gap-2")}>
        <LayoutDashboard className={cn("transition-all duration-300 ease-in-out", open ? "size-7 text-primary" : "size-6 text-primary")} />
        <h1 className={cn("font-semibold text-lg text-foreground transition-opacity duration-300 ease-in-out", open ? "opacity-100" : "opacity-0 pointer-events-none")}>
          Demand Hub
        </h1>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isSpinning = spinningIconId === item.id;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.label}
                    asChild
                  >
                    <a onClick={() => handleNavItemClick(item.id)}>
                       <IconComponent 
                        className={cn(
                          "lucide", 
                          isSpinning ? "animate-spin" : "",
                          isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"
                        )} 
                      />
                      <span className={isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"}>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className={cn(open ? "p-4" : "p-2")}>
        <Link href="/admin/settings" legacyBehavior passHref>
            <SidebarMenuButton 
              tooltip="Settings" 
              asChild
              isActive={pathname.startsWith('/admin/settings')}
              onClick={() => handleNavItemClick('nav-settings')}
            >
                 <a>
                    <Settings 
                      className={cn(
                        "lucide",
                        spinningIconId === 'nav-settings' ? "animate-spin" : "", 
                        pathname.startsWith('/admin/settings') ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"
                      )} 
                    />
                    <span className={pathname.startsWith('/admin/settings') ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"}>Settings</span>
                </a>
            </SidebarMenuButton>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileSidebar() {
  const pathname = usePathname();
  const [spinningIconId, setSpinningIconId] = useState<string | null>(null);

  const handleNavItemClick = (itemId: string) => {
    setSpinningIconId(itemId);
    setTimeout(() => {
      setSpinningIconId(null);
    }, 1000); // Spin for 1 second
  };

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
          <LayoutDashboard className="size-7 text-primary" />
          <h1 className="font-semibold text-lg">Demand Hub</h1>
        </SidebarHeader>
        <nav className="grid gap-2 text-base font-medium p-4">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isSpinning = spinningIconId === item.id;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavItemClick(item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground"
                )}
              >
                <IconComponent className={cn("h-5 w-5", isSpinning ? "animate-spin" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-4 border-t border-sidebar-border">
           <Link
              href="/admin/settings"
              onClick={() => handleNavItemClick('nav-settings')}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname.startsWith('/admin/settings') ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground"
              )}
            >
              <Settings className={cn("h-5 w-5", spinningIconId === 'nav-settings' ? "animate-spin" : "")} />
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
