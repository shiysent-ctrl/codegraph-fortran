! 功能：验证类型、常量和接口作用域；输入无，输出为索引节点；不依赖外部库。
module StateModel
  implicit none
  integer, parameter :: Limit = 4
  type :: State
    integer :: Count
  end type State
  interface
    subroutine ExternalProcessor()
    end subroutine ExternalProcessor
  end interface
  interface Process
    subroutine NamedProcessor()
    end subroutine NamedProcessor
  end interface Process
contains
  subroutine AfterInterface()
  end subroutine AfterInterface
end module StateModel
