"use client"

import * as React from "react"
import { Sidebar, 
    SidebarContent, 
    SidebarGroup, 
    SidebarGroupContent, 
    SidebarHeader,
    SidebarFooter,
    SidebarMenu, 
    SidebarMenuButton, 
    SidebarMenuItem, 
    useSidebar,
    } from "@/components/ui/sidebar"
import { CreditCard, FileBarChart, Home, LayoutDashboard, MapPinned, PanelLeft, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { UserButton, useUser } from "@clerk/nextjs"

const items = [
    {
      title: "Dashboard",
      url: "/",
      icon: Home,
    },
    {
        title: "Accounts",
        url: "/accounts",
        icon: LayoutDashboard,
    },
    {
        title: "Transactions",
        url: "/transactions",
        icon: CreditCard,
    },
    {
        title: "Investments",
        url: "/investments",
        icon: TrendingUp,
    },
    {
        title: "Reports",
        url: "/reports/cash-flow",
        icon: FileBarChart,
    },
    {
        title: "Trips",
        url: "/trips",
        icon: MapPinned,
    },
  ]

  export function AppSidebar() {
    const { toggleSidebar, open } = useSidebar()
    const [isHovered, setIsHovered] = React.useState(false)
    const { user } = useUser()
    const userButtonRef = React.useRef<HTMLDivElement>(null)

    const handleFooterClick = () => {
      const button = userButtonRef.current?.querySelector('button');
      if (button) {
        button.click();
      }
    }

    return (
      <Sidebar collapsible="icon">
        <SidebarHeader className={cn("px-3 py-4", !open && "flex items-center justify-center")}>
          {open ? (
            <div className="flex items-center justify-between w-full">
              <span 
                className="text-2xl font-bold tracking-tight text-primary"
                style={{ fontFamily: "'Arvo', serif" }}
              >
                Grov
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-sidebar="trigger"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={toggleSidebar}
                  >
                    <PanelLeft className="size-5" />
                    <span className="sr-only">Close Sidebar</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Close Sidebar
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-sidebar="trigger"
                  variant="ghost"
                  size="icon"
                  className="size-9 relative"
                  onClick={toggleSidebar}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                >
                  <span
                    className={cn(
                      "text-2xl font-bold text-primary transition-all duration-200 absolute",
                      isHovered ? "opacity-0 scale-75" : "opacity-100 scale-100"
                    )}
                    style={{ fontFamily: "'Arvo', serif" }}
                  >
                    G
                  </span>
                  <PanelLeft
                    className={cn(
                      "size-5 transition-all duration-200 absolute",
                      isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"
                    )}
                  />
                  <span className="sr-only">Open Sidebar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Open Sidebar
              </TooltipContent>
            </Tooltip>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            {open && <div className="mb-4" />}
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild
                      className="group relative flex items-center gap-4 rounded-lg px-4 py-3.5 text-base font-medium"
                    >
                      <a 
                        href={item.url}
                        className="flex items-center gap-4 w-full"
                      >
                        <item.icon className="h-6 w-6 shrink-0 transition-transform" />
                        <span className="truncate">{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-0 border-t">
          {open ? (
            <div 
              className="flex items-center gap-2.5 p-3 hover:bg-accent cursor-pointer transition-colors relative"
              onClick={handleFooterClick}
            >
              <div ref={userButtonRef} className="pointer-events-none">
                <UserButton 
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8"
                    }
                  }}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">
                  {user?.fullName || user?.firstName || "My Account"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-3">
              <UserButton 
                appearance={{
                  elements: {
                    avatarBox: "w-7 h-7"
                  }
                }}
              />
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    )
  }
  
