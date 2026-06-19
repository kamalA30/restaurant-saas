import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AiAgentService } from './ai-agent.service';
import { AiQueryDto } from './dto/ai-query.dto';

@ApiTags('AI Agent')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.OWNER, Role.BRANCH_MANAGER) // 🛡️ محظور تماماً على النادل والكاشير
@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('query')
  @ApiOperation({ summary: 'إرسال سؤال واستشارة مالية للعميل الذكي للوحة التحكم' })
  async handleQuery(@Body() dto: AiQueryDto, @Req() req) {
    return this.aiAgentService.processQuery(dto.message, req.user);
  }
}