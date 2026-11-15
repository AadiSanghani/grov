"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { CreditCard, FileBarChart, Home, LayoutDashboard, MapPinned, TrendingUp } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const items = [
  { title: "Dashboard", url: "/", match: "/dashboard", icon: Home },
  { title: "Accounts", url: "/accounts", match: "/accounts", icon: LayoutDashboard },
  { title: "Transactions", url: "/transactions", match: "/transactions", icon: CreditCard },
  { title: "Investments", url: "/investments", match: "/investments", icon: TrendingUp },
  { title: "Reports", url: "/reports", match: "/reports", icon: FileBarChart },
  { title: "Trips", url: "/trips", match: "/trips", icon: MapPinned },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { open, isMobile, setOpenMobile } = useSidebar()
  const expanded = isMobile || open

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-20 justify-center px-3">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          {expanded && (
            <Link href="/" aria-label="Grov dashboard" onNavigate={() => setOpenMobile(false)} className="px-2 py-2">
              <span className="grov-wordmark text-[1.75rem] text-sidebar-primary">Grov</span>
            </Link>
          )}
          <SidebarTrigger className="size-10 shrink-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3 pt-1">
          <SidebarGroupContent>
            <nav id="workspace-navigation" aria-label="Main navigation">
              <SidebarMenu className="gap-1">
                {items.map((item) => {
                  const isActive = pathname === item.url || pathname === item.match || pathname.startsWith(`${item.match}/`)

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className="h-11 gap-3 rounded-lg px-3 text-sm font-medium group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-3! md:h-9"
                      >
                        <Link
                          href={item.url}
                          aria-current={isActive ? "page" : undefined}
                          aria-label={item.title}
                          onNavigate={() => setOpenMobile(false)}
                        >
                          <item.icon aria-hidden="true" className="size-4 shrink-0" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
        {expanded && (
          <p className="px-2 text-xs text-muted-foreground">
            Personal workspace
          </p>
        )}
        <UserButton
          showName={expanded}
          appearance={{
            elements: {
              rootBox: "w-full",
              userButtonBox: "min-w-0 flex-row-reverse gap-2.5",
              userButtonTrigger: "w-full min-h-10 justify-start rounded-lg p-1.5 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              userButtonOuterIdentifier: "min-w-0 truncate text-sm font-medium text-sidebar-foreground",
              avatarBox: "size-7 shrink-0",
            },
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
