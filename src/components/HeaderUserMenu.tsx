"use client";
import React, { useState, useRef, useEffect } from "react";
import { Icon } from '@/components/ui/icon';
import Link from "next/link";
import Image from "next/image";
import { Handshake, LogIn } from "lucide-react";
import { useUser } from "@/firebase";

interface HeaderUserMenuProps {
  hideDashboard?: boolean;
}

export default function HeaderUserMenu({ hideDashboard = false }: HeaderUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    const { getAuth, signOut } = await import('firebase/auth');
    const auth = getAuth();
    await signOut(auth);
  };

  return (
    <div className="flex items-center gap-2 h-full min-w-0">
      {user && (
        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0">
          {user.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 font-mono">
              {user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
        </div>
      )}
      <div className="relative h-full flex items-center" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hover:bg-white/10 text-zinc-400 hover:text-white min-w-[40px] min-h-[40px] p-2 md:py-2 md:px-3 rounded-md transition-colors cursor-pointer flex items-center justify-center h-full"
          title="Menu"
          aria-label="Open navigation menu"
        >
          <Icon name="hamburger" className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in duration-200 origin-top-right">
            <div className="flex flex-col py-1">
              {/* Mobile Navigation Links */}
              <div className="lg:hidden flex flex-col">
                <Link href="/partners" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-zinc-300 transition-colors" onClick={() => setIsOpen(false)}>
                  <Handshake className="w-4 h-4" /> Partners
                </Link>
                <Link href="/agents" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-zinc-300 transition-colors" onClick={() => setIsOpen(false)}>
                  <Icon name="building" className="w-4 h-4" /> Clients
                </Link>
                <Link href="/events" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-zinc-300 transition-colors" onClick={() => setIsOpen(false)}>
                  <Icon name="calendar" className="w-4 h-4" /> Events
                </Link>
                <Link href="/cac" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-zinc-300 transition-colors" onClick={() => setIsOpen(false)}>
                  <Icon name="info" className="w-4 h-4" /> About Us
                </Link>
                <Link href="/community" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-[#00ffcc] transition-colors" onClick={() => setIsOpen(false)}>
                  <Icon name="users" className="w-4 h-4" /> Community Hub
                </Link>
                <Link href="/playground/app" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-amber-400 transition-colors" onClick={() => setIsOpen(false)}>
                  <Image
                    src="/cybrdeck-logo/playground.png"
                    alt=""
                    width={16}
                    height={16}
                    className="w-4 h-4 object-contain"
                    aria-hidden
                  />
                  Playground
                </Link>

                <div className="h-px bg-zinc-800 w-full my-1" />
              </div>

              {/* Guest auth CTAs — mirrors the desktop header's Apply Here /
                  Portal Access buttons, which are `hidden lg:block` and
                  otherwise unreachable on mobile. */}
              {!user && (
                <div className="flex flex-col">
                  <Link href="/apply-here" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-zinc-300 transition-colors" onClick={() => setIsOpen(false)}>
                    <Icon name="user-plus" className="w-4 h-4" /> Apply Here
                  </Link>
                  <Link href="/login" className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-white transition-colors" onClick={() => setIsOpen(false)}>
                    <LogIn className="w-4 h-4" /> Portal Access
                  </Link>
                  <div className="h-px bg-zinc-800 w-full my-1" />
                </div>
              )}

              {!hideDashboard && user && (
              <>
                <Link 
                  href="/dashboard"
                  className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-[#008aff] transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <Icon name="dashboard" className="w-4 h-4" />
                  Dashboard
                </Link>
                <div className="h-px bg-zinc-800 w-full" />
              </>
            )}
            
            {user && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  handleLogout();
                }}
                className="flex items-center gap-3 px-4 py-2.5 text-[10px] md:text-xs font-headline tracking-widest uppercase hover:bg-white/5 text-red-500 transition-colors text-left w-full cursor-pointer"
              >
                <Icon name="log-out" className="w-4 h-4" />
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
