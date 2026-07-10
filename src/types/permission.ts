export interface PlayPermission {
  type: 'full' | 'trial' | 'forbidden';
  duration?: number;
  reason?: string;
}
