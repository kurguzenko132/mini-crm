import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { createClient } from '@/lib/supabase/server';

export default async function LoginPage() {
  let isLoggedIn = false;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    isLoggedIn = Boolean(data.user);
  } catch {
    isLoggedIn = false;
  }

  if (isLoggedIn) redirect('/dashboard');
  return <LoginForm />;
}
