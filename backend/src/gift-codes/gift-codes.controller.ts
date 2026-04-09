import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { GiftCodesService } from './gift-codes.service';
import { SendGiftCodesDto } from './dto/send-gift-codes.dto';
import {
  GiftCodeResponse,
  GiftCodePublicResponse,
  GiftCodeClaimResponse,
  SendGiftCodesResponse,
} from './dto/gift-codes-response.dto';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/gift-codes')
@Public()
export class GiftCodesController {
  constructor(private giftCodesService: GiftCodesService) {}

  @Get(':code')
  @ApiOkResponse({ type: GiftCodePublicResponse })
  async getGiftCode(@Param('code') code: string) {
    return this.giftCodesService.getGiftCodeByCode(code);
  }

  @Post(':code/claim')
  @ApiCreatedResponse({ type: GiftCodeClaimResponse })
  async claimGiftCode(@Param('code') code: string) {
    return this.giftCodesService.markCodeAsClaimed(code);
  }
}

@Controller('api/admin/gift-codes')
@UseGuards(RolesGuard)
@Roles(Role.Admin)
export class GiftCodesAdminController {
  constructor(private giftCodesService: GiftCodesService) {}

  @Post('send')
  @ApiCreatedResponse({ type: SendGiftCodesResponse })
  async sendGiftCodes(@Body() dto: SendGiftCodesDto) {
    return this.giftCodesService.sendGiftCodes(dto);
  }

  @Get()
  @ApiOkResponse({ type: [GiftCodeResponse] })
  async getAllGiftCodes() {
    return this.giftCodesService.getAllGiftCodes();
  }
}
