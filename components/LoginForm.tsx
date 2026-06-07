'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = useMemo(() => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isConfigured) {
      setError('Сначала заполни .env.local: NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const response = await supabase.auth.signInWithPassword({ email, password });

      if (response.error) throw response.error;
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'Не удалось выполнить вход.';
      setError(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <span className="eyebrow">PilotBase workspace</span>
        <h1>Launch CRM для ранних пользователей</h1>
        <p>Единое место для лидов, интервью, условий, следующих касаний и воронки подключения.</p>
        <div className="auth-points">
          <span>CRM</span>
          <span>Интервью</span>
          <span>Воронка</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <h1>PilotBase</h1>
            <p>Единая база ранних пользователей для маркетинга</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            Пароль
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 6 символов" required />
          </label>

          {error && <div className="alert error">{error}</div>}
          {!isConfigured && (
            <div className="alert warning">
              Проект ещё не подключён к Supabase. Заполни `.env.local` и выполни SQL из `supabase/schema.sql`.
            </div>
          )}

          <button className="primary-button wide" disabled={loading} type="submit">
            {loading ? 'Проверяю...' : 'Войти в workspace'}
          </button>
        </form>
      </section>
    </main>
  );
}
