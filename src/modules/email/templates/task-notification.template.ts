import { baseTemplate } from './base.template';

export function taskAssignedTemplate(
  assigneeName: string,
  taskTitle: string,
  actorName: string,
  priority?: string,
  dueDate?: string,
): string {
  const priorityRow = priority
    ? `<tr>
        <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Priority</td>
        <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${priority.charAt(0).toUpperCase() + priority.slice(1)}</td>
      </tr>`
    : '';

  const dueDateRow = dueDate
    ? `<tr>
        <td style="font-size:12px;color:hsl(220,10%,50%);padding:4px 0;">Due date</td>
        <td style="font-size:12px;color:hsl(220,25%,10%);font-weight:600;padding:4px 0;">${dueDate}</td>
      </tr>`
    : '';

  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">📋</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          New task assigned
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          ${actorName} assigned you a task on Servix OS.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${assigneeName}</strong>, you have been assigned a new task.
        </p>

        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Task details
          </p>
          <p style="margin:0 0 14px;font-size:16px;font-weight:700;color:hsl(220,25%,10%);line-height:1.4;">${taskTitle}</p>
          <table style="border-collapse:collapse;width:100%;">
            <tbody>
              ${priorityRow}
              ${dueDateRow}
            </tbody>
          </table>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Log in to Servix OS to view and manage your tasks.
        </p>
      </div>`;

  return baseTemplate('New task assigned — Servix OS', body);
}

export function taskUpdatedAssigneeTemplate(
  assigneeName: string,
  taskTitle: string,
  actorName: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">🔄</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Task updated
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          A task you are working on was updated.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${assigneeName}</strong>,
          <strong style="color:hsl(220,25%,10%);">${actorName}</strong> made an update to a task you are assigned to.
        </p>

        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Task
          </p>
          <p style="margin:0;font-size:16px;font-weight:700;color:hsl(220,25%,10%);line-height:1.4;">${taskTitle}</p>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Log in to Servix OS to review the latest changes.
        </p>
      </div>`;

  return baseTemplate('Task updated — Servix OS', body);
}

export function taskUpdatedActorTemplate(
  actorName: string,
  taskTitle: string,
  assigneeName: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(217,91%,60%) 0%,hsl(270,70%,60%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">✅</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Task update by assignee
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          Your task was updated by the assignee.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${actorName}</strong>,
          <strong style="color:hsl(220,25%,10%);">${assigneeName}</strong> made an update to your task.
        </p>

        <div style="background:#f5f8ff;border:1.5px solid hsl(217,91%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Task
          </p>
          <p style="margin:0;font-size:16px;font-weight:700;color:hsl(220,25%,10%);line-height:1.4;">${taskTitle}</p>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Log in to Servix OS to review the latest changes.
        </p>
      </div>`;

  return baseTemplate('Task updated by assignee — Servix OS', body);
}
