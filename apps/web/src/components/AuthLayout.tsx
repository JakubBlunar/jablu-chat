import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#1a1a2e] px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5865f2] text-xl font-bold text-white shadow-lg shadow-[#5865f2]/25">
          C
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Chat
        </h1>
        <p className="text-sm text-gray-400">Connect with your community</p>
      </div>

      <div className="w-full max-w-[420px] rounded-xl border border-white/10 bg-[#2b2d31] p-8 shadow-xl shadow-black/40">
        {children}
      </div>
    </div>
  );
}
