import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface AppLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
  showFooter?: boolean;
}

export default function AppLayout({ children, showNav = true, showFooter = true }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-x-hidden">
      {/* Skip to Main Content Link for Screen Readers and Keyboard Navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-blue-600 focus:text-white focus:rounded-xl focus:font-bold focus:shadow-xl focus:ring-4 focus:ring-blue-300"
      >
        Skip to main content
      </a>

      {showNav && <Navbar />}

      <main id="main-content" tabIndex={-1} className="flex-1 relative z-10 w-full focus:outline-none">
        {children}
      </main>

      {showFooter && <Footer />}
    </div>
  );
}
