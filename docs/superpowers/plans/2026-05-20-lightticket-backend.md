# LightTicket Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Express REST API + Socket.io server that powers the LightTicket platform, with JWT auth, Prisma ORM (MySQL/SQLite), file uploads, and MC plugin WebSocket integration.

**Architecture:** Express app with layered structure (routes → controllers → services → Prisma). Socket.io server runs alongside HTTP for MC plugin real-time notifications. Prisma handles DB abstraction for MySQL/SQLite switching via env var.

**Tech Stack:** Node.js 20+, Express, Socket.io, Prisma, JWT (jsonwebtoken), bcrypt, multer, zod (validation), vitest (testing)

---

## File Structure

```
backend/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                    # Entry point: Express + Socket.io setup
│   ├── config.ts                   # Env vars, constants
│   ├── app.ts                      # Express app factory (for testing)
│   ├── middleware/
│   │   ├── auth.ts                 # JWT verification middleware
│   │   ├── server-auth.ts          # X-Server-Key verification for MC plugin
│   │   ├── role.ts                 # Role-based access control
│   │   └── upload.ts               # Multer config for file uploads
│   ├── routes/
│   │   ├── auth.ts                 # /api/auth/*
│   │   ├── tickets.ts              # /api/tickets/*
│   │   ├── comments.ts             # /api/tickets/:id/comments
│   │   ├── labels.ts               # /api/labels/*
│   │   ├── attachments.ts          # /api/attachments/*
│   │   ├── servers.ts              # /api/servers/*
│   │   └── mc.ts                   # /api/mc/* (plugin endpoints)
│   ├── services/
│   │   ├── auth.service.ts         # Registration, login, token refresh, linking
│   │   ├── ticket.service.ts       # CRUD, filtering, status transitions
│   │   ├── comment.service.ts      # Comment CRUD
│   │   ├── label.service.ts        # Label CRUD
│   │   ├── attachment.service.ts   # File upload/retrieval
│   │   ├── server.service.ts       # Server registration, API key management
│   │   └── permission.service.ts   # Permission request approval/rejection
│   ├── socket/
│   │   ├── index.ts                # Socket.io server setup + auth
│   │   └── events.ts               # Event emitters for ticket updates
│   └── utils/
│       ├── errors.ts               # Custom error classes
│       ├── validate.ts             # Zod schema helpers
│       └── link-code.ts            # 6-digit code generation
├── tests/
│   ├── setup.ts                    # Test DB setup/teardown
│   ├── auth.test.ts
│   ├── tickets.test.ts
│   ├── comments.test.ts
│   ├── labels.test.ts
│   ├── mc.test.ts
│   └── permissions.test.ts
└── uploads/                        # Local file storage (gitignored)
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd backend
npm init -y
npm install express socket.io @prisma/client jsonwebtoken bcrypt multer zod cors dotenv
npm install -D typescript @types/node @types/express @types/jsonwebtoken @types/bcrypt @types/multer @types/cors vitest supertest @types/supertest prisma tsx
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 4: Create .env.example**

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-production"
JWT_REFRESH_SECRET="change-me-too"
PORT=3000
UPLOAD_DIR="./uploads"
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
uploads/
.env
*.db
*.db-journal
```

