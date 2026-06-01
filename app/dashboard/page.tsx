import DashboardClient from '@/components/DashboardClient';
import { createClient } from '@/lib/supabase/server';
import type { EarlyUser, MarketingQuestion, UserAnswer } from '@/lib/types';

export default async function DashboardPage() {
  const supabase = await createClient();

  const [usersResult, questionsResult, answersResult] = await Promise.all([
    supabase.from('early_users').select('*').order('updated_at', { ascending: false }),
    supabase.from('marketing_questions').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('user_question_answers').select('*'),
  ]);

  const initialError = usersResult.error?.message
    ?? questionsResult.error?.message
    ?? answersResult.error?.message
    ?? null;

  return (
    <DashboardClient
      initialUsers={(usersResult.data ?? []) as EarlyUser[]}
      initialQuestions={(questionsResult.data ?? []) as MarketingQuestion[]}
      initialAnswers={(answersResult.data ?? []) as UserAnswer[]}
      initialError={initialError}
    />
  );
}
