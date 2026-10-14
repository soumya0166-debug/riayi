import { AuthForm } from '@/features/auth/AuthForm';

export default function ResetPasswordPage() {
  return (
    <div className="auth-page-wrapper">
      <AuthForm mode="reset" />
    </div>
  );
}
