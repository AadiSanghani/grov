"use client"

import { SignedIn } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import { DataProvider } from "@/app/data-context"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

function isPublicPath(pathname: string) {
  return ["/sign-in", "/sign-up"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

export function AppShell({
  children,
  defaultSidebarOpen = true,
}: {
  children: React.ReactNode
  defaultSidebarOpen?: boolean
}) {
  const pathname = usePathname()

  // Only Clerk's authentication routes are public. The dashboard at / remains
  // protected by middleware and SignedIn, with one persistent workspace shell.
  if (isPublicPath(pathname)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-svh w-full">
        {children}
      </main>
    )
  }

  return (
    <SignedIn>
      <DataProvider>
        <SidebarProvider defaultOpen={defaultSidebarOpen}>
          <AppSidebar />
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
              <SidebarTrigger id="mobile-navigation-trigger" className="size-10" />
              <span className="grov-wordmark text-xl text-primary">Grov</span>
              <span className="ml-auto text-xs text-muted-foreground">Workspace</span>
            </header>
            <main id="main-content" tabIndex={-1} className="min-w-0 scroll-mt-16 md:scroll-mt-4">
              {children}
            </main>
          </div>
        </SidebarProvider>
      </DataProvider>
    </SignedIn>
  )
}
