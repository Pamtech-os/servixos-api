import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Types } from 'mongoose';
import type { JwtUser } from '../decorators/current-user.decorator';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import { ACTIVITY_LOGS_MESSAGES } from 'src/common/constants/messages/activity-logs.messages';
import { LogCategory } from 'src/modules/activity-logs/schemas/activity-log.schema';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Maps the first path segment to a log category.
 * Example: "/clients/abc123" → LogCategory.CLIENT
 */
const PATH_CATEGORY_MAP: Record<string, LogCategory> = {
  clients: LogCategory.CLIENT,
  jobs: LogCategory.JOB,
  invoices: LogCategory.INVOICE,
  payments: LogCategory.PAYMENT,
  employees: LogCategory.EMPLOYEE,
  roles: LogCategory.ROLE,
  tasks: LogCategory.TASK,
  requests: LogCategory.REQUEST,
  website: LogCategory.WEBSITE,
  settings: LogCategory.SETTINGS,
  auth: LogCategory.AUTH,
};

const METHOD_ACTION_VERB: Record<string, string> = {
  POST: ACTIVITY_LOGS_MESSAGES.ACTIONS.RESOURCE.CREATED,
  PATCH: ACTIVITY_LOGS_MESSAGES.ACTIONS.RESOURCE.UPDATED,
  PUT: ACTIVITY_LOGS_MESSAGES.ACTIONS.RESOURCE.UPDATED,
  DELETE: ACTIVITY_LOGS_MESSAGES.ACTIONS.RESOURCE.DELETED,
};

/**
 * Globally intercepts all mutating HTTP operations (POST/PATCH/PUT/DELETE)
 * and writes an ActivityLog entry after the response is sent.
 *
 * The log creation is fire-and-forget: it never blocks or disrupts the caller.
 * IP geolocation lookup (ip-api.com) and actor name resolution happen inside
 * ActivityLogsService.log(), both with short timeouts.
 *
 * Category is inferred from the first path segment.
 * ResourceId is extracted from URL params (:id) or from the POST response data.
 * Routes with no recognised category are silently skipped.
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly agendaService: AgendaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method } = req;

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const user = req.user as JwtUser | undefined;
    if (!user?.businessId) {
      return next.handle();
    }

    const category = this.deriveCategory(req.path);
    if (!category) {
      return next.handle();
    }

    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? '';
    const action = this.deriveAction(method, req.path);
    const urlParamId = this.extractIdFromPath(req.path);

    return next.handle().pipe(
      tap((responseData: unknown) => {
        /*
         * Prefer the ID from the URL params; for POST requests where the path
         * carries no id (e.g. POST /clients), fall back to the created resource's _id.
         */
        const resourceId =
          urlParamId ?? this.extractResourceIdFromResponse(responseData);

        void this.agendaService.now(JOBS.ACTIVITY_LOG_WRITE, {
          businessId: user.businessId,
          actorId: user.sub,
          actorRole: user.userRole,
          action,
          category,
          resourceId: resourceId ?? undefined,
          resourceType: this.deriveResourceType(req.path),
          ipAddress,
          userAgent,
        });
      }),
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private deriveCategory(path: string): LogCategory | null {
    // Extract first meaningful segment: "/api/clients/abc" → "clients"
    const segments = path.replace(/^\/+/, '').split('/');
    const first = segments[0] ?? '';
    // Skip the "api" prefix if present
    const key = first === 'api' ? (segments[1] ?? '') : first;
    return PATH_CATEGORY_MAP[key] ?? null;
  }

  private deriveAction(method: string, path: string): string {
    const verb =
      METHOD_ACTION_VERB[method] ??
      ACTIVITY_LOGS_MESSAGES.ACTIONS.RESOURCE.MODIFIED;
    const resourceType = this.deriveResourceType(path);
    return `${verb} ${resourceType}`;
  }

  private deriveResourceType(path: string): string {
    const segments = path.replace(/^\/+/, '').split('/');
    const first = segments[0] === 'api' ? (segments[1] ?? '') : segments[0];
    // Convert kebab-case to title-case singular: "activity-logs" → "activity log"
    return first
      .replace(/-/g, ' ')
      .replace(/s$/, '')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Extracts a MongoId from path segments.
   * Example: "/clients/664abc123456789012345678/export" → "664abc123456789012345678"
   */
  private extractIdFromPath(path: string): string | null {
    const segments = path.replace(/^\/+/, '').split('/');
    for (const segment of segments) {
      if (Types.ObjectId.isValid(segment) && segment.length === 24) {
        return segment;
      }
    }
    return null;
  }

  /**
   * Tries to extract the _id of a newly created resource from a POST response.
   * The handler returns { message, data } before ResponseTransformInterceptor wraps it.
   * Example: { data: { _id: ObjectId("...") } } → "..."
   */
  private extractResourceIdFromResponse(responseData: unknown): string | null {
    if (typeof responseData !== 'object' || responseData === null) return null;

    const payload = responseData as Record<string, unknown>;
    const data = payload['data'];

    if (typeof data !== 'object' || data === null) return null;

    const record = data as Record<string, unknown>;
    const raw = record['_id'] ?? record['id'];

    if (!raw) return null;

    if (typeof raw === 'string' && Types.ObjectId.isValid(raw)) return raw;
    if (raw instanceof Types.ObjectId) return raw.toString();
    if (typeof raw === 'object' && 'toString' in raw) {
      const str = (raw as { toString(): string }).toString();
      if (Types.ObjectId.isValid(str)) return str;
    }

    return null;
  }

  /**
   * Extracts the real client IP, respecting X-Forwarded-For headers set by
   * reverse proxies (nginx, load balancers, Cloudflare).
   */
  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return (
      req.socket?.remoteAddress ?? (req as unknown as { ip?: string }).ip ?? ''
    );
  }
}
