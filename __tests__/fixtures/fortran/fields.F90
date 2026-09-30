! 仅用于验证符号与调用关系，不代表核物理模型。
! 输入为示例标量，输出为函数值和索引调用关系；不依赖外部库。
module FieldEngine
  implicit none
contains
  real function Energy(rho) result(e)
    real, intent(in) :: rho
    real :: e
    e = rho * rho
    e = e + 1.0
  end function Energy

  subroutine Advance()
    call UPDATEFIELD()
    call LocalStep()
  contains
    subroutine LocalStep()
      call UpdateField()
    end subroutine LocalStep
  end subroutine Advance

  subroutine UpdateField()
    real :: value
    value = ENERGY(1.0)
    value = value + 2.0
  end subroutine UpdateField
end module FieldEngine