- [ ] **Step 6: Add scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:run": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold project with dependencies and config"
```

---

## Task 2: Prisma Schema & Database

**Files:**
- Create: `backend/prisma/schema.prisma`

- [ ] **Step 1: Write Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = env("DB_PROVIDER")
  url      = env("DATABASE_URL")
}

enum Role {
  player
  staff
  admin
}

enum TicketType {
  bug_report
  permission_request
  suggestion
  report
}

enum TicketStatus {
  open
  in_progress
  resolved
  closed
  rejected
}

enum Priority {
  low
  medium
  high
  critical
}

enum CommentSource {
  web
  minecraft
}

enum ExecutionStatus {
  pending
  executed
  failed
}

model User {
  id             String    @id @default(cuid())
  email          String    @unique
  passwordHash   String    @map("password_hash")
  username       String    @unique
  minecraftUuid  String?   @unique @map("minecraft_uuid")
  minecraftName  String?   @map("minecraft_name")
  role           Role      @default(player)
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  tickets        Ticket[]  @relation("author")
  assignedTickets Ticket[] @relation("assignee")
  comments       Comment[]
  attachments    Attachment[]
  auditLogs      AuditLog[]

  @@map("users")
}

model Server {
  id          String   @id @default(cuid())
  name        String   @unique
  apiKey      String   @unique @map("api_key")
  address     String?
  description String?
  createdAt   DateTime @default(now()) @map("created_at")

  tickets     Ticket[]
  linkCodes   LinkCode[]

  @@map("servers")
}

model Ticket {
  id         String       @id @default(cuid())
  title      String
  body       String
  type       TicketType
  status     TicketStatus @default(open)
  priority   Priority     @default(medium)
  authorId   String       @map("author_id")
  serverId   String?      @map("server_id")
  assigneeId String?      @map("assignee_id")
  createdAt  DateTime     @default(now()) @map("created_at")
  updatedAt  DateTime     @updatedAt @map("updated_at")
  closedAt   DateTime?    @map("closed_at")

  author     User         @relation("author", fields: [authorId], references: [id])
  server     Server?      @relation(fields: [serverId], references: [id])
  assignee   User?        @relation("assignee", fields: [assigneeId], references: [id])
  labels     TicketLabel[]
  comments   Comment[]
  attachments Attachment[]
  auditLogs  AuditLog[]
  permissionRequest PermissionRequest?

  @@map("tickets")
}

model Label {
  id          String        @id @default(cuid())
  name        String        @unique
  color       String
  description String?
  tickets     TicketLabel[]

  @@map("labels")
}

model TicketLabel {
  ticketId String @map("ticket_id")
  labelId  String @map("label_id")
  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  label    Label  @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([ticketId, labelId])
  @@map("ticket_labels")
}

model Comment {
  id        String        @id @default(cuid())
  ticketId  String        @map("ticket_id")
  authorId  String        @map("author_id")
  body      String
  source    CommentSource @default(web)
  createdAt DateTime      @default(now()) @map("created_at")

  ticket    Ticket        @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author    User          @relation(fields: [authorId], references: [id])
  attachments Attachment[]

  @@map("comments")
}

model Attachment {
  id         String   @id @default(cuid())
  ticketId   String?  @map("ticket_id")
  commentId  String?  @map("comment_id")
  filename   String
  path       String
  mimeType   String   @map("mime_type")
  size       Int
  uploadedBy String   @map("uploaded_by")
  createdAt  DateTime @default(now()) @map("created_at")

  ticket     Ticket?  @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  comment    Comment? @relation(fields: [commentId], references: [id], onDelete: Cascade)
  uploader   User     @relation(fields: [uploadedBy], references: [id])

  @@map("attachments")
}

model PermissionRequest {
  id              String          @id @default(cuid())
  ticketId        String          @unique @map("ticket_id")
  permissionNode  String?         @map("permission_node")
  groupName       String?         @map("group_name")
  executionStatus ExecutionStatus @default(pending) @map("execution_status")
  executedAt      DateTime?       @map("executed_at")
  errorMessage    String?         @map("error_message")

  ticket          Ticket          @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@map("permission_requests")
}

model LinkCode {
  id            String   @id @default(cuid())
  code          String   @unique
  minecraftUuid String   @map("minecraft_uuid")
  minecraftName String   @map("minecraft_name")
  serverId      String   @map("server_id")
  expiresAt     DateTime @map("expires_at")
  used          Boolean  @default(false)

  server        Server   @relation(fields: [serverId], references: [id])

  @@map("link_codes")
}

model AuditLog {
  id       String   @id @default(cuid())
  ticketId String   @map("ticket_id")
  actorId  String   @map("actor_id")
  action   String
  oldValue String?  @map("old_value")
  newValue String?  @map("new_value")
  createdAt DateTime @default(now()) @map("created_at")

  ticket   Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  actor    User     @relation(fields: [actorId], references: [id])

  @@map("audit_logs")
}
```

- [ ] **Step 2: Generate Prisma client and run initial migration**

```bash
cp .env.example .env
# Set DB_PROVIDER=sqlite for dev
npx prisma migrate dev --name init
```

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/
git commit -m "feat(backend): add Prisma schema with all data models"
```

---

## Task 3: App Factory & Config

**Files:**
- Create: `backend/src/config.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/index.ts`
- Create: `backend/src/utils/errors.ts`
- Create: `backend/tests/setup.ts`

- [ ] **Step 1: Create config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  accessTokenExpiry: '2h',
  refreshTokenExpiry: '7d',
  linkCodeExpiry: 5 * 60 * 1000, // 5 minutes
};
```

- [ ] **Step 2: Create utils/errors.ts**

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(400, message);
  }
}
```

- [ ] **Step 3: Create app.ts**

```typescript
import express from 'express';
import cors from 'cors';
import { AppError } from './utils/errors.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

- [ ] **Step 4: Create index.ts**

```typescript
import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
const server = createServer(app);

server.listen(config.port, () => {
  console.log(`LightTicket API running on port ${config.port}`);
});
```

- [ ] **Step 5: Create tests/setup.ts**

```typescript
import { PrismaClient } from '@prisma/client';
import { beforeEach } from 'vitest';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.ticketLabel.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.permissionRequest.deleteMany();
  await prisma.linkCode.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.label.deleteMany();
  await prisma.user.deleteMany();
  await prisma.server.deleteMany();
});

export { prisma };
```

- [ ] **Step 6: Verify the app starts**

```bash
npx tsx src/index.ts &
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/ backend/tests/
git commit -m "feat(backend): add app factory, config, error classes, and test setup"
```

---

## Task 4: Auth Middleware & Service

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/middleware/server-auth.ts`
- Create: `backend/src/middleware/role.ts`
- Create: `backend/src/services/auth.service.ts`
- Create: `backend/src/routes/auth.ts`
- Create: `backend/tests/auth.test.ts`

- [ ] **Step 1: Write auth middleware test**

```typescript
// tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

