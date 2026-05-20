import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PurchaseItemDto {
  @IsInt()
  @Min(1)
  itemId: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  variantId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  quantity?: number;
}
