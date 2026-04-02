import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { ShopService } from './shop.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PurchaseItemDto } from './dto/purchase-item.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import {
  ShopResponse,
  ShopItemResponse,
  ShopItemVariantResponse,
  DeleteShopResponse,
  DeleteItemResponse,
  DeleteVariantResponse,
  BalanceResponse,
  UserTransactionResponse,
  AdminTransactionResponse,
  RefundResponse,
  PurchaseResponse,
  PinnedItemResponse,
  RemovedResponse,
} from './dto/shop-response.dto';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

@Controller('api/shop')
@Public()
export class ShopController {
  constructor(private shopService: ShopService) {}

  @Get('shops')
  @ApiOkResponse({ type: [ShopResponse] })
  async getShops() {
    return this.shopService.getPublicShops();
  }

  @Get(':slug/items')
  @ApiOkResponse({ type: [ShopItemResponse] })
  async getItems(@Param('slug') slug: string) {
    const shop = await this.shopService.getShopBySlug(slug);
    if (!shop.isActive || !shop.isPublic) {
      throw new NotFoundException('Shop not found');
    }
    return this.shopService.getItems(shop.shopId);
  }

  @Get(':slug/items/:id')
  @ApiOkResponse({ type: ShopItemResponse })
  async getItem(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const shop = await this.shopService.getShopBySlug(slug);
    if (!shop.isActive || !shop.isPublic) {
      throw new NotFoundException('Shop not found');
    }
    return this.shopService.getItem(id);
  }
}

@Controller('api/shop/auth')
export class ShopAuthController {
  constructor(private shopService: ShopService) {}

  @Get('balance')
  @ApiOkResponse({ type: BalanceResponse })
  async getBalance(@Req() req: Request) {
    return this.shopService.getUserBalance(req.user.userId);
  }

  @Post('purchase')
  @ApiCreatedResponse({ type: PurchaseResponse })
  async purchaseItem(
    @Body() purchaseItemDto: PurchaseItemDto,
    @Req() req: Request,
  ) {
    return this.shopService.purchaseItem(
      req.user.userId,
      purchaseItemDto.itemId,
      purchaseItemDto.variantId,
    );
  }

  @Get('transactions')
  @ApiOkResponse({ type: [UserTransactionResponse] })
  async getTransactions(@Req() req: Request) {
    return this.shopService.getUserTransactions(req.user.userId);
  }

  @Get('pinned-item')
  @ApiOkResponse({ type: PinnedItemResponse })
  async getPinnedItem(@Req() req: Request) {
    return this.shopService.getPinnedItem(req.user.userId);
  }

  @Post('pinned-item')
  @ApiCreatedResponse({ type: PinnedItemResponse })
  async setPinnedItem(
    @Body('itemId', ParseIntPipe) itemId: number,
    @Req() req: Request,
  ) {
    return this.shopService.setPinnedItem(req.user.userId, itemId);
  }

  @Delete('pinned-item')
  @ApiOkResponse({ type: RemovedResponse })
  async removePinnedItem(@Req() req: Request) {
    return this.shopService.removePinnedItem(req.user.userId);
  }
}

@Controller('api/shop/admin')
@UseGuards(RolesGuard)
@Roles(Role.Admin)
export class ShopAdminController {
  constructor(private shopService: ShopService) {}

  // ── Shop CRUD ──

  @Get('shops')
  @ApiOkResponse({ type: [ShopResponse] })
  async getShops() {
    return this.shopService.getShops();
  }

  @Post('shops')
  @ApiCreatedResponse({ type: ShopResponse })
  async createShop(@Body() createShopDto: CreateShopDto) {
    return this.shopService.createShop(createShopDto);
  }

  @Put('shops/:shopId')
  @ApiOkResponse({ type: ShopResponse })
  async updateShop(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() updateShopDto: UpdateShopDto,
  ) {
    return this.shopService.updateShop(shopId, updateShopDto);
  }

  @Delete('shops/:shopId')
  @ApiOkResponse({ type: DeleteShopResponse })
  async deleteShop(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.shopService.deleteShop(shopId);
  }

  // ── Items (scoped to shop) ──

  @Get('shops/:shopId/items')
  @ApiOkResponse({ type: [ShopItemResponse] })
  async getAllItems(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.shopService.getAllItems(shopId);
  }

  @Post('shops/:shopId/items')
  @ApiCreatedResponse({ type: ShopItemResponse })
  async createItem(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() createItemDto: CreateItemDto,
  ) {
    return this.shopService.createItem(shopId, createItemDto);
  }

  @Put('items/:id')
  @ApiOkResponse({ type: ShopItemResponse })
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.shopService.updateItem(id, updateItemDto);
  }

  @Delete('items/:id')
  @ApiOkResponse({ type: DeleteItemResponse })
  async deleteItem(@Param('id', ParseIntPipe) id: number) {
    return this.shopService.deleteItem(id);
  }

  // ── Variants ──

  @Post('items/:id/variants')
  @ApiCreatedResponse({ type: ShopItemVariantResponse })
  async createVariant(
    @Param('id', ParseIntPipe) itemId: number,
    @Body() createVariantDto: CreateVariantDto,
  ) {
    return this.shopService.createVariant(itemId, createVariantDto);
  }

  @Put('variants/:id')
  @ApiOkResponse({ type: ShopItemVariantResponse })
  async updateVariant(
    @Param('id', ParseIntPipe) variantId: number,
    @Body() updateVariantDto: UpdateVariantDto,
  ) {
    return this.shopService.updateVariant(variantId, updateVariantDto);
  }

  @Delete('variants/:id')
  @ApiOkResponse({ type: DeleteVariantResponse })
  async deleteVariant(@Param('id', ParseIntPipe) variantId: number) {
    return this.shopService.deleteVariant(variantId);
  }

  // ── Transactions ──

  @Get('transactions')
  @ApiOkResponse({ type: [AdminTransactionResponse] })
  @ApiQuery({ name: 'shopId', required: false, type: String })
  async getAllTransactions(@Query('shopId') shopId?: string) {
    const parsedShopId = shopId ? parseInt(shopId, 10) : undefined;
    return this.shopService.getAllTransactions(parsedShopId);
  }

  @Delete('transactions/:id')
  @ApiOkResponse({ type: RefundResponse })
  async refundTransaction(@Param('id', ParseIntPipe) transactionId: number) {
    return this.shopService.refundTransaction(transactionId);
  }

  @Put('transactions/:id/fulfill')
  @ApiOkResponse({ type: AdminTransactionResponse })
  async markTransactionFulfilled(
    @Param('id', ParseIntPipe) transactionId: number,
  ) {
    return this.shopService.markTransactionFulfilled(transactionId);
  }

  @Delete('transactions/:id/fulfill')
  @ApiOkResponse({ type: AdminTransactionResponse })
  async unfulfillTransaction(@Param('id', ParseIntPipe) transactionId: number) {
    return this.shopService.unfulfillTransaction(transactionId);
  }
}