describe('POST /api/auth/register', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!', username: 'testuser' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!', username: 'user1' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!', username: 'user2' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'Password123!', username: 'loginuser' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns new access token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'refresh@example.com', password: 'Password123!', username: 'refreshuser' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run tests/auth.test.ts
```
Expected: FAIL — modules not found

- [ ] **Step 3: Create auth middleware**

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError } from '../utils/errors.js';

export interface AuthPayload {
  userId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid token');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
```

- [ ] **Step 4: Create server-auth middleware**

```typescript
// src/middleware/server-auth.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { UnauthorizedError } from '../utils/errors.js';

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      server?: { id: string; name: string };
    }
  }
}

export async function serverAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers['x-server-key'] as string | undefined;
  if (!apiKey) {
    throw new UnauthorizedError('Missing X-Server-Key header');
  }

  const server = await prisma.server.findUnique({ where: { apiKey } });
  if (!server) {
    throw new UnauthorizedError('Invalid server key');
  }

  req.server = { id: server.id, name: server.name };
  next();
}
```

- [ ] **Step 5: Create role middleware**

```typescript
// src/middleware/role.ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';

const ROLE_HIERARCHY = { player: 0, staff: 1, admin: 2 };

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ForbiddenError();
    }
    const userLevel = ROLE_HIERARCHY[req.user.role as keyof typeof ROLE_HIERARCHY] ?? 0;
    const minLevel = Math.min(...roles.map(r => ROLE_HIERARCHY[r as keyof typeof ROLE_HIERARCHY] ?? 0));
    if (userLevel < minLevel) {
      throw new ForbiddenError();
    }
    next();
  };
}
```

- [ ] **Step 6: Create auth service**

```typescript
// src/services/auth.service.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError, UnauthorizedError, ValidationError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function register(email: string, password: string, username: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    throw new AppError(409, existing.email === email ? 'Email already registered' : 'Username taken');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, username },
  });

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as { userId: string; role: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedError();

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.accessTokenExpiry },
    );
    return { accessToken, user: sanitizeUser(user) };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
}

export async function linkMinecraft(userId: string, code: string) {
  const linkCode = await prisma.linkCode.findFirst({
    where: { code, used: false, expiresAt: { gt: new Date() } },
  });
  if (!linkCode) throw new ValidationError('Invalid or expired link code');

  await prisma.user.update({
    where: { id: userId },
    data: { minecraftUuid: linkCode.minecraftUuid, minecraftName: linkCode.minecraftName },
  });

  await prisma.linkCode.update({ where: { id: linkCode.id }, data: { used: true } });
  return { uuid: linkCode.minecraftUuid, name: linkCode.minecraftName };
}

function generateTokens(userId: string, role: string) {
  const accessToken = jwt.sign({ userId, role }, config.jwtSecret, { expiresIn: config.accessTokenExpiry });
  const refreshToken = jwt.sign({ userId, role }, config.jwtRefreshSecret, { expiresIn: config.refreshTokenExpiry });
  return { accessToken, refreshToken };
}

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}
```

- [ ] **Step 7: Create auth routes**

```typescript
// src/routes/auth.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const result = await authService.register(parsed.data.email, parsed.data.password, parsed.data.username);
  res.status(201).json(result);
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const result = await authService.login(parsed.data.email, parsed.data.password);
  res.json(result);
});

router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ValidationError('refreshToken required');

  const result = await authService.refresh(refreshToken);
  res.json(result);
});

router.post('/link-minecraft', authMiddleware, async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) throw new ValidationError('code required');

  const result = await authService.linkMinecraft(req.user!.userId, code);
  res.json(result);
});

export default router;
```

- [ ] **Step 8: Wire auth routes into app.ts**

Add to `src/app.ts`:
```typescript
import authRoutes from './routes/auth.js';

// After app.use(express.json()):
app.use('/api/auth', authRoutes);
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/auth.test.ts
```
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/middleware/ backend/src/services/auth.service.ts backend/src/routes/auth.ts backend/tests/auth.test.ts
git commit -m "feat(backend): add auth system with register, login, refresh, and MC linking"
```

---

## Task 5: Ticket Service & Routes

**Files:**
- Create: `backend/src/services/ticket.service.ts`
- Create: `backend/src/routes/tickets.ts`
- Create: `backend/tests/tickets.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write ticket tests**

```typescript
// tests/tickets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.accessToken;
}

describe('POST /api/tickets', () => {
  it('creates a ticket', async () => {
    const token = await createUserAndGetToken();
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Bug', body: 'Something broke', type: 'bug_report' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test Bug');
    expect(res.body.status).toBe('open');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ title: 'Test', body: 'Body', type: 'bug_report' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/tickets', () => {
  it('returns paginated tickets with filters', async () => {
    const token = await createUserAndGetToken();
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bug 1', body: 'Body', type: 'bug_report' });
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Suggestion 1', body: 'Body', type: 'suggestion' });

    const res = await request(app)
      .get('/api/tickets?type=bug_report')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].title).toBe('Bug 1');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
  });
});

describe('PATCH /api/tickets/:id', () => {
  it('allows author to update status', async () => {
    const token = await createUserAndGetToken();
    const created = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'To Close', body: 'Body', type: 'suggestion' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tickets.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create ticket service**

```typescript
// src/services/ticket.service.ts
import { PrismaClient, TicketStatus, TicketType, Priority } from '@prisma/client';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

const prisma = new PrismaClient();

interface CreateTicketInput {
  title: string;
  body: string;
  type: TicketType;
  priority?: Priority;
  serverId?: string;
  authorId: string;
}

interface ListTicketsInput {
  page?: number;
  pageSize?: number;
  status?: TicketStatus;
  type?: TicketType;
  authorId?: string;
  serverId?: string;
  labelId?: string;
  search?: string;
}

export async function create(input: CreateTicketInput) {
  return prisma.ticket.create({
    data: {
      title: input.title,
      body: input.body,
      type: input.type,
      priority: input.priority || 'medium',
      authorId: input.authorId,
      serverId: input.serverId,
    },
    include: { author: { select: { id: true, username: true, minecraftName: true } }, labels: { include: { label: true } } },
  });
}

export async function list(input: ListTicketsInput) {
  const page = input.page || 1;
  const pageSize = input.pageSize || 20;
  const where: any = {};

  if (input.status) where.status = input.status;
  if (input.type) where.type = input.type;
  if (input.authorId) where.authorId = input.authorId;
  if (input.serverId) where.serverId = input.serverId;
  if (input.labelId) where.labels = { some: { labelId: input.labelId } };
  if (input.search) where.OR = [
    { title: { contains: input.search } },
    { body: { contains: input.search } },
  ];

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, minecraftName: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets, total, page, pageSize };
}

