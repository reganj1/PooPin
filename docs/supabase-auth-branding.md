# Supabase Auth Branding Checklist

## Redirects
- Supabase Dashboard -> Authentication -> URL Configuration
- Set `Site URL` to your primary app URL.
- Add these redirect URLs:
  - `http://localhost:3000/auth/callback`
  - your production `https://<your-domain>/auth/callback`
  - any preview URLs you expect to use

## Email Auth
- Supabase Dashboard -> Authentication -> Providers -> Email
- Enable email sign-in.
- Disable `Confirm email` for Poopin's passwordless email flow.
- Poopin uses a unified OTP-code flow for both new and returning users.
- Supabase uses the same `signInWithOtp()` method for magic links and codes, so the email template decides which experience users receive.

## Email Sender
- Supabase Dashboard -> Settings -> Auth -> SMTP Settings
- Configure your own SMTP sender so emails come from Poopin instead of the generic Supabase sender.
- Set the sender/display name to `Poopin`.

## Email Template
- Supabase Dashboard -> Authentication -> Email Templates
- Update the Magic Link / OTP email subject line to match Poopin.
- Rewrite the body copy so it sounds like the product and tells users to enter the 6-digit code in the app.
- Use `{{ .Token }}` in the template body.
- Do not use `{{ .ConfirmationURL }}` for Poopin's login flow, or Supabase will send a magic link instead of a code.
- Poopin should not rely on the Confirm Signup template for login. If users are seeing “Confirm your signup”, `Confirm email` is still enabled or a different auth path is being used.
- Add Poopin branding/logo if your current email setup supports it.

## App-Side Scope
- Keep Poopin branding in-app for the contribution gate and `/login` page.
- Keep hosted email branding in Supabase dashboard/SMTP settings rather than adding custom email-sending code in the app.
