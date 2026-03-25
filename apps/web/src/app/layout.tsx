import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { AuthProvider } from "@/context/auth-context";
import { NavAuth } from "@/components/nav-auth";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Clashd - Live Video Debates",
  description:
    "The arena for live video debates. Pick a side, make your case, and let the audience decide who wins.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <AuthProvider>
          {/* Navigation */}
          <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-darker/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tighter">
                  <span className="text-clash-red">CL</span>
                  <span className="text-white">AS</span>
                  <span className="text-clash-blue">HD</span>
                </span>
              </Link>

              {/* Nav Links */}
              <div className="hidden items-center gap-8 md:flex">
                <Link
                  href="/discover"
                  className="text-sm font-medium text-neutral-400 transition-colors hover:text-white"
                >
                  Discover
                </Link>
                <Link
                  href="/challenges"
                  className="text-sm font-medium text-neutral-400 transition-colors hover:text-white"
                >
                  Challenges
                </Link>
                <Link
                  href="/bookmarks"
                  className="text-sm font-medium text-neutral-400 transition-colors hover:text-white"
                >
                  Bookmarks
                </Link>
                <Link
                  href="/pricing"
                  className="text-sm font-medium text-clash-red transition-colors hover:text-white"
                >
                  Clash+
                </Link>
              </div>

              {/* Auth Actions */}
              <NavAuth />
            </div>
          </nav>

          {/* Page Content */}
          <main>{children}</main>

          {/* Footer */}
          <footer className="border-t border-neutral-800 bg-darker">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <span className="text-sm text-neutral-500">
                  &copy; {new Date().getFullYear()} Clashd. All rights reserved.
                </span>
                <div className="flex gap-6">
                  <Link
                    href="#"
                    className="text-sm text-neutral-500 hover:text-neutral-300"
                  >
                    Terms
                  </Link>
                  <Link
                    href="#"
                    className="text-sm text-neutral-500 hover:text-neutral-300"
                  >
                    Privacy
                  </Link>
                  <Link
                    href="#"
                    className="text-sm text-neutral-500 hover:text-neutral-300"
                  >
                    Community Guidelines
                  </Link>
                </div>
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
