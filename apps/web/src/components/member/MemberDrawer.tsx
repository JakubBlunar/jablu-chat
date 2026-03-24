import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { MemberSidebar } from "@/components/member/MemberSidebar";
import { useLayoutStore } from "@/stores/layout.store";

export function MemberDrawer() {
  const open = useLayoutStore((s) => s.memberDrawerOpen);
  const close = useLayoutStore((s) => s.closeMemberDrawer);

  return (
    <MobileDrawer open={open} onClose={close} side="right" width="w-64">
      <MemberSidebar />
    </MobileDrawer>
  );
}