export async function getById(id: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function update(id: string, userId: string, userRole: string, data: { status?: TicketStatus; priority?: Priority; assigneeId?: string }) {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError();

  const updateData: any = {};
  if (data.status) {
    updateData.status = data.status;
    if (data.status === 'closed' || data.status === 'resolved') {
      updateData.closedAt = new Date();
    }
  }
  if (data.priority && isStaff) updateData.priority = data.priority;
  if (data.assigneeId && isStaff) updateData.assigneeId = data.assigneeId;

  return prisma.ticket.update({
    where: { id },
    data: updateData,
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      labels: { include: { label: true } },
    },
  });
}
```

- [ ] **Step 4: Create ticket routes**

```typescript
// src/routes/tickets.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  type: z.enum(['bug_report', 'permission_request', 'suggestion', 'report']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  serverId: z.string().optional(),
});

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const ticket = await ticketService.create({ ...parsed.data, authorId: req.user!.userId });
  res.status(201).json(ticket);
});

router.get('/', async (req: Request, res: Response) => {
  const result = await ticketService.list({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    status: req.query.status as any,
    type: req.query.type as any,
    authorId: req.query.authorId as string,
    serverId: req.query.serverId as string,
    labelId: req.query.labelId as string,
    search: req.query.search as string,
  });
  res.json(result);
});

router.get('/:id', async (req: Request, res: Response) => {
  const ticket = await ticketService.getById(req.params.id);
  res.json(ticket);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const ticket = await ticketService.update(req.params.id, req.user!.userId, req.user!.role, req.body);
  res.json(ticket);
});

export default router;
```

- [ ] **Step 5: Wire into app.ts**

Add to `src/app.ts`:
```typescript
import ticketRoutes from './routes/tickets.js';
app.use('/api/tickets', ticketRoutes);
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/tickets.test.ts
```
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/ticket.service.ts backend/src/routes/tickets.ts backend/tests/tickets.test.ts backend/src/app.ts
git commit -m "feat(backend): add ticket CRUD with filtering and pagination"
```

---

## Task 6: Comments & Labels

**Files:**
- Create: `backend/src/services/comment.service.ts`
- Create: `backend/src/services/label.service.ts`
- Create: `backend/src/routes/comments.ts`
- Create: `backend/src/routes/labels.ts`
- Create: `backend/tests/comments.test.ts`
- Create: `backend/tests/labels.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write comment tests**

```typescript
// tests/comments.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

async function setupTicket() {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email: 'commenter@test.com', password: 'Password123!', username: 'commenter' });
  const token = reg.body.accessToken;
  const ticket = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Ticket', body: 'Body', type: 'bug_report' });
  return { token, ticketId: ticket.body.id };
}

describe('POST /api/tickets/:id/comments', () => {
  it('adds a comment to a ticket', async () => {
    const { token, ticketId } = await setupTicket();
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'This is a comment' });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe('This is a comment');
    expect(res.body.source).toBe('web');
  });
});

