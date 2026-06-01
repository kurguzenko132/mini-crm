import type { STAGES } from './constants';

export type Stage = (typeof STAGES)[number];
export type Priority = 'low' | 'medium' | 'high';
export type EventType = 'created' | 'updated' | 'stage_changed' | 'note' | 'contact' | 'deleted';
export type QuestionType = 'short_text' | 'long_text' | 'number' | 'yes_no' | 'single_choice';
export type UserRole = 'map' | 'crm';
export type QuestionTargetRole = 'all' | UserRole;

export type EarlyUser = {
  id: string;
  owner_id?: string | null;
  profile_role: UserRole;
  name: string;
  city: string;
  industry: string;
  contact: string | null;
  terms: string;
  stage: Stage;
  next_step: string | null;
  next_contact_date: string | null;
  priority: Priority;
  source: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type EarlyUserInput = {
  profile_role: UserRole;
  name: string;
  city: string;
  industry: string;
  contact: string;
  terms: string;
  stage: Stage;
  next_step: string;
  next_contact_date: string;
  priority: Priority;
  source: string;
  notes: string;
  is_archived: boolean;
};

export type EarlyUserEvent = {
  id: string;
  owner_id?: string | null;
  early_user_id: string;
  type: EventType;
  title: string;
  note: string | null;
  created_at: string;
};

export type MarketingQuestion = {
  id: string;
  owner_id?: string | null;
  target_role: QuestionTargetRole;
  text: string;
  category: string;
  type: QuestionType;
  options: string[];
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MarketingQuestionInput = {
  target_role: QuestionTargetRole;
  text: string;
  category: string;
  type: QuestionType;
  optionsText: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

export type UserAnswer = {
  id: string;
  owner_id?: string | null;
  early_user_id: string;
  question_id: string;
  answer_text: string | null;
  created_at: string;
  updated_at: string;
};

export type Filters = {
  search: string;
  profileRole: '' | UserRole;
  city: string;
  industry: string;
  terms: string;
  stage: string;
  priority: string;
  onlyToday: boolean;
};
