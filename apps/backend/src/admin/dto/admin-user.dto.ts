import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const MAX_SEARCH = 120;
const MAX_PAGE_SIZE = 100;

export class ListUsersQueryDto {
  /** Free-text match on email or name. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH)
  q?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'USER'])
  role?: 'ADMIN' | 'USER';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

export class UpdateUserRoleDto {
  @IsIn(['ADMIN', 'USER'])
  role!: 'ADMIN' | 'USER';
}
