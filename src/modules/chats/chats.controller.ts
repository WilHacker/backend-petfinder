import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatsService } from './chats.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar mis chats con badge de no leídos' })
  getMyChats(@CurrentUser('sub') usuarioId: string) {
    return this.chatsService.getMyChats(usuarioId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del chat — perfiles de ambos participantes' })
  getChatDetail(
    @Param('id', ParseUUIDPipe) conversacionId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.chatsService.getChatDetail(conversacionId, usuarioId);
  }

  @Put(':id/accept')
  @ApiOperation({ summary: 'Rescatista acepta la invitación de chat' })
  acceptChat(
    @Param('id', ParseUUIDPipe) conversacionId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.chatsService.acceptChat(conversacionId, usuarioId);
  }

  @Put(':id/decline')
  @ApiOperation({ summary: 'Rescatista rechaza la invitación de chat' })
  declineChat(
    @Param('id', ParseUUIDPipe) conversacionId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.chatsService.declineChat(conversacionId, usuarioId);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Historial de mensajes del chat' })
  getMessages(
    @Param('id', ParseUUIDPipe) conversacionId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.chatsService.getMessages(conversacionId, usuarioId);
  }

  @Post(':id/messages')
  @UseInterceptors(FileInterceptor('foto', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        contenido: { type: 'string', example: 'Hola, encontré a tu mascota' },
        lat: { type: 'number', example: -17.39 },
        lng: { type: 'number', example: -66.15 },
        foto: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Enviar mensaje (texto, foto y/o ubicación GPS)' })
  sendMessage(
    @Param('id', ParseUUIDPipe) conversacionId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: SendMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.chatsService.sendMessage(conversacionId, usuarioId, dto, file);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Marcar todos los mensajes del chat como leídos' })
  markAsRead(
    @Param('id', ParseUUIDPipe) conversacionId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.chatsService.markAsRead(conversacionId, usuarioId);
  }
}
