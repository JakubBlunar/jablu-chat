import type { UserStatus } from "@chat/shared";
import { useCallback, useMemo, useState } from "react";
import { ProfileCard, type ProfileCardUser } from "@/components/ProfileCard";
import { UserAvatar } from "@/components/UserAvatar";
import type { Member } from "@/stores/member.store";
import { useMemberStore } from "@/stores/member.store";

function roleLabel(role: Member["role"]): string | null {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return null;
}

function resolvePresence(
  m: Member,
  onlineIds: Set<string>,
): UserStatus {
  if (!onlineIds.has(m.userId)) return "offline";
  const s = m.user.status;
  if (s === "idle" || s === "dnd" || s === "online") return s;
  return "online";
}

export function MemberSidebar() {
  const members = useMemberStore((s) => s.members);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const isLoading = useMemberStore((s) => s.isLoading);

  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);

  const closeCard = useCallback(() => setCardUser(null), []);

  const handleMemberClick = useCallback(
    (member: Member, presence: UserStatus, rect: DOMRect) => {
      setCardUser({
        id: member.userId,
        username: member.user.username,
        avatarUrl: member.user.avatarUrl,
        bio: member.user.bio ?? null,
        status: presence,
        joinedAt: member.joinedAt,
        role: member.role,
      });
      setCardRect(rect);
    },
    [],
  );

  const { online, offline } = useMemo(() => {
    const on: Member[] = [];
    const off: Member[] = [];
    for (const m of members) {
      if (onlineIds.has(m.userId)) on.push(m);
      else off.push(m);
    }
    return { online: on, offline: off };
  }, [members, onlineIds]);

  const total = members.length;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-surface-dark">
      <div className="flex h-12 shrink-0 items-center border-b border-black/20 px-4">
        <h2 className="text-[11px] font-semibold tracking-wide text-gray-400">
          MEMBERS — {total}
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {isLoading && members.length === 0 ? (
          <div className="space-y-3 px-2">
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
                <div className="h-3 flex-1 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : null}

        <section className="mb-4">
          <h3 className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-gray-400">
            ONLINE — {online.length}
          </h3>
          <ul className="space-y-0.5">
            {online.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                presence={resolvePresence(m, onlineIds)}
                dimmed={false}
                onClick={handleMemberClick}
              />
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-gray-400">
            OFFLINE — {offline.length}
          </h3>
          <ul className="space-y-0.5">
            {offline.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                presence="offline"
                dimmed
                onClick={handleMemberClick}
              />
            ))}
          </ul>
        </section>
      </div>

      {cardUser && (
        <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />
      )}
    </aside>
  );
}

function MemberRow({
  member,
  presence,
  dimmed,
  onClick,
}: {
  member: Member;
  presence: UserStatus;
  dimmed: boolean;
  onClick: (member: Member, presence: UserStatus, rect: DOMRect) => void;
}) {
  const name = member.user.username;
  const badge = roleLabel(member.role);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(member, presence, rect);
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.04] ${
          dimmed ? "opacity-50" : ""
        }`}
      >
        <UserAvatar
          username={name}
          avatarUrl={member.user.avatarUrl}
          size="md"
          showStatus
          status={presence}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium text-gray-200">
              {name}
            </span>
            {badge ? (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/40">
                {badge}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
