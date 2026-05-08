import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShopResponse {
  @ApiProperty()
  shopId: number;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ShopItemVariantResponse {
  @ApiProperty()
  variantId: number;

  @ApiProperty()
  itemId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  cost: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ShopItemResponse {
  @ApiProperty()
  itemId: number;

  @ApiProperty()
  shopId: number;

  @ApiProperty()
  shopSlug: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  cost: number;

  @ApiProperty({ type: [String] })
  regions: string[];

  @ApiProperty({ type: Number, nullable: true })
  maxPerUser: number | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [ShopItemVariantResponse] })
  variants: ShopItemVariantResponse[];
}

export class DeleteShopResponse {
  @ApiProperty()
  deleted: boolean;

  @ApiProperty()
  shopId: number;
}

export class DeleteItemResponse {
  @ApiProperty()
  deleted: boolean;

  @ApiProperty()
  itemId: number;
}

export class DeleteVariantResponse {
  @ApiProperty()
  deleted: boolean;

  @ApiProperty()
  variantId: number;
}

export class BalanceResponse {
  @ApiProperty()
  totalApprovedHours: number;

  @ApiProperty()
  totalSpent: number;

  @ApiProperty()
  balance: number;
}

class TransactionItemSummary {
  @ApiProperty()
  itemId: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl?: string | null;
}

class TransactionVariantSummary {
  @ApiProperty()
  variantId: number;

  @ApiProperty()
  name: string;
}

class TransactionUserSummary {
  @ApiProperty()
  userId: number;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  addressLine1: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine2: string | null;

  @ApiProperty({ type: String, nullable: true })
  city: string | null;

  @ApiProperty({ type: String, nullable: true })
  state: string | null;

  @ApiProperty({ type: String, nullable: true })
  country: string | null;

  @ApiProperty({ type: String, nullable: true })
  zipCode: string | null;
}

export class UserTransactionResponse {
  @ApiProperty()
  transactionId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  itemId: number;

  @ApiProperty({ type: Number, nullable: true })
  variantId: number | null;

  @ApiProperty()
  cost: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: TransactionItemSummary })
  item: TransactionItemSummary;

  @ApiProperty({ type: TransactionVariantSummary, nullable: true })
  variant: TransactionVariantSummary | null;
}

export class AdminTransactionResponse extends UserTransactionResponse {
  @ApiProperty()
  isFulfilled: boolean;

  @ApiProperty({ type: Date, nullable: true })
  fulfilledAt: Date | null;

  @ApiProperty({ type: TransactionUserSummary })
  user: TransactionUserSummary;
}

export class RefundResponse {
  @ApiProperty()
  refunded: boolean;

  @ApiProperty()
  transactionId: number;

  @ApiProperty()
  refundedAmount: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  itemName: string;
}

export class PurchaseResponse {
  @ApiProperty({ type: UserTransactionResponse })
  transaction: UserTransactionResponse;

  @ApiProperty({ type: BalanceResponse })
  newBalance: BalanceResponse;

  @ApiProperty({ type: String, nullable: true })
  specialAction: string | null;
}

class PinnedItemDetailResponse {
  @ApiProperty()
  itemId: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  cost: number;

  @ApiProperty()
  isActive: boolean;
}

export class PinnedItemResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  itemId: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: PinnedItemDetailResponse })
  item: PinnedItemDetailResponse;
}

export class RemovedResponse {
  @ApiProperty()
  removed: boolean;
}
