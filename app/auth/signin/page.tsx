import { AuthForm } from '@/features/auth/AuthForm';

export default function SignInPage() {
  return (
    <div className="auth-page-wrapper">
      <AuthForm mode="signin" />
    </div>
  );
}