describe('GET /api/tickets/:id/comments', () => {
  it('returns comments for a ticket', async () => {
    const { token, ticketId } = await setupTicket();
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Comment 1' });

    const res = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write label tests**

```typescript
// tests/labels.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function getAdminToken() {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email: 'admin@test.com', password: 'Password123!', username: 'admin' });
  await prisma.user.update({ where: { email: 'admin@test.com' }, data: { role: 'admin' } });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'Password123!' });
  return login.body.accessToken;
}

describe('POST /api/labels', () => {
  it('admin can create a label', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'bug', color: '#ef4444' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('bug');
    expect(res.body.color).toBe('#ef4444');
  });

  it('player cannot create a label', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'player@test.com', password: 'Password123!', username: 'player' });

    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ name: 'hack', color: '#000' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/labels', () => {
  it('returns all labels', async () => {
    const token = await getAdminToken();
    await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'feature', color: '#3b82f6' });

    const res = await request(app)
      .get('/api/labels')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/comments.test.ts tests/labels.test.ts
```
Expected: FAIL

- [ ] **Step 4: Create comment service**

```typescript
// src/services/comment.service.ts
import { PrismaClient, CommentSource } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(ticketId: string, authorId: string, body: string, source: CommentSource = 'web') {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return prisma.comment.create({
    data: { ticketId, authorId, body, source },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}

export async function listByTicket(ticketId: string) {
  return prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}
```

- [ ] **Step 5: Create label service**

```typescript
// src/services/label.service.ts
import { PrismaClient } from '@prisma/client';
import { AppError, NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(name: string, color: string, description?: string) {
  const existing = await prisma.label.findUnique({ where: { name } });
  if (existing) throw new AppError(409, 'Label already exists');

  return prisma.label.create({ data: { name, color, description } });
}

export async function list() {
  return prisma.label.findMany({ orderBy: { name: 'asc' } });
}

export async function update(id: string, data: { name?: string; color?: string; description?: string }) {
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('Label not found');
  return prisma.label.update({ where: { id }, data });
}

export async function remove(id: string) {
  await prisma.label.delete({ where: { id } });
}

export async function addToTicket(ticketId: string, labelId: string) {
  return prisma.ticketLabel.create({ data: { ticketId, labelId } });
}

export async function removeFromTicket(ticketId: string, labelId: string) {
  await prisma.ticketLabel.delete({ where: { ticketId_labelId: { ticketId, labelId } } });
}
```

- [ ] **Step 6: Create comment routes**

```typescript
// src/routes/comments.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as commentService from '../services/comment.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router({ mergeParams: true });

const createSchema = z.object({
  body: z.string().min(1),
});

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const comment = await commentService.create(req.params.id, req.user!.userId, parsed.data.body);
  res.status(201).json(comment);
});

router.get('/', async (req: Request, res: Response) => {
  const comments = await commentService.listByTicket(req.params.id);
  res.json(comments);
});

export default router;
```

- [ ] **Step 7: Create label routes**

```typescript
// src/routes/labels.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as labelService from '../services/label.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().optional(),
});

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const labels = await labelService.list();
  res.json(labels);
});

router.post('/', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const label = await labelService.create(parsed.data.name, parsed.data.color, parsed.data.description);
  res.status(201).json(label);
});

router.patch('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const label = await labelService.update(req.params.id, req.body);
  res.json(label);
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  await labelService.remove(req.params.id);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 8: Wire into app.ts**

```typescript
import commentRoutes from './routes/comments.js';
import labelRoutes from './routes/labels.js';

app.use('/api/tickets/:id/comments', commentRoutes);
app.use('/api/labels', labelRoutes);
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/comments.test.ts tests/labels.test.ts
```
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/comment.service.ts backend/src/services/label.service.ts backend/src/routes/comments.ts backend/src/routes/labels.ts backend/tests/comments.test.ts backend/tests/labels.test.ts backend/src/app.ts
git commit -m "feat(backend): add comments and labels with role-based access"
```

---

## Task 7: File Uploads & Attachments

**Files:**
- Create: `backend/src/middleware/upload.ts`
- Create: `backend/src/services/attachment.service.ts`
- Create: `backend/src/routes/attachments.ts`
- Create: `backend/tests/attachments.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write attachment tests**

```typescript
// tests/attachments.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import path from 'path';
import fs from 'fs';

const app = createApp();

const testFilePath = path.join(__dirname, 'test-image.png');

// Create a minimal PNG for testing
beforeAll(() => {
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  ]);
  fs.writeFileSync(testFilePath, pngHeader);
});

afterAll(() => {
  if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
});

describe('POST /api/attachments/upload', () => {
  it('uploads a file and returns metadata', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'uploader@test.com', password: 'Password123!', username: 'uploader' });

    const res = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .attach('file', testFilePath);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('filename');
    expect(res.body.mimeType).toBe('image/png');
  });

  it('rejects without auth', async () => {
    const res = await request(app)
      .post('/api/attachments/upload')
      .attach('file', testFilePath);

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Create upload middleware**

```typescript
// src/middleware/upload.ts
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomUUID() + ext;
    cb(null, name);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});
```

- [ ] **Step 3: Create attachment service**

```typescript
// src/services/attachment.service.ts
import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

interface CreateAttachmentInput {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  ticketId?: string;
  commentId?: string;
}

export async function create(input: CreateAttachmentInput) {
  return prisma.attachment.create({ data: input });
}

export async function getById(id: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');
  return attachment;
}
```

- [ ] **Step 4: Create attachment routes**

```typescript
// src/routes/attachments.ts
import { Router, Request, Response } from 'express';
import path from 'path';
import { upload } from '../middleware/upload.js';
import * as attachmentService from '../services/attachment.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import { config } from '../config.js';

const router = Router();

router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new ValidationError('No file provided');

  const attachment = await attachmentService.create({
    filename: req.file.originalname,
    path: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user!.userId,
    ticketId: req.body.ticketId,
    commentId: req.body.commentId,
  });

  res.status(201).json(attachment);
});

router.get('/:id', async (req: Request, res: Response) => {
  const attachment = await attachmentService.getById(req.params.id);
  const filePath = path.resolve(config.uploadDir, attachment.path);
  res.sendFile(filePath);
});

export default router;
```

- [ ] **Step 5: Wire into app.ts and ensure uploads dir exists**

```typescript
import attachmentRoutes from './routes/attachments.js';
import fs from 'fs';
import { config } from './config.js';

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

app.use('/api/attachments', attachmentRoutes);
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/attachments.test.ts
```
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/upload.ts backend/src/services/attachment.service.ts backend/src/routes/attachments.ts backend/tests/attachments.test.ts backend/src/app.ts
git commit -m "feat(backend): add file upload and attachment management"
```

---

## Task 8: MC Plugin Endpoints

**Files:**
- Create: `backend/src/routes/mc.ts`
- Create: `backend/src/utils/link-code.ts`
- Create: `backend/tests/mc.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create link-code utility**

```typescript
// src/utils/link-code.ts
import crypto from 'crypto';

export function generateLinkCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}
```

- [ ] **Step 2: Write MC endpoint tests**

```typescript
// tests/mc.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

let serverKey: string;

beforeEach(async () => {
  const server = await prisma.server.create({
    data: { name: 'survival', apiKey: 'test-server-key-123', address: 'mc.example.com' },
  });
  serverKey = server.apiKey;
});

describe('POST /api/mc/link-code', () => {
  it('generates a 6-digit link code', async () => {
    const res = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', serverKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' });

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body).toHaveProperty('expiresAt');
  });

  it('rejects without server key', async () => {
    const res = await request(app)
      .post('/api/mc/link-code')
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/mc/tickets', () => {
  it('creates a ticket from game context', async () => {
    // First create and link a user
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'mcplayer@test.com', password: 'Password123!', username: 'mcplayer' });

    await prisma.user.update({
      where: { email: 'mcplayer@test.com' },
      data: { minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' },
    });

    const res = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', serverKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Block glitch',
        body: 'Blocks disappear when placed',
        type: 'bug_report',
        context: { world: 'world', x: 100, y: 64, z: -200, gameMode: 'SURVIVAL' },
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Block glitch');
  });

  it('rejects unlinked player', async () => {
    const res = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', serverKey)
      .send({
        minecraftUuid: 'unknown-uuid',
        title: 'Test',
        body: 'Body',
        type: 'bug_report',
      });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/mc/tickets/:uuid', () => {
  it('returns tickets for a player by UUID', async () => {
    await prisma.user.create({
      data: {
        email: 'viewer@test.com', passwordHash: 'x', username: 'viewer',
        minecraftUuid: 'view-uuid', minecraftName: 'Viewer',
      },
    });

    const res = await request(app)
      .get('/api/mc/tickets/view-uuid')
      .set('X-Server-Key', serverKey);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/mc.test.ts
```
Expected: FAIL

- [ ] **Step 4: Create MC routes**

```typescript
// src/routes/mc.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { serverAuthMiddleware } from '../middleware/server-auth.js';
import { generateLinkCode } from '../utils/link-code.js';
import { config } from '../config.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import * as ticketService from '../services/ticket.service.js';
import * as commentService from '../services/comment.service.js';

const prisma = new PrismaClient();
const router = Router();

router.use(serverAuthMiddleware);

const linkCodeSchema = z.object({
  minecraftUuid: z.string(),
  minecraftName: z.string(),
});

const mcTicketSchema = z.object({
  minecraftUuid: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  type: z.enum(['bug_report', 'permission_request', 'suggestion', 'report']),
  context: z.object({
    world: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    gameMode: z.string().optional(),
  }).optional(),
});

router.post('/link-code', async (req: Request, res: Response) => {
  const parsed = linkCodeSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + config.linkCodeExpiry);

  const linkCode = await prisma.linkCode.create({
    data: {
      code,
      minecraftUuid: parsed.data.minecraftUuid,
      minecraftName: parsed.data.minecraftName,
      serverId: req.server!.id,
      expiresAt,
    },
  });

  res.status(201).json({ code: linkCode.code, expiresAt: linkCode.expiresAt });
});

router.post('/tickets', async (req: Request, res: Response) => {
  const parsed = mcTicketSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({ where: { minecraftUuid: parsed.data.minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked to any account');

  let body = parsed.data.body;
  if (parsed.data.context) {
    const ctx = parsed.data.context;
    body += `\n\n---\n**Game Context:**\n- World: ${ctx.world}\n- Position: ${ctx.x}, ${ctx.y}, ${ctx.z}\n- Game Mode: ${ctx.gameMode}`;
  }

  const ticket = await ticketService.create({
    title: parsed.data.title,
    body,
    type: parsed.data.type as any,
    authorId: user.id,
    serverId: req.server!.id,
  });

  res.status(201).json(ticket);
});

router.get('/tickets/:uuid', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { minecraftUuid: req.params.uuid } });
  if (!user) {
    res.json([]);
    return;
  }

  const result = await ticketService.list({ authorId: user.id, pageSize: 10 });
  res.json(result.tickets);
});

router.post('/comments', async (req: Request, res: Response) => {
  const { minecraftUuid, ticketId, body } = req.body;
  if (!minecraftUuid || !ticketId || !body) throw new ValidationError('minecraftUuid, ticketId, and body required');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const comment = await commentService.create(ticketId, user.id, body, 'minecraft');
  res.status(201).json(comment);
});

export default router;
```

- [ ] **Step 5: Wire into app.ts**

```typescript
import mcRoutes from './routes/mc.js';
app.use('/api/mc', mcRoutes);
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/mc.test.ts
```
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/mc.ts backend/src/utils/link-code.ts backend/tests/mc.test.ts backend/src/app.ts
git commit -m "feat(backend): add MC plugin endpoints with server-key auth and link codes"
```

---

## Task 9: Socket.io Integration

**Files:**
- Create: `backend/src/socket/index.ts`
- Create: `backend/src/socket/events.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create Socket.io server setup**

```typescript
// src/socket/index.ts
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let io: Server;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const mcNamespace = io.of('/mc');

  mcNamespace.use(async (socket: Socket, next) => {
    const apiKey = socket.handshake.auth.serverKey as string;
    if (!apiKey) return next(new Error('Missing server key'));

    const server = await prisma.server.findUnique({ where: { apiKey } });
    if (!server) return next(new Error('Invalid server key'));

    socket.data.serverId = server.id;
    socket.data.serverName = server.name;
    next();
  });

  mcNamespace.on('connection', (socket: Socket) => {
    console.log(`MC server connected: ${socket.data.serverName}`);
    socket.join(`server:${socket.data.serverId}`);

    socket.on('disconnect', () => {
      console.log(`MC server disconnected: ${socket.data.serverName}`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}
```

- [ ] **Step 2: Create event emitters**

```typescript
// src/socket/events.ts
import { getIO } from './index.js';

export function emitTicketUpdate(serverId: string, event: string, data: any) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').to(`server:${serverId}`).emit(event, data);
}

export function emitToAllServers(event: string, data: any) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').emit(event, data);
}
```

- [ ] **Step 3: Update index.ts to initialize Socket.io**

```typescript
// src/index.ts (replace existing content)
import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from './config.js';
import { initSocket } from './socket/index.js';

const app = createApp();
const server = createServer(app);

initSocket(server);

server.listen(config.port, () => {
  console.log(`LightTicket API running on port ${config.port}`);
});
```

- [ ] **Step 4: Emit events from ticket service on status changes**

Add to `src/services/ticket.service.ts` at the top:
```typescript
import { emitTicketUpdate } from '../socket/events.js';
```

Add at the end of the `update` function, before the return:
```typescript
  if (data.status && ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
      ticketId: id,
      oldStatus: ticket.status,
      newStatus: data.status,
      authorUuid: (await prisma.user.findUnique({ where: { id: ticket.authorId } }))?.minecraftUuid,
    });
  }
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/socket/ backend/src/index.ts backend/src/services/ticket.service.ts
git commit -m "feat(backend): add Socket.io with MC namespace and real-time event emission"
```

---

## Task 10: Permission Request Flow

**Files:**
- Create: `backend/src/services/permission.service.ts`
- Create: `backend/tests/permissions.test.ts`
- Modify: `backend/src/routes/tickets.ts`

- [ ] **Step 1: Write permission tests**

```typescript
// tests/permissions.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function setupPermissionTicket() {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email: 'requester@test.com', password: 'Password123!', username: 'requester' });
  const token = reg.body.accessToken;

  const ticket = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Request builder rank',
      body: 'I want to build',
      type: 'permission_request',
    });

  // Create permission request record
  await prisma.permissionRequest.create({
    data: { ticketId: ticket.body.id, groupName: 'builder' },
  });

  // Create staff user
  const staff = await request(app)
    .post('/api/auth/register')
    .send({ email: 'staff@test.com', password: 'Password123!', username: 'staffuser' });
  await prisma.user.update({ where: { email: 'staff@test.com' }, data: { role: 'staff' } });
  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'staff@test.com', password: 'Password123!' });

  return { ticketId: ticket.body.id, staffToken: staffLogin.body.accessToken, playerToken: token };
}

describe('POST /api/tickets/:id/approve', () => {
  it('staff can approve a permission request', async () => {
    const { ticketId, staffToken } = await setupPermissionTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.permissionRequest.executionStatus).toBe('pending');
  });

  it('player cannot approve', async () => {
    const { ticketId, playerToken } = await setupPermissionTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/approve`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/tickets/:id/reject', () => {
  it('staff can reject with reason', async () => {
    const { ticketId, staffToken } = await setupPermissionTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/reject`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'Not enough playtime' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/permissions.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create permission service**

```typescript
// src/services/permission.service.ts
import { PrismaClient } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { emitTicketUpdate } from '../socket/events.js';

const prisma = new PrismaClient();

export async function approve(ticketId: string, actorId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.type !== 'permission_request') throw new ValidationError('Not a permission request');
  if (!ticket.permissionRequest) throw new ValidationError('No permission request data');

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'resolved', closedAt: new Date() },
    include: { permissionRequest: true, author: true },
  });

  await prisma.auditLog.create({
    data: { ticketId, actorId, action: 'permission_approved', newValue: 'resolved' },
  });

  if (ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'permission:approved', {
      ticketId,
      playerUuid: ticket.author.minecraftUuid,
      permissionNode: ticket.permissionRequest.permissionNode,
      groupName: ticket.permissionRequest.groupName,
    });
  }

  return updated;
}

