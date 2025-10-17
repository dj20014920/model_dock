import { FC, useCallback } from 'react'
import Button from '~app/components/Button'
import Dialog from '~app/components/Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onAccept: () => void
}

const RiskConsentModal: FC<Props> = ({ open, onClose, onAccept }) => {
  const accept = useCallback(() => {
    onAccept()
  }, [onAccept])

  return (
    <Dialog title="자동 라우팅 경고" open={open} onClose={onClose} className="rounded-2xl w-[560px]" borderless={false}>
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p className="text-primary-text">
          자동 입력/자동 전송 기능을 사용하면, 일부 서비스에서 봇으로 인식되어 계정 제한 등 리스크가 발생할 수 있습니다.
          특히 웹앱 세션을 사용하는 모드에서는 서비스 정책에 따라 제약이 있을 수 있습니다. 이 내용을 이해하고 동의하십니까?
        </p>
        <div className="flex flex-row justify-end gap-2 mt-2">
          <Button text="취소" color="flat" onClick={onClose} />
          <Button text="동의하고 활성화" color="primary" onClick={accept} />
        </div>
      </div>
    </Dialog>
  )
}

export default RiskConsentModal

