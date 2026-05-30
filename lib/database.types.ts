export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      early_users: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          city: string;
          industry: string;
          contact: string | null;
          terms: string;
          stage: string;
          next_step: string | null;
          next_contact_date: string | null;
          priority: string;
          source: string | null;
          notes: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          name: string;
          city: string;
          industry: string;
          contact?: string | null;
          terms: string;
          stage: string;
          next_step?: string | null;
          next_contact_date?: string | null;
          priority?: string;
          source?: string | null;
          notes?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          city?: string;
          industry?: string;
          contact?: string | null;
          terms?: string;
          stage?: string;
          next_step?: string | null;
          next_contact_date?: string | null;
          priority?: string;
          source?: string | null;
          notes?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      early_user_events: {
        Row: {
          id: string;
          owner_id: string;
          early_user_id: string;
          type: string;
          title: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          early_user_id: string;
          type?: string;
          title: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          early_user_id?: string;
          type?: string;
          title?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      marketing_questions: {
        Row: {
          id: string;
          owner_id: string;
          text: string;
          category: string;
          type: string;
          options: Json;
          is_required: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          text: string;
          category?: string;
          type?: string;
          options?: Json;
          is_required?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          text?: string;
          category?: string;
          type?: string;
          options?: Json;
          is_required?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_question_answers: {
        Row: {
          id: string;
          owner_id: string;
          early_user_id: string;
          question_id: string;
          answer_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          early_user_id: string;
          question_id: string;
          answer_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          early_user_id?: string;
          question_id?: string;
          answer_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
