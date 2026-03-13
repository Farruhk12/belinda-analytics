export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  password: string;
  role: 'admin' | 'user';
  /** Пустой массив = доступ ко всем регионам */
  allowed_regions: string[];
  /** Пустой массив = доступ ко всем группам */
  allowed_groups: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
