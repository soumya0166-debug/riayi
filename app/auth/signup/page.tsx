import { AuthForm } from '@/features/auth/AuthForm';

export default function SignUpPage() {
  return (
    <div className="auth-page-wrapper">
      <AuthForm mode="signup" />
    </div>
  );
}
