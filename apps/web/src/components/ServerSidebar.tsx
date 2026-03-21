import { useState } from "react";
import { CreateServerModal } from "@/components/CreateServerModal";
import { JoinInviteModal } from "@/components/JoinInviteModal";
import { useServerStore } from "@/stores/server.store";

function DmIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v10h16V6H4zm2 2h8v2H6V8zm0 4h5v2H6v-2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z" />
    </svg>
  );
}

function JoinIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export function ServerSidebar() {
  const servers = useServerStore((s) => s.servers);
  const currentServerId = useServerStore((s) => s.currentServerId);
  const setCurrentServer = useServerStore((s) => s.setCurrentServer);
  const isLoading = useServerStore((s) => s.isLoading);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <aside className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <button
          type="button"
          title="Direct messages (coming soon)"
          className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[24px] bg-[#313338] text-[#23a559] transition-all duration-200 ease-out hover:rounded-2xl hover:bg-[#23a559] hover:text-white"
        >
          <DmIcon />
        </button>

        <div
          className="my-1 h-0.5 w-8 rounded-full bg-white/15"
          aria-hidden
        />

        <nav className="flex flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden px-0 py-0">
          {isLoading && servers.length === 0 ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[#313338]"
                />
              ))}
            </div>
          ) : (
            servers.map((server) => {
              const active = server.id === currentServerId;
              const initial = server.name.trim().charAt(0).toUpperCase() || "?";
              return (
                <div key={server.id} className="group/pill relative flex justify-center">
                  <span
                    className={`absolute left-0 top-1/2 z-10 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-200 ${
                      active ? "h-10 opacity-100" : "h-0 opacity-0 group-hover/pill:h-5 group-hover/pill:opacity-80"
                    }`}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => setCurrentServer(server.id)}
                    title={server.name}
                    className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden text-sm font-semibold text-white transition-all duration-200 ease-out ${
                      active
                        ? "rounded-2xl bg-[#5865f2]"
                        : "rounded-[24px] bg-[#313338] hover:rounded-2xl hover:bg-[#5865f2]"
                    }`}
                  >
                    {server.iconUrl ? (
                      <img
                        src={server.iconUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initial
                    )}
                  </button>
                </div>
              );
            })
          )}
        </nav>

        <button
          type="button"
          title="Add a server"
          onClick={() => setCreateOpen(true)}
          className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-[24px] bg-[#313338] text-[#23a559] transition-all duration-200 ease-out hover:rounded-2xl hover:bg-[#23a559] hover:text-white"
        >
          <PlusIcon />
        </button>

        <button
          type="button"
          title="Join a server"
          onClick={() => setJoinOpen(true)}
          className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-[24px] bg-[#313338] text-[#23a559] transition-all duration-200 ease-out hover:rounded-2xl hover:bg-[#23a559] hover:text-white"
        >
          <JoinIcon />
        </button>
      </aside>

      <CreateServerModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {joinOpen && <JoinInviteModal onClose={() => setJoinOpen(false)} />}
    </>
  );
}
