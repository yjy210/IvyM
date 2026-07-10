import { PermissionReason, SourceReason } from '../types';

export function getPlayEventMessage(reason?: string, fallback?: string): string {
  switch (reason) {
    case PermissionReason.VIP_ONLY:
      return '该歌曲需要VIP会员';
    case PermissionReason.REGION_BLOCKED:
      return '该歌曲在当前地区不可用';
    case PermissionReason.COPYRIGHT_RESTRICTED:
      return '版权限制，暂不可播放';
    case PermissionReason.SONG_UNAVAILABLE:
      return '歌曲暂不可播放';
    case SourceReason.NETWORK_ERROR:
      return '网络错误，请检查网络连接';
    case SourceReason.SONG_REMOVED:
      return '歌曲已下架';
    case SourceReason.COOKIE_EXPIRED:
      return '登录已过期，请重新登录';
    default:
      return fallback || '播放失败';
  }
}
