import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { debugLog } from '../utils/debug-log';
import { BalanceService } from '../balance/balance.service';

@Injectable()
export class ShopService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private mailService: MailService,
    private balanceService: BalanceService,
  ) {}

  // ── Shop CRUD ──

  async getPublicShops() {
    return this.prisma.shop.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getShops() {
    return this.prisma.shop.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async getShopBySlug(slug: string) {
    const shop = await this.prisma.shop.findUnique({ where: { slug } });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return shop;
  }

  async createShop(dto: CreateShopDto) {
    return this.prisma.shop.create({ data: dto });
  }

  async updateShop(shopId: number, dto: UpdateShopDto) {
    const shop = await this.prisma.shop.findUnique({ where: { shopId } });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return this.prisma.shop.update({ where: { shopId }, data: dto });
  }

  async deleteShop(shopId: number) {
    const shop = await this.prisma.shop.findUnique({ where: { shopId } });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    await this.prisma.shop.delete({ where: { shopId } });
    return { deleted: true, shopId };
  }

  // ── Items ──

  async getItems(shopId: number) {
    return this.prisma.shopItem.findMany({
      where: { shopId },
      orderBy: [{ isActive: 'desc' }, { cost: 'asc' }],
      include: {
        variants: {
          orderBy: { cost: 'asc' },
        },
      },
    });
  }

  async getAllItems(shopId: number) {
    return this.prisma.shopItem.findMany({
      where: { shopId },
      orderBy: { updatedAt: 'desc' },
      include: {
        variants: {
          orderBy: { cost: 'asc' },
        },
      },
    });
  }

  async getItem(itemId: number) {
    const item = await this.prisma.shopItem.findUnique({
      where: { itemId },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { cost: 'asc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  async createItem(shopId: number, createItemDto: CreateItemDto) {
    const shop = await this.prisma.shop.findUnique({ where: { shopId } });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return this.prisma.shopItem.create({
      data: {
        shopId,
        name: createItemDto.name,
        description: createItemDto.description,
        imageUrl: createItemDto.imageUrl,
        cost: createItemDto.cost,
        regions: createItemDto.regions ?? [],
      },
      include: {
        variants: true,
      },
    });
  }

  async updateItem(itemId: number, updateItemDto: UpdateItemDto) {
    const item = await this.prisma.shopItem.findUnique({
      where: { itemId },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return this.prisma.shopItem.update({
      where: { itemId },
      data: updateItemDto,
      include: {
        variants: true,
      },
    });
  }

  async deleteItem(itemId: number) {
    const item = await this.prisma.shopItem.findUnique({
      where: { itemId },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    await this.prisma.shopItem.delete({
      where: { itemId },
    });

    return { deleted: true, itemId };
  }

  async createVariant(itemId: number, data: { name: string; cost: number }) {
    const item = await this.prisma.shopItem.findUnique({
      where: { itemId },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return this.prisma.shopItemVariant.create({
      data: {
        itemId,
        name: data.name,
        cost: data.cost,
      },
    });
  }

  async updateVariant(
    variantId: number,
    data: { name?: string; cost?: number; isActive?: boolean },
  ) {
    const variant = await this.prisma.shopItemVariant.findUnique({
      where: { variantId },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    return this.prisma.shopItemVariant.update({
      where: { variantId },
      data,
    });
  }

  async deleteVariant(variantId: number) {
    const variant = await this.prisma.shopItemVariant.findUnique({
      where: { variantId },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    await this.prisma.shopItemVariant.delete({
      where: { variantId },
    });

    return { deleted: true, variantId };
  }

  async getUserBalance(userId: number) {
    return this.balanceService.getUserBalance(userId);
  }

  async purchaseItem(userId: number, itemId: number, variantId?: number) {
    console.log(
      `[Shop Purchase] Starting purchase for userId: ${userId}, itemId: ${itemId}, variantId: ${variantId || 'none'}`,
    );

    await this.balanceService.verifyEligibility(userId, 'Shop Purchase');

    const item = await this.prisma.shopItem.findUnique({
      where: { itemId },
      include: {
        shop: true,
        variants: {
          where: { isActive: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (!item.shop.isActive) {
      throw new BadRequestException('This shop is currently unavailable');
    }

    if (!item.isActive) {
      throw new BadRequestException('This item is no longer available');
    }

    if (item.maxPerUser !== null && item.maxPerUser > 0) {
      const existingPurchaseCount = await this.prisma.transaction.count({
        where: { userId, itemId },
      });

      if (existingPurchaseCount >= item.maxPerUser) {
        throw new BadRequestException(
          item.maxPerUser === 1
            ? `You have already purchased this item`
            : `You have reached the maximum limit of ${item.maxPerUser} for this item`,
        );
      }
    }

    let cost = item.cost;
    let variant = null;
    let description = item.name;

    if (item.variants.length > 0) {
      if (!variantId) {
        throw new BadRequestException('This item requires selecting a variant');
      }

      variant = item.variants.find((v) => v.variantId === variantId);
      if (!variant) {
        throw new BadRequestException('Invalid variant selected');
      }

      cost = variant.cost;
      description = `${item.name} - ${variant.name}`;
    } else if (variantId) {
      throw new BadRequestException('This item does not have variants');
    }

    if (item.description) {
      description += ` - ${item.description}`;
    }

    const { balance } = await this.getUserBalance(userId);

    if (balance < cost) {
      throw new BadRequestException(
        `Insufficient balance. You have ${balance} hours but this item costs ${cost} hours.`,
      );
    }

    console.log(
      `[Shop Purchase] Creating transaction for userId: ${userId}, itemId: ${itemId}, cost: ${cost}`,
    );
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        kind: 'ShopItem',
        itemId,
        variantId: variant?.variantId || null,
        itemDescription: description,
        cost,
      },
      include: {
        item: true,
        variant: true,
      },
    });

    console.log(
      `[Shop Purchase] Transaction created successfully: transactionId ${transaction.transactionId}`,
    );
    const newBalance = await this.getUserBalance(userId);
    console.log(
      `[Shop Purchase] New balance for userId ${userId}: ${newBalance.balance} hours`,
    );

    let specialAction: string | null = null;

    if (item.itemId === 1) {
      console.log(
        '[Midnight Ticket] Processing ticket purchase for user:',
        userId,
      );
      try {
        const attendApiKey = this.configService.get<string>('ATTEND_API_KEY');
        console.log('[Midnight Ticket] API Key present:', !!attendApiKey);

        if (!attendApiKey) {
          console.error('[Midnight Ticket] ATTEND_API_KEY not configured');
        } else {
          const user = await this.prisma.user.findUnique({
            where: { userId },
            select: { firstName: true, lastName: true, email: true },
          });
          debugLog('[Midnight Ticket] User found:', user?.email);

          if (user && user.email) {
            console.log('[Midnight Ticket] Sending request to attend API...');
            const response = await fetch(
              'https://attend.hackclub.com/api/v1/events/80acf8b8-8d7d-4ff6-9311-14edcff613b3/participants',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${attendApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  first_name: user.firstName || 'Midnight',
                  last_name: user.lastName || 'Attendee',
                  email: user.email,
                }),
              },
            );

            const responseText = await response.text();
            console.log(
              '[Midnight Ticket] API Response status:',
              response.status,
            );
            console.log('[Midnight Ticket] API Response body:', responseText);

            if (response.ok) {
              specialAction = 'midnight_ticket';
              console.log(
                '[Midnight Ticket] Success! specialAction set to midnight_ticket',
              );
            } else {
              console.error(
                '[Midnight Ticket] API request failed:',
                response.status,
                responseText,
              );
            }
          } else {
            console.error('[Midnight Ticket] User not found or no email');
          }
        }
      } catch (error) {
        console.error(
          '[Midnight Ticket] Failed to register participant:',
          error,
        );
      }
    }

    console.log(
      `[Shop Purchase] Purchase completed successfully for userId: ${userId}, transactionId: ${transaction.transactionId}, specialAction: ${specialAction || 'none'}`,
    );
    return {
      transaction,
      newBalance,
      specialAction,
    };
  }

  async getPinnedItem(userId: number) {
    return this.prisma.pinnedItem.findUnique({
      where: { userId },
      include: {
        item: {
          select: {
            itemId: true,
            name: true,
            description: true,
            imageUrl: true,
            cost: true,
            isActive: true,
          },
        },
      },
    });
  }

  async setPinnedItem(userId: number, itemId: number) {
    const item = await this.prisma.shopItem.findUnique({ where: { itemId } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return this.prisma.pinnedItem.upsert({
      where: { userId },
      create: { userId, itemId },
      update: { itemId },
      include: {
        item: {
          select: {
            itemId: true,
            name: true,
            description: true,
            imageUrl: true,
            cost: true,
            isActive: true,
          },
        },
      },
    });
  }

  async removePinnedItem(userId: number) {
    const pinned = await this.prisma.pinnedItem.findUnique({
      where: { userId },
    });
    if (!pinned) {
      throw new NotFoundException('No pinned item found');
    }

    await this.prisma.pinnedItem.delete({ where: { userId } });
    return { removed: true };
  }

  async getUserTransactions(userId: number) {
    return this.prisma.transaction.findMany({
      where: { userId },
      include: {
        item: {
          select: {
            itemId: true,
            name: true,
            imageUrl: true,
          },
        },
        variant: {
          select: {
            variantId: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllTransactions(shopId?: number) {
    return this.prisma.transaction.findMany({
      where: shopId
        ? { kind: 'ShopItem', item: { shopId } }
        : { kind: 'ShopItem' },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            zipCode: true,
            country: true,
          },
        },
        item: {
          select: {
            itemId: true,
            name: true,
          },
        },
        variant: {
          select: {
            variantId: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async refundTransaction(transactionId: number) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionId },
      include: {
        user: { select: { userId: true, email: true } },
        item: { select: { name: true } },
        variant: { select: { name: true } },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    await this.prisma.transaction.delete({
      where: { transactionId },
    });

    const baseName = transaction.item?.name ?? transaction.itemDescription;
    const itemName = transaction.variant
      ? `${baseName} (${transaction.variant.name})`
      : baseName;

    debugLog(
      `[Refund] Transaction ${transactionId} refunded: ${transaction.cost} hours returned to user ${transaction.user.email} for "${itemName}"`,
    );

    return {
      refunded: true,
      transactionId,
      refundedAmount: transaction.cost,
      userId: transaction.user.userId,
      itemName,
    };
  }

  async markTransactionFulfilled(transactionId: number) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionId },
      include: {
        user: { select: { userId: true, email: true } },
        item: { select: { name: true } },
        variant: { select: { name: true } },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.isFulfilled) {
      throw new BadRequestException('Transaction is already fulfilled');
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { transactionId },
      data: {
        isFulfilled: true,
        fulfilledAt: new Date(),
      },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        item: {
          select: {
            itemId: true,
            name: true,
          },
        },
        variant: {
          select: {
            variantId: true,
            name: true,
          },
        },
      },
    });

    const baseName = transaction.item?.name ?? transaction.itemDescription;
    const itemName = transaction.variant
      ? `${baseName} (${transaction.variant.name})`
      : baseName;

    debugLog(
      `[Fulfillment] Transaction ${transactionId} marked as fulfilled for user ${transaction.user.email} - "${itemName}"`,
    );

    try {
      await this.mailService.sendOrderFulfilledEmail(transaction.user.email, {
        transactionId,
        itemName,
        itemDescription: transaction.itemDescription,
      });
      debugLog(
        `[Fulfillment] Email sent to ${transaction.user.email} for transaction ${transactionId}`,
      );
    } catch (error) {
      console.error(
        `[Fulfillment] Error sending email to ${transaction.user.email}:`,
        error,
      );
    }

    return updatedTransaction;
  }

  async unfulfillTransaction(transactionId: number) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionId },
      include: {
        user: { select: { userId: true, email: true } },
        item: { select: { name: true } },
        variant: { select: { name: true } },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (!transaction.isFulfilled) {
      throw new BadRequestException('Transaction is not fulfilled');
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { transactionId },
      data: {
        isFulfilled: false,
        fulfilledAt: null,
      },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        item: {
          select: {
            itemId: true,
            name: true,
          },
        },
        variant: {
          select: {
            variantId: true,
            name: true,
          },
        },
      },
    });

    const baseName = transaction.item?.name ?? transaction.itemDescription;
    const itemName = transaction.variant
      ? `${baseName} (${transaction.variant.name})`
      : baseName;

    debugLog(
      `[Unfulfill] Transaction ${transactionId} marked as unfulfilled for user ${transaction.user.email} - "${itemName}"`,
    );

    return updatedTransaction;
  }
}
