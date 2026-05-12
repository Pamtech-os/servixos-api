import { baseTemplate } from './base.template';

export function taskOverdueTemplate(
  assigneeName: string,
  taskTitle: string,
  dueDate: string,
): string {
  const body = `
      <div style="background:linear-gradient(135deg,hsl(0,72%,51%) 0%,hsl(20,90%,48%) 100%);padding:34px 30px;text-align:center;border-radius:16px;margin:0 24px;">
        <p style="font-size:34px;margin:0 0 10px;line-height:1;">⏰</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;">
          Task overdue
        </h1>
        <p style="color:rgba(255,255,255,0.88);font-size:13px;margin:0;line-height:1.5;">
          A task assigned to you has passed its due date.
        </p>
      </div>

      <div style="background-color:#ffffff;border-radius:16px;margin:16px 24px;padding:28px 28px 24px;">
        <p style="font-size:13px;color:hsl(220,10%,40%);line-height:1.65;margin:0 0 16px;">
          Hi <strong style="color:hsl(220,25%,10%);">${assigneeName}</strong>,
          a task you are working on is now overdue. Please review and take action.
        </p>

        <div style="background:#fff5f5;border:1.5px solid hsl(0,72%,88%);border-radius:14px;padding:20px 18px;margin:0 0 18px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:hsl(220,10%,50%);letter-spacing:1px;text-transform:uppercase;">
            Task
          </p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:hsl(220,25%,10%);line-height:1.4;">${taskTitle}</p>
          <p style="margin:0;font-size:12px;color:hsl(0,60%,45%);font-weight:600;">
            Due: ${dueDate}
          </p>
        </div>

        <p style="margin:0;font-size:11px;color:hsl(220,10%,55%);line-height:1.7;">
          Log in to Servix OS to update this task or reach out to your manager.
        </p>
      </div>`;

  return baseTemplate('Task overdue — Servix OS', body);
}
