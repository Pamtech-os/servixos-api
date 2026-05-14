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

/** URL path segments that map to recognised resource types */
const RESOURCE_PATHS = {
  CLIENTS: 'clients',
  JOBS: 'jobs',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  EMPLOYEES: 'employees',
  ROLES: 'roles',
  TASKS: 'tasks',
  REQUESTS: 'requests',
  WEBSITE: 'website',
  SETTINGS: 'settings',
  AUTH: 'auth',
} as const;

/**
 * Maps the first path segment to a log category.
 * Example: "/clients/abc123" → LogCategory.CLIENT
 */
const PATH_CATEGORY_MAP: Record<string, LogCategory> = {
  [RESOURCE_PATHS.CLIENTS]: LogCategory.CLIENT,
  [RESOURCE_PATHS.JOBS]: LogCategory.JOB,
  [RESOURCE_PATHS.INVOICES]: LogCategory.INVOICE,
  [RESOURCE_PATHS.PAYMENTS]: LogCategory.PAYMENT,
  [RESOURCE_PATHS.EMPLOYEES]: LogCategory.EMPLOYEE,
  [RESOURCE_PATHS.ROLES]: LogCategory.ROLE,
  [RESOURCE_PATHS.TASKS]: LogCategory.TASK,
  [RESOURCE_PATHS.REQUESTS]: LogCategory.REQUEST,
  [RESOURCE_PATHS.WEBSITE]: LogCategory.WEBSITE,
  [RESOURCE_PATHS.SETTINGS]: LogCategory.SETTINGS,
  [RESOURCE_PATHS.AUTH]: LogCategory.AUTH,
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
    const urlParamId = this.extractIdFromPath(req.path);
    const requestBody = req.body as Record<string, unknown> | undefined;

    return next.handle().pipe(
      tap((responseData: unknown) => {
        /*
         * Prefer the ID from the URL params; for POST requests where the path
         * carries no id (e.g. POST /clients), fall back to the created resource's _id.
         */
        const resourceId =
          urlParamId ?? this.extractResourceIdFromResponse(responseData);

        const action = this.buildRichAction(
          method,
          req.path,
          responseData,
          requestBody,
        );

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

  /**
   * Builds a human-readable action description using the HTTP method, URL path,
   * and response/request body data where available.
   *
   * Specific resource types get rich descriptions (e.g. "Job 'Cloud Migration'
   * status updated to In Progress"). All others fall back to the generic
   * "${verb} ${ResourceType}" pattern.
   */
  private buildRichAction(
    method: string,
    path: string,
    responseData: unknown,
    requestBody: Record<string, unknown> | undefined,
  ): string {
    const segments = path.replace(/^\/+/, '').split('/');
    const first = segments[0] === 'api' ? (segments[1] ?? '') : segments[0];
    const data = this.extractResponseData(responseData);

    switch (first) {
      case RESOURCE_PATHS.CLIENTS: {
        const name = this.extractStr(data, 'name');
        if (name) {
          if (method === 'POST')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.CLIENT.ADDED(name);
          if (method === 'DELETE')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.CLIENT.DELETED(name);
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.CLIENT.UPDATED(name);
        }
        break;
      }
      case RESOURCE_PATHS.INVOICES: {
        const num = this.extractStr(data, 'invoiceNumber');
        if (num) {
          if (method === 'POST')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.INVOICE.CREATED(num);
          if (method === 'DELETE')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.INVOICE.DELETED(num);
          const status = this.extractStr(data, 'status');
          if (status === 'paid')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.INVOICE.MARKED_PAID(num);
          if (status === 'partial')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.INVOICE.PARTIAL_PAID(num);
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.INVOICE.UPDATED(num);
        }
        break;
      }
      case RESOURCE_PATHS.JOBS: {
        const title = this.extractStr(data, 'title');
        if (title) {
          if (method === 'POST')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.JOB.CREATED(title);
          if (method === 'DELETE')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.JOB.DELETED(title);
          // Only mention status in the action when the request explicitly changed it
          const reqStatus = requestBody?.['status'];
          const status = this.extractStr(data, 'status');
          if (status && typeof reqStatus === 'string') {
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.JOB.STATUS_UPDATED(
              title,
              this.formatStatus(status),
            );
          }
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.JOB.UPDATED(title);
        }
        break;
      }
      case RESOURCE_PATHS.PAYMENTS: {
        const amount = this.extractNum(data, 'amount');
        if (amount != null) {
          const formatted = this.formatAmount(amount);
          if (method === 'POST')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.PAYMENT.RECORDED(formatted);
          if (method === 'DELETE')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.PAYMENT.DELETED(formatted);
        }
        break;
      }
      case RESOURCE_PATHS.EMPLOYEES: {
        const name =
          this.extractStr(data, 'name') ??
          this.joinName(
            this.extractStr(data, 'firstName'),
            this.extractStr(data, 'lastName'),
          );
        if (name) {
          if (method === 'POST')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.EMPLOYEE.INVITED(name);
          if (method === 'DELETE')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.EMPLOYEE.DEACTIVATED(name);
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.EMPLOYEE.UPDATED(name);
        }
        break;
      }
      case RESOURCE_PATHS.TASKS: {
        const title = this.extractStr(data, 'title');
        if (title) {
          if (method === 'POST')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.TASK.CREATED(title);
          if (method === 'DELETE')
            return ACTIVITY_LOGS_MESSAGES.ACTIONS.TASK.DELETED(title);
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.TASK.UPDATED(title);
        }
        break;
      }
      case RESOURCE_PATHS.REQUESTS: {
        if (method === 'POST')
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.REQUEST.CREATED;
        const status = this.extractStr(data, 'status');
        if (status === 'accepted')
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.REQUEST.ACCEPTED;
        if (status === 'rejected')
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.REQUEST.REJECTED;
        if (status === 'cancelled')
          return ACTIVITY_LOGS_MESSAGES.ACTIONS.REQUEST.CANCELLED;
        break;
      }
    }

    // Generic fallback for resources without specific templates
    const verb =
      METHOD_ACTION_VERB[method] ??
      ACTIVITY_LOGS_MESSAGES.ACTIONS.RESOURCE.MODIFIED;
    return `${verb} ${this.deriveResourceType(path)}`;
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

  /** Extracts the `data` object from a service response envelope. */
  private extractResponseData(
    responseData: unknown,
  ): Record<string, unknown> | null {
    if (typeof responseData !== 'object' || responseData === null) return null;
    const data = (responseData as Record<string, unknown>)['data'];
    if (typeof data !== 'object' || data === null) return null;
    return data as Record<string, unknown>;
  }

  private extractStr(
    data: Record<string, unknown> | null,
    key: string,
  ): string | null {
    if (!data) return null;
    const val = data[key];
    return typeof val === 'string' && val.trim() ? val.trim() : null;
  }

  private extractNum(
    data: Record<string, unknown> | null,
    key: string,
  ): number | null {
    if (!data) return null;
    const val = data[key];
    return typeof val === 'number' && isFinite(val) ? val : null;
  }

  private joinName(first: string | null, last: string | null): string | null {
    const parts = [first, last].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  /** Converts snake_case status to Title Case: "in_progress" → "In Progress" */
  private formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Formats a number with thousands separators: 4100 → "4,100" */
  private formatAmount(amount: number): string {
    const rounded = Math.round(amount * 100) / 100;
    const [integer, decimal] = rounded.toString().split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimal ? `${grouped}.${decimal}` : grouped;
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
