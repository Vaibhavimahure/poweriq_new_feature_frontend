export interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  image?: string | null;
  companyId?: string | null;
  company?: string | null;
  plantId?: string | null;
  plant?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  accessToken: string;
  refreshToken: string;
  userData: UserData;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  userData?: UserData;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserData | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
}
