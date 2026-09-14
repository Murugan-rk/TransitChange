import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  Bus,
  LogOut,
  User,
  QrCode,
  Ticket,
  LayoutDashboard,
  Shield,
} from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getDashboardPath = () => {
    if (user?.role === 'Admin') return '/admin';
    if (user?.role === 'Conductor') return '/conductor';
    return '/passenger';
  };

  const getRoleBadge = () => {
    switch (user?.role) {
      case 'Conductor':
        return {
          icon: <Ticket size={14} aria-hidden="true" />,
          label: 'Conductor',
          classes: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-300 dark:border-blue-800',
        };
      case 'Passenger':
        return {
          icon: <QrCode size={14} aria-hidden="true" />,
          label: 'Passenger',
          classes: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
        };
      case 'Admin':
        return {
          icon: <Shield size={14} aria-hidden="true" />,
          label: 'Administrator',
          classes: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border-purple-300 dark:border-purple-800',
        };
      default:
        return null;
    }
  };

  const isCurrentPath = (path: string) => location.pathname === path;
  const roleBadge = getRoleBadge();

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo & Brand */}
            <Link
              to={user ? getDashboardPath() : '/login'}
              className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-blue-600 rounded-xl p-1"
              aria-label="TransitChange Home"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
                <Bus size={22} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white block">
                  TransitChange
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block -mt-0.5">
                  Public Bus Change System
                </span>
              </div>
            </Link>

            {/* Middle Trust Indicator (Simple, Non-Technical) */}
            <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Official Public Transit System</span>
              <span className="text-slate-400">•</span>
              <span>Single-use ticket guarantee</span>
            </div>

            {/* Right Nav Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {user ? (
                <>
                  {/* Role Badge */}
                  {roleBadge && (
                    <span
                      role="status"
                      className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${roleBadge.classes}`}
                    >
                      {roleBadge.icon}
                      <span>{roleBadge.label}</span>
                    </span>
                  )}

                  {/* Dashboard Link */}
                  <Link
                    to={getDashboardPath()}
                    aria-current={isCurrentPath(getDashboardPath()) ? 'page' : undefined}
                    className={`hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isCurrentPath(getDashboardPath())
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <LayoutDashboard size={17} aria-hidden="true" />
                    <span>Home</span>
                  </Link>

                  {/* Profile Link */}
                  <Link
                    to="/profile"
                    aria-current={isCurrentPath('/profile') ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isCurrentPath('/profile')
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    aria-label={`Profile: ${user.fullName}`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs"
                      aria-hidden="true"
                    >
                      {user.fullName ? user.fullName.charAt(0).toUpperCase() : <User size={14} />}
                    </div>
                    <span className="hidden md:inline max-w-[120px] truncate text-slate-800 dark:text-slate-100">
                      {user.fullName}
                    </span>
                  </Link>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    type="button"
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    aria-label="Sign Out"
                    title="Sign Out"
                  >
                    <LogOut size={18} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/login"
                    className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    Create Account
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Phone viewports < 640px) */}
      {user && (
        <nav
          aria-label="Mobile Navigation"
          className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 shadow-lg flex items-center justify-around"
        >
          <Link
            to={getDashboardPath()}
            aria-current={isCurrentPath(getDashboardPath()) ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-h-[48px] min-w-[64px] rounded-xl px-2 py-1 text-xs font-bold transition ${
              isCurrentPath(getDashboardPath())
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <LayoutDashboard size={20} aria-hidden="true" />
            <span className="mt-0.5">Home</span>
          </Link>

          <Link
            to="/profile"
            aria-current={isCurrentPath('/profile') ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-h-[48px] min-w-[64px] rounded-xl px-2 py-1 text-xs font-bold transition ${
              isCurrentPath('/profile')
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <User size={20} aria-hidden="true" />
            <span className="mt-0.5">Profile</span>
          </Link>

          <button
            onClick={handleLogout}
            type="button"
            className="flex flex-col items-center justify-center min-h-[48px] min-w-[64px] rounded-xl px-2 py-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-red-600 transition"
          >
            <LogOut size={20} aria-hidden="true" />
            <span className="mt-0.5">Sign Out</span>
          </button>
        </nav>
      )}
    </>
  );
}
