import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

export function useAppNavigate() {
  const navigate = useNavigate();

  const goToServer = useCallback(
    (serverId: string) => navigate(`/channels/${serverId}`),
    [navigate],
  );

  const goToChannel = useCallback(
    (serverId: string, channelId: string) =>
      navigate(`/channels/${serverId}/${channelId}`),
    [navigate],
  );

  const goToDms = useCallback(() => navigate("/channels/@me"), [navigate]);

  const goToDm = useCallback(
    (conversationId: string) => navigate(`/channels/@me/${conversationId}`),
    [navigate],
  );

  return { navigate, goToServer, goToChannel, goToDms, goToDm } as const;
}
