type AuthResult =
  | { success: true; user_id: number; username: string; token: string }
  | { success: false; error: string };

type AuthState = {
  authenticated: boolean;
  userId: number | null;
  username: string | null;
  authToken: string | null;
};

export type { AuthResult, AuthState };