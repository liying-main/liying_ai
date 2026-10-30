/**
 * 开源版：去掉账号体系后的头像区。
 * 只显示品牌头像，不再有登录态、头像上传、昵称修改与退出登录。
 */
import logoImg from '../assets/logo.png'

interface UserAvatarProps {
  showSettings?: boolean
  setShowSettings?: (value: boolean) => void
}

export function UserAvatar(_props: UserAvatarProps) {
  return (
    <div className="user-avatar" title="厉影AI 开源版">
      <img src={logoImg} alt="厉影AI" width={28} height={28} style={{ borderRadius: '50%' }} />
    </div>
  )
}

