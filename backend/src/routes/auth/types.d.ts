export interface User {
  id: string;
  email: string;
  name: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}
export interface AuthResponse {
  user: User;
  token: string;
}
//# sourceMappingURL=types.d.ts.map
