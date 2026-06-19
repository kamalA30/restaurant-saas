import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
      },
    });

    this.logger.log(`New user registered: ${user.email} (${user.role})`);
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    console.log( dto.email + " dto.email ")
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    console.log( dto.password + " dto.password ")

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');
    console.log( dto.password + " dto.password ")

    this.logger.log(`User logged in: ${user.email}`);
    return this.issueTokens(user);
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { userId, token: refreshToken, isRevoked: false, expiresAt: { gt: new Date() } },
    });
    if (!tokenRecord) throw new UnauthorizedException('Invalid or expired refresh token');

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true },
    });

    return this.issueTokens(user);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { isRevoked: true },
    });
  }

  private async issueTokens(user: any): Promise<AuthResponseDto> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    };

    console.log ("payload  " + payload)
    const accessSecret = this.config.get<string>('jwt.accessSecret');
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    const refreshSecret = this.config.get<string>('jwt.refreshSecret');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    // Use sign() with secret in options — compatible with all @nestjs/jwt versions
    const accessToken = this.jwtService.sign(payload, { secret: accessSecret, expiresIn: accessExpiresIn } as any);
    const refreshToken = this.jwtService.sign(payload, { secret: refreshSecret, expiresIn: refreshExpiresIn } as any);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        restaurantId: user.restaurantId,
      },
    };
  }
}
