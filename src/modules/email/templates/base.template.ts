export function baseTemplate(title: string, body: string): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="background-color:#ebf1fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;">
    <div style="max-width:600px;margin:0 auto;background-color:#ebf1fd;">

      <!-- Header -->
      <div style="padding:32px 32px 20px;text-align:center;">
        <img
          src="https://res.cloudinary.com/dpfpkwdus/image/upload/v1776905725/servix-logo_lhz4j8"
          alt="Servix OS logo"
          width="80"
          height="80"
          style="display:inline-block;"
        />
      </div>

      ${body}

      <!-- Footer -->
      <div style="background-color:#ebf1fd;padding:20px 32px 28px;text-align:center;">
        <p style="font-size:12px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 3px;">Servix OS</p>
        <p style="font-size:11px;color:hsl(220,10%,50%);margin:0 0 12px;line-height:1.5;">
          The all-in-one platform to run, scale, and grow your business.
        </p>
        <p style="font-size:10px;color:hsl(220,10%,62%);margin:0;">© ${new Date().getFullYear()} Servix OS. All rights reserved.</p>
      </div>

    </div>
  </body>
</html>`;
}