export async function reject(ticketId: string, actorId: string, reason?: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.type !== 'permission_request') throw new ValidationError('Not a permission request');

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'rejected', closedAt: new Date() },
    include: { permissionRequest: true },
  });

  await prisma.auditLog.create({
    data: { ticketId, actorId, action: 'permission_rejected', newValue: reason || 'rejected' },
  });

  if (ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'permission:rejected', {
      ticketId,
      playerUuid: ticket.author.minecraftUuid,
      reason,
    });
  }

  return updated;
}

export async function reportExecution(ticketId: string, success: boolean, errorMessage?: string) {
  const status = success ? 'executed' : 'failed';

  await prisma.permissionRequest.update({
    where: { ticketId },
    data: { executionStatus: status, executedAt: new Date(), errorMessage },
  });
}
```

- [ ] **Step 4: Add approve/reject routes to tickets.ts**

Add to `src/routes/tickets.ts`:
```typescript
import * as permissionService from '../services/permission.service.js';
import { requireRole } from '../middleware/role.js';

router.post('/:id/approve', requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.approve(req.params.id, req.user!.userId);
  res.json(ticket);
});

router.post('/:id/reject', requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.reject(req.params.id, req.user!.userId, req.body.reason);
  res.json(ticket);
});
```

- [ ] **Step 5: Add execution report endpoint to MC routes**

Add to `src/routes/mc.ts`:
```typescript
import * as permissionService from '../services/permission.service.js';

