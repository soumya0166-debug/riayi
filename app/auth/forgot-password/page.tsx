import { AuthForm } from '@/features/auth/AuthForm';

export default function ForgotPasswordPage() {
  return (
    <div className="auth-page-wrapper">
      <AuthForm mode="forgot" />
    </div>
  );
}
