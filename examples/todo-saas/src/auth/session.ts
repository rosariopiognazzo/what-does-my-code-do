export interface Session {
  userId: string;
}

export function loadSession(token: string): Session | undefined {
  return token ? { userId: token } : undefined;
}