router.post('/permission-executed', async (req: Request, res: Response) => {
  const { ticketId, success, errorMessage } = req.body;
  if (!ticketId) throw new ValidationError('ticketId required');

  await permissionService.reportExecution(ticketId, success, errorMessage);
  res.json({ ok: true });
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/permissions.test.ts
```
Expected: All PASS

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/permission.service.ts backend/src/routes/tickets.ts backend/src/routes/mc.ts backend/tests/permissions.test.ts
git commit -m "feat(backend): add permission request approval/rejection with Socket.io notifications"
```

---

## Task 11: Server Management & Final Wiring

**Files:**
- Create: `backend/src/services/server.service.ts`
- Create: `backend/src/routes/servers.ts`
- Modify: `backend/src/app.ts` (final version with all routes)

- [ ] **Step 1: Create server service**

```typescript
// src/services/server.service.ts
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AppError, NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(name: string, address?: string, description?: string) {
  const existing = await prisma.server.findUnique({ where: { name } });
  if (existing) throw new AppError(409, 'Server name already exists');

  const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;

  return prisma.server.create({
    data: { name, apiKey, address, description },
  });
}

export async function list() {
  return prisma.server.findMany({ orderBy: { name: 'asc' } });
}

export async function regenerateKey(id: string) {
  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('Server not found');

  const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;
  return prisma.server.update({ where: { id }, data: { apiKey } });
}

export async function remove(id: string) {
  await prisma.server.delete({ where: { id } });
}
```

- [ ] **Step 2: Create server routes**

```typescript
// src/routes/servers.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as serverService from '../services/server.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

router.use(authMiddleware, requireRole('admin'));

const createSchema = z.object({
  name: z.string().min(1).max(50),
  address: z.string().optional(),
  description: z.string().optional(),
});

router.get('/', async (_req: Request, res: Response) => {
  const servers = await serverService.list();
  res.json(servers);
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const server = await serverService.create(parsed.data.name, parsed.data.address, parsed.data.description);
  res.status(201).json(server);
});

router.post('/:id/regenerate-key', async (req: Request, res: Response) => {
  const server = await serverService.regenerateKey(req.params.id);
  res.json(server);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await serverService.remove(req.params.id);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 3: Write final app.ts with all routes**

```typescript
// src/app.ts (complete version)
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { AppError } from './utils/errors.js';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import commentRoutes from './routes/comments.js';
import labelRoutes from './routes/labels.js';
import attachmentRoutes from './routes/attachments.js';
import serverRoutes from './routes/servers.js';
import mcRoutes from './routes/mc.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/tickets/:id/comments', commentRoutes);
  app.use('/api/labels', labelRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/mc', mcRoutes);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ backend/tests/
git commit -m "feat(backend): add server management and finalize all route wiring"
```




