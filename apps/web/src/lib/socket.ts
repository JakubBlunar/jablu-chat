import { io, type Socket } from "socket.io-client";
import { api } from "./api";

let socket: Socket | null = null;

function getSocketUrl(): string {
  if (api.baseUrl) return api.baseUrl;
  if (import.meta.env.DEV) return "http://localhost:3001";
  return "";
}

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
