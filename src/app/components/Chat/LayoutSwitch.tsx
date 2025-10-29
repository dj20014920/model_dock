import { cx } from '~/utils'
import { FC } from 'react'
import { Layout } from '~app/consts'
import layoutFourIcon from '~assets/icons/layout-four.svg'
import layoutImageIcon from '~assets/icons/layout-image-input.svg'
import layoutThreeIcon from '~assets/icons/layout-three.svg'
import layoutTwoIcon from '~assets/icons/layout-two.svg'
import layoutSixIcon from '~assets/icons/layout-six.svg'

const Item: FC<{ icon: string; active: boolean; onClick: () => void }> = (props) => {
  return (
    <a className={cx(!!props.active && 'bg-[#00000014] dark:bg-[#ffffff26] rounded-[6px]')} onClick={props.onClick}>
      <img src={props.icon} className="w-8 h-8 cursor-pointer" />
    </a>
  )
}

interface Props {
  layout: Layout
  onChange: (layout: Layout) => void
  availableLayouts?: Layout[] // 사용 가능한 레이아웃 제한 (사이드패널용)
}

const LayoutSwitch: FC<Props> = (props) => {
  const { availableLayouts } = props
  
  // 사용 가능한 레이아웃이 지정된 경우 필터링
  const shouldShow = (layout: Layout) => {
    if (!availableLayouts) return true
    return availableLayouts.includes(layout)
  }

  return (
    <div className="flex flex-row items-center gap-2 bg-primary-background rounded-2xl px-4">
      {shouldShow(2) && (
        <Item
          icon={layoutTwoIcon}
          active={props.layout === 2 || props.layout === 'twoVertical'}
          onClick={() => props.onChange(2)}
        />
      )}
      {shouldShow(3) && (
        <Item icon={layoutThreeIcon} active={props.layout === 3} onClick={() => props.onChange(3)} />
      )}
      {shouldShow(4) && (
        <Item icon={layoutFourIcon} active={props.layout === 4} onClick={() => props.onChange(4)} />
      )}
      {shouldShow('sixGrid' as Layout) && (
        <Item icon={layoutSixIcon} active={props.layout === 'sixGrid'} onClick={() => props.onChange('sixGrid')} />
      )}
      {shouldShow('imageInput' as Layout) && (
        <Item
          icon={layoutImageIcon}
          active={props.layout === 'imageInput'}
          onClick={() => props.onChange('imageInput')}
        />
      )}
    </div>
  )
}

export default LayoutSwitch
